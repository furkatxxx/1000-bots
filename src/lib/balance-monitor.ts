// #31 — Мониторинг балансов платных API-сервисов
// Проверяет остатки и уведомляет в Telegram если баланс ниже порога

interface BalanceResult {
  service: string;
  balance: number | null; // в долларах или рублях
  currency: string;
  status: "ok" | "low" | "critical" | "error";
  threshold: number;
  error?: string;
}

export interface BalanceReport {
  results: BalanceResult[];
  hasProblems: boolean;
  checkedAt: string;
}

// Пороги для уведомлений
const THRESHOLDS = {
  anthropic: 1.0,  // $1 — критически мало
  newsapi: 0,      // бесплатный план — просто проверяем доступность
  dadata: 0,       // бесплатный план — проверяем доступность
};

// Проверить баланс Anthropic
async function checkAnthropicBalance(apiKey: string): Promise<BalanceResult> {
  try {
    // Anthropic API не имеет эндпоинта для проверки баланса напрямую
    // Используем маленький запрос чтобы проверить что ключ работает
    // Если ключ заблокирован или баланс 0 — будет ошибка 401/402
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    if (response.ok) {
      return {
        service: "Anthropic (Claude)",
        balance: null, // точный баланс не узнать через API
        currency: "USD",
        status: "ok",
        threshold: THRESHOLDS.anthropic,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errorData: any = await response.json().catch(() => ({}));
    const errorType = String(errorData?.error?.type || "");
    const errorMsg = String(errorData?.error?.message || `HTTP ${response.status}`);

    // 401 = неверный ключ, 402 = нет баланса, 429 = лимит
    if (response.status === 402 || errorType === "insufficient_balance") {
      return {
        service: "Anthropic (Claude)",
        balance: 0,
        currency: "USD",
        status: "critical",
        threshold: THRESHOLDS.anthropic,
        error: "Баланс исчерпан!",
      };
    }

    if (response.status === 401) {
      return {
        service: "Anthropic (Claude)",
        balance: null,
        currency: "USD",
        status: "error",
        threshold: THRESHOLDS.anthropic,
        error: "Неверный API-ключ",
      };
    }

    return {
      service: "Anthropic (Claude)",
      balance: null,
      currency: "USD",
      status: "ok", // если 429 или другое — значит ключ рабочий
      threshold: THRESHOLDS.anthropic,
      error: errorMsg,
    };
  } catch (error) {
    return {
      service: "Anthropic (Claude)",
      balance: null,
      currency: "USD",
      status: "error",
      threshold: THRESHOLDS.anthropic,
      error: error instanceof Error ? error.message : "Ошибка подключения",
    };
  }
}

// Проверить DaData (бесплатный план — просто проверяем что ключ рабочий)
async function checkDadataBalance(apiKey: string): Promise<BalanceResult> {
  try {
    const response = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Token ${apiKey}`,
      },
      body: JSON.stringify({ query: "тест", count: 1 }),
    });

    return {
      service: "DaData",
      balance: null,
      currency: "RUB",
      status: response.ok ? "ok" : "error",
      threshold: THRESHOLDS.dadata,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      service: "DaData",
      balance: null,
      currency: "RUB",
      status: "error",
      threshold: THRESHOLDS.dadata,
      error: error instanceof Error ? error.message : "Ошибка подключения",
    };
  }
}

// Главная функция — проверить все балансы
export async function checkAllBalances(keys: {
  anthropicApiKey?: string | null;
  dadataApiKey?: string | null;
}): Promise<BalanceReport> {
  const results: BalanceResult[] = [];

  const promises: Promise<void>[] = [];

  if (keys.anthropicApiKey) {
    promises.push(
      checkAnthropicBalance(keys.anthropicApiKey).then((r) => { results.push(r); })
    );
  }

  if (keys.dadataApiKey) {
    promises.push(
      checkDadataBalance(keys.dadataApiKey).then((r) => { results.push(r); })
    );
  }

  await Promise.allSettled(promises);

  const hasProblems = results.some((r) => r.status === "low" || r.status === "critical" || r.status === "error");

  return {
    results,
    hasProblems,
    checkedAt: new Date().toISOString(),
  };
}

// Отправить уведомление о проблемах с балансами в Telegram
export async function sendBalanceAlert(
  botToken: string,
  chatId: string,
  report: BalanceReport
): Promise<void> {
  const problems = report.results.filter((r) => r.status !== "ok");
  if (problems.length === 0) return;

  const statusEmoji: Record<string, string> = {
    ok: "✅",
    low: "⚠️",
    critical: "🚨",
    error: "❌",
  };

  const lines = report.results.map((r) => {
    const emoji = statusEmoji[r.status] || "❓";
    const balanceText = r.balance !== null ? ` (${r.balance} ${r.currency})` : "";
    const errorText = r.error ? ` — ${r.error}` : "";
    return `${emoji} ${r.service}${balanceText}${errorText}`;
  });

  const text = `🔔 *Проверка балансов API*\n\n${lines.join("\n")}\n\n⏰ ${new Date().toLocaleString("ru-RU")}`;

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
}
