import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// DELETE /api/admin/fix-stuck?before=2026-03-12 — удалить отчёты и идеи до указанной даты
export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }

  const before = request.nextUrl.searchParams.get("before");
  if (!before) {
    return NextResponse.json({ error: "Укажи ?before=ГГГГ-ММ-ДД" }, { status: 400 });
  }

  const beforeDate = new Date(before + "T00:00:00.000Z");

  // Находим отчёты до указанной даты
  const reports = await prisma.dailyReport.findMany({
    where: { date: { lt: beforeDate } },
    include: { _count: { select: { ideas: true } } },
  });

  if (reports.length === 0) {
    return NextResponse.json({ deleted: 0, message: "Нет отчётов до " + before });
  }

  // Удаляем идеи (каскад не работает автоматически в некоторых случаях)
  const reportIds = reports.map(r => r.id);
  const deletedIdeas = await prisma.businessIdea.deleteMany({
    where: { reportId: { in: reportIds } },
  });

  // Удаляем отчёты
  const deletedReports = await prisma.dailyReport.deleteMany({
    where: { id: { in: reportIds } },
  });

  const details = reports.map(r => ({
    date: r.date.toISOString().slice(0, 10),
    ideas: r._count.ideas,
    status: r.status,
  }));

  return NextResponse.json({
    deletedReports: deletedReports.count,
    deletedIdeas: deletedIdeas.count,
    details,
  });
}

// GET — оставляем для fix-stuck (на всякий случай)
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }

  const stuck = await prisma.dailyReport.findMany({
    where: { status: "generating" },
    include: { _count: { select: { ideas: true } } },
  });

  const fixed: { date: string; ideas: number }[] = [];

  for (const report of stuck) {
    if (report._count.ideas > 0) {
      await prisma.dailyReport.update({
        where: { id: report.id },
        data: {
          status: "complete",
          pipelineStage: null,
          generatedAt: new Date(),
          trendAnalysis: null,
          filteredTrendsJson: null,
        },
      });
      fixed.push({
        date: report.date.toISOString().slice(0, 10),
        ideas: report._count.ideas,
      });
    }
  }

  return NextResponse.json({
    fixed: fixed.length,
    details: fixed,
    message: fixed.length > 0
      ? `Восстановлено ${fixed.length} отчётов`
      : "Нет зависших отчётов с идеями",
  });
}
