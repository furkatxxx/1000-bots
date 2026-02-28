import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// POST /api/telegram/send-top — отправить ТОП-5 идей в Telegram
export async function POST() {
  const settings = await prisma.settings.findUnique({ where: { id: "main" } });

  if (!settings?.telegramBotToken || !settings?.telegramChatId) {
    return NextResponse.json(
      { error: "Не настроен Telegram. Добавьте токен бота и Chat ID в настройках." },
      { status: 400 }
    );
  }

  // Берём последний завершённый отчёт
  const report = await prisma.dailyReport.findFirst({
    where: { status: "complete" },
    orderBy: { date: "desc" },
    include: {
      ideas: {
        where: { isArchived: false },
      },
    },
  });

  if (!report || report.ideas.length === 0) {
    return NextResponse.json(
      { error: "Нет готовых идей для отправки. Сгенерируйте отчёт." },
      { status: 400 }
    );
  }

  // Сортируем идеи по шансу успеха (убывание) → берём ТОП-5
  const topIdeas = report.ideas
    .sort((a, b) => (b.successChance || 0) - (a.successChance || 0))
    .slice(0, 5);

  // Формируем сообщение
  const date = report.date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  let message = `🏆 *ТОП-5 бизнес-идей*\n📅 ${date}\n\n`;

  topIdeas.forEach((idea, i) => {
    const medal = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"][i];
    const chance = idea.successChance ? `${idea.successChance}%` : "—";
    const revenue = idea.estimatedRevenue || "—";
    const time = idea.timeToLaunch || "—";
    const diff: Record<string, string> = { easy: "🟢", medium: "🟡", hard: "🔴" };
    const diffIcon = diff[idea.difficulty] || "⚪";

    message += `${medal} *${escapeMarkdown(idea.name)}* ${idea.emoji}\n`;
    message += `${escapeMarkdown(idea.description.slice(0, 150))}${idea.description.length > 150 ? "..." : ""}\n\n`;
    message += `📊 Шанс: *${chance}* · 💰 Доход: *${escapeMarkdown(revenue)}*\n`;
    message += `⏱ До MVP: *${escapeMarkdown(time)}* · ${diffIcon} Сложность: ${idea.difficulty}\n`;
    message += `───────────────\n\n`;
  });

  message += `💡 Всего идей в отчёте: ${report.ideas.length}`;

  // Отправляем в Telegram
  try {
    const tgUrl = `https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`;
    const res = await fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: settings.telegramChatId,
        text: message,
        parse_mode: "Markdown",
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

// Экранирование спецсимволов Markdown для Telegram
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}
