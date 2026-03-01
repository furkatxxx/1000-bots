import type { TrendCollector, TrendItem } from "./base";
import { fetchWithTimeout } from "@/lib/utils";

// Product Hunt — парсим публичный Atom-фид (не требует API-ключа)

function detectCategory(name: string, tagline: string): string {
  const text = `${name} ${tagline}`.toLowerCase();
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
      const feedUrl = "https://www.producthunt.com/feed";
      const res = await fetchWithTimeout(feedUrl, {
        headers: {
          "User-Agent": "1000bots/1.0 (business trend collector)",
          Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml",
        },
      });

      if (!res.ok) {
        console.warn(`[ProductHunt] Фид вернул ${res.status}`);
        return [];
      }

      const xml = await res.text();
      return this.parseFeed(xml);
    } catch (err) {
      console.error("[ProductHunt] Ошибка:", err);
      return [];
    }
  }

  private parseFeed(xml: string): TrendItem[] {
    const items: TrendItem[] = [];

    // Пробуем Atom-формат (<entry>) — Product Hunt отдаёт именно его
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;

    while ((match = entryRegex.exec(xml)) !== null && items.length < 20) {
      const entryXml = match[1];
      const title = this.extractTag(entryXml, "title");
      const link = this.extractAtomLink(entryXml);
      const summary = this.extractTag(entryXml, "summary") || this.extractTag(entryXml, "content");

      if (title) {
        const score = Math.round(((20 - items.length) / 20) * 100);
        items.push({
          sourceId: this.sourceId,
          title,
          url: link || null,
          score,
          summary: summary ? summary.replace(/<[^>]*>/g, "").slice(0, 200) : null,
          category: detectCategory(title, summary || ""),
          metadata: { source: "atom" },
        });
      }
    }

    // Если Atom не сработал — пробуем RSS-формат (<item>) на всякий случай
    if (items.length === 0) {
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      while ((match = itemRegex.exec(xml)) !== null && items.length < 20) {
        const itemXml = match[1];
        const title = this.extractTag(itemXml, "title");
        const link = this.extractTag(itemXml, "link");
        const description = this.extractTag(itemXml, "description");

        if (title) {
          const score = Math.round(((20 - items.length) / 20) * 100);
          items.push({
            sourceId: this.sourceId,
            title,
            url: link || null,
            score,
            summary: description ? description.replace(/<[^>]*>/g, "").slice(0, 200) : null,
            category: detectCategory(title, description || ""),
            metadata: { source: "rss" },
          });
        }
      }
    }

    return items;
  }

  // Atom: <link href="https://..." />
  private extractAtomLink(xml: string): string | null {
    // Ссылка с rel="alternate" или без rel
    const altMatch = xml.match(/<link[^>]*rel="alternate"[^>]*href="([^"]*)"[^>]*\/?>/);
    if (altMatch) return altMatch[1];

    const hrefMatch = xml.match(/<link[^>]*href="([^"]*)"[^>]*\/?>/);
    return hrefMatch ? hrefMatch[1] : null;
  }

  private extractTag(xml: string, tag: string): string | null {
    // CDATA формат
    const cdataMatch = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`));
    if (cdataMatch) return cdataMatch[1].trim();

    // Обычный формат
    const simpleMatch = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
    return simpleMatch ? simpleMatch[1].trim() : null;
  }
}
