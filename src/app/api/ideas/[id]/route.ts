import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// PATCH /api/ideas/[id] — обновить рейтинг, избранное, архив
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 });
  }

  // Проверяем что идея существует
  const existing = await prisma.businessIdea.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Идея не найдена" },
      { status: 404 }
    );
  }

  // Собираем только разрешённые поля
  const data: Record<string, unknown> = {};

  if (typeof body.rating === "number" && body.rating >= 1 && body.rating <= 5) {
    data.rating = body.rating;
  }
  if (body.rating === null) {
    data.rating = null;
  }
  if (typeof body.isFavorite === "boolean") {
    data.isFavorite = body.isFavorite;
  }
  if (typeof body.isArchived === "boolean") {
    data.isArchived = body.isArchived;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Нет данных для обновления" },
      { status: 400 }
    );
  }

  const updated = await prisma.businessIdea.update({
    where: { id },
    data,
  });

  return NextResponse.json({
    idea: {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
    },
  });
}

// GET /api/ideas/[id] — получить одну идею
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const idea = await prisma.businessIdea.findUnique({ where: { id } });

  if (!idea) {
    return NextResponse.json(
      { error: "Идея не найдена" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    idea: {
      ...idea,
      createdAt: idea.createdAt.toISOString(),
    },
  });
}
