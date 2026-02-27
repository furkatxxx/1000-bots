import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { collectAll } from "@/lib/collectors";

// GET /api/trends — получить тренды из БД (за сегодня по умолчанию)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source"); // фильтр по источнику
  const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);

  const where: Record<string, unknown> = {};
  if (source) where.sourceId = source;

  const trends = await prisma.trendData.findMany({
    where,
    orderBy: { fetchedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ trends, count: trends.length });
}

// POST /api/trends — запустить сбор трендов из всех источников
export async function POST() {
  try {
    // Берём настройки
    const settings = await prisma.settings.findUnique({
      where: { id: "main" },
    });

    // Список включённых источников
    const sources = await prisma.trendSource.findMany({
      where: { enabled: true },
    });
    const enabledSources = sources.map((s) => s.name);

    // Собираем тренды
    const items = await collectAll({
      newsApiKey: settings?.newsApiKey || undefined,
      googleTrendsGeo: settings?.googleTrendsGeo || "US",
      enabledSources: enabledSources.length > 0 ? enabledSources : undefined,
    });

    // Сохраняем в БД
    const saved = await prisma.trendData.createMany({
      data: items.map((item) => ({
        sourceId: item.sourceId,
        title: item.title,
        url: item.url,
        score: item.score,
        summary: item.summary,
        category: item.category,
        metadata: JSON.stringify(item.metadata),
      })),
    });

    // Обновляем время последнего запуска для каждого источника
    const sourcesUsed = [...new Set(items.map((i) => i.sourceId))];
    for (const name of sourcesUsed) {
      await prisma.trendSource.upsert({
        where: { name },
        update: { lastRunAt: new Date() },
        create: {
          name,
          label: name === "hacker_news" ? "Hacker News"
            : name === "google_trends" ? "Google Trends"
            : name === "news_api" ? "NewsAPI"
            : name,
          enabled: true,
          lastRunAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      collected: saved.count,
      sources: sourcesUsed,
    });
  } catch (error) {
    console.error("[API /trends] Ошибка сбора трендов:", error);
    return NextResponse.json(
      { success: false, error: "Ошибка сбора трендов" },
      { status: 500 }
    );
  }
}
