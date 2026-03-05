import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const ALLOWED_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
];

// GET /api/settings — получить настройки
export async function GET() {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: "main" },
    });

    if (!settings) {
      const created = await prisma.settings.create({
        data: { id: "main" },
      });
      return NextResponse.json({ settings: maskKeys(created) });
    }

    return NextResponse.json({ settings: maskKeys(settings) });
  } catch (error) {
    console.error("[API /settings] Ошибка GET:", error);
    return NextResponse.json({ error: "Ошибка загрузки настроек" }, { status: 500 });
  }
}

// POST /api/settings — обновить настройки
export async function POST(request: Request) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    const MAX_KEY_LENGTH = 500;

    // Строковые поля с лимитом длины
    const stringFields = [
      "anthropicApiKey", "newsApiKey", "wordstatToken",
      "telegramBotToken", "telegramChatId",
      "dadataApiKey", "vkServiceToken",
      "googleTrendsGeo", "siteUrl",
    ];

    for (const field of stringFields) {
      if (typeof body[field] === "string") {
        const value = (body[field] as string).slice(0, MAX_KEY_LENGTH);
        data[field] = value;
      }
    }

    if (typeof body.maxIdeasPerReport === "number") {
      data.maxIdeasPerReport = Math.min(Math.max(body.maxIdeasPerReport, 1), 30);
    }

    if (typeof body.preferredModel === "string") {
      if (ALLOWED_MODELS.includes(body.preferredModel)) {
        data.preferredModel = body.preferredModel;
      }
    }

    // Этап 8: модель для экспертов
    if (typeof body.expertModel === "string") {
      if (body.expertModel === "" || ALLOWED_MODELS.includes(body.expertModel)) {
        data.expertModel = body.expertModel || null;
      }
    }

    // Этап 8: расписание
    if (typeof body.scheduleEnabled === "boolean") {
      data.scheduleEnabled = body.scheduleEnabled;
    }
    if (typeof body.scheduleTime === "string" && /^\d{2}:\d{2}$/.test(body.scheduleTime)) {
      data.scheduleTime = body.scheduleTime;
    }
    if (typeof body.scheduleAutoTelegram === "boolean") {
      data.scheduleAutoTelegram = body.scheduleAutoTelegram;
    }

    const settings = await prisma.settings.upsert({
      where: { id: "main" },
      update: data,
      create: { id: "main", ...data },
    });

    return NextResponse.json({ settings: maskKeys(settings) });
  } catch (error) {
    console.error("[API /settings] Ошибка POST:", error);
    return NextResponse.json({ error: "Ошибка сохранения настроек" }, { status: 500 });
  }
}

// Маскируем API-ключи для безопасности
function maskKeys(settings: Record<string, unknown>) {
  return {
    ...settings,
    anthropicApiKey: maskString(settings.anthropicApiKey as string | null),
    newsApiKey: maskString(settings.newsApiKey as string | null),
    wordstatToken: maskString(settings.wordstatToken as string | null),
    telegramBotToken: maskString(settings.telegramBotToken as string | null),
    telegramChatId: settings.telegramChatId || "",
    dadataApiKey: maskString(settings.dadataApiKey as string | null),
    vkServiceToken: maskString(settings.vkServiceToken as string | null),
    siteUrl: (settings.siteUrl as string) || "",
    // Этап 8
    expertModel: (settings.expertModel as string) || "",
    scheduleEnabled: settings.scheduleEnabled ?? false,
    scheduleTime: (settings.scheduleTime as string) || "08:00",
    scheduleAutoTelegram: settings.scheduleAutoTelegram ?? false,
  };
}

function maskString(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return value.slice(0, 4) + "••••" + value.slice(-4);
}
