import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const DEFAULT_SOURCES = [
  { name: "hacker_news", label: "Hacker News" },
  { name: "google_trends", label: "Google Trends" },
  { name: "news_api", label: "NewsAPI" },
  { name: "github_trending", label: "GitHub Trending" },
  { name: "product_hunt", label: "Product Hunt" },
];

// GET /api/trends/sources — список источников с их состоянием
export async function GET() {
  // Убедимся что все источники существуют в БД
  for (const def of DEFAULT_SOURCES) {
    await prisma.trendSource.upsert({
      where: { name: def.name },
      update: {},
      create: { name: def.name, label: def.label, enabled: true },
    });
  }

  const sources = await prisma.trendSource.findMany({
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    sources: sources.map((s) => ({
      name: s.name,
      label: s.label,
      enabled: s.enabled,
    })),
  });
}

// POST /api/trends/sources — обновить вкл/выкл источников
export async function POST(request: Request) {
  const body = await request.json();
  const sourcesMap = body.sources as Record<string, boolean>;

  if (!sourcesMap || typeof sourcesMap !== "object") {
    return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
  }

  for (const [name, enabled] of Object.entries(sourcesMap)) {
    const def = DEFAULT_SOURCES.find((d) => d.name === name);
    if (!def) continue;

    await prisma.trendSource.upsert({
      where: { name },
      update: { enabled },
      create: { name, label: def.label, enabled },
    });
  }

  return NextResponse.json({ success: true });
}
