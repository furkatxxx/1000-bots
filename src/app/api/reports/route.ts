import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { collectAll } from "@/lib/collectors";
import { generateIdeas, filterTrends, semanticDedup } from "@/lib/ai-brain";
import {
  runHealthCheck,
  sendHealthTelegramAlert,
  isHealthyEnough,
  SOURCE_LABELS,
} from "@/lib/health-check";

export const maxDuration = 300;

// Дедлайн: 2026-03-07 12:00 МСК (09:00 UTC)
const LOCK_AFTER = new Date("2026-03-07T09:00:00Z");
const GENERATE_PASSWORD = "0811";

// GET /api/reports — список всех отчётов
export async function GET() {
  try {
    const reports = await prisma.dailyReport.findMany({
      orderBy: { date: "desc" },
      include: { _count: { select: { ideas: true } } },
    });

    const favoritesCount = await prisma.businessIdea.count({
      where: { isFavorite: true },
    });

    return NextResponse.json({
      reports: reports.map((r) => ({
        id: r.id,
        date: r.date.toISOString(),
        status: r.status,
        trendsCount: r.trendsCount,
        ideasCount: r._count.ideas,
        aiModel: r.aiModel,
        generatedAt: r.generatedAt?.toISOString() || null,
        createdAt: r.createdAt.toISOString(),
      })),
      favoritesCount,
    });
  } catch (error) {
    console.error("[API /reports] Ошибка GET:", error);
    return NextResponse.json({ error: "Ошибка загрузки отчётов" }, { status: 500 });
  }
}

