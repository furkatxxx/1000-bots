import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { expertCouncil } from "@/lib/ai-brain";
import { expertChain } from "@/lib/expert-chain";
import { collectValidationData, formatValidationForPrompt } from "@/lib/validators";

// POST /api/ideas/[id]/expert-council — запустить экспертный совет с автовалидацией
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
    // 1. Собираем данные для валидации (Вордстат + DaData + ЕГРЮЛ)
    console.log("[Expert Council] Сбор данных валидации...");
    const validationData = await collectValidationData({
      ideaName: idea.name,
      ideaDescription: idea.description,
      targetAudience: idea.targetAudience,
      wordstatToken: settings.wordstatToken || undefined,
      dadataApiKey: settings.dadataApiKey || undefined,
    });

    const validationContext = formatValidationForPrompt(validationData);
    const sourcesUsed: string[] = [];
    if (validationData.wordstat) sourcesUsed.push("Вордстат");
    if (validationData.dadata) sourcesUsed.push("DaData");
    if (validationData.egrul.length > 0) sourcesUsed.push("ЕГРЮЛ");

    if (sourcesUsed.length > 0) {
      console.log(`[Expert Council] Данные собраны: ${sourcesUsed.join(", ")}`);
    } else {
      console.log("[Expert Council] Нет ключей для валидации — только AI-анализ");
    }

    // 2. Вызываем цепочку экспертов (или старый совет через ?chain=false)
    const url = new URL(_request.url);
    const useChain = url.searchParams.get("chain") !== "false";
    const expertModel = settings.expertModel || settings.preferredModel || "claude-haiku-4-5-20251001";

    const ideaData = {
      name: idea.name,
      description: idea.description,
      targetAudience: idea.targetAudience,
      monetization: idea.monetization,
      startupCost: idea.startupCost,
      competitionLevel: idea.competitionLevel,
      actionPlan: idea.actionPlan,
      estimatedRevenue: idea.estimatedRevenue,
    };

    const result = useChain
      ? await expertChain({
          idea: ideaData,
          apiKey: settings.anthropicApiKey,
          model: expertModel,
          validationContext: validationContext || undefined,
        })
      : await expertCouncil({
          idea: ideaData,
          apiKey: settings.anthropicApiKey,
          model: expertModel,
          validationContext: validationContext || undefined,
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
      validationSources: sourcesUsed,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Неизвестная ошибка";
    console.error("[Expert Council] Ошибка:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
