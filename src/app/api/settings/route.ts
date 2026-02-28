import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/settings — получить настройки
export async function GET() {
  const settings = await prisma.settings.findUnique({
    where: { id: "main" },
  });

  if (!settings) {
    // Создаём дефолтные настройки
    const created = await prisma.settings.create({
      data: { id: "main" },
    });
    return NextResponse.json({ settings: maskKeys(created) });
  }

  return NextResponse.json({ settings: maskKeys(settings) });
}

// POST /api/settings — обновить настройки
export async function POST(request: Request) {
  const body = await request.json();

  const data: Record<string, unknown> = {};

  if (typeof body.anthropicApiKey === "string") {
    data.anthropicApiKey = body.anthropicApiKey;
  }
  if (typeof body.newsApiKey === "string") {
    data.newsApiKey = body.newsApiKey;
  }
  if (typeof body.googleTrendsGeo === "string") {
    data.googleTrendsGeo = body.googleTrendsGeo;
  }
  if (typeof body.maxIdeasPerReport === "number") {
    data.maxIdeasPerReport = Math.min(Math.max(body.maxIdeasPerReport, 1), 30);
  }
  if (typeof body.preferredModel === "string") {
    data.preferredModel = body.preferredModel;
  }
  if (typeof body.wordstatToken === "string") {
    data.wordstatToken = body.wordstatToken;
  }

  const settings = await prisma.settings.upsert({
    where: { id: "main" },
    update: data,
    create: { id: "main", ...data },
  });

  return NextResponse.json({ settings: maskKeys(settings) });
}

// Маскируем API-ключи для безопасности
function maskKeys(settings: Record<string, unknown>) {
  return {
    ...settings,
    anthropicApiKey: maskString(settings.anthropicApiKey as string | null),
    newsApiKey: maskString(settings.newsApiKey as string | null),
    wordstatToken: maskString(settings.wordstatToken as string | null),
  };
}

function maskString(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return value.slice(0, 4) + "••••" + value.slice(-4);
}
