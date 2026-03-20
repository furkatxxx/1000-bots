import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { expertChain } from "@/lib/expert-chain";
import { collectValidationData, formatValidationForPrompt } from "@/lib/validators";
import { sendTopToTelegram } from "@/lib/telegram";

export const maxDuration = 300;

// GET /api/cron/experts — Vercel Cron раз в день (9:00 МСК)
// Оценивает ВСЕ неоценённые идеи из сегодняшнего отчёта по очереди
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }

  const startTime = Date.now();
  const MAX_RUNTIME_MS = 270_000; // 270с (буфер 30с до лимита 300с)

  try {
    const settings = await prisma.settings.findUnique({ where: { id: "main" } });
    if (!settings?.anthropicApiKey) {
      return NextResponse.json({ skipped: true, reason: "Нет API-ключа" });
    }

    const expertModel = settings.expertModel || "claude-sonnet-4-6";
    // Оцениваем идеи за последние 3 дня (не только сегодня)
    const threeDaysAgo = new Date();
    threeDaysAgo.setHours(0, 0, 0, 0);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const results: { name: string; score: number; verdict: string }[] = [];
    const errors: { name: string; error: string }[] = [];

    // Cleanup: сброс зависших "processing" идей (orphans от предыдущих таймаутов Vercel)
    const orphans = await prisma.businessIdea.updateMany({
      where: {
        expertAnalysis: "processing",
        report: { status: "complete", date: { gte: threeDaysAgo } },
      },
      data: { expertAnalysis: null },
    });
    if (orphans.count > 0) {
      console.log(`[Cron Experts] Сброшено ${orphans.count} зависших "processing" идей`);
    }

    // Цикл: оцениваем идеи пока есть время
    const EXPERT_CHAIN_TIME = 180_000; // ~3 мин на одну цепочку экспертов
    for (let i = 0; i < 10; i++) {
      // Проверяем: хватит ли времени на полную цепочку?
      const timeLeft = MAX_RUNTIME_MS - (Date.now() - startTime);
      if (timeLeft < EXPERT_CHAIN_TIME) {
        console.log(`[Cron Experts] Осталось ${Math.round(timeLeft / 1000)}с — мало для цепочки, стоп. Оценено ${results.length}, ошибок ${errors.length}`);
        break;
      }

      // Ищем следующую неоценённую идею
      const idea = await prisma.businessIdea.findFirst({
        where: {
          report: { status: "complete", date: { gte: threeDaysAgo } },
          expertAnalysis: null,
        },
        select: {
          id: true, name: true, description: true, targetAudience: true,
          monetization: true, startupCost: true, competitionLevel: true,
          actionPlan: true, estimatedRevenue: true, trendBacking: true,
        },
        orderBy: { createdAt: "desc" },
      });

      if (!idea) {
        console.log(`[Cron Experts] Все идеи оценены (${results.length} за этот запуск)`);
        break;
      }

      // Блокируем
      await prisma.businessIdea.update({
        where: { id: idea.id },
        data: { expertAnalysis: "processing" },
      });

      try {
        console.log(`[Cron Experts] ${i + 1}. Оцениваю: "${idea.name}"...`);

        const validationData = await collectValidationData({
          ideaName: idea.name,
          ideaDescription: idea.description,
          targetAudience: idea.targetAudience,
          wordstatToken: settings.wordstatToken || undefined,
          dadataApiKey: settings.dadataApiKey || undefined,
        });
        const validationContext = formatValidationForPrompt(validationData);

        const result = await expertChain({
          idea: {
            name: idea.name,
            description: idea.description,
            targetAudience: idea.targetAudience,
            monetization: idea.monetization,
            startupCost: idea.startupCost,
            competitionLevel: idea.competitionLevel,
            actionPlan: idea.actionPlan,
            estimatedRevenue: idea.estimatedRevenue,
            trendBacking: idea.trendBacking,
          },
          apiKey: settings.anthropicApiKey,
          model: expertModel,
          validationContext: validationContext || undefined,
        });

        await prisma.businessIdea.update({
          where: { id: idea.id },
          data: { expertAnalysis: JSON.stringify(result.analysis) },
        });

        const score = result.analysis.finalScore;
        const verdict = result.analysis.finalVerdict;
        console.log(`[Cron Experts] "${idea.name}": ${score}/10 → ${verdict}`);
        results.push({ name: idea.name, score, verdict });
      } catch (err) {
        await prisma.businessIdea.update({
          where: { id: idea.id },
          data: { expertAnalysis: null },
        });
        const msg = err instanceof Error ? err.message : "Ошибка";
        console.error(`[Cron Experts] Ошибка для "${idea.name}":`, err);
        errors.push({ name: idea.name, error: msg });
      }
    }

    // Автоотправка в Telegram — когда ВСЕ идеи оценены и Telegram ещё не отправлен
    const remaining = await prisma.businessIdea.count({
      where: {
        report: { status: "complete", date: { gte: threeDaysAgo } },
        expertAnalysis: null,
      },
    });

    // Проверяем: есть ли сегодняшний отчёт?
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayReport = await prisma.dailyReport.findFirst({
      where: { date: today, status: "complete" },
    });

    let telegramStatus = "не требуется";

    if (remaining > 0) {
      telegramStatus = `ждёт (${remaining} неоценённых)`;
    } else if (!todayReport) {
      telegramStatus = "нет отчёта сегодня";
    } else if (todayReport.telegramSent) {
      telegramStatus = "уже отправлен ранее";
    } else if (settings.telegramBotToken && settings.telegramChatId) {
      // Все идеи оценены + Telegram ещё не отправлен → отправляем НАПРЯМУЮ
      try {
        const result = await sendTopToTelegram();
        if (result.success && result.sentCount > 0) {
          await prisma.dailyReport.update({
            where: { id: todayReport.id },
            data: { telegramSent: true },
          });
          telegramStatus = `отправлен (${result.sentCount} идей)`;
        } else {
          telegramStatus = result.error || `нет идей с оценкой 7+`;
        }
      } catch (tgErr) {
        const msg = tgErr instanceof Error ? tgErr.message : "Неизвестная ошибка";
        console.error("[Cron Experts] Ошибка отправки в Telegram:", tgErr);
        telegramStatus = `ошибка: ${msg}`;
      }
    }

    return NextResponse.json({
      success: true,
      evaluated: results.length,
      errors: errors.length,
      results,
      remaining,
      telegramStatus,
      ...(errors.length > 0 ? { errorDetails: errors } : {}),
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("[Cron Experts] Ошибка:", error);
    return NextResponse.json({ error: "Ошибка cron-экспертов" }, { status: 500 });
  }
}
