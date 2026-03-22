import type { TrendCollector, TrendItem } from "./base";
import { detectCategory, extractXmlTag } from "./base";
import { fetchWithTimeout } from "@/lib/utils";

// Reddit Pains — парсим подреддиты где люди ЖАЛУЮТСЯ и ИЩУТ решения
// Отдельный коллектор от основного Reddit (тот ищет тренды, этот — боли)

const PAIN_SUBREDDITS = [
  { name: "smallbusiness", weight: 1.5 },      // Малый бизнес — реальные проблемы
  { name: "ecommerce", weight: 1.4 },           // E-commerce боли (близко к МП)
  { name: "Automate", weight: 1.3 },            // Люди ищут автоматизацию рутины
  { name: "SaaS", weight: 1.2 },                // Проблемы с SaaS-продуктами
  { name: "freelance", weight: 1.1 },           // Фрилансеры и их боли
];

// Фильтруем посты где просят помощь / жалуются
const PAIN_SIGNALS = [
  /help|looking for|need|struggling|frustrat/i,
  /alternative to|replacement for|better than/i,
  /how do (you|I)|any (tool|app|service|solution)/i,
  /hate|annoying|broken|waste of time/i,
  /too expensive|overpriced|can't afford/i,
  /automate|manual|tedious|repetitive/i,
  /recommend|suggest|advice/i,
];

export class RedditPainsCollector implements TrendCollector {
  sourceId = "reddit_pains";
  label = "Reddit Боли";

  async collect(): Promise<TrendItem[]> {
    const allItems: TrendItem[] = [];

    const results = await Promise.allSettled(
      PAIN_SUBREDDITS.map((sub) => this.fetchSubreddit(sub.name, sub.weight))
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        allItems.push(...result.value);
      }
    }

    allItems.sort((a, b) => b.score - a.score);
    return allItems.slice(0, 20);
  }

  private async fetchSubreddit(subreddit: string, weight: number): Promise<TrendItem[]> {
    // old.reddit.com меньше блокирует серверные IP
    const urls = [
      `https://old.reddit.com/r/${subreddit}/new.rss`,
      `https://www.reddit.com/r/${subreddit}/new.rss`,
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
          console.warn(`[Reddit Pains] r/${subreddit} вернул ${res.status} (${url})`);
          continue;
        }

        const xml = await res.text();
        const items = this.parseAtom(xml, subreddit, weight);
        if (items.length > 0) return items;
      } catch (err) {
        console.warn(`[Reddit Pains] r/${subreddit} ошибка (${url}):`, err);
        continue;
      }
    }
    return [];
  }

  private parseAtom(xml: string, subreddit: string, weight: number): TrendItem[] {
    const items: TrendItem[] = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;
    let position = 0;

    while ((match = entryRegex.exec(xml)) !== null && items.length < 8) {
      position++;
      const entryXml = match[1];
      const title = extractXmlTag(entryXml, "title");
      const link = this.extractAtomLink(entryXml);
      const content = extractXmlTag(entryXml, "content");

      if (!title || title.length < 10) continue;

      const fullText = `${title} ${content || ""}`;

      // Фильтруем: только посты с сигналами боли
      const hasPain = PAIN_SIGNALS.some((p) => p.test(fullText));
      if (!hasPain) continue;

      const positionScore = Math.round(((10 - position) / 10) * 100);
      const painBonus = 20;
      const score = Math.min(100, Math.round((positionScore + painBonus) * weight));

      // Обрезаем контент для summary, убираем HTML
      const cleanContent = content
        ? content.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").trim().slice(0, 200)
        : null;

      items.push({
        sourceId: this.sourceId,
        title,
        url: link || `https://www.reddit.com/r/${subreddit}`,
        score,
        summary: cleanContent,
        category: detectCategory(`${title} ${subreddit}`),
        metadata: { subreddit, type: "pain" },
      });
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
