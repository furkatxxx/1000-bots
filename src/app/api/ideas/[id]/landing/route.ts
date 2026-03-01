import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateLanding } from "@/lib/landing-generator";

// POST /api/ideas/[id]/landing — генерация лендинга (#33)
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const idea = await prisma.businessIdea.findUnique({ where: { id } });
  if (!idea) {
    return NextResponse.json({ error: "Идея не найдена" }, { status: 404 });
  }

  // Если уже есть лендинг — возвращаем кэш
  if (idea.landingHtml) {
    return NextResponse.json({ html: idea.landingHtml, cached: true });
  }

  const settings = await prisma.settings.findUnique({ where: { id: "main" } });
  if (!settings?.anthropicApiKey) {
    return NextResponse.json(
      { error: "Не указан API-ключ Anthropic." },
      { status: 400 }
    );
  }

  try {
    const siteUrl = settings.siteUrl?.replace(/\/+$/, "") || "";
    const waitlistUrl = siteUrl ? `${siteUrl}/api/waitlist` : undefined;

    const result = await generateLanding({
      ideaName: idea.name,
      ideaEmoji: idea.emoji,
      ideaDescription: idea.description,
      targetAudience: idea.targetAudience,
      monetization: idea.monetization,
      market: idea.market,
      apiKey: settings.anthropicApiKey,
      model: settings.preferredModel || "claude-haiku-4-5-20251001",
      waitlistApiUrl: waitlistUrl,
    });

    // Сохраняем в БД
    await prisma.businessIdea.update({
      where: { id },
      data: { landingHtml: result.html },
    });

    return NextResponse.json({
      html: result.html,
      cached: false,
      tokensUsed: result.tokensIn + result.tokensOut,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Ошибка генерации лендинга";
    console.error("[Landing] Ошибка:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/ideas/[id]/landing — получить HTML лендинга (для iframe)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const idea = await prisma.businessIdea.findUnique({
    where: { id },
    select: { landingHtml: true },
  });

  if (!idea?.landingHtml) {
    return new Response("<h1>Лендинг ещё не создан</h1>", {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response(idea.landingHtml, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
