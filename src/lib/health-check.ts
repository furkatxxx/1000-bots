// Модуль проверки здоровья источников трендов
// Используется: /api/health/sources (мониторинг) и /api/reports (перед генерацией)

import { fetchWithTimeout } from "@/lib/utils";

// Результат проверки одного источника
export interface SourceCheck {
  id: string;
  label: string;
  ok: boolean;
  items: number;
  error?: string;
  ms: number;
}

// Итог проверки всех источников
export interface HealthCheckResult {
  ok: boolean;
  total: number;
  working: number;
  failed: number;
  results: SourceCheck[];
  checkedAt: string;
}

// Настройки для проверки (ключи API и параметры)
export interface HealthCheckSettings {
  googleTrendsGeo?: string;
  newsApiKey?: string | null;
  vkServiceToken?: string | null;
  wordstatToken?: string | null;
  telemetrApiKey?: string | null;
}

// Названия источников на русском
export const SOURCE_LABELS: Record<string, string> = {
  hacker_news: "Hacker News",
  google_trends: "Google Trends",
  news_api: "NewsAPI",
  github_trending: "GitHub Trending",
  product_hunt: "Product Hunt",
  reddit: "Reddit",
  yandex_wordstat: "Яндекс Вордстат",
  telemetr: "Telemetr.io",
  vk_trends: "VK Тренды",
};

// Минимальный процент работающих источников для генерации отчёта
// Если сломано 40%+ источников — генерация отменяется
export const MIN_HEALTHY_PERCENT = 60;

// Проверка одного источника с замером времени
async function checkSource(
  id: string,
  label: string,
  fn: () => Promise<number>
): Promise<SourceCheck> {
  const start = Date.now();
  try {
    const items = await fn();
    return { id, label, ok: items > 0, items, ms: Date.now() - start };
  } catch (e) {
    return {
      id,
      label,
      ok: false,
      items: 0,
      error: e instanceof Error ? e.message : String(e),
      ms: Date.now() - start,
    };
  }
}

