import type { TrendCollector, TrendItem } from "./base";
import { detectCategory, extractXmlTag } from "./base";
import { fetchWithTimeout } from "@/lib/utils";

// VC.ru — статьи предпринимателей о проблемах, жалобах, поиске решений
// Парсим RSS-фид популярных разделов

const FEEDS = [
  { url: "https://vc.ru/rss", section: "основной", weight: 1.2 },
  { url: "https://vc.ru/rss/all", section: "всё", weight: 1.0 },
];

// Фильтруем посты с бизнес-сигналами (боли, регуляция, тренды, возможности)
const BUSINESS_PATTERNS = [
  // Боли и проблемы
  /проблем/i, /не работает/i, /ошибк/i, /жалоб/i, /трудност/i,
  /не (могу|может|удаётся)/i, /устал/i, /бесит/i, /замучил/i,
  /дорого/i, /переплачива/i, /экономить/i, /рутин/i,
  // Поиск решений
  /нужен|ищу|подскажите|помогите|как (сделать|решить|выбрать)/i,
  /альтернатив/i, /замена|заменить/i, /сервис|инструмент/i,
  // Бизнес-возможности и регуляция
  /запрет/i, /штраф/i, /блокировк/i, /закон/i, /регулирован/i,
  /потребовал/i, /обязал/i, /ограничен/i,
  // E-commerce и маркетплейсы
  /wildberries|ozon|маркетплейс|селлер|продавц/i,
  /самозанят/i, /предприниматель/i, /малый бизнес/i,
  // Технологии и AI
  /ИИ|искусственн.*интеллект|нейросет/i, /автоматизац/i,
  /бот|SaaS|API/i, /стартап/i,
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
      const rawTitle = extractXmlTag(itemXml, "title");
      const description = extractXmlTag(itemXml, "description");
      const link = extractXmlTag(itemXml, "link");

      // Убираем CDATA обёртку если есть
      const title = rawTitle?.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();

      if (!title || title.length < 10) continue;

      const fullText = `${title} ${description || ""}`;

      // Фильтруем: оставляем только посты с бизнес-сигналами
      const hasBizSignal = BUSINESS_PATTERNS.some((p) => p.test(fullText));
      if (!hasBizSignal) continue;

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
