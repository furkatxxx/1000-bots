import type { TrendCollector, TrendItem } from "./base";
import { detectCategory, extractXmlTag } from "./base";
import { fetchWithTimeout } from "@/lib/utils";

// Product Hunt — парсим публичный Atom-фид (не требует API-ключа)

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
      const title = extractXmlTag(entryXml, "title");
      const link = this.extractAtomLink(entryXml);
      const summary = extractXmlTag(entryXml, "summary") || extractXmlTag(entryXml, "content");

      if (title) {
        const score = Math.round(((20 - items.length) / 20) * 100);
        items.push({
          sourceId: this.sourceId,
          title,
          url: link || null,
          score,
          summary: summary ? summary.replace(/<[^>]*>/g, "").slice(0, 200) : null,
          category: detectCategory(`${title} ${summary || ""}`),
          metadata: { source: "atom" },
        });
      }
    }

    // Если Atom не сработал — пробуем RSS-формат (<item>) на всякий случай
    if (items.length === 0) {
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      while ((match = itemRegex.exec(xml)) !== null && items.length < 20) {
        const itemXml = match[1];
        const title = extractXmlTag(itemXml, "title");
        const link = extractXmlTag(itemXml, "link");
        const description = extractXmlTag(itemXml, "description");

        if (title) {
          const score = Math.round(((20 - items.length) / 20) * 100);
          items.push({
            sourceId: this.sourceId,
            title,
            url: link || null,
            score,
            summary: description ? description.replace(/<[^>]*>/g, "").slice(0, 200) : null,
            category: detectCategory(`${title} ${description || ""}`),
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

}
