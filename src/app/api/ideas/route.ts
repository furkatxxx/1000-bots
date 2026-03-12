import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/ideas — все идеи за всё время с фильтрами
// Параметры: ?market=russia|global|both &difficulty=easy|medium|hard &favorite=true &archived=false
//            &sort=expert|chance|date|revenue &search=текст &limit=50 &offset=0
export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl;
    const market = url.searchParams.get("market");
    const difficulty = url.searchParams.get("difficulty");
    const favorite = url.searchParams.get("favorite");
    const archived = url.searchParams.get("archived");
    const search = url.searchParams.get("search");
    const sort = url.searchParams.get("sort") || "date";
    const verdict = url.searchParams.get("verdict");
    const period = url.searchParams.get("period");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
    const offset = Number(url.searchParams.get("offset")) || 0;

    // Собираем фильтры
    const where: Record<string, unknown> = {};

    if (market === "russia") {
      where.market = { in: ["russia", "both"] };
    } else if (market === "global") {
      where.market = { in: ["global", "both"] };
    } else if (market === "both") {
      where.market = "both";
    }
    if (difficulty && ["easy", "medium", "hard"].includes(difficulty)) {
      where.difficulty = difficulty;
    }
    if (favorite === "true") {
      where.isFavorite = true;
    }
    if (archived === "true") {
      where.isArchived = true;
    } else if (archived !== "all") {
      where.isArchived = false; // По умолчанию скрываем архивные
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }

    if (period === "today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      where.createdAt = { gte: today };
    } else if (period === "week") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      where.createdAt = { gte: weekAgo };
    } else if (period === "month") {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      where.createdAt = { gte: monthAgo };
    }

    // Только идеи из завершённых отчётов
    where.report = { status: "complete" };

    // Сортировка
    let orderBy: Record<string, string> = { createdAt: "desc" };
    if (sort === "date") orderBy = { createdAt: "desc" };
    if (sort === "name_asc") orderBy = { name: "asc" };
    if (sort === "name_desc") orderBy = { name: "desc" };

    // Получаем идеи
    const [ideas, total] = await Promise.all([
      prisma.businessIdea.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
        include: { report: { select: { date: true, aiModel: true } } },
      }),
      prisma.businessIdea.count({ where }),
    ]);

    // Парсим JSON-поля и сортируем по экспертам если нужно
    let mapped = ideas.map((idea) => {
      let expertAnalysis = null;
      if (idea.expertAnalysis) {
        try { expertAnalysis = JSON.parse(idea.expertAnalysis); } catch { /* skip */ }
      }
      return {
        id: idea.id,
        reportId: idea.reportId,
        reportDate: idea.report.date.toISOString(),
        name: idea.name,
        emoji: idea.emoji,
        description: idea.description,
        targetAudience: idea.targetAudience,
        monetization: idea.monetization,
        startupCost: idea.startupCost,
        competitionLevel: idea.competitionLevel,
        trendBacking: idea.trendBacking,
        actionPlan: idea.actionPlan,
        claudeCodeReady: idea.claudeCodeReady,
        difficulty: idea.difficulty,
        successChance: idea.successChance,
        estimatedRevenue: idea.estimatedRevenue,
        timeToLaunch: idea.timeToLaunch,
        market: idea.market,
        expertAnalysis,
        rating: idea.rating,
        isFavorite: idea.isFavorite,
        isArchived: idea.isArchived,
        createdAt: idea.createdAt.toISOString(),
      };
    });

    // Фильтр по вердикту экспертов (в памяти, т.к. это JSON-поле)
    if (verdict === "launch" || verdict === "pivot" || verdict === "reject") {
      mapped = mapped.filter((idea) => idea.expertAnalysis?.finalVerdict === verdict);
    } else if (verdict === "none") {
      mapped = mapped.filter((idea) => !idea.expertAnalysis);
    }

    // Пересчитываем total после фильтрации по вердикту
    const filteredTotal = verdict && verdict !== "all" ? mapped.length : total;

    // Сортировка по экспертам (в памяти, т.к. это JSON-поле)
    if (sort === "expert") {
      mapped = mapped.sort((a, b) =>
        (b.expertAnalysis?.finalScore || 0) - (a.expertAnalysis?.finalScore || 0)
      );
    }

    return NextResponse.json({
      ideas: mapped,
      total: filteredTotal ?? total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[API /ideas] Ошибка:", error);
    return NextResponse.json({ error: "Ошибка загрузки идей" }, { status: 500 });
  }
}
