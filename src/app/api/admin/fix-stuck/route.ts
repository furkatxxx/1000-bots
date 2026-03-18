import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/admin/fix-stuck — одноразовый фикс зависших отчётов
// Находит все generating отчёты с идеями и помечает их как complete
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
