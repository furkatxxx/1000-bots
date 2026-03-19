import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// POST /api/admin/cleanup — удалить старые отчёты
// Параметры: ?before=2026-03-12 (удалить до этой даты, не включая)
// Без параметра — удаляет всё кроме сегодняшнего
// Защита через CRON_SECRET
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }

  try {
    const url = request.nextUrl;
    const beforeParam = url.searchParams.get("before");

    let cutoff: Date;
    if (beforeParam) {
      cutoff = new Date(beforeParam + "T00:00:00.000Z");
    } else {
      cutoff = new Date();
      cutoff.setHours(0, 0, 0, 0);
    }

    // Считаем что удалим
    const oldReports = await prisma.dailyReport.findMany({
      where: { date: { lt: cutoff } },
      select: { id: true, date: true, _count: { select: { ideas: true } } },
    });

    if (oldReports.length === 0) {
      return NextResponse.json({ message: "Нечего удалять", deleted: 0 });
    }

    const totalIdeas = oldReports.reduce((sum, r) => sum + r._count.ideas, 0);

    // Удаляем (каскадно удалит идеи через onDelete: Cascade)
    const result = await prisma.dailyReport.deleteMany({
      where: { date: { lt: cutoff } },
    });

    console.log(`[Cleanup] Удалено ${result.count} отчётов и ~${totalIdeas} идей (до ${cutoff.toISOString().slice(0,10)})`);

    return NextResponse.json({
      deleted: result.count,
      reports: oldReports.map((r) => ({
        date: r.date.toISOString().split("T")[0],
        ideas: r._count.ideas,
      })),
      totalIdeasRemoved: totalIdeas,
    });
  } catch (error) {
    console.error("[Cleanup] Ошибка:", error);
    return NextResponse.json({ error: "Ошибка очистки" }, { status: 500 });
  }
}
