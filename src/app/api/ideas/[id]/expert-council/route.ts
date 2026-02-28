import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { expertCouncil } from "@/lib/ai-brain";

// POST /api/ideas/[id]/expert-council — запустить экспертный совет
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const idea = await prisma.businessIdea.findUnique({ where: { id } });
  if (!idea) {
    return NextResponse.json({ error: "Идея не найдена" }, { status: 404 });
  }

  // Если уже есть анализ — возвращаем кэш
  if (idea.expertAnalysis) {
    try {
      const cached = JSON.parse(idea.expertAnalysis);
      return NextResponse.json({ analysis: cached, cached: true });
    } catch {
      // Битый JSON в БД — перегенерируем
    }
  }

  const settings = await prisma.settings.findUnique({ where: { id: "main" } });
  if (!settings?.anthropicApiKey) {
    return NextResponse.json(
      { error: "Не указан API-ключ Anthropic. Добавьте его в настройках." },
      { status: 400 }
    );
  }

  try {
    const result = await expertCouncil({
      idea: {
        name: idea.name,
        description: idea.description,
        targetAudience: idea.targetAudience,
        monetization: idea.monetization,
        startupCost: idea.startupCost,
        competitionLevel: idea.competitionLevel,
        actionPlan: idea.actionPlan,
        estimatedRevenue: idea.estimatedRevenue,
      },
      apiKey: settings.anthropicApiKey,
      model: settings.preferredModel || "claude-haiku-4-5-20251001",
    });

    // Сохраняем в БД
    await prisma.businessIdea.update({
      where: { id },
      data: { expertAnalysis: JSON.stringify(result.analysis) },
    });

    return NextResponse.json({
      analysis: result.analysis,
      cached: false,
      tokensUsed: result.tokensIn + result.tokensOut,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Неизвестная ошибка";
    console.error("[Expert Council] Ошибка:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
