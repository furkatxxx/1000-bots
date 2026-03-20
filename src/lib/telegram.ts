import { prisma } from "@/lib/db";
import { fetchWithTimeout } from "@/lib/utils";
import type { ExpertAnalysis } from "@/lib/types";

// Экранирование спецсимволов для Telegram HTML
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type SendTopResult = {
  success: boolean;
  sentCount: number;
  messageId?: number;
  error?: string;
};

// Отправить ТОП идей в Telegram (вызывается напрямую, без HTTP)
export async function sendTopToTelegram(options?: { force?: boolean }): Promise<SendTopResult> {
  const force = options?.force ?? false;

  const settings = await prisma.settings.findUnique({ where: { id: "main" } });

  if (!settings?.telegramBotToken || !settings?.telegramChatId) {
    return { success: false, sentCount: 0, error: "Не настроен Telegram" };
  }

  // Берём последний завершённый отчёт со всеми идеями
  const report = await prisma.dailyReport.findFirst({
    where: { status: "complete" },
    orderBy: { date: "desc" },
    include: {
      ideas: { where: { isArchived: false } },
    },
  });

  if (!report || report.ideas.length === 0) {
    return { success: false, sentCount: 0, error: "Нет готовых идей" };
  }

  // Умная фильтрация: только идеи с экспертной оценкой ≥ 7
  let topIdeas;
  if (force) {
    topIdeas = [...report.ideas]
      .sort((a, b) => (b.successChance || 0) - (a.successChance || 0))
      .slice(0, 5);
  } else {
    const withExperts = report.ideas
      .map((idea) => {
        let expert: ExpertAnalysis | null = null;
        if (idea.expertAnalysis) {
          try { expert = JSON.parse(idea.expertAnalysis as string) as ExpertAnalysis; } catch {}
        }
        return { ...idea, _expert: expert };
      })
      .filter((idea) => idea._expert && idea._expert.finalScore >= 7)
      .sort((a, b) => (b._expert?.finalScore || 0) - (a._expert?.finalScore || 0))
      .slice(0, 5);

    if (withExperts.length === 0) {
      return { success: true, sentCount: 0, error: "Нет идей с оценкой 7+" };
    }
    topIdeas = withExperts;
  }

  const siteUrl = settings.siteUrl?.replace(/\/+$/, "")
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  // Формируем сообщение
  const date = report.date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const title = force ? "ТОП-5 бизнес-идей" : `ТОП идей (оценка 7+/10)`;
  let message = `🏆 <b>${title}</b>\n📅 ${date}\n\n`;

  topIdeas.forEach((idea, i) => {
    const num = i + 1;
    const medal = ["🥇", "🥈", "🥉", "🏅", "🏅"][i] || "🏅";
    const escapedName = escapeHtml(idea.name);
    const marketFlag: Record<string, string> = { russia: "🇷🇺", global: "🌍", both: "🇷🇺🌍" };
    const flag = marketFlag[idea.market] || "";
    const diff: Record<string, string> = { easy: "🟢", medium: "🟡", hard: "🔴" };
    const diffIcon = diff[idea.difficulty] || "⚪";

    let expertInfo: ExpertAnalysis | null = null;
    if ("_expert" in idea && idea._expert) {
      expertInfo = idea._expert as ExpertAnalysis;
    } else if (idea.expertAnalysis) {
      try { expertInfo = JSON.parse(idea.expertAnalysis as string) as ExpertAnalysis; } catch {}
    }

    if (siteUrl) {
      message += `${medal} <b>${num}.</b> ${flag} <a href="${siteUrl}/ideas/${idea.id}"><b>${escapedName}</b></a> ${idea.emoji}\n`;
    } else {
      message += `${medal} <b>${num}.</b> ${flag} <b>${escapedName}</b> ${idea.emoji}\n`;
    }
    message += `${escapeHtml(idea.description.slice(0, 150))}${idea.description.length > 150 ? "..." : ""}\n\n`;

    if (expertInfo) {
      const verdictLabels: Record<string, string> = { launch: "✅ Запускать", pivot: "🔄 Доработать", reject: "❌ Отказаться" };
      const verdict = verdictLabels[expertInfo.finalVerdict] || expertInfo.finalVerdict;
      message += `🎯 Эксперты: <b>${expertInfo.finalScore}/10</b> · ${verdict}\n`;
    } else {
      const chance = idea.successChance ? `${idea.successChance}%` : "—";
      message += `📊 Шанс: <b>${chance}</b>\n`;
    }

    const revenue = idea.estimatedRevenue || "—";
    const time = idea.timeToLaunch || "—";
    message += `💰 Доход: <b>${escapeHtml(revenue)}</b> · ⏱ MVP: <b>${escapeHtml(time)}</b> · ${diffIcon}\n`;
    message += `───────────────\n\n`;
  });

  message += `💡 Всего идей в отчёте: ${report.ideas.length}`;
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
    return { success: false, sentCount: 0, error: `Telegram API: ${data.description || "Ошибка"}` };
  }

  return { success: true, sentCount: topIdeas.length, messageId: data.result.message_id };
}
