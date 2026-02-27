import type { TrendCollector, TrendItem } from "./base";

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

// Определяем категорию по заголовку
function detectCategory(title: string): string | null {
  const lower = title.toLowerCase();
  if (/ai|artificial intelligence|machine learning|llm|chatgpt|claude/.test(lower)) return "ai";
  if (/startup|funding|raise|venture/.test(lower)) return "startup";
  if (/business|economy|market|stock/.test(lower)) return "business";
  if (/tech|software|app|platform/.test(lower)) return "tech";
  return null;
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
      // Запрос 1: топ заголовки по технологиям
      const headlinesUrl = `${NEWSAPI_BASE}/top-headlines?category=technology&language=en&pageSize=15&apiKey=${this.apiKey}`;
      // Запрос 2: поиск по бизнес-ключевым словам
      const searchUrl = `${NEWSAPI_BASE}/everything?q="startup" OR "AI tool" OR "business idea"&sortBy=popularity&pageSize=15&apiKey=${this.apiKey}`;

      const [headlinesRes, searchRes] = await Promise.all([
        fetch(headlinesUrl),
        fetch(searchUrl),
      ]);

      const headlines: NewsAPIResponse = await headlinesRes.json();
      const search: NewsAPIResponse = await searchRes.json();

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
