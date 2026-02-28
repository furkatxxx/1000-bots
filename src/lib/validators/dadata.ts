// DaData API — поиск компаний по нише
// Бесплатно 10K запросов/день, нужен API-ключ

import { fetchWithTimeout } from "@/lib/utils";

const DADATA_BASE = "https://suggestions.dadata.ru/suggestions/api/4_1/rs";

export interface DadataCompany {
  name: string;
  inn: string;
  address: string;
  okved: string;
  okvedName: string;
  registrationDate: string;
  employeeCount: number | null;
  revenue: number | null; // рублей
  status: string;
}

export interface DadataValidation {
  query: string;
  okvedCodes: string[];
  companiesFound: number; // сколько нашли (до 20)
  companies: DadataCompany[];
  competitionLevel: "high" | "medium" | "low" | "empty";
}

// Поиск кодов ОКВЭД по описанию ниши
async function findOkvedCodes(query: string, apiKey: string): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(`${DADATA_BASE}/suggest/okved2`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, count: 5 }),
    });

    if (!res.ok) return [];
    const data = await res.json();
    return (data.suggestions || [])
      .map((s: { data: { kod: string } }) => s.data.kod)
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Поиск компаний по запросу + ОКВЭД
async function findCompanies(
  query: string,
  okvedCodes: string[],
  apiKey: string
): Promise<{ name: string; inn: string; okved: string; okvedName: string; address: string; registrationDate: string; status: string }[]> {
  try {
    const body: Record<string, unknown> = {
      query,
      count: 20,
      status: ["ACTIVE"],
      type: "LEGAL",
    };
    if (okvedCodes.length > 0) {
      body.okved = okvedCodes.slice(0, 10);
    }

    const res = await fetchWithTimeout(`${DADATA_BASE}/suggest/party`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) return [];
    const data = await res.json();

    return (data.suggestions || []).map((s: {
      data: {
        name: { short_with_opf: string };
        inn: string;
        okved: string;
        okved_type: string;
        address: { value: string };
        state: { registration_date: number; status: string };
      };
    }) => ({
      name: s.data.name?.short_with_opf || "",
      inn: s.data.inn || "",
      okved: s.data.okved || "",
      okvedName: s.data.okved_type || "",
      address: s.data.address?.value || "",
      registrationDate: s.data.state?.registration_date
        ? new Date(s.data.state.registration_date).toISOString().split("T")[0]
        : "",
      status: s.data.state?.status || "",
    }));
  } catch {
    return [];
  }
}

// Получить финансовые данные по ИНН
async function getFinancials(inn: string, apiKey: string): Promise<{
  revenue: number | null;
  employeeCount: number | null;
}> {
  try {
    const res = await fetchWithTimeout(`${DADATA_BASE}/findById/party`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query: inn, type: "LEGAL" }),
    });

    if (!res.ok) return { revenue: null, employeeCount: null };
    const data = await res.json();
    const company = data.suggestions?.[0]?.data;
    if (!company) return { revenue: null, employeeCount: null };

    return {
      revenue: company.finance?.income || null,
      employeeCount: company.employee_count || null,
    };
  } catch {
    return { revenue: null, employeeCount: null };
  }
}

// Основная функция: полная валидация ниши через DaData
export async function validateNiche(
  query: string,
  apiKey: string
): Promise<DadataValidation | null> {
  try {
    // 1. Ищем коды ОКВЭД по описанию ниши
    const okvedCodes = await findOkvedCodes(query, apiKey);

    // 2. Ищем компании
    const rawCompanies = await findCompanies(query, okvedCodes, apiKey);

    if (rawCompanies.length === 0) {
      return {
        query,
        okvedCodes,
        companiesFound: 0,
        companies: [],
        competitionLevel: "empty",
      };
    }

    // 3. Обогащаем финансами (первые 5 для экономии квоты)
    const enriched: DadataCompany[] = [];
    for (const company of rawCompanies.slice(0, 5)) {
      const financials = await getFinancials(company.inn, apiKey);
      enriched.push({
        ...company,
        employeeCount: financials.employeeCount,
        revenue: financials.revenue,
      });
    }

    // Остальные без финансов
    for (const company of rawCompanies.slice(5)) {
      enriched.push({
        ...company,
        employeeCount: null,
        revenue: null,
      });
    }

    // 4. Оценка конкуренции
    let competitionLevel: "high" | "medium" | "low" | "empty" = "low";
    const count = rawCompanies.length;
    if (count >= 15) competitionLevel = "high";
    else if (count >= 5) competitionLevel = "medium";

    return {
      query,
      okvedCodes,
      companiesFound: count,
      companies: enriched,
      competitionLevel,
    };
  } catch (error) {
    console.error("[DaData] Ошибка:", error);
    return null;
  }
}
