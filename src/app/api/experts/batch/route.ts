import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { expertChain } from "@/lib/expert-chain";
import { collectValidationData, formatValidationForPrompt } from "@/lib/validators";

export const maxDuration = 300;

// GET /api/experts/batch?reportId=xxx — прогресс экспертной оценки
export async function GET(request: NextRequest) {
  try {
    const reportId = request.nextUrl.searchParams.get("reportId");
    if (!reportId) {
      return NextResponse.json({ error: "reportId обязателен" }, { status: 400 });
    }

    const ideas = await prisma.businessIdea.findMany({
      where: { reportId },
      select: { id: true, name: true, expertAnalysis: true },
    });

    const done = ideas.filter((i) => i.expertAnalysis && i.expertAnalysis !== "processing").length;
    const processing = ideas.filter((i) => i.expertAnalysis === "processing").length;
    const remaining = ideas.length - done - processing;

    return NextResponse.json({
      total: ideas.length,
      done,
      processing,
      remaining,
      allDone: remaining === 0 && processing === 0,
      ideas: ideas.map((i) => ({
        id: i.id,
        name: i.name,
        status: !i.expertAnalysis ? "pending" : i.expertAnalysis === "processing" ? "processing" : "done",
      })),
    });
  } catch (error) {
    console.error("[Experts Batch] Ошибка GET:", error);
    return NextResponse.json({ error: "Ошибка проверки прогресса" }, { status: 500 });
  }
}

// POST /api/experts/batch — оценить ОДНУ следующую идею
// Body: { reportId: string }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const reportId = body.reportId as string;
    if (!reportId) {
      return NextResponse.json({ error: "reportId обязателен" }, { status: 400 });
    }

    const settings = await prisma.settings.findUnique({ where: { id: "main" } });
    if (!settings?.anthropicApiKey) {
      return NextResponse.json({ error: "Нет API-ключа Anthropic" }, { status: 400 });
    }

    // Находим первую неоценённую идею
    const ideas = await prisma.businessIdea.findMany({
      where: { reportId },
      select: {
        id: true, name: true, description: true, targetAudience: true,
        monetization: true, startupCost: true, competitionLevel: true,
        actionPlan: true, estimatedRevenue: true, trendBacking: true,
        expertAnalysis: true,
      },
    });

    const nextIdea = ideas.find((idea) => !idea.expertAnalysis);

    if (!nextIdea) {
      const done = ideas.filter((i) => i.expertAnalysis && i.expertAnalysis !== "processing").length;
      return NextResponse.json({ done: true, total: ideas.length, processed: done });
    }

    // Помечаем как "processing" (блокировка)
    await prisma.businessIdea.update({
      where: { id: nextIdea.id },
      data: { expertAnalysis: "processing" },
    });

    const expertModel = settings.expertModel || "claude-sonnet-4-6";

    try {
      console.log(`[Experts Batch] Оцениваю: "${nextIdea.name}"...`);

      // Собираем данные валидации
      const validationData = await collectValidationData({
        ideaName: nextIdea.name,
        ideaDescription: nextIdea.description,
        targetAudience: nextIdea.targetAudience,
        wordstatToken: settings.wordstatToken || undefined,
        dadataApiKey: settings.dadataApiKey || undefined,
      });
      const validationContext = formatValidationForPrompt(validationData);

      // Запускаем цепочку экспертов
      const result = await expertChain({
        idea: {
          name: nextIdea.name,
          description: nextIdea.description,
          targetAudience: nextIdea.targetAudience,
          monetization: nextIdea.monetization,
          startupCost: nextIdea.startupCost,
          competitionLevel: nextIdea.competitionLevel,
          actionPlan: nextIdea.actionPlan,
          estimatedRevenue: nextIdea.estimatedRevenue,
          trendBacking: nextIdea.trendBacking,
        },
        apiKey: settings.anthropicApiKey,
        model: expertModel,
        validationContext: validationContext || undefined,
      });

      // Сохраняем результат
      await prisma.businessIdea.update({
        where: { id: nextIdea.id },
        data: { expertAnalysis: JSON.stringify(result.analysis) },
      });

      const done = ideas.filter((i) => i.expertAnalysis && i.expertAnalysis !== "processing" && i.id !== nextIdea.id).length + 1;
      const remaining = ideas.length - done;

      console.log(`[Experts Batch] "${nextIdea.name}": ${result.analysis.finalScore}/10 → ${result.analysis.finalVerdict}`);

      return NextResponse.json({
        done: remaining === 0,
        processed: nextIdea.name,
        score: result.analysis.finalScore,
        verdict: result.analysis.finalVerdict,
        total: ideas.length,
        completed: done,
        remaining,
      });
    } catch (err) {
      // Сбрасываем "processing" при ошибке
      await prisma.businessIdea.update({
        where: { id: nextIdea.id },
        data: { expertAnalysis: null },
      });
      console.error(`[Experts Batch] Ошибка для "${nextIdea.name}":`, err);
      const msg = err instanceof Error ? err.message : "Ошибка экспертной оценки";
      return NextResponse.json({ error: msg, idea: nextIdea.name }, { status: 500 });
    }
  } catch (error) {
    console.error("[Experts Batch] Ошибка POST:", error);
    return NextResponse.json({ error: "Ошибка запуска экспертов" }, { status: 500 });
  }
}
