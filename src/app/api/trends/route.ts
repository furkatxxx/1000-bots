import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { collectAll } from "@/lib/collectors";

// GET /api/trends — получить тренды из БД
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get("source");
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 100, 1), 500);

    const where: Record<string, unknown> = {};
    if (source) where.sourceId = source;

    const trends = await prisma.trendData.findMany({
      where,
      orderBy: { fetchedAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ trends, count: trends.length });
  } catch (error) {
    console.error("[API /trends] Ошибка GET:", error);
    return NextResponse.json({ error: "Ошибка загрузки трендов" }, { status: 500 });
  }
}

// POST /api/trends — запустить сбор трендов из всех источников
export async function POST() {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: "main" },
    });

    const sources = await prisma.trendSource.findMany({
      where: { enabled: true },
    });
    const enabledSources = sources.map((s) => s.name);

    // Передаём ВСЕ API-ключи из настроек
    const items = await collectAll({
      newsApiKey: settings?.newsApiKey || undefined,
      wordstatToken: settings?.wordstatToken || undefined,
      googleTrendsGeo: settings?.googleTrendsGeo || "US",
      telemetrApiKey: settings?.telemetrApiKey || undefined,
      vkServiceToken: settings?.vkServiceToken || undefined,
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

    // Обновляем время последнего запуска
    const sourcesUsed = [...new Set(items.map((i) => i.sourceId))];
    for (const name of sourcesUsed) {
      await prisma.trendSource.upsert({
        where: { name },
        update: { lastRunAt: new Date() },
        create: {
          name,
          label: name,
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
