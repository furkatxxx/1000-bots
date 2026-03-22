import { prisma } from "@/lib/db";

// Маппинг причин отклонения → инструкции для промпта
const REJECT_INSTRUCTIONS: Record<string, string> = {
  vague: "Описывай конкретную ситуацию: кто, что делает, сколько теряет. Без абстракций.",
  crowded: "Называй 3 конкурента и объясни почему твоё решение НЕ конкурирует, а работает в другой нише.",
  not_my_profile: "Жёстче фильтруй: без найма, лицензий, физпроизводства, холодных звонков.",
  bad_economics: "Покажи unit-экономику: цена привлечения клиента, средний чек, сколько клиентов нужно для окупаемости.",
  boring: "Избегай шаблонных форматов. Ищи неожиданные ниши и пересечения.",
};

// Маппинг причин одобрения → приоритеты для промпта
const LIKE_INSTRUCTIONS: Record<string, string> = {
  real_pain: "Приоритет: идеи где боль можно описать одним предложением.",
  easy_start: "Приоритет: MVP за 3-7 дней, без сложных интеграций.",
  clear_audience: "Аудитория должна быть описана так, чтобы найти 100 таких людей за день в Telegram.",
  good_money: "Модель монетизации: подписка или разовая покупка, цена обоснована сравнением с альтернативами.",
};

export interface TasteProfile {
  totalFeedback: number;
  rejectCounts: Record<string, number>;
  likeCounts: Record<string, number>;
  promptBlock: string | null;
}

// Собирает профиль вкуса из всех оценок в БД
export async function buildTasteProfile(): Promise<TasteProfile> {
  const empty: TasteProfile = { totalFeedback: 0, rejectCounts: {}, likeCounts: {}, promptBlock: null };

  // try/catch — колонки могут ещё не существовать в БД (до db push)
  let rejected: { rejectReason: string | null; feedbackComment: string | null }[];
  let liked: { likeReasons: string | null; feedbackComment: string | null }[];
  try {
    rejected = await prisma.businessIdea.findMany({
      where: { rejectReason: { not: null } },
      select: { rejectReason: true, feedbackComment: true },
    });

    liked = await prisma.businessIdea.findMany({
      where: { likeReasons: { not: null } },
      select: { likeReasons: true, feedbackComment: true },
    });
  } catch (err) {
    console.warn("[TasteProfile] Колонки обратной связи ещё не добавлены в БД:", err);
    return empty;
  }

  const totalFeedback = rejected.length + liked.length;

  // Мало оценок — профиль ещё не сформирован
  if (totalFeedback < 5) {
    return { totalFeedback, rejectCounts: {}, likeCounts: {}, promptBlock: null };
  }

  // Подсчёт причин отклонения
  const rejectCounts: Record<string, number> = {};
  for (const r of rejected) {
    if (r.rejectReason) {
      rejectCounts[r.rejectReason] = (rejectCounts[r.rejectReason] || 0) + 1;
    }
  }

  // Подсчёт причин одобрения
  const likeCounts: Record<string, number> = {};
  for (const l of liked) {
    if (l.likeReasons) {
      try {
        const reasons: string[] = JSON.parse(l.likeReasons);
        for (const reason of reasons) {
          likeCounts[reason] = (likeCounts[reason] || 0) + 1;
        }
      } catch { /* skip */ }
    }
  }

  // Генерируем текстовый блок для промпта
  const lines: string[] = [];
  lines.push(`## Профиль основателя (на основе ${totalFeedback} оценок)`);

  // Топ причины отклонения (>20% от всех отклонений)
  const rejectTotal = rejected.length || 1;
  const topRejects = Object.entries(rejectCounts)
    .sort((a, b) => b[1] - a[1])
    .filter(([, count]) => count / rejectTotal > 0.2);

  if (topRejects.length > 0) {
    lines.push("");
    lines.push("### Что НЕ нравится (учти при генерации):");
    for (const [reason, count] of topRejects) {
      const pct = Math.round((count / rejectTotal) * 100);
      const instruction = REJECT_INSTRUCTIONS[reason];
      if (instruction) {
        lines.push(`- ${pct}% отклонений: ${instruction}`);
      }
    }
  }

  // Топ причины одобрения (>30% от всех одобренных)
  const likeTotal = liked.length || 1;
  const topLikes = Object.entries(likeCounts)
    .sort((a, b) => b[1] - a[1])
    .filter(([, count]) => count / likeTotal > 0.3);

  if (topLikes.length > 0) {
    lines.push("");
    lines.push("### Что НРАВИТСЯ (приоритет):");
    for (const [reason, count] of topLikes) {
      const pct = Math.round((count / likeTotal) * 100);
      const instruction = LIKE_INSTRUCTIONS[reason];
      if (instruction) {
        lines.push(`- ${pct}% одобрений за это: ${instruction}`);
      }
    }
  }

  // Комментарии (последние 5 уникальных)
  const allComments = [...rejected, ...liked]
    .map((i) => i.feedbackComment)
    .filter((c): c is string => !!c && c.trim().length > 0);
  const uniqueComments = [...new Set(allComments)].slice(-5);

  if (uniqueComments.length > 0) {
    lines.push("");
    lines.push("### Комментарии основателя:");
    for (const c of uniqueComments) {
      lines.push(`- "${c}"`);
    }
  }

  return {
    totalFeedback,
    rejectCounts,
    likeCounts,
    promptBlock: lines.join("\n"),
  };
}
