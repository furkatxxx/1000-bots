import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { expertChain } from "@/lib/expert-chain";
import { collectValidationData, formatValidationForPrompt } from "@/lib/validators";
import { fetchWithTimeout } from "@/lib/utils";

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const results: { name: string; score: number; verdict: string }[] = [];
    const errors: { name: string; error: string }[] = [];

    // Цикл: оцениваем идеи пока есть время
    for (let i = 0; i < 10; i++) {
      // Проверяем лимит времени
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.log(`[Cron Experts] Лимит времени — оценено ${results.length}, ошибок ${errors.length}`);
        break;
      }

      // Ищем следующую неоценённую идею
      const idea = await prisma.businessIdea.findFirst({
        where: {
          report: { status: "complete", date: { gte: today } },
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

    // Автоотправка в Telegram — только когда ВСЕ идеи оценены (не осталось неоценённых)
    const remaining = await prisma.businessIdea.count({
      where: {
        report: { status: "complete", date: { gte: today } },
        expertAnalysis: null,
      },
    });

    if (results.length > 0 && remaining === 0 && settings.telegramBotToken && settings.telegramChatId) {
      try {
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : `http://localhost:${process.env.PORT || 4000}`;
        await fetchWithTimeout(`${baseUrl}/api/telegram/send-top`, { method: "POST" });
        console.log("[Cron Experts] Все идеи оценены — ТОП отправлен в Telegram");
      } catch (tgErr) {
        console.error("[Cron Experts] Ошибка отправки в Telegram:", tgErr);
      }
    } else if (remaining > 0) {
      console.log(`[Cron Experts] Осталось ${remaining} неоценённых — Telegram ждёт`);
    }

    return NextResponse.json({
      success: true,
      evaluated: results.length,
      errors: errors.length,
      results,
      ...(errors.length > 0 ? { errorDetails: errors } : {}),
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("[Cron Experts] Ошибка:", error);
    return NextResponse.json({ error: "Ошибка cron-экспертов" }, { status: 500 });
  }
}
