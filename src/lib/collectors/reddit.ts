import type { TrendCollector, TrendItem } from "./base";
import { detectCategory, extractXmlTag } from "./base";
import { fetchWithTimeout } from "@/lib/utils";

// Reddit — парсим публичные Atom-фиды популярных подреддитов (без API-ключа)

const SUBREDDITS = [
  { name: "microsaas", weight: 1.5 },       // Реальные микро-бизнесы, цифры выручки
  { name: "indiehackers", weight: 1.4 },     // Соло-предприниматели, конкретные кейсы
  { name: "Entrepreneur", weight: 1.2 },     // Бизнес-вопросы и боли
  { name: "SideProject", weight: 1.1 },      // Люди показывают проекты — видно что востребовано
  { name: "slavelabour", weight: 1.3 },      // Люди платят за конкретные задачи — прямой спрос
];

export class RedditCollector implements TrendCollector {
  sourceId = "reddit";
  label = "Reddit";

  async collect(): Promise<TrendItem[]> {
    const allItems: TrendItem[] = [];

    // Собираем из нескольких подреддитов параллельно
    const results = await Promise.allSettled(
      SUBREDDITS.map((sub) => this.fetchSubreddit(sub.name, sub.weight))
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        allItems.push(...result.value);
      }
    }

    // Сортируем по score и берём топ-20
    allItems.sort((a, b) => b.score - a.score);
    return allItems.slice(0, 20);
  }

  private async fetchSubreddit(subreddit: string, weight: number): Promise<TrendItem[]> {
    // old.reddit.com меньше блокирует серверные IP
    const urls = [
      `https://old.reddit.com/r/${subreddit}/hot.rss`,
      `https://www.reddit.com/r/${subreddit}/hot.rss`,
    ];
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

    for (const url of urls) {
      try {
        const res = await fetchWithTimeout(url, {
          headers: {
            "User-Agent": ua,
            Accept: "application/atom+xml, application/xml, text/xml",
          },
        });

        if (!res.ok) {
          console.warn(`[Reddit] r/${subreddit} вернул ${res.status} (${url})`);
          continue;
        }

        const xml = await res.text();
        const items = this.parseAtom(xml, subreddit, weight);
        if (items.length > 0) return items;
      } catch (err) {
        console.warn(`[Reddit] r/${subreddit} ошибка (${url}):`, err);
        continue;
      }
    }
    return [];
  }

  private parseAtom(xml: string, subreddit: string, weight: number): TrendItem[] {
    const items: TrendItem[] = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;

    while ((match = entryRegex.exec(xml)) !== null && items.length < 8) {
      const entryXml = match[1];
      const title = extractXmlTag(entryXml, "title");
      const link = this.extractAtomLink(entryXml);

      if (title && title.length > 5) {
        // Позиция определяет важность (топ = выше)
        const positionScore = Math.round(((8 - items.length) / 8) * 100);
        const score = Math.min(100, Math.round(positionScore * weight));

        items.push({
          sourceId: this.sourceId,
          title,
          url: link || `https://www.reddit.com/r/${subreddit}`,
          score,
          summary: null,
          category: detectCategory(`${title} ${subreddit}`),
          metadata: {
            subreddit,
          },
        });
      }
    }

    return items;
  }

  private extractAtomLink(xml: string): string | null {
    const altMatch = xml.match(/<link[^>]*rel="alternate"[^>]*href="([^"]*)"[^>]*\/?>/);
    if (altMatch) return altMatch[1];

    const hrefMatch = xml.match(/<link[^>]*href="([^"]*)"[^>]*\/?>/);
    return hrefMatch ? hrefMatch[1] : null;
  }

}
