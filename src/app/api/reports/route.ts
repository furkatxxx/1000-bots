import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createOrGetTodayReport, checkHealth, runFullPipeline } from "@/lib/pipeline";

export const maxDuration = 300;

// Дедлайн: 2026-03-07 12:00 МСК (09:00 UTC)
const LOCK_AFTER = new Date("2026-03-07T09:00:00Z");
const GENERATE_PASSWORD = process.env.GENERATE_PASSWORD || "";

// GET /api/reports — список всех отчётов
export async function GET() {
  try {
    const reports = await prisma.dailyReport.findMany({
      orderBy: { date: "desc" },
      include: { _count: { select: { ideas: true } } },
    });

    const favoritesCount = await prisma.businessIdea.count({
      where: { isFavorite: true },
    });

    return NextResponse.json({
      reports: reports.map((r) => ({
        id: r.id,
        date: r.date.toISOString(),
        status: r.status,
        trendsCount: r.trendsCount,
        ideasCount: r._count.ideas,
        aiModel: r.aiModel,
        generatedAt: r.generatedAt?.toISOString() || null,
        createdAt: r.createdAt.toISOString(),
      })),
      favoritesCount,
    });
  } catch (error) {
    console.error("[API /reports] Ошибка GET:", error);
    return NextResponse.json({ error: "Ошибка загрузки отчётов" }, { status: 500 });
  }
}

// POST /api/reports — генерация отчёта (wrapper над pipeline)
export async function POST(request: NextRequest) {
  // Защита паролем после дедлайна
  if (Date.now() > LOCK_AFTER.getTime()) {
    try {
      const body = await request.json();
      if (body?.password !== GENERATE_PASSWORD) {
        return NextResponse.json(
          { success: false, error: "Требуется пароль для генерации", needPassword: true },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, error: "Требуется пароль для генерации", needPassword: true },
        { status: 403 }
      );
    }
  }

  try {
    const settings = await prisma.settings.findUnique({ where: { id: "main" } });
    if (!settings?.anthropicApiKey) {
      return NextResponse.json(
        { success: false, error: "Не указан API-ключ Anthropic. Добавьте его в настройках." },
        { status: 400 }
      );
    }

    // Проверка здоровья источников
    const health = await checkHealth(settings);
    if (!health.ok) {
      return NextResponse.json(
        { success: false, error: health.error, healthCheck: health.healthCheck },
        { status: 503 }
      );
    }

    // Создать или получить отчёт
    const reportResult = await createOrGetTodayReport();
    if ("error" in reportResult) {
      return NextResponse.json({ success: false, error: reportResult.error }, { status: 409 });
    }

    // Запуск полного pipeline (3 этапа)
    const result = await runFullPipeline(reportResult.reportId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      report: {
        id: reportResult.reportId,
        ideasCount: result.ideasCount,
        trendsCount: result.trendsCount,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Ошибка генерации";
    console.error("[Reports] Ошибка:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// DELETE /api/reports — удалить все отчёты кроме сегодняшнего
export async function DELETE() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const oldReports = await prisma.dailyReport.findMany({
      where: { date: { lt: today } },
      select: { id: true, date: true, _count: { select: { ideas: true } } },
    });

    if (oldReports.length === 0) {
      return NextResponse.json({ message: "Нечего удалять", deleted: 0 });
    }

    const totalIdeas = oldReports.reduce((sum, r) => sum + r._count.ideas, 0);

    // Каскадно удалит идеи через onDelete: Cascade
    const result = await prisma.dailyReport.deleteMany({
      where: { date: { lt: today } },
    });

    console.log(`[Cleanup] Удалено ${result.count} отчётов и ~${totalIdeas} идей`);

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
