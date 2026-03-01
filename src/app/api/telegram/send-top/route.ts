import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchWithTimeout } from "@/lib/utils";

// POST /api/telegram/send-top — отправить ТОП-5 идей в Telegram
export async function POST() {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: "main" } });

    if (!settings?.telegramBotToken || !settings?.telegramChatId) {
      return NextResponse.json(
        { error: "Не настроен Telegram. Добавьте токен бота и Chat ID в настройках." },
        { status: 400 }
      );
    }

    // Берём последний завершённый отчёт с ТОП-5 по шансу успеха
    const report = await prisma.dailyReport.findFirst({
      where: { status: "complete" },
      orderBy: { date: "desc" },
      include: {
        ideas: {
          where: { isArchived: false },
          orderBy: { successChance: "desc" },
          take: 5,
        },
      },
    });

    if (!report || report.ideas.length === 0) {
      return NextResponse.json(
        { error: "Нет готовых идей для отправки. Сгенерируйте отчёт." },
        { status: 400 }
      );
    }

    const topIdeas = report.ideas;
    const siteUrl = settings.siteUrl?.replace(/\/+$/, "") || ""; // убираем trailing slash

    // Формируем сообщение в HTML-разметке (поддерживает жирное + ссылка одновременно)
    const date = report.date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    let message = `🏆 <b>ТОП-5 бизнес-идей</b>\n📅 ${date}\n\n`;

    topIdeas.forEach((idea, i) => {
      const num = i + 1;
      const medal = ["🥇", "🥈", "🥉", "🏅", "🏅"][i];
      const chance = idea.successChance ? `${idea.successChance}%` : "—";
      const revenue = idea.estimatedRevenue || "—";
      const time = idea.timeToLaunch || "—";
      const diff: Record<string, string> = { easy: "🟢", medium: "🟡", hard: "🔴" };
      const diffIcon = diff[idea.difficulty] || "⚪";
      const escapedName = escapeHtml(idea.name);
      const marketFlag: Record<string, string> = { russia: "🇷🇺", global: "🌍", both: "🇷🇺🌍" };
      const flag = marketFlag[idea.market] || "";

      // Номер + медаль + флаг рынка + название (жирное + кликабельная ссылка)
      if (siteUrl) {
        message += `${medal} <b>${num}.</b> ${flag} <a href="${siteUrl}/ideas/${idea.id}"><b>${escapedName}</b></a> ${idea.emoji}\n`;
      } else {
        message += `${medal} <b>${num}.</b> ${flag} <b>${escapedName}</b> ${idea.emoji}\n`;
      }
      message += `${escapeHtml(idea.description.slice(0, 150))}${idea.description.length > 150 ? "..." : ""}\n\n`;
      message += `📊 Шанс: <b>${chance}</b> · 💰 Доход: <b>${escapeHtml(revenue)}</b>\n`;
      message += `⏱ До MVP: <b>${escapeHtml(time)}</b> · ${diffIcon} Сложность: ${idea.difficulty}\n`;
      message += `───────────────\n\n`;
    });

    message += `💡 Всего идей в отчёте: ${report.ideas.length}`;

    // Ссылка на полный отчёт
    if (siteUrl) {
      message += `\n\n🔗 <a href="${siteUrl}/reports/${report.id}">Все идеи →</a>`;
    }

    // Отправляем в Telegram
    const tgUrl = `https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`;
    const res = await fetchWithTimeout(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: settings.telegramChatId,
        text: message,
        parse_mode: "HTML",
      }),
    });

    const data = await res.json();

    if (!data.ok) {
      console.error("[Telegram] Ошибка:", data);
      return NextResponse.json(
        { error: `Telegram API: ${data.description || "Неизвестная ошибка"}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      sentCount: topIdeas.length,
      messageId: data.result.message_id,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Ошибка отправки";
    console.error("[Telegram] Ошибка:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Экранирование спецсимволов для Telegram HTML
// В HTML экранируются: < > &
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
