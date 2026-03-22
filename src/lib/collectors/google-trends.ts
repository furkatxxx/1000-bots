import type { TrendCollector, TrendItem } from "./base";
import { extractXmlTag } from "./base";
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
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
      "Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0",
    ];

    for (const ua of userAgents) {
      try {
        const url = `https://trends.google.com/trending/rss?geo=${this.geo}`;
        const res = await fetchWithTimeout(url, {
          headers: {
            "User-Agent": ua,
            Accept: "application/rss+xml, application/xml, text/xml",
          },
        });

        if (!res.ok) {
          console.warn(`[GoogleTrends] RSS вернул ${res.status}, пробую другой UA...`);
          continue;
        }

        const xml = await res.text();
        const items = this.parseRSS(xml);
        if (items.length > 0) return items;
      } catch (err) {
        console.warn("[GoogleTrends] Ошибка, пробую другой UA:", err);
        continue;
      }
    }

    console.error("[GoogleTrends] Все попытки провалились");
    return [];
  }

  private parseRSS(xml: string): TrendItem[] {
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    // Один проход: собираем данные и трафик одновременно
    const parsed: { title: string; link: string; traffic: string; newsTitle: string | null; trafficNum: number }[] = [];
    while ((match = itemRegex.exec(xml)) !== null && parsed.length < 20) {
      const itemXml = match[1];
      const title = extractXmlTag(itemXml, "title");
      if (!title) continue;
      const traffic = extractXmlTag(itemXml, "ht:approx_traffic") || "0";
      parsed.push({
        title,
        link: extractXmlTag(itemXml, "link") || `https://trends.google.com/trending?geo=${this.geo}`,
        traffic,
        newsTitle: this.extractNewsTitle(itemXml),
        trafficNum: parseTraffic(traffic),
      });
    }

    const maxTraffic = Math.max(...parsed.map((p) => p.trafficNum), 1);

    return parsed.map((p) => ({
      sourceId: this.sourceId,
      title: p.title,
      url: p.link,
      score: Math.round((p.trafficNum / maxTraffic) * 100),
      summary: p.newsTitle,
      category: null,
      metadata: { traffic: p.traffic, geo: this.geo },
    }));
  }

  // Извлечь заголовок новости из <ht:news_item>
  private extractNewsTitle(xml: string): string | null {
    const newsMatch = xml.match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/);
    return newsMatch ? newsMatch[1].trim() : null;
  }

}
