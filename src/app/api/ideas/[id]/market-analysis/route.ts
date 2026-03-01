import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeMarket } from "@/lib/market-analysis";
import { collectValidationData, formatValidationForPrompt } from "@/lib/validators";

// POST /api/ideas/[id]/market-analysis — анализ рынка + SEO (#34, #35)
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
  if (idea.marketAnalysis) {
    try {
      const cached = JSON.parse(idea.marketAnalysis);
      return NextResponse.json({ analysis: cached, cached: true });
    } catch { /* перегенерируем */ }
  }

  const settings = await prisma.settings.findUnique({ where: { id: "main" } });
  if (!settings?.anthropicApiKey) {
    return NextResponse.json(
      { error: "Не указан API-ключ Anthropic." },
      { status: 400 }
    );
  }

  try {
    // Собираем данные валидации для более точного анализа
    let validationContext = "";
    try {
      const validationData = await collectValidationData({
        ideaName: idea.name,
        ideaDescription: idea.description,
        targetAudience: idea.targetAudience,
        wordstatToken: settings.wordstatToken || undefined,
        dadataApiKey: settings.dadataApiKey || undefined,
      });
      validationContext = formatValidationForPrompt(validationData);
    } catch {
      console.warn("[Market Analysis] Валидация не удалась, продолжаем без неё");
    }

    const result = await analyzeMarket({
      ideaName: idea.name,
      ideaDescription: idea.description,
      targetAudience: idea.targetAudience,
      monetization: idea.monetization,
      market: idea.market,
      validationContext: validationContext || undefined,
      apiKey: settings.anthropicApiKey,
      model: settings.preferredModel || "claude-haiku-4-5-20251001",
    });

    // Сохраняем в БД
    await prisma.businessIdea.update({
      where: { id },
      data: { marketAnalysis: JSON.stringify(result.analysis) },
    });

    return NextResponse.json({
      analysis: result.analysis,
      cached: false,
      tokensUsed: result.tokensIn + result.tokensOut,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Ошибка анализа рынка";
    console.error("[Market Analysis] Ошибка:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
