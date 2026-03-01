import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/ideas/[id]/metrics — получить метрики (#38)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const metrics = await prisma.ideaMetric.findMany({
    where: { ideaId: id },
    orderBy: { date: "desc" },
    take: 100,
  });

  // Агрегируем по имени (последнее значение)
  const latest: Record<string, { value: number; date: string }> = {};
  for (const m of metrics) {
    if (!latest[m.name]) {
      latest[m.name] = { value: m.value, date: m.date.toISOString() };
    }
  }

  // Считаем подписчиков из waitlist
  const waitlistCount = await prisma.waitlistEntry.count({
    where: { ideaId: id },
  });

  return NextResponse.json({
    metrics: metrics.map((m) => ({
      id: m.id,
      name: m.name,
      value: m.value,
      date: m.date.toISOString(),
    })),
    latest,
    waitlistCount,
  });
}

// POST /api/ideas/[id]/metrics — добавить метрику
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { name, value } = body;

    if (!name || typeof value !== "number") {
      return NextResponse.json(
        { error: "Нужны name (строка) и value (число)" },
        { status: 400 }
      );
    }

    const validNames = ["visitors", "signups", "revenue", "conversion", "retention", "mrr"];
    if (!validNames.includes(name)) {
      return NextResponse.json(
        { error: `Допустимые метрики: ${validNames.join(", ")}` },
        { status: 400 }
      );
    }

    const metric = await prisma.ideaMetric.create({
      data: { ideaId: id, name, value },
    });

    return NextResponse.json({
      metric: {
        id: metric.id,
        name: metric.name,
        value: metric.value,
        date: metric.date.toISOString(),
      },
    });
  } catch (error) {
    console.error("[Metrics] Ошибка:", error);
    return NextResponse.json(
      { error: "Ошибка сохранения метрики" },
      { status: 500 }
    );
  }
}
