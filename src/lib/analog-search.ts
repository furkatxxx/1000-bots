// #32 — Автопоиск аналогов на Product Hunt и GitHub
// Ищет похожие продукты по названию и описанию идеи

import { fetchWithTimeout } from "./utils";

export interface AnalogProduct {
  name: string;
  description: string;
  url: string;
  source: "product_hunt" | "github";
  stars?: number;       // для GitHub
  language?: string;    // для GitHub
  topics?: string[];    // теги/топики
}

export interface AnalogsResult {
  products: AnalogProduct[];
  searchQuery: string;
  searchedAt: string;
}

// Извлекаем ключевые слова для поиска аналогов
function buildSearchQuery(ideaName: string, ideaDescription: string): string {
  // Убираем эмодзи и служебные слова
  const stopWords = new Set([
    "для", "на", "по", "от", "из", "через", "как", "или", "что", "это",
    "бот", "сервис", "платформа", "система", "инструмент", "app", "bot",
    "service", "tool", "platform", "ai", "автоматический", "автоматизация",
  ]);

  const words = ideaName
    .replace(/[^\wа-яА-ЯёЁa-zA-Z\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()));

  // Берём 2-3 ключевых слова из названия
  let query = words.slice(0, 3).join(" ");

  // Если мало слов — добавляем из описания
  if (words.length < 2) {
    const descWords = ideaDescription
      .replace(/[^\wа-яА-ЯёЁa-zA-Z\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopWords.has(w.toLowerCase()))
      .slice(0, 2);
    query = [query, ...descWords].filter(Boolean).join(" ");
  }

  return query || ideaName.slice(0, 30);
}

// Поиск на GitHub через Search API (бесплатно)
async function searchGitHub(query: string): Promise<AnalogProduct[]> {
  try {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=5`;
    const res = await fetchWithTimeout(url, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "1000bots/1.0",
      },
    });

    if (!res.ok) return [];

    const data = await res.json();
    if (!data.items || !Array.isArray(data.items)) return [];

    return data.items.map((repo: {
      full_name: string;
      description: string | null;
      html_url: string;
      stargazers_count: number;
      language: string | null;
      topics: string[];
    }) => ({
      name: repo.full_name,
      description: (repo.description || "Нет описания").slice(0, 200),
      url: repo.html_url,
      source: "github" as const,
      stars: repo.stargazers_count,
      language: repo.language || undefined,
      topics: repo.topics?.slice(0, 5) || [],
    }));
  } catch (error) {
    console.error("[Analog Search] GitHub error:", error);
    return [];
  }
}

// Поиск на Product Hunt через веб (без API-ключа)
async function searchProductHunt(query: string): Promise<AnalogProduct[]> {
  try {
    // Product Hunt имеет поиск через URL
    const url = `https://www.producthunt.com/search?q=${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; 1000bots/1.0)",
        Accept: "text/html",
      },
    });

    if (!res.ok) return [];

    const html = await res.text();

    // Парсим результаты из HTML (ищем паттерны Product Hunt)
    const results: AnalogProduct[] = [];

    // Product Hunt отдаёт JSON в data-* атрибутах или в script-тегах
    // Ищем ссылки на посты: /posts/product-name
    const postRegex = /<a[^>]*href="\/posts\/([^"]*)"[^>]*>([^<]*)<\/a>/g;
    let match;
    const seen = new Set<string>();

    while ((match = postRegex.exec(html)) !== null && results.length < 5) {
      const slug = match[1];
      const name = match[2].trim();
      if (!name || name.length < 3 || seen.has(slug)) continue;
      seen.add(slug);

      results.push({
        name,
        description: "",
        url: `https://www.producthunt.com/posts/${slug}`,
        source: "product_hunt",
      });
    }

    // Альтернативный парсинг: ищем JSON-данные в скрипте
    if (results.length === 0) {
      const jsonMatch = html.match(/"name":"([^"]+)","tagline":"([^"]+)"/g);
      if (jsonMatch) {
        for (const m of jsonMatch.slice(0, 5)) {
          const nameMatch = m.match(/"name":"([^"]+)"/);
          const tagMatch = m.match(/"tagline":"([^"]+)"/);
          if (nameMatch) {
            results.push({
              name: nameMatch[1],
              description: tagMatch ? tagMatch[1] : "",
              url: `https://www.producthunt.com/search?q=${encodeURIComponent(nameMatch[1])}`,
              source: "product_hunt",
            });
          }
        }
      }
    }

    return results;
  } catch (error) {
    console.error("[Analog Search] Product Hunt error:", error);
    return [];
  }
}

// Главная функция: искать аналоги параллельно
export async function searchAnalogs(
  ideaName: string,
  ideaDescription: string
): Promise<AnalogsResult> {
  const query = buildSearchQuery(ideaName, ideaDescription);
  console.log(`[Analog Search] Ищем аналоги: "${query}"`);

  const [githubResults, phResults] = await Promise.allSettled([
    searchGitHub(query),
    searchProductHunt(query),
  ]);

  const products: AnalogProduct[] = [
    ...(githubResults.status === "fulfilled" ? githubResults.value : []),
    ...(phResults.status === "fulfilled" ? phResults.value : []),
  ];

  return {
    products,
    searchQuery: query,
    searchedAt: new Date().toISOString(),
  };
}
