import type { TrendCollector, TrendItem } from "./base";
import { fetchWithTimeout, concurrentMap } from "@/lib/utils";

const HN_API = "https://hacker-news.firebaseio.com/v0";
const TOP_STORIES_LIMIT = 30;

interface HNStory {
  id: number;
  title: string;
  url?: string;
  score: number;
  type: string;
  descendants?: number;
}

// Определяем категорию по ключевым словам в заголовке
function detectCategory(title: string): string | null {
  const lower = title.toLowerCase();
  if (/\bai\b|artificial intelligence|llm|gpt|claude|machine learning/.test(lower)) return "ai";
  if (/startup|funding|vc|raise|seed|series/.test(lower)) return "startup";
  if (/saas|subscription|mrr|arr/.test(lower)) return "saas";
  if (/crypto|bitcoin|blockchain|web3/.test(lower)) return "crypto";
  if (/open.?source|github|repo/.test(lower)) return "opensource";
  return "tech";
}

export class HackerNewsCollector implements TrendCollector {
  sourceId = "hacker_news";
  label = "Hacker News";

  async collect(): Promise<TrendItem[]> {
    // Получаем список ID топ-историй
    const res = await fetchWithTimeout(`${HN_API}/topstories.json`);
    if (!res.ok) throw new Error(`HN API error: ${res.status}`);

    const ids: number[] = await res.json();
    const topIds = ids.slice(0, TOP_STORIES_LIMIT);

    // Загружаем истории пачками по 10 (не DDoS-им Firebase)
    const stories = await concurrentMap<number, HNStory | null>(
      topIds,
      async (id) => {
        try {
          const r = await fetchWithTimeout(`${HN_API}/item/${id}.json`);
          if (!r.ok) return null;
          return r.json();
        } catch {
          return null;
        }
      },
      10
    );

    // Находим максимальный score для нормализации
    const validStories = stories.filter((s): s is HNStory => s !== null);
    const maxScore = Math.max(...validStories.map((s) => s.score), 1);

    // Нормализуем в TrendItem
    return validStories.map((story) => ({
      sourceId: this.sourceId,
      title: story.title,
      url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
      score: Math.round((story.score / maxScore) * 100),
      summary: null,
      category: detectCategory(story.title),
      metadata: {
        hnId: story.id,
        rawScore: story.score,
        comments: story.descendants || 0,
      },
    }));
  }
}
