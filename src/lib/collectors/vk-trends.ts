// VK API — тренды из ВКонтакте (популярные посты по хештегам)
// Бесплатно, нужен сервисный токен VK (регистрация приложения)

import type { TrendItem, TrendCollector } from "./base";

const VK_API = "https://api.vk.com/method";
const VK_VERSION = "5.199";

// Хештеги для поиска бизнес/технологических трендов
const SEED_HASHTAGS = [
  "#стартап",
  "#бизнесидея",
  "#нейросети",
  "#маркетплейс",
  "#автоматизация",
  "#SaaS",
  "#фриланс",
  "#IT",
];

interface VkPost {
  id: number;
  owner_id: number;
  text: string;
  date: number;
  likes: { count: number };
  reposts: { count: number };
  views?: { count: number };
  comments: { count: number };
}

export class VkTrendsCollector implements TrendCollector {
  sourceId = "vk_trends";
  label = "VK Тренды";
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async collect(): Promise<TrendItem[]> {
    const items: TrendItem[] = [];

    // Случайные 4 хештега из 8
    const shuffled = [...SEED_HASHTAGS].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 4);

    for (const hashtag of selected) {
      try {
        const posts = await this.searchPosts(hashtag);

        for (const post of posts) {
          const engagement = (post.likes?.count || 0) + (post.reposts?.count || 0) * 3 + (post.comments?.count || 0) * 2;
          const views = post.views?.count || 0;

          // Нормализуем очки: вовлечённость → 0-100
          const score = Math.min(100, Math.round(engagement / 5));

          // Извлекаем первые 150 символов как заголовок
          const text = post.text.replace(/\n/g, " ").trim();
          const title = text.length > 150 ? text.slice(0, 147) + "..." : text;

          if (title.length < 20) continue; // слишком короткий

          items.push({
            sourceId: this.sourceId,
            title,
            url: `https://vk.com/wall${post.owner_id}_${post.id}`,
            score,
            summary: `👍 ${post.likes?.count || 0} · 🔄 ${post.reposts?.count || 0} · 👁 ${views.toLocaleString("ru-RU")}`,
            category: "business",
            metadata: {
              hashtag,
              likes: post.likes?.count,
              reposts: post.reposts?.count,
              views,
              comments: post.comments?.count,
              engagement,
              date: new Date(post.date * 1000).toISOString(),
            },
          });
        }
      } catch (error) {
        console.error(`[VK] Ошибка для ${hashtag}:`, error);
      }
    }

    // Сортируем по score и берём топ-15
    items.sort((a, b) => b.score - a.score);
    return items.slice(0, 15);
  }

  private async searchPosts(query: string): Promise<VkPost[]> {
    const url = new URL(`${VK_API}/newsfeed.search`);
    url.searchParams.set("q", query);
    url.searchParams.set("count", "20");
    url.searchParams.set("start_from", "0");
    url.searchParams.set("access_token", this.token);
    url.searchParams.set("v", VK_VERSION);

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`VK API ${res.status}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(`VK API: ${data.error.error_msg || JSON.stringify(data.error)}`);
    }

    return data.response?.items || [];
  }
}
