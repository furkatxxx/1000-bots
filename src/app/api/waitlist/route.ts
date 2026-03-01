import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// POST /api/waitlist — сбор email с лендингов (#37)
// Принимает: { ideaId, email, name? }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ideaId, email, name } = body;

    if (!ideaId || !email) {
      return NextResponse.json(
        { error: "Нужны ideaId и email" },
        { status: 400 }
      );
    }

    // Простая валидация email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Некорректный email" },
        { status: 400 }
      );
    }

    // Проверяем что идея существует
    const idea = await prisma.businessIdea.findUnique({
      where: { id: ideaId },
      select: { id: true },
    });
    if (!idea) {
      return NextResponse.json(
        { error: "Идея не найдена" },
        { status: 404 }
      );
    }

    // Сохраняем (upsert — если email уже есть, обновляем имя)
    await prisma.waitlistEntry.upsert({
      where: {
        ideaId_email: { ideaId, email },
      },
      update: { name: name || null },
      create: {
        ideaId,
        email,
        name: name || null,
      },
    });

    // Считаем общее количество подписчиков
    const count = await prisma.waitlistEntry.count({
      where: { ideaId },
    });

    return NextResponse.json({ success: true, totalSubscribers: count });
  } catch (error) {
    console.error("[Waitlist] Ошибка:", error);
    return NextResponse.json(
      { error: "Ошибка сохранения" },
      { status: 500 }
    );
  }
}

// GET /api/waitlist?ideaId=xxx — получить подписчиков
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ideaId = searchParams.get("ideaId");

  if (!ideaId) {
    return NextResponse.json(
      { error: "Нужен ideaId" },
      { status: 400 }
    );
  }

  const entries = await prisma.waitlistEntry.findMany({
    where: { ideaId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      email: e.email,
      name: e.name,
      createdAt: e.createdAt.toISOString(),
    })),
    count: entries.length,
  });
}
