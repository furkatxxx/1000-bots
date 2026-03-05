import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  runHealthCheck,
  sendHealthTelegramAlert,
} from "@/lib/health-check";

// GET /api/health/sources — проверить все источники
export async function GET() {
  return handleHealthCheck(false);
}

// POST /api/health/sources — проверить + отправить уведомление в Telegram при проблемах
export async function POST() {
  return handleHealthCheck(true);
}

async function handleHealthCheck(sendTelegram: boolean) {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: "main" },
    });

    const result = await runHealthCheck({
      googleTrendsGeo: settings?.googleTrendsGeo || "US",
      newsApiKey: settings?.newsApiKey,
      vkServiceToken: settings?.vkServiceToken,
      wordstatToken: settings?.wordstatToken,
    });

    // Отправляем в Telegram если есть проблемы и запрошено
    if (
      sendTelegram &&
      result.failed > 0 &&
      settings?.telegramBotToken &&
      settings?.telegramChatId
    ) {
      await sendHealthTelegramAlert(
        settings.telegramBotToken,
        settings.telegramChatId,
        result,
        "monitoring"
      );
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Неизвестная ошибка" },
      { status: 500 }
    );
  }
}
