import type { TrendCollector, TrendItem } from "./base";
import { fetchWithTimeout } from "@/lib/utils";

// Google Trends — прямой запрос к публичному RSS-фиду (без пакетов)

function parseTraffic(traffic: string): number {
  // "500,000+" → 500000, "200K+" → 200000, "1M+" → 1000000
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
    try {
      const url = `https://trends.google.com/trending/rss?geo=${this.geo}`;
      const res = await fetchWithTimeout(url, {
        headers: {
          "User-Agent": "1000bots/1.0 (business trend collector)",
          Accept: "application/rss+xml, application/xml, text/xml",
        },
      });

      if (!res.ok) {
        console.error(`[GoogleTrends] RSS вернул ${res.status}`);
        return [];
      }

      const xml = await res.text();
      return this.parseRSS(xml);
    } catch (err) {
      console.error("[GoogleTrends] Ошибка сбора:", err);
      return [];
    }
  }

  private parseRSS(xml: string): TrendItem[] {
    const items: TrendItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    // Собираем все трафики для нормализации
    const allTraffic: number[] = [];
    const rawItems: { title: string; traffic: string; link: string | null; news: string | null }[] = [];

    const tempXml = xml;
    const tempRegex = /<item>([\s\S]*?)<\/item>/g;
    let tempMatch;
    while ((tempMatch = tempRegex.exec(tempXml)) !== null) {
      const itemXml = tempMatch[1];
      const traffic = this.extractTag(itemXml, "ht:approx_traffic") || "0";
      allTraffic.push(parseTraffic(traffic));
    }

    const maxTraffic = Math.max(...allTraffic, 1);

    while ((match = itemRegex.exec(xml)) !== null && items.length < 20) {
      const itemXml = match[1];
      const title = this.extractTag(itemXml, "title");
      const link = this.extractTag(itemXml, "link");
      const traffic = this.extractTag(itemXml, "ht:approx_traffic") || "0";
      const newsTitle = this.extractNewsTitle(itemXml);

      if (title) {
        items.push({
          sourceId: this.sourceId,
          title,
          url: link || `https://trends.google.com/trending?geo=${this.geo}`,
          score: Math.round((parseTraffic(traffic) / maxTraffic) * 100),
          summary: newsTitle,
          category: null,
          metadata: {
            traffic,
            geo: this.geo,
          },
        });
      }
    }

    return items;
  }

  // Извлечь заголовок новости из <ht:news_item>
  private extractNewsTitle(xml: string): string | null {
    const newsMatch = xml.match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/);
    return newsMatch ? newsMatch[1].trim() : null;
  }

  private extractTag(xml: string, tag: string): string | null {
    // CDATA
    const cdataMatch = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`));
    if (cdataMatch) return cdataMatch[1].trim();

    // Обычный формат
    const simpleMatch = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
    return simpleMatch ? simpleMatch[1].trim() : null;
  }
}
