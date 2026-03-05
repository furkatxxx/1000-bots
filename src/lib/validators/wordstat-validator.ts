// Валидация спроса через Яндекс Вордстат
// Использует уже подключённый API для проверки реального спроса

import { fetchWithTimeout } from "@/lib/utils";

const WORDSTAT_BASE = "https://api.wordstat.yandex.net";

export interface WordstatValidation {
  keyword: string;
  monthlySearches: number; // основной запрос
  relatedQueries: { text: string; count: number }[];
  dynamics: { date: string; count: number }[]; // тренд за 3 месяца
  demandLevel: "high" | "medium" | "low" | "none"; // автоматическая оценка
}

// Получить данные по спросу для ключевого слова
export async function validateDemand(
  keyword: string,
  token: string
): Promise<WordstatValidation | null> {
  try {
    // 1. Получаем топ-запросы (поисковый объём)
    const topRes = await fetchWithTimeout(`${WORDSTAT_BASE}/v1/topRequests`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phrase: keyword,
        regions: [225], // 225 = вся Россия
        devices: ["all"],
      }),
    });

    if (!topRes.ok) {
      console.error(`[Wordstat Validator] Ошибка: ${topRes.status}`);
      return null;
    }

    const topData = await topRes.json();
    const rawItems = topData.topRequests || topData.queries || [];
    const queries: { text: string; count: number }[] = rawItems.map((q: { phrase?: string; text?: string; count: number }) => ({
      text: q.phrase || q.text || "",
      count: q.count,
    }));
    const monthlySearches = queries.length > 0 ? queries[0].count : 0;

    // 2. Получаем динамику за 3 месяца
    const fromDate = getMonday90DaysAgo();
    const dynRes = await fetchWithTimeout(`${WORDSTAT_BASE}/v1/dynamics`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phrase: keyword,
        period: "weekly",
        fromDate,
      }),
    });

    let dynamics: { date: string; count: number }[] = [];
    if (dynRes.ok) {
      const dynData = await dynRes.json();
      dynamics = (dynData.data || []).map((d: { date: string; count: number; share: number }) => ({
        date: d.date,
        count: d.count,
      }));
    }

    // 3. Автоматическая оценка уровня спроса
    let demandLevel: "high" | "medium" | "low" | "none" = "none";
    if (monthlySearches >= 10000) demandLevel = "high";
    else if (monthlySearches >= 1000) demandLevel = "medium";
    else if (monthlySearches > 0) demandLevel = "low";

    return {
      keyword,
      monthlySearches,
      relatedQueries: queries.slice(0, 10), // топ-10 связанных
      dynamics,
      demandLevel,
    };
  } catch (error) {
    console.error("[Wordstat Validator] Ошибка:", error);
    return null;
  }
}

// Множественная валидация — проверяем спрос по нескольким ключевым словам сразу
export interface MultiWordstatValidation {
  keywords: string[];
  totalMonthlySearches: number; // сумма по всем ключевым словам
  bestKeyword: WordstatValidation; // ключевое слово с макс. спросом
  allResults: WordstatValidation[];
  demandLevel: "high" | "medium" | "low" | "none";
}

export async function validateDemandMultiple(
  keywords: string[],
  token: string
): Promise<MultiWordstatValidation | null> {
  // Запускаем все ключевые слова параллельно
  const results = await Promise.allSettled(
    keywords.map((kw) => validateDemand(kw, token))
  );

  const validResults = results
    .filter(
      (r): r is PromiseFulfilledResult<WordstatValidation | null> =>
        r.status === "fulfilled"
    )
    .map((r) => r.value)
    .filter((r): r is WordstatValidation => r !== null);

  if (validResults.length === 0) return null;

  // Лучшее ключевое слово = максимум запросов
  const sorted = [...validResults].sort(
    (a, b) => b.monthlySearches - a.monthlySearches
  );
  const best = sorted[0];

  // Суммарный спрос (грубая оценка — может быть пересечение аудиторий)
  const total = validResults.reduce((sum, r) => sum + r.monthlySearches, 0);

  // Уровень спроса по суммарному объёму
  let demandLevel: "high" | "medium" | "low" | "none" = "none";
  if (total >= 10000) demandLevel = "high";
  else if (total >= 1000) demandLevel = "medium";
  else if (total > 0) demandLevel = "low";

  return {
    keywords,
    totalMonthlySearches: total,
    bestKeyword: best,
    allResults: validResults,
    demandLevel,
  };
}

// Понедельник, 90 дней назад (требование API Вордстат)
function getMonday90DaysAgo(): string {
  const date = new Date();
  date.setDate(date.getDate() - 90);
  // Откатиться до понедельника
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  return date.toISOString().split("T")[0];
}