// POST /api/reports — генерация отчёта (упрощённый pipeline)
export async function POST(request: NextRequest) {
  // Защита паролем после дедлайна
  if (Date.now() > LOCK_AFTER.getTime()) {
    try {
      const body = await request.json();
      if (body?.password !== GENERATE_PASSWORD) {
        return NextResponse.json(
          { success: false, error: "Требуется пароль для генерации", needPassword: true },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, error: "Требуется пароль для генерации", needPassword: true },
        { status: 403 }
      );
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await prisma.dailyReport.findUnique({ where: { date: today } });
  if (existing?.status === "generating") {
    const stuckThreshold = 10 * 60 * 1000;
    const createdTime = existing.generatedAt?.getTime() || existing.createdAt.getTime();
    const isStuck = Date.now() - createdTime > stuckThreshold;

    if (!isStuck) {
      return NextResponse.json(
        { success: false, error: "Отчёт уже генерируется. Подождите (~5-8 минут)." },
        { status: 409 }
      );
    }
    console.warn("[Reports] Генерация зависла, перезапуск...");
  }

  const settings = await prisma.settings.findUnique({ where: { id: "main" } });
  if (!settings?.anthropicApiKey) {
    return NextResponse.json(
      { success: false, error: "Не указан API-ключ Anthropic. Добавьте его в настройках." },
      { status: 400 }
    );
  }

  // ШАГ 0: Проверка здоровья источников
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

    return NextResponse.json(
      {
        success: false,
        error: `Генерация отменена: работают ${healthResult.working} из ${healthResult.total} источников. Не работают: ${failedNames}.`,
        healthCheck: healthResult,
      },
      { status: 503 }
    );
  }

  const report = await prisma.dailyReport.upsert({
    where: { date: today },
    update: { status: "generating", error: null },
    create: { date: today, status: "generating" },
  });

  try {
    const sources = await prisma.trendSource.findMany({ where: { enabled: true } });
    const enabledSources = sources.map((s) => s.name);

    // ═══════════════════════════════════════════════════
    // ШАГ 1: СБОР ТРЕНДОВ
    // ═══════════════════════════════════════════════════
    console.log("[Gen] Шаг 1: Сбор трендов...");
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

    const activeSourceIds = new Set(trendItems.map((t) => t.sourceId));
    const silentSources = enabledSources.filter((s) => !activeSourceIds.has(s));
    if (silentSources.length > 0) {
      console.warn(`[Gen] Источники без данных: ${silentSources.map((s) => SOURCE_LABELS[s] || s).join(", ")}`);
    }

    // Сохраняем тренды
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

    // ═══════════════════════════════════════════════════
    // ШАГ 2: ФИЛЬТРАЦИЯ МУСОРНЫХ ТРЕНДОВ
    // ═══════════════════════════════════════════════════
    const trendData = trendItems.map((t) => ({
      title: t.title,
      score: t.score,
      source: t.sourceId,
      category: t.category || undefined,
    }));

    const filtered = filterTrends(trendData);
    console.log(`[Gen] Шаг 2: Фильтр трендов: ${trendData.length} → ${filtered.length} (убрано ${trendData.length - filtered.length} мусорных)`);

    if (filtered.length < 5) {
      console.warn(`[Gen] Мало трендов после фильтра (${filtered.length}), используем все`);
    }
    const trendsForAI = filtered.length >= 5 ? filtered : trendData;

    // Дедупликация: прошлые идеи
    const recentIdeas = await prisma.businessIdea.findMany({
      where: { report: { id: { not: report.id }, status: "complete" } },
      select: { name: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    const previousIdeas = recentIdeas.map((i) => i.name);

    // Модели: Sonnet для генерации, Haiku для экспертов
    const generationModel = "claude-sonnet-4-6";
    const expertModel = settings.expertModel || "claude-haiku-4-5-20251001";
    let totalTokensIn = 0;
    let totalTokensOut = 0;

    // ═══════════════════════════════════════════════════
    // ШАГ 3: ГЕНЕРАЦИЯ 10 ИДЕЙ (Sonnet, один проход)
    // ═══════════════════════════════════════════════════
    console.log(`[Gen] Шаг 3: Генерация 10 идей (${generationModel})...`);
    const genResult = await generateIdeas({
      trends: trendsForAI,
      maxIdeas: 10,
      model: generationModel,
      apiKey: settings.anthropicApiKey,
      previousIdeas,
    });
    totalTokensIn += genResult.tokensIn;
    totalTokensOut += genResult.tokensOut;
    console.log(`[Gen] Сгенерировано: ${genResult.ideas.length} идей`);

    // ═══════════════════════════════════════════════════
    // ШАГ 4: СЕМАНТИЧЕСКАЯ ДЕДУПЛИКАЦИЯ
    // ═══════════════════════════════════════════════════
    console.log("[Gen] Шаг 4: Семантическая дедупликация...");
    const dedupResult = await semanticDedup({
      ideas: genResult.ideas,
      apiKey: settings.anthropicApiKey,
      model: expertModel,
    });
    totalTokensIn += dedupResult.tokensIn;
    totalTokensOut += dedupResult.tokensOut;
    const finalIdeas = dedupResult.unique;
    console.log(`[Gen] После дедупликации: ${finalIdeas.length} уникальных идей`);

    // ═══════════════════════════════════════════════════
    // ШАГ 5: СОХРАНЕНИЕ В БД
    // ═══════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════
    // ШАГ 6: ФИНАЛИЗАЦИЯ (экспертов запустит фронтенд отдельно)
    // ═══════════════════════════════════════════════════
    console.log(`[Gen] ═══ ИТОГ ═══`);
    console.log(`[Gen] Тренды: ${trendItems.length} собрано, ${trendsForAI.length} после фильтра`);
    console.log(`[Gen] Идеи: ${genResult.ideas.length} → ${finalIdeas.length} (после дедупа)`);
    console.log(`[Gen] Токены: ${totalTokensIn} in, ${totalTokensOut} out`);

    const updated = await prisma.dailyReport.update({
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

    return NextResponse.json({
      success: true,
      report: {
        id: updated.id,
        date: updated.date.toISOString(),
        status: updated.status,
        trendsCount: updated.trendsCount,
        ideasCount: updated.ideasCount,
      },
      pipeline: {
        trends: trendItems.length,
        afterFilter: trendsForAI.length,
        generated: genResult.ideas.length,
        afterDedup: finalIdeas.length,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка";
    try {
      await prisma.dailyReport.update({
        where: { id: report.id },
        data: { status: "failed", error: errorMessage },
      });
    } catch (dbError) {
      console.error("[Gen] Ошибка обновления статуса:", dbError);
    }

    console.error("[Gen] Ошибка генерации:", error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
