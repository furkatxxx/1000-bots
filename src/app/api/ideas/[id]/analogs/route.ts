import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { searchAnalogs } from "@/lib/analog-search";

// POST /api/ideas/[id]/analogs — поиск аналогов (#32)
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const idea = await prisma.businessIdea.findUnique({ where: { id } });
  if (!idea) {
    return NextResponse.json({ error: "Идея не найдена" }, { status: 404 });
  }

  // Если уже есть аналоги — возвращаем кэш
  if (idea.analogs) {
    try {
      const cached = JSON.parse(idea.analogs);
      return NextResponse.json({ analogs: cached, cached: true });
    } catch { /* перегенерируем */ }
  }

  try {
    const result = await searchAnalogs(idea.name, idea.description);

    // Сохраняем в БД
    await prisma.businessIdea.update({
      where: { id },
      data: { analogs: JSON.stringify(result) },
    });

    return NextResponse.json({ analogs: result, cached: false });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Ошибка поиска аналогов";
    console.error("[Analogs] Ошибка:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
