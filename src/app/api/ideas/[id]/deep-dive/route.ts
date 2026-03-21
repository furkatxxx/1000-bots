import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deepDiveIdea } from "@/lib/ai-brain";

// POST /api/ideas/[id]/deep-dive — сгенерировать глубокий анализ для существующей идеи
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const idea = await prisma.businessIdea.findUnique({ where: { id } });
  if (!idea) {
    return NextResponse.json({ error: "Идея не найдена" }, { status: 404 });
  }

  if (idea.deepDive) {
    return NextResponse.json({ deepDive: idea.deepDive, cached: true });
  }

  const settings = await prisma.settings.findUnique({ where: { id: "main" } });
  if (!settings?.anthropicApiKey) {
    return NextResponse.json(
      { error: "Не указан API-ключ Anthropic. Добавьте его в настройках." },
      { status: 400 }
    );
  }

  try {
    const result = await deepDiveIdea({
      concept: {
        name: idea.name,
        pain: idea.description,
        solution: idea.description,
        who: idea.targetAudience,
        whyNow: idea.trendBacking || "",
        market: (idea.market as "russia" | "global" | "both") || "both",
      },
      apiKey: settings.anthropicApiKey,
    });

    // Формируем текст deep dive из результата
    const deepDiveText = result.result
      ? `## Вердикт: ${result.verdict}\n\n${result.result.description}\n\n### Конкуренты\n${result.competitors || "Не указаны"}\n\n### Уникальный угол\n${result.uniqueAngle || "Не указан"}\n\n### Юнит-экономика\n${result.unitEconomics || "Не рассчитана"}`
      : `## Вердикт: KILL\n\n${result.killReason || "Не прошла глубокий анализ"}`;

    await prisma.businessIdea.update({
      where: { id },
      data: { deepDive: deepDiveText },
    });

    return NextResponse.json({
      deepDive: deepDiveText,
      cached: false,
      tokensUsed: result.tokensIn + result.tokensOut,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Неизвестная ошибка";
    console.error("[Deep Dive] Ошибка:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
