import type { TrendCollector, TrendItem } from "./base";
import { detectCategory } from "./base";
import { fetchWithTimeout } from "@/lib/utils";

// GitHub Trending — через Search API (бесплатно, 10 запросов/мин без токена)
// Ищем репозитории, созданные за последнюю неделю, сортируем по звёздам

interface GitHubRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics: string[];
}

interface GitHubSearchResponse {
  total_count: number;
  items: GitHubRepo[];
}


export class GitHubTrendingCollector implements TrendCollector {
  sourceId = "github_trending";
  label = "GitHub Trending";

  async collect(): Promise<TrendItem[]> {
    try {
      // Ищем репозитории, созданные за последние 7 дней
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const dateStr = weekAgo.toISOString().split("T")[0];

      const url = `https://api.github.com/search/repositories?q=created:>${dateStr}&sort=stars&order=desc&per_page=20`;

      const res = await fetchWithTimeout(url, {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "1000bots/1.0",
        },
      });

      if (!res.ok) {
        throw new Error(`GitHub API error: ${res.status}`);
      }

      const data: GitHubSearchResponse = await res.json();

      if (!data.items || data.items.length === 0) return [];

      const maxStars = Math.max(...data.items.map((r) => r.stargazers_count), 1);

      return data.items.map((repo) => ({
        sourceId: this.sourceId,
        title: `${repo.full_name}: ${repo.description || repo.name}`,
        url: repo.html_url,
        score: Math.round((repo.stargazers_count / maxStars) * 100),
        summary: repo.description,
        category: detectCategory(`${repo.name} ${repo.description || ""} ${repo.topics.join(" ")}`),
        metadata: {
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          language: repo.language,
          topics: repo.topics,
        },
      }));
    } catch (err) {
      console.error("[GitHub Trending] Ошибка:", err);
      return [];
    }
  }
}
