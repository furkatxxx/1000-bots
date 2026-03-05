// Оркестратор валидации — собирает данные из всех источников
// перед вызовом экспертного совета

import { validateDemandMultiple, type MultiWordstatValidation } from "./wordstat-validator";
import { validateNiche, type DadataValidation, type DadataCompany } from "./dadata";
import { getMultipleFinancials, formatRubles, type EgrulFinancials } from "./egrul";

export interface ValidationData {
  wordstat: MultiWordstatValidation | null;
  dadata: DadataValidation | null;
  egrul: EgrulFinancials[];
}

// Собрать все данные валидации для идеи
export async function collectValidationData(input: {
  ideaName: string;
  ideaDescription: string;
  targetAudience: string;
  wordstatToken?: string | null;
  dadataApiKey?: string | null;
}): Promise<ValidationData> {
  const result: ValidationData = {
    wordstat: null,
    dadata: null,
    egrul: [],
  };

  // Извлекаем 3-5 ключевых слов из разных частей идеи
  const keywords = extractKeywords(
    input.ideaName,
    input.ideaDescription,
    input.targetAudience
  );

  // Ключевое слово для DaData (первое из списка)
  const dadataKeyword = keywords[0] || extractFallbackKeyword(input.ideaName);

  // Параллельно запускаем Вордстат и DaData
  const promises: Promise<void>[] = [];

  // 1. Вордстат — спрос по НЕСКОЛЬКИМ ключевым словам
  if (input.wordstatToken && keywords.length > 0) {
    promises.push(
      validateDemandMultiple(keywords, input.wordstatToken).then((data) => {
        result.wordstat = data;
      })
    );
  }

  // 2. DaData — компании в нише
  if (input.dadataApiKey) {
    promises.push(
      validateNiche(dadataKeyword, input.dadataApiKey).then((data) => {
        result.dadata = data;
      })
    );
  }

  await Promise.allSettled(promises);

  // 3. ЕГРЮЛ — финансы найденных компаний (последовательно, без ключа)
  if (result.dadata && result.dadata.companies.length > 0) {
    const inns = result.dadata.companies
      .filter((c) => c.inn)
      .map((c) => c.inn);

    if (inns.length > 0) {
      result.egrul = await getMultipleFinancials(inns, 3); // макс 3 для скорости
    }
  }

  return result;
}

// Автоматические вердикты на основе реальных данных (перед AI)
function buildAutoVerdicts(data: ValidationData): string {
  const verdicts: string[] = [];

  if (data.wordstat) {
    const ws = data.wordstat;
    const total = ws.totalMonthlySearches;
    const keywordsStr = ws.allResults
      .map((r) => `"${r.keyword}" (${r.monthlySearches.toLocaleString("ru-RU")})`)
      .join(", ");

    if (total > 10000) {
      verdicts.push(
        `✅ СПРОС ВЫСОКИЙ — суммарно ${total.toLocaleString("ru-RU")} запросов/мес по ключевым словам: ${keywordsStr}. Аудитория ищет решение этой проблемы.`
      );
    } else if (total >= 1000) {
      verdicts.push(
        `⚠️ СПРОС СРЕДНИЙ — суммарно ${total.toLocaleString("ru-RU")} запросов/мес по: ${keywordsStr}. Рынок есть, но не огромный.`
      );
    } else if (total > 0) {
      verdicts.push(
        `⚠️ СПРОС НИЗКИЙ — суммарно ${total.toLocaleString("ru-RU")} запросов/мес по: ${keywordsStr}. Но это может означать новый рынок без сформированного спроса.`
      );
    } else {
      verdicts.push(
        `🔍 СПРОС НЕ ОБНАРУЖЕН — 0 запросов по: ${ws.keywords.join(", ")}. Возможно, рынок ещё не сформирован, либо аудитория ищет по-другому.`
      );
    }

    // Динамика лучшего ключевого слова
    const best = ws.bestKeyword;
    if (best.dynamics.length >= 2) {
      const first = best.dynamics[0]?.count || 0;
      const last = best.dynamics[best.dynamics.length - 1]?.count || 0;
      if (last > first * 1.2) {
        verdicts.push(
          `📈 Спрос РАСТЁТ: по "${best.keyword}" с ${first} до ${last} за последние месяцы.`
        );
      } else if (last < first * 0.8) {
        verdicts.push(
          `📉 Спрос ПАДАЕТ: по "${best.keyword}" с ${first} до ${last}. Это тревожный сигнал.`
        );
      }
    }
  }

  if (data.dadata) {
    const dd = data.dadata;
    if (dd.companiesFound > 50) {
      verdicts.push(
        `⚠️ КОНКУРЕНЦИЯ ВЫСОКАЯ — ${dd.companiesFound} компаний в нише. Но наличие конкурентов подтверждает что рынок существует. Нужно чёткое отличие.`
      );
    } else if (dd.companiesFound >= 10) {
      verdicts.push(
        `✅ КОНКУРЕНЦИЯ СРЕДНЯЯ — ${dd.companiesFound} компаний. Рынок есть, но не перенасыщен. Хороший сигнал.`
      );
    } else if (dd.companiesFound > 0) {
      verdicts.push(
        `✅ КОНКУРЕНЦИЯ НИЗКАЯ — всего ${dd.companiesFound} компаний. Можно занять нишу.`
      );
    } else {
      verdicts.push(
        `🔍 КОМПАНИЙ НЕ НАЙДЕНО — либо ниша пуста (хорошо для первопроходца), либо запрос слишком узкий.`
      );
    }
  }

  if (data.egrul.length > 0) {
    const avgRevenue =
      data.egrul.reduce((sum, e) => sum + (e.latestRevenue || 0), 0) /
      data.egrul.length;
    if (avgRevenue > 10_000_000) {
      verdicts.push(
        `✅ РЫНОК КРУПНЫЙ — средняя выручка конкурентов ${formatRubles(avgRevenue)}. Деньги в нише есть.`
      );
    } else if (avgRevenue > 1_000_000) {
      verdicts.push(
        `⚠️ РЫНОК СРЕДНИЙ — средняя выручка конкурентов ${formatRubles(avgRevenue)}.`
      );
    } else {
      verdicts.push(
        `❌ РЫНОК МАЛЕНЬКИЙ — средняя выручка конкурентов всего ${formatRubles(avgRevenue)}.`
      );
    }
  }

  return verdicts.length > 0
    ? `## АВТОВЕРДИКТ (на основе реальных данных):\n${verdicts.join("\n")}`
    : "";
}

