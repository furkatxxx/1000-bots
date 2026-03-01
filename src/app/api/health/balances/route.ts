import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAllBalances, sendBalanceAlert } from "@/lib/balance-monitor";

// GET /api/health/balances — проверить балансы всех API
export async function GET() {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: "main" },
    });

    if (!settings) {
      return NextResponse.json(
        { error: "Настройки не найдены" },
        { status: 404 }
      );
    }

    const report = await checkAllBalances({
      anthropicApiKey: settings.anthropicApiKey,
      dadataApiKey: settings.dadataApiKey,
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error("[API /health/balances] Ошибка:", error);
    return NextResponse.json(
      { error: "Ошибка проверки балансов" },
      { status: 500 }
    );
  }
}

// POST /api/health/balances — проверить балансы + отправить в Telegram если проблемы
export async function POST() {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: "main" },
    });

    if (!settings) {
      return NextResponse.json(
        { error: "Настройки не найдены" },
        { status: 404 }
      );
    }

    const report = await checkAllBalances({
      anthropicApiKey: settings.anthropicApiKey,
      dadataApiKey: settings.dadataApiKey,
    });

    // Отправляем в Telegram если есть проблемы
    if (report.hasProblems && settings.telegramBotToken && settings.telegramChatId) {
      await sendBalanceAlert(
        settings.telegramBotToken,
        settings.telegramChatId,
        report
      );
    }

    return NextResponse.json({
      ...report,
      telegramSent: report.hasProblems && !!settings.telegramBotToken,
    });
  } catch (error) {
    console.error("[API /health/balances] Ошибка:", error);
    return NextResponse.json(
      { error: "Ошибка проверки балансов" },
      { status: 500 }
    );
  }
}
