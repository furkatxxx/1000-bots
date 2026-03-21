import type { TrendCollector, TrendItem } from "./base";
import { detectCategory, extractXmlTag } from "./base";
import { fetchWithTimeout } from "@/lib/utils";

// VC.ru — статьи предпринимателей о проблемах, жалобах, поиске решений
// Парсим RSS-фид популярных разделов

const FEEDS = [
  { url: "https://vc.ru/rss/new", section: "новое", weight: 1.0 },
  { url: "https://vc.ru/rss/popular", section: "популярное", weight: 1.3 },
];

// Фильтруем только посты с признаками боли/проблемы
const PAIN_PATTERNS = [
  /проблем/i, /не работает/i, /сломал/i, /ошибк/i, /жалоб/i,
  /как (решить|исправить|избавиться|справиться)/i, /трудност/i,
  /не могу/i, /невозможно/i, /устал от/i, /достало/i, /бесит/i,
  /нужен (сервис|инструмент|бот|решение)/i, /ищу (сервис|инструмент|решение|альтернатив)/i,
  /кто сталкивался/i, /подскажите/i, /помогите/i,
  /боль/i, /головная боль/i, /замучил/i, /надоел/i,
  /дорого/i, /переплачива/i, /экономить/i, /оптимизир/i,
  /автоматизир/i, /вручную/i, /рутин/i, /долго делать/i,
];

export class VcRuCollector implements TrendCollector {
  sourceId = "vc_ru";
  label = "VC.ru";

  async collect(): Promise<TrendItem[]> {
    const allItems: TrendItem[] = [];

    const results = await Promise.allSettled(
      FEEDS.map((feed) => this.fetchFeed(feed.url, feed.section, feed.weight))
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        allItems.push(...result.value);
      }
    }

    allItems.sort((a, b) => b.score - a.score);
    return allItems.slice(0, 20);
  }

  private async fetchFeed(url: string, section: string, weight: number): Promise<TrendItem[]> {
    try {
      const res = await fetchWithTimeout(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; TrendBot/1.0)",
          Accept: "application/rss+xml, application/xml, text/xml",
        },
      });

      if (!res.ok) {
        console.warn(`[VC.ru] ${section} вернул ${res.status}`);
        return [];
      }

      const xml = await res.text();
      return this.parseRss(xml, section, weight);
    } catch (err) {
      console.error(`[VC.ru] ${section} ошибка:`, err);
      return [];
    }
  }

  private parseRss(xml: string, section: string, weight: number): TrendItem[] {
    const items: TrendItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    let position = 0;

    while ((match = itemRegex.exec(xml)) !== null && items.length < 15) {
      position++;
      const itemXml = match[1];
      const title = extractXmlTag(itemXml, "title");
      const description = extractXmlTag(itemXml, "description");
      const link = extractXmlTag(itemXml, "link");

      if (!title || title.length < 10) continue;

      const fullText = `${title} ${description || ""}`;

      // Фильтруем: оставляем только посты с признаками боли
      const hasPain = PAIN_PATTERNS.some((p) => p.test(fullText));
      if (!hasPain) continue;

      const positionScore = Math.round(((20 - position) / 20) * 100);
      const painBonus = 15; // бонус за явный признак боли
      const score = Math.min(100, Math.round((positionScore + painBonus) * weight));

      // Обрезаем описание до 200 символов, убираем HTML-теги
      const cleanSummary = description
        ? description.replace(/<[^>]+>/g, "").trim().slice(0, 200)
        : null;

      items.push({
        sourceId: this.sourceId,
        title,
        url: link || "https://vc.ru",
        score,
        summary: cleanSummary,
        category: detectCategory(fullText),
        metadata: { section },
      });
    }

    return items;
  }
}
