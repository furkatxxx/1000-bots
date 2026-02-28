import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deepDiveIdea } from "@/lib/ai-brain";

// POST /api/ideas/[id]/deep-dive — сгенерировать детальный план реализации
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const idea = await prisma.businessIdea.findUnique({ where: { id } });
  if (!idea) {
    return NextResponse.json({ error: "Идея не найдена" }, { status: 404 });
  }

  // Если уже есть deep dive — возвращаем его
  if (idea.deepDive) {
    return NextResponse.json({ deepDive: idea.deepDive, cached: true });
  }

  // Получаем API-ключ
  const settings = await prisma.settings.findUnique({ where: { id: "main" } });
  if (!settings?.anthropicApiKey) {
    return NextResponse.json(
      { error: "Не указан API-ключ Anthropic. Добавьте его в настройках." },
      { status: 400 }
    );
  }

  try {
    const result = await deepDiveIdea({
      idea: {
        name: idea.name,
        description: idea.description,
        targetAudience: idea.targetAudience,
        monetization: idea.monetization,
        actionPlan: idea.actionPlan,
      },
      apiKey: settings.anthropicApiKey,
      model: settings.preferredModel || "claude-haiku-4-5-20251001",
    });

    // Сохраняем в БД
    await prisma.businessIdea.update({
      where: { id },
      data: { deepDive: result.deepDive },
    });

    return NextResponse.json({
      deepDive: result.deepDive,
      cached: false,
      tokensUsed: result.tokensIn + result.tokensOut,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Неизвестная ошибка";
    console.error("[Deep Dive] Ошибка:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
