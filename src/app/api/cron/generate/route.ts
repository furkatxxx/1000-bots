import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { collectAll } from "@/lib/collectors";
import { generateIdeas, filterTrends, semanticDedup, analyzeTrends, validateIdeas } from "@/lib/ai-brain";
import {
  runHealthCheck,
  sendHealthTelegramAlert,
  isHealthyEnough,
} from "@/lib/health-check";
import { fetchWithTimeout } from "@/lib/utils";

export const maxDuration = 300;

// GET /api/cron/generate — Vercel Cron вызывает каждый день
export async function GET(request: NextRequest) {
  // Защита: только Vercel Cron или запрос с правильным ключом
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }

  try {
    const settings = await prisma.settings.findUnique({ where: { id: "main" } });

    if (!settings?.scheduleEnabled) {
      return NextResponse.json({ skipped: true, reason: "Расписание выключено" });
    }

    if (!settings?.anthropicApiKey) {
      return NextResponse.json({ skipped: true, reason: "Нет API-ключа Anthropic" });
    }

    // Проверяем: нет ли уже отчёта за сегодня?
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.dailyReport.findFirst({
      where: {
        date: { gte: today },
        status: { in: ["complete", "generating"] },
      },
    });

    if (existing) {
      return NextResponse.json({ skipped: true, reason: "Отчёт за сегодня уже есть" });
    }

    // Генерируем отчёт (повторяем логику из POST /api/reports)
    console.log("[Cron] Запускаю автогенерацию отчёта");

    // Здоровье источников
    const healthResult = await runHealthCheck({
      googleTrendsGeo: settings.googleTrendsGeo || "US",
      newsApiKey: settings.newsApiKey,
      vkServiceToken: settings.vkServiceToken,
      wordstatToken: settings.wordstatToken,
    });

    if (!isHealthyEnough(healthResult)) {
      const failedNames = healthResult.results
        .filter((r) => !r.ok)
        .map((r) => r.label)
        .join(", ");

      if (settings.telegramBotToken && settings.telegramChatId) {
        await sendHealthTelegramAlert(settings.telegramBotToken, settings.telegramChatId, healthResult, "pre-report");
      }

      return NextResponse.json({
        skipped: true,
        reason: `Мало рабочих источников. Не работают: ${failedNames}`,
      });
    }

    const report = await prisma.dailyReport.upsert({
      where: { date: today },
      update: { status: "generating", error: null },
      create: { date: today, status: "generating" },
    });

    try {
      const sources = await prisma.trendSource.findMany({ where: { enabled: true } });
      const enabledSources = sources.map((s) => s.name);

      // Шаг 1: Сбор трендов
      const trendItems = await collectAll({
        newsApiKey: settings.newsApiKey || undefined,
        wordstatToken: settings.wordstatToken || undefined,
        googleTrendsGeo: settings.googleTrendsGeo || "US",
        vkServiceToken: settings.vkServiceToken || undefined,
        enabledSources: enabledSources.length > 0 ? enabledSources : undefined,
      });

      if (trendItems.length === 0) {
        throw new Error("Не удалось собрать тренды ни из одного источника.");
      }

      await prisma.trendData.createMany({
        data: trendItems.map((item) => ({
          sourceId: item.sourceId,
          title: item.title,
          url: item.url,
          score: item.score,
          summary: item.summary,
          category: item.category,
          metadata: JSON.stringify(item.metadata),
        })),
      });

      // Шаг 2: Фильтрация
      const trendData = trendItems.map((t) => ({
        title: t.title,
        score: t.score,
        source: t.sourceId,
        category: t.category || undefined,
        summary: t.summary || undefined,
        originalTitle: (t.metadata?.originalTitle as string) || undefined,
        metadata: t.metadata || undefined,
      }));
      const filtered = filterTrends(trendData);
      const trendsForAI = filtered.length >= 5 ? filtered : trendData;

      // Дедупликация прошлых идей
      const recentIdeas = await prisma.businessIdea.findMany({
        where: { report: { id: { not: report.id }, status: "complete" } },
        select: { name: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      });

      const generationModel = "claude-opus-4-6";
      let totalTokensIn = 0;
      let totalTokensOut = 0;

      // Шаг 3а: Анализ трендов — выявление болей (Opus)
      console.log("[Cron] Шаг 3а: Анализ трендов — выявление болей (Opus)...");
      const analysisResult = await analyzeTrends({
        trends: trendsForAI,
        apiKey: settings.anthropicApiKey,
      });
      totalTokensIn += analysisResult.tokensIn;
      totalTokensOut += analysisResult.tokensOut;

      // Шаг 3б: Генерация идей на основе анализа (Opus)
      console.log(`[Cron] Шаг 3б: Генерация 7 идей (${generationModel})...`);
      const genResult = await generateIdeas({
        trends: trendsForAI,
        maxIdeas: 7,
        model: generationModel,
        apiKey: settings.anthropicApiKey,
        previousIdeas: recentIdeas.map((i) => i.name),
        trendAnalysis: analysisResult.analysis,
      });
      totalTokensIn += genResult.tokensIn;
      totalTokensOut += genResult.tokensOut;

      // Шаг 4: Семантическая дедупликация (Sonnet)
      const dedupResult = await semanticDedup({
        ideas: genResult.ideas,
        apiKey: settings.anthropicApiKey,
        model: "claude-sonnet-4-6",
      });
      totalTokensIn += dedupResult.tokensIn;
      totalTokensOut += dedupResult.tokensOut;

      // Шаг 5: Смысловая валидация (Opus)
      console.log("[Cron] Шаг 5: Смысловая валидация (Opus)...");
      const validationResult = await validateIdeas({
        ideas: dedupResult.unique,
        apiKey: settings.anthropicApiKey,
      });
      totalTokensIn += validationResult.tokensIn;
      totalTokensOut += validationResult.tokensOut;
      const finalIdeas = validationResult.valid;

      // Шаг 5: Сохранение
      await prisma.businessIdea.deleteMany({ where: { reportId: report.id } });
      await prisma.businessIdea.createMany({
        data: finalIdeas.map((idea) => ({
          reportId: report.id,
          name: idea.name,
          emoji: idea.emoji,
          description: idea.description,
          targetAudience: idea.targetAudience,
          monetization: idea.monetization,
          startupCost: idea.startupCost,
          competitionLevel: idea.competitionLevel,
          trendBacking: idea.trendBacking,
          actionPlan: idea.actionPlan,
          claudeCodeReady: idea.claudeCodeReady,
          difficulty: idea.difficulty,
          successChance: idea.successChance,
          estimatedRevenue: idea.estimatedRevenue,
          timeToLaunch: idea.timeToLaunch,
          market: idea.market,
          marketScenarios: JSON.stringify(idea.marketScenarios),
        })),
      });

      // Шаг 7: Финализация (эксперты запустятся отдельным кроном /api/cron/experts)
      await prisma.dailyReport.update({
        where: { id: report.id },
        data: {
          status: "complete",
          trendsCount: trendItems.length,
          ideasCount: finalIdeas.length,
          aiModel: generationModel,
          aiTokensIn: totalTokensIn,
          aiTokensOut: totalTokensOut,
          generatedAt: new Date(),
        },
      });

      // Автоотправка в Telegram
      if (settings.scheduleAutoTelegram && settings.telegramBotToken && settings.telegramChatId) {
        try {
          const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : `http://localhost:${process.env.PORT || 4000}`;
          await fetchWithTimeout(`${baseUrl}/api/telegram/send-top`, { method: "POST" });
          console.log("[Cron] ТОП отправлен в Telegram");
        } catch (tgErr) {
          console.error("[Cron] Ошибка отправки в Telegram:", tgErr);
        }
      }

      console.log(`[Cron] Отчёт создан: ${finalIdeas.length} идей`);
      return NextResponse.json({
        success: true,
        ideasCount: finalIdeas.length,
        trendsCount: trendItems.length,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка";
      await prisma.dailyReport.update({
        where: { id: report.id },
        data: { status: "failed", error: errorMessage },
      }).catch(() => {});

      console.error("[Cron] Ошибка генерации:", error);
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  } catch (error) {
    console.error("[Cron] Ошибка:", error);
    return NextResponse.json({ error: "Ошибка cron-задачи" }, { status: 500 });
  }
}
