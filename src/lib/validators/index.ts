// Оркестратор валидации — собирает данные из всех источников
// перед вызовом экспертного совета

import { validateDemand, type WordstatValidation } from "./wordstat-validator";
import { validateNiche, type DadataValidation, type DadataCompany } from "./dadata";
import { getMultipleFinancials, formatRubles, type EgrulFinancials } from "./egrul";

export interface ValidationData {
  wordstat: WordstatValidation | null;
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

  // Извлекаем ключевое слово из названия идеи (первые 2-3 слова)
  const keyword = extractKeyword(input.ideaName, input.ideaDescription);

  // Параллельно запускаем Вордстат и DaData
  const promises: Promise<void>[] = [];

  // 1. Вордстат — спрос
  if (input.wordstatToken) {
    promises.push(
      validateDemand(keyword, input.wordstatToken).then((data) => {
        result.wordstat = data;
      })
    );
  }

  // 2. DaData — компании в нише
  if (input.dadataApiKey) {
    promises.push(
      validateNiche(keyword, input.dadataApiKey).then((data) => {
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

// Форматировать данные валидации в текст для AI-промпта
export function formatValidationForPrompt(data: ValidationData): string {
  const parts: string[] = [];

  // Вордстат
  if (data.wordstat) {
    const ws = data.wordstat;
    const demandLabels = { high: "ВЫСОКИЙ", medium: "СРЕДНИЙ", low: "НИЗКИЙ", none: "НЕТ ДАННЫХ" };
    parts.push(`## РЕАЛЬНЫЕ ДАННЫЕ: Яндекс Вордстат (поисковый спрос)
- Ключевой запрос: "${ws.keyword}"
- Ежемесячных поисков: ${ws.monthlySearches.toLocaleString("ru-RU")}
- Уровень спроса: ${demandLabels[ws.demandLevel]}
- Связанные запросы: ${ws.relatedQueries.slice(0, 5).map((q) => `"${q.text}" (${q.count.toLocaleString("ru-RU")})`).join(", ") || "нет"}
- Динамика за 3 мес: ${ws.dynamics.length > 0 ? ws.dynamics.map((d) => `${d.date}: ${d.count}`).join(" → ") : "нет данных"}`);
  }

  // DaData
  if (data.dadata) {
    const dd = data.dadata;
    const compLabels = { high: "ВЫСОКАЯ", medium: "СРЕДНЯЯ", low: "НИЗКАЯ", empty: "НЕТ КОНКУРЕНТОВ" };
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
- Примеры компаний:
  - ${topCompanies || "нет данных"}`);
  }

  // ЕГРЮЛ
  if (data.egrul.length > 0) {
    const egrulText = data.egrul
      .map((e) => {
        const rev = formatRubles(e.latestRevenue);
        const exp = formatRubles(e.latestExpenses);
        const emp = e.latestEmployees ? `${e.latestEmployees} чел` : "н/д";
        const growth = e.revenueGrowth !== null ? `${e.revenueGrowth > 0 ? "+" : ""}${e.revenueGrowth}%` : "н/д";
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

// Извлекаем ключевое слово из названия и описания идеи
function extractKeyword(name: string, description: string): string {
  // Убираем эмодзи и спецсимволы
  const clean = name
    .replace(/[\u{1F600}-\u{1F6FF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[^\wа-яА-ЯёЁ\s-]/g, "")
    .trim();

  // Берём основные слова (пропускаем служебные)
  const stopWords = new Set(["для", "на", "по", "от", "из", "через", "как", "или", "app", "bot", "сервис", "платформа", "система", "инструмент"]);
  const words = clean
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()));

  // Возвращаем 2-3 значимых слова
  return words.slice(0, 3).join(" ") || clean.split(" ").slice(0, 2).join(" ") || description.split(" ").slice(0, 3).join(" ");
}

export { type WordstatValidation } from "./wordstat-validator";
export { type DadataValidation, type DadataCompany } from "./dadata";
export { type EgrulFinancials, formatRubles } from "./egrul";