// Проверить все источники
export async function runHealthCheck(
  settings: HealthCheckSettings
): Promise<HealthCheckResult> {
  const checks: Promise<SourceCheck>[] = [];

  // 1. Hacker News (без ключа)
  checks.push(
    checkSource("hacker_news", "Hacker News", async () => {
      const r = await fetchWithTimeout(
        "https://hacker-news.firebaseio.com/v0/topstories.json"
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ids = await r.json();
      return Array.isArray(ids) ? ids.length : 0;
    })
  );

  // 2. Google Trends (без ключа)
  checks.push(
    checkSource("google_trends", "Google Trends", async () => {
      const geo = settings.googleTrendsGeo || "US";
      const r = await fetchWithTimeout(
        `https://trends.google.com/trending/rss?geo=${geo}`,
        { headers: { "User-Agent": "1000bots/1.0" } }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const xml = await r.text();
      return (xml.match(/<item>/g) || []).length;
    })
  );

  // 3. NewsAPI (нужен ключ)
  if (settings.newsApiKey) {
    checks.push(
      checkSource("news_api", "NewsAPI", async () => {
        const r = await fetchWithTimeout(
          `https://newsapi.org/v2/top-headlines?country=us&pageSize=3&apiKey=${settings.newsApiKey}`
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        return d.articles ? d.articles.length : 0;
      })
    );
  }

  // 4. GitHub Trending (без ключа)
  checks.push(
    checkSource("github_trending", "GitHub Trending", async () => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const dateStr = weekAgo.toISOString().split("T")[0];
      const r = await fetchWithTimeout(
        `https://api.github.com/search/repositories?q=created:>${dateStr}&sort=stars&per_page=3`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "1000bots/1.0",
          },
        }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      return d.items ? d.items.length : 0;
    })
  );

  // 5. Product Hunt (без ключа)
  checks.push(
    checkSource("product_hunt", "Product Hunt", async () => {
      const r = await fetchWithTimeout("https://www.producthunt.com/feed", {
        headers: { "User-Agent": "1000bots/1.0" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const xml = await r.text();
      return (xml.match(/<entry>/g) || []).length;
    })
  );

  // 6. Reddit (без ключа)
  checks.push(
    checkSource("reddit", "Reddit", async () => {
      const r = await fetchWithTimeout(
        "https://www.reddit.com/r/technology/hot.rss",
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
        }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const xml = await r.text();
      return (xml.match(/<entry>/g) || []).length;
    })
  );

  // 7. VK Тренды (нужен ключ)
  if (settings.vkServiceToken) {
    checks.push(
      checkSource("vk_trends", "VK Тренды", async () => {
        const r = await fetchWithTimeout(
          `https://api.vk.com/method/newsfeed.search?q=%23стартап&count=3&access_token=${settings.vkServiceToken}&v=5.199`
        );
        const d = await r.json();
        if (d.error) throw new Error(d.error.error_msg);
        return d.response?.items?.length || 0;
      })
    );
  }

  // 8. Яндекс Вордстат (нужен ключ)
  if (settings.wordstatToken) {
    checks.push(
      checkSource("yandex_wordstat", "Яндекс Вордстат", async () => {
        const r = await fetchWithTimeout(
          "https://api.wordstat.yandex.net/v1/topRequests",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${settings.wordstatToken}`,
            },
            body: JSON.stringify({
              phrase: "бизнес",
              regions: [],
              devices: ["all"],
            }),
          }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        return d.queries?.length || 0;
      })
    );
  }

  // 9. Telemetr (нужен ключ)
  if (settings.telemetrApiKey) {
    checks.push(
      checkSource("telemetr", "Telemetr.io", async () => {
        const r = await fetchWithTimeout(
          "https://api.telemetr.io/v1/catalog/search?q=бизнес&limit=3",
          { headers: { "X-Api-Key": settings.telemetrApiKey! } }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        return Array.isArray(d) ? d.length : 0;
      })
    );
  }

  // Запуск параллельно
  const results = await Promise.all(checks);

  const working = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  return {
    ok: failed.length === 0,
    total: results.length,
    working: working.length,
    failed: failed.length,
    results,
    checkedAt: new Date().toISOString(),
  };
}

// Отправка уведомления в Telegram о проблемах с источниками
export async function sendHealthTelegramAlert(
  botToken: string,
  chatId: string,
  healthResult: HealthCheckResult,
  context: "monitoring" | "pre-report"
) {
  const failed = healthResult.results.filter((r) => !r.ok);
  const working = healthResult.results.filter((r) => r.ok);

  const header =
    context === "pre-report"
      ? "🚫 <b>Генерация отчёта отменена!</b>\n\nСлишком мало источников работает — нет смысла тратить деньги на AI."
      : "⚠️ <b>Проверка источников трендов</b>";

  const lines = [
    header,
    "",
    `✅ Работают: ${working.length}`,
    `❌ Не работают: ${failed.length}`,
    "",
  ];

  for (const f of failed) {
    lines.push(`❌ <b>${f.label}</b>: ${f.error || "0 элементов"}`);
  }

  if (context === "pre-report") {
    const percent = Math.round(
      (working.length / healthResult.total) * 100
    );
    lines.push("");
    lines.push(
      `Нужно минимум ${MIN_HEALTHY_PERCENT}% работающих источников, сейчас ${percent}%.`
    );
    lines.push("Исправьте проблемы и запустите генерацию заново.");
  }

  try {
    await fetchWithTimeout(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: lines.join("\n"),
          parse_mode: "HTML",
        }),
      }
    );
  } catch {
    // Не ломаем основной процесс из-за Telegram
  }
}

// Проверить: достаточно ли источников для генерации отчёта?
export function isHealthyEnough(result: HealthCheckResult): boolean {
  if (result.total === 0) return false;
  const percent = (result.working / result.total) * 100;
  return percent >= MIN_HEALTHY_PERCENT;
}
