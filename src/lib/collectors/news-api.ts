import type { TrendCollector, TrendItem } from "./base";
import { detectCategory } from "./base";
import { fetchWithTimeout } from "@/lib/utils";

const NEWSAPI_BASE = "https://newsapi.org/v2";

interface NewsArticle {
  title: string;
  url: string;
  description: string | null;
  source: { name: string };
  publishedAt: string;
}

interface NewsAPIResponse {
  status: string;
  totalResults: number;
  articles: NewsArticle[];
}


export class NewsAPICollector implements TrendCollector {
  sourceId = "news_api";
  label = "NewsAPI";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async collect(): Promise<TrendItem[]> {
    if (!this.apiKey) {
      console.warn("[NewsAPI] API-ключ не задан, пропускаем");
      return [];
    }

    try {
      // API-ключ через заголовок (безопаснее, чем в URL)
      const headers = { "X-Api-Key": this.apiKey };

      const headlinesUrl = `${NEWSAPI_BASE}/top-headlines?category=technology&language=en&pageSize=15`;
      const searchUrl = `${NEWSAPI_BASE}/everything?q="startup" OR "AI tool" OR "business idea"&sortBy=popularity&pageSize=15`;

      const [headlinesRes, searchRes] = await Promise.all([
        fetchWithTimeout(headlinesUrl, { headers }),
        fetchWithTimeout(searchUrl, { headers }),
      ]);

      if (!headlinesRes.ok) console.warn(`[NewsAPI] headlines: ${headlinesRes.status}`);
      if (!searchRes.ok) console.warn(`[NewsAPI] search: ${searchRes.status}`);

      const headlines: NewsAPIResponse = headlinesRes.ok ? await headlinesRes.json() : { status: "error", totalResults: 0, articles: [] };
      const search: NewsAPIResponse = searchRes.ok ? await searchRes.json() : { status: "error", totalResults: 0, articles: [] };

      // Объединяем, убираем дубликаты по URL
      const seen = new Set<string>();
      const allArticles: NewsArticle[] = [];

      for (const article of [
        ...(headlines.articles || []),
        ...(search.articles || []),
      ]) {
        if (!article.title || article.title === "[Removed]") continue;
        if (seen.has(article.url)) continue;
        seen.add(article.url);
        allArticles.push(article);
      }

      // Нормализуем — score по позиции (ранние = более важные)
      return allArticles.slice(0, 25).map((article, idx) => ({
        sourceId: this.sourceId,
        title: article.title,
        url: article.url,
        score: Math.round(((25 - idx) / 25) * 100),
        summary: article.description,
        category: detectCategory(article.title),
        metadata: {
          source: article.source?.name,
          publishedAt: article.publishedAt,
        },
      }));
    } catch (err) {
      console.error("[NewsAPI] Ошибка сбора:", err);
      return [];
    }
  }
}