// Форматировать данные валидации в текст для AI-промпта
export function formatValidationForPrompt(data: ValidationData): string {
  const parts: string[] = [];

  // Сначала автовердикты (структурированные выводы)
  const autoVerdicts = buildAutoVerdicts(data);
  if (autoVerdicts) {
    parts.push(autoVerdicts);
  }

  // Вордстат — по всем ключевым словам
  if (data.wordstat) {
    const ws = data.wordstat;
    const demandLabels = {
      high: "ВЫСОКИЙ",
      medium: "СРЕДНИЙ",
      low: "НИЗКИЙ",
      none: "НЕТ ДАННЫХ",
    };

    // Детали по каждому ключевому слову
    const keywordDetails = ws.allResults
      .map(
        (r) =>
          `  - "${r.keyword}": ${r.monthlySearches.toLocaleString("ru-RU")} запросов/мес (${demandLabels[r.demandLevel]})`
      )
      .join("\n");

    // Связанные запросы — объединённые из всех результатов
    const allRelated = ws.allResults
      .flatMap((r) => r.relatedQueries)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const relatedStr = allRelated
      .map((q) => `"${q.text}" (${q.count.toLocaleString("ru-RU")})`)
      .join(", ");

    parts.push(`## РЕАЛЬНЫЕ ДАННЫЕ: Яндекс Вордстат (поисковый спрос)
- Проверено ключевых слов: ${ws.keywords.length}
- Суммарный спрос: ${ws.totalMonthlySearches.toLocaleString("ru-RU")} запросов/мес
- Уровень спроса: ${demandLabels[ws.demandLevel]}
- По каждому слову:
${keywordDetails}
- Связанные запросы: ${relatedStr || "нет"}
- Динамика (по "${ws.bestKeyword.keyword}"): ${ws.bestKeyword.dynamics.length > 0 ? ws.bestKeyword.dynamics.map((d) => `${d.date}: ${d.count}`).join(" → ") : "нет данных"}

ВАЖНО: Нулевой спрос по конкретному названию идеи НЕ означает отсутствие рынка. Люди ищут ПРОБЛЕМУ, а не название продукта. Оценивай спрос по связанным запросам и суммарному объёму.`);
  }

  // DaData
  if (data.dadata) {
    const dd = data.dadata;
    const compLabels = {
      high: "ВЫСОКАЯ",
      medium: "СРЕДНЯЯ",
      low: "НИЗКАЯ",
      empty: "НЕТ КОНКУРЕНТОВ",
    };
    const topCompanies = dd.companies
      .slice(0, 5)
      .map((c: DadataCompany) => {
        const rev = c.revenue ? formatRubles(c.revenue) : "н/д";
        const emp = c.employeeCount ? `${c.employeeCount} чел` : "";
        return `${c.name} (${[rev, emp].filter(Boolean).join(", ")})`;
      })
      .join("\n  - ");

    parts.push(`## РЕАЛЬНЫЕ ДАННЫЕ: DaData (компании в нише)
- Запрос: "${dd.query}"
- Найдено компаний: ${dd.companiesFound}
- Коды ОКВЭД: ${dd.okvedCodes.join(", ") || "не найдены"}
- Уровень конкуренции: ${compLabels[dd.competitionLevel]}
- Наличие конкурентов — это сигнал что РЫНОК СУЩЕСТВУЕТ (положительный фактор)
- Примеры компаний:
  - ${topCompanies || "нет данных"}`);
  }

  // ЕГРЮЛ
  if (data.egrul.length > 0) {
    const egrulText = data.egrul
      .map((e) => {
        const rev = formatRubles(e.latestRevenue);
        const exp = formatRubles(e.latestExpenses);
        const emp = e.latestEmployees
          ? `${e.latestEmployees} чел`
          : "н/д";
        const growth =
          e.revenueGrowth !== null
            ? `${e.revenueGrowth > 0 ? "+" : ""}${e.revenueGrowth}%`
            : "н/д";
        return `ИНН ${e.inn}: выручка ${rev}, расходы ${exp}, сотрудников ${emp}, рост ${growth}`;
      })
      .join("\n  - ");

    parts.push(`## РЕАЛЬНЫЕ ДАННЫЕ: ЕГРЮЛ (финансы конкурентов)
  - ${egrulText}`);
  }

  if (parts.length === 0) {
    return ""; // нет данных для валидации
  }

  return `\n\n---\n\n# ДАННЫЕ ДЛЯ ВАЛИДАЦИИ (используй для обоснования оценок):\n\n${parts.join("\n\n")}`;
}

