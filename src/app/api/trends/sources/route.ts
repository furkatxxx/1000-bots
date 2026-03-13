import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const ALL_SOURCES = [
  { name: "google_trends", label: "Google Trends" },
  { name: "yandex_wordstat", label: "Яндекс Вордстат" },
  { name: "vk_trends", label: "VK Тренды" },
  { name: "reddit", label: "Reddit" },
];

// GET /api/trends/sources — список источников с их состоянием
export async function GET() {
  try {
    // Инициализируем только при первом запуске (а не каждый GET)
    // Инициализируем через upsert только если таблица пуста
    const existingCount = await prisma.trendSource.count();
    if (existingCount === 0) {
      for (const s of ALL_SOURCES) {
        await prisma.trendSource.upsert({
          where: { name: s.name },
          update: {},
          create: { name: s.name, label: s.label, enabled: true },
        });
      }
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
  } catch (error) {
    console.error("[API /trends/sources] Ошибка GET:", error);
    return NextResponse.json({ error: "Ошибка загрузки источников" }, { status: 500 });
  }
}

// POST /api/trends/sources — обновить вкл/выкл источников
export async function POST(request: Request) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 });
    }

    const sourcesMap = body.sources as Record<string, boolean>;
    if (!sourcesMap || typeof sourcesMap !== "object") {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }

    const validNames = new Set(ALL_SOURCES.map((s) => s.name));

    for (const [name, enabled] of Object.entries(sourcesMap)) {
      if (!validNames.has(name)) continue;
      if (typeof enabled !== "boolean") continue;

      const def = ALL_SOURCES.find((d) => d.name === name);
      if (!def) continue;

      await prisma.trendSource.upsert({
        where: { name },
        update: { enabled },
        create: { name, label: def.label, enabled },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /trends/sources] Ошибка POST:", error);
    return NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 });
  }
}
