import type { TrendCollector, TrendItem } from "./base";
import { fetchWithTimeout } from "@/lib/utils";

// Product Hunt — парсим публичную RSS-ленту (не требует API-ключа)

function detectCategory(name: string, tagline: string, topics: string[]): string {
  const text = `${name} ${tagline} ${topics.join(" ")}`.toLowerCase();
  if (/\bai\b|artificial intelligence|llm|gpt|machine learning/.test(text)) return "ai";
  if (/saas|subscription|tool|platform/.test(text)) return "saas";
  if (/marketing|seo|growth|analytics/.test(text)) return "marketing";
  if (/developer|api|code|dev/.test(text)) return "devtools";
  if (/design|ui|ux|figma/.test(text)) return "design";
  if (/productivity|workflow|automation/.test(text)) return "productivity";
  return "tech";
}

export class ProductHuntCollector implements TrendCollector {
  sourceId = "product_hunt";
  label = "Product Hunt";

  async collect(): Promise<TrendItem[]> {
    try {
      const rssUrl = "https://www.producthunt.com/feed";
      const res = await fetchWithTimeout(rssUrl, {
        headers: {
          "User-Agent": "1000bots/1.0 (business trend collector)",
          Accept: "application/rss+xml, application/xml, text/xml",
        },
      });

      if (!res.ok) {
        return await this.collectFromFrontend();
      }

      const xml = await res.text();
      return this.parseRSS(xml);
    } catch (err) {
      console.error("[ProductHunt] RSS ошибка, пробую альтернативный метод:", err);
      try {
        return await this.collectFromFrontend();
      } catch (err2) {
        console.error("[ProductHunt] Полная ошибка:", err2);
        return [];
      }
    }
  }

  private parseRSS(xml: string): TrendItem[] {
    const items: TrendItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && items.length < 20) {
      const itemXml = match[1];
      const title = this.extractTag(itemXml, "title");
      const link = this.extractTag(itemXml, "link");
      const description = this.extractTag(itemXml, "description");

      if (title) {
        // Нормализуем score в 0-100 (позиция → важность)
        const score = Math.round(((20 - items.length) / 20) * 100);
        items.push({
          sourceId: this.sourceId,
          title,
          url: link || null,
          score,
          summary: description ? description.slice(0, 200) : null,
          category: detectCategory(title, description || "", []),
          metadata: { source: "rss" },
        });
      }
    }

    return items;
  }

  private extractTag(xml: string, tag: string): string | null {
    const cdataMatch = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`));
    if (cdataMatch) return cdataMatch[1].trim();

    const simpleMatch = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
    return simpleMatch ? simpleMatch[1].trim() : null;
  }

  private async collectFromFrontend(): Promise<TrendItem[]> {
    const url = "https://www.producthunt.com/";
    const res = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html",
      },
    });

    if (!res.ok) {
      throw new Error(`ProductHunt frontend error: ${res.status}`);
    }

    const html = await res.text();
    const items: TrendItem[] = [];
    const titleRegex = /<h3[^>]*>([^<]+)<\/h3>/g;
    let titleMatch;
    let idx = 0;

    while ((titleMatch = titleRegex.exec(html)) !== null && idx < 15) {
      const title = titleMatch[1].trim();
      if (title.length > 3 && title.length < 100) {
        const score = Math.round(((15 - idx) / 15) * 100);
        items.push({
          sourceId: this.sourceId,
          title,
          url: "https://www.producthunt.com",
          score,
          summary: null,
          category: detectCategory(title, "", []),
          metadata: { source: "frontend" },
        });
        idx++;
      }
    }

    return items;
  }
}
