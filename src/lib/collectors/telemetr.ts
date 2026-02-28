// Telemetr.io — тренды из Telegram (быстрорастущие каналы)
// Бесплатно 1000 запросов/месяц, нужен API-ключ от @telemetrio_api_bot

import type { TrendItem, TrendCollector } from "./base";
import { fetchWithTimeout } from "@/lib/utils";

const API_BASE = "https://api.telemetr.io/v1";

interface CatalogItem {
  internal_id: string;
  title: string;
  members_count: number;
  privacy: string;
  verified: boolean;
  country: string;
  language: string;
  category: string;
  members_change?: {
    last_7_days?: number;
    last_30_days?: number;
  };
  post_views?: number;
  post_views_24h?: number;
  er?: number;
}

export class TelemetrCollector implements TrendCollector {
  sourceId = "telemetr";
  label = "Telemetr.io (Telegram)";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async collect(): Promise<TrendItem[]> {
    const items: TrendItem[] = [];

    // Запрашиваем быстрорастущие русскоязычные каналы
    try {
      const data = await this.searchCatalog("members_growth7d");

      for (const channel of data) {
        const growth7d = channel.members_change?.last_7_days || 0;
        const members = channel.members_count || 0;

        // Нормализуем очки: рост подписчиков за неделю → 0-100
        const score = Math.min(100, Math.round((growth7d / Math.max(members, 1)) * 1000));

        items.push({
          sourceId: this.sourceId,
          title: `📱 ${channel.title} (+${growth7d.toLocaleString("ru-RU")} за 7д)`,
          url: `https://t.me/${channel.internal_id}`,
          score,
          summary: `${members.toLocaleString("ru-RU")} подписчиков, рост ${growth7d.toLocaleString("ru-RU")} за неделю`,
          category: channel.category || "telegram",
          metadata: {
            members,
            growth7d,
            growth30d: channel.members_change?.last_30_days,
            postViews: channel.post_views,
            postViews24h: channel.post_views_24h,
            er: channel.er,
            verified: channel.verified,
          },
        });
      }
    } catch (error) {
      console.error("[Telemetr] Ошибка сбора:", error);
    }

    return items.slice(0, 15); // макс 15 трендов
  }

  private async searchCatalog(sortBy: string): Promise<CatalogItem[]> {
    const url = new URL(`${API_BASE}/catalog/search`);
    url.searchParams.set("language", "ru");
    url.searchParams.set("sort_by", sortBy);
    url.searchParams.set("sort_direction", "desc");
    url.searchParams.set("limit", "20");

    const res = await fetchWithTimeout(url.toString(), {
      headers: {
        "x-api-key": this.apiKey,
        accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Telemetr API ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    return data.items || (Array.isArray(data) ? data : []);
  }
}
