import type { TrendCollector, TrendItem } from "./base";

// google-trends-api — неофициальный пакет, может сломаться
// Оборачиваем в try/catch, при ошибке возвращаем пустой массив
let googleTrends: {
  dailyTrends: (opts: { geo: string }) => Promise<string>;
} | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  googleTrends = require("google-trends-api");
} catch {
  console.warn("[GoogleTrends] Пакет google-trends-api не найден");
}

interface GTDailyTrend {
  title: { query: string; exploreLink: string };
  formattedTraffic: string;
  articles: Array<{ title: string; url: string; snippet: string }>;
}

function parseTraffic(traffic: string): number {
  // "200K+" → 200000, "1M+" → 1000000
  const clean = traffic.replace(/[+,]/g, "").trim();
  if (clean.endsWith("K")) return parseFloat(clean) * 1000;
  if (clean.endsWith("M")) return parseFloat(clean) * 1000000;
  return parseInt(clean) || 0;
}

export class GoogleTrendsCollector implements TrendCollector {
  sourceId = "google_trends";
  label = "Google Trends";
  private geo: string;

  constructor(geo: string = "US") {
    this.geo = geo;
  }

  async collect(): Promise<TrendItem[]> {
    if (!googleTrends) {
      console.warn("[GoogleTrends] Пакет недоступен, пропускаем");
      return [];
    }

    try {
      const rawJson = await googleTrends.dailyTrends({ geo: this.geo });
      const data = JSON.parse(rawJson);

      const days = data?.default?.trendingSearchesDays;
      if (!days || days.length === 0) return [];

      // Берём тренды за последний день
      const trends: GTDailyTrend[] = days[0].trendingSearches || [];

      // Нормализация
      const maxTraffic = Math.max(
        ...trends.map((t) => parseTraffic(t.formattedTraffic)),
        1
      );

      return trends.slice(0, 20).map((trend) => {
        const article = trend.articles?.[0];
        return {
          sourceId: this.sourceId,
          title: trend.title.query,
          url: article?.url || `https://trends.google.com${trend.title.exploreLink}`,
          score: Math.round(
            (parseTraffic(trend.formattedTraffic) / maxTraffic) * 100
          ),
          summary: article?.snippet || null,
          category: null, // Google Trends не даёт категории напрямую
          metadata: {
            traffic: trend.formattedTraffic,
            articlesCount: trend.articles?.length || 0,
          },
        };
      });
    } catch (err) {
      console.error("[GoogleTrends] Ошибка сбора:", err);
      return [];
    }
  }
}
