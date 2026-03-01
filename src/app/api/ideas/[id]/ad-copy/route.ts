import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateAdCopy } from "@/lib/ad-copywriter";

// POST /api/ideas/[id]/ad-copy — генерация рекламных текстов (#36)
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const idea = await prisma.businessIdea.findUnique({ where: { id } });
  if (!idea) {
    return NextResponse.json({ error: "Идея не найдена" }, { status: 404 });
  }

  // Если уже есть — возвращаем кэш
  if (idea.adCopy) {
    try {
      const cached = JSON.parse(idea.adCopy);
      return NextResponse.json({ adCopy: cached, cached: true });
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
    const result = await generateAdCopy({
      ideaName: idea.name,
      ideaDescription: idea.description,
      targetAudience: idea.targetAudience,
      monetization: idea.monetization,
      market: idea.market,
      apiKey: settings.anthropicApiKey,
      model: settings.preferredModel || "claude-haiku-4-5-20251001",
    });

    // Сохраняем в БД
    await prisma.businessIdea.update({
      where: { id },
      data: { adCopy: JSON.stringify(result.result) },
    });

    return NextResponse.json({
      adCopy: result.result,
      cached: false,
      tokensUsed: result.tokensIn + result.tokensOut,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Ошибка генерации рекламы";
    console.error("[Ad Copy] Ошибка:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
