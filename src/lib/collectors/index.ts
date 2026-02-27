import type { TrendItem } from "./base";
import { HackerNewsCollector } from "./hacker-news";
import { GoogleTrendsCollector } from "./google-trends";
import { NewsAPICollector } from "./news-api";
import { translateToRussian } from "../translate";

interface CollectorConfig {
  newsApiKey?: string;
  googleTrendsGeo?: string;
  enabledSources?: string[];
}

// Собрать тренды из всех включённых источников
export async function collectAll(config: CollectorConfig): Promise<TrendItem[]> {
  const enabled = config.enabledSources || [
    "hacker_news",
    "google_trends",
    "news_api",
  ];

  const collectors = [];

  if (enabled.includes("hacker_news")) {
    collectors.push(new HackerNewsCollector());
  }
  if (enabled.includes("google_trends")) {
    collectors.push(new GoogleTrendsCollector(config.googleTrendsGeo));
  }
  if (enabled.includes("news_api") && config.newsApiKey) {
    collectors.push(new NewsAPICollector(config.newsApiKey));
  }

  // Запускаем параллельно, не падаем если один источник сломался
  const results = await Promise.allSettled(
    collectors.map((c) => c.collect())
  );

  const items: TrendItem[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    } else {
      console.error("[Collectors] Ошибка коллектора:", result.reason);
    }
  }

  // Переводим заголовки на русский
  if (items.length > 0) {
    try {
      const titles = items.map((i) => i.title);
      const translated = await translateToRussian(titles);
      for (let i = 0; i < items.length; i++) {
        items[i].title = translated[i] || items[i].title;
      }
    } catch (err) {
      console.error("[Collectors] Ошибка перевода, оставляем оригиналы:", err);
    }
  }

  return items;
}

export { HackerNewsCollector } from "./hacker-news";
export { GoogleTrendsCollector } from "./google-trends";
export { NewsAPICollector } from "./news-api";
export type { TrendItem } from "./base";
