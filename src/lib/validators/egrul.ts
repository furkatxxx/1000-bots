// egrul.itsoft.ru — финансовые данные компаний из ЕГРЮЛ
// Бесплатно, 100 запросов/день, без регистрации

import { fetchWithTimeout } from "@/lib/utils";

const EGRUL_BASE = "https://egrul.itsoft.ru";

export interface EgrulFinancials {
  inn: string;
  years: EgrulYear[];
  latestRevenue: number | null;
  latestExpenses: number | null;
  latestEmployees: number | null;
  revenueGrowth: number | null; // процент роста за год
}

export interface EgrulYear {
  year: number;
  income: number | null;
  outcome: number | null;
  employees: number | null;
}

// Получить финансовые данные компании по ИНН
export async function getCompanyFinancials(inn: string): Promise<EgrulFinancials | null> {
  try {
    const res = await fetchWithTimeout(`${EGRUL_BASE}/fin/?inn=${inn}`, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.error(`[EGRUL] Ошибка ${res.status} для ИНН ${inn}`);
      return null;
    }

    const text = await res.text();
    if (!text || text.trim() === "" || text.trim() === "{}") {
      return null;
    }

    const data = JSON.parse(text);

    // Парсим данные по годам
    const years: EgrulYear[] = [];
    for (const [yearStr, yearData] of Object.entries(data)) {
      const year = parseInt(yearStr);
      if (isNaN(year) || year < 2010) continue;

      const yd = yearData as Record<string, unknown>;
      years.push({
        year,
        income: typeof yd.income === "number" ? yd.income : null,
        outcome: typeof yd.outcome === "number" ? yd.outcome : null,
        employees: typeof yd.n === "number" ? yd.n : null,
      });
    }

    // Сортируем по году (убывание)
    years.sort((a, b) => b.year - a.year);

    const latest = years[0] || null;
    const previous = years[1] || null;

    // Рост выручки
    let revenueGrowth: number | null = null;
    if (latest?.income && previous?.income && previous.income > 0) {
      revenueGrowth = Math.round(((latest.income - previous.income) / previous.income) * 100);
    }

    return {
      inn,
      years: years.slice(0, 5), // последние 5 лет
      latestRevenue: latest?.income || null,
      latestExpenses: latest?.outcome || null,
      latestEmployees: latest?.employees || null,
      revenueGrowth,
    };
  } catch (error) {
    console.error(`[EGRUL] Ошибка для ИНН ${inn}:`, error);
    return null;
  }
}

// Получить финансы для нескольких компаний
export async function getMultipleFinancials(
  inns: string[],
  maxRequests: number = 5 // ограничиваем для экономии квоты
): Promise<EgrulFinancials[]> {
  const results: EgrulFinancials[] = [];
  const limited = inns.slice(0, maxRequests);

  for (const inn of limited) {
    const data = await getCompanyFinancials(inn);
    if (data) results.push(data);
    // Пауза 500мс между запросами
    await new Promise((r) => setTimeout(r, 500));
  }

  return results;
}

// Форматирование суммы в рублях для отображения
export function formatRubles(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)} млрд ₽`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} млн ₽`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)} тыс ₽`;
  return `${amount} ₽`;
}
