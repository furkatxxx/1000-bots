import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { expertChain } from "@/lib/expert-chain";
import { collectValidationData, formatValidationForPrompt } from "@/lib/validators";

export const maxDuration = 300;

// GET /api/cron/experts — Vercel Cron каждые 5 мин
// Находит одну неоценённую идею и прогоняет через экспертов
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }

  try {
    const settings = await prisma.settings.findUnique({ where: { id: "main" } });
    if (!settings?.anthropicApiKey) {
      return NextResponse.json({ skipped: true, reason: "Нет API-ключа" });
    }

    // Ищем идею без экспертной оценки из завершённых отчётов
    const idea = await prisma.businessIdea.findFirst({
      where: {
        report: { status: "complete" },
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
      return NextResponse.json({ skipped: true, reason: "Все идеи оценены" });
    }

    // Блокируем
    await prisma.businessIdea.update({
      where: { id: idea.id },
      data: { expertAnalysis: "processing" },
    });

    const expertModel = settings.expertModel || "claude-sonnet-4-6";

    try {
      console.log(`[Cron Experts] Оцениваю: "${idea.name}"...`);

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

      console.log(`[Cron Experts] "${idea.name}": ${result.analysis.finalScore}/10 → ${result.analysis.finalVerdict}`);

      return NextResponse.json({
        success: true,
        idea: idea.name,
        score: result.analysis.finalScore,
        verdict: result.analysis.finalVerdict,
      });
    } catch (err) {
      await prisma.businessIdea.update({
        where: { id: idea.id },
        data: { expertAnalysis: null },
      });
      console.error(`[Cron Experts] Ошибка для "${idea.name}":`, err);
      return NextResponse.json({
        error: err instanceof Error ? err.message : "Ошибка",
        idea: idea.name,
      }, { status: 500 });
    }
  } catch (error) {
    console.error("[Cron Experts] Ошибка:", error);
    return NextResponse.json({ error: "Ошибка cron-экспертов" }, { status: 500 });
  }
}