// Извлекаем 3-5 ключевых слов из названия, описания и аудитории
// Ищем не название продукта, а ПРОБЛЕМУ которую он решает
function extractKeywords(
  name: string,
  description: string,
  targetAudience: string
): string[] {
  const stopWords = new Set([
    "для", "на", "по", "от", "из", "через", "как", "или", "что", "это",
    "при", "без", "все", "его", "них", "они", "она", "весь", "каждый",
    "app", "bot", "сервис", "платформа", "система", "инструмент", "помощник",
    "генератор", "бот", "приложение", "онлайн", "автоматизация",
  ]);

  // Чистим текст от эмодзи и спецсимволов
  function clean(text: string): string {
    return text
      .replace(/[\u{1F600}-\u{1F6FF}]/gu, "")
      .replace(/[\u{2600}-\u{27BF}]/gu, "")
      .replace(/[^\wа-яА-ЯёЁ\s-]/g, " ")
      .trim();
  }

  // Извлекаем значимые 2-3 словные фразы
  function extractPhrases(text: string, maxPhrases: number): string[] {
    const words = clean(text)
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()));

    const phrases: string[] = [];

    // Пары слов
    for (let i = 0; i < words.length - 1 && phrases.length < maxPhrases; i++) {
      const pair = `${words[i]} ${words[i + 1]}`;
      if (pair.length >= 6) phrases.push(pair);
    }

    // Одиночные длинные слова (если мало фраз)
    if (phrases.length < maxPhrases) {
      for (const w of words) {
        if (w.length >= 5 && phrases.length < maxPhrases) {
          phrases.push(w);
        }
      }
    }

    return phrases;
  }

  const keywords: string[] = [];
  const seen = new Set<string>();

  function addUnique(phrase: string) {
    const lower = phrase.toLowerCase();
    if (!seen.has(lower) && lower.length >= 4) {
      seen.add(lower);
      keywords.push(phrase);
    }
  }

  // 1. Из названия — основная тема (1-2 фразы)
  const namePhrases = extractPhrases(name, 2);
  namePhrases.forEach(addUnique);

  // 2. Из описания — проблема которую решает (2-3 фразы)
  const descPhrases = extractPhrases(description, 3);
  descPhrases.forEach(addUnique);

  // 3. Из целевой аудитории — кто ищет решение (1 фраза)
  const audiencePhrases = extractPhrases(targetAudience, 1);
  audiencePhrases.forEach(addUnique);

  // Берём максимум 5 ключевых слов (больше — дорого по API)
  return keywords.slice(0, 5);
}

// Запасное извлечение (если основной метод не сработал)
function extractFallbackKeyword(name: string): string {
  const clean = name
    .replace(/[\u{1F600}-\u{1F6FF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[^\wа-яА-ЯёЁ\s-]/g, "")
    .trim();
  return clean.split(" ").slice(0, 3).join(" ") || "бизнес";
}

export { type WordstatValidation, type MultiWordstatValidation } from "./wordstat-validator";
export { type DadataValidation, type DadataCompany } from "./dadata";
export { type EgrulFinancials, formatRubles } from "./egrul";
