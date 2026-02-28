"use client";

import { useState, useEffect, useCallback } from "react";

interface TrendData {
  id: string;
  sourceId: string;
  title: string;
  url: string | null;
  score: number;
  summary: string | null;
  category: string | null;
  fetchedAt: string;
}

const SOURCE_LABELS: Record<string, string> = {
  hacker_news: "Hacker News",
  google_trends: "Google Trends",
  news_api: "NewsAPI",
  github_trending: "GitHub Trending",
  product_hunt: "Product Hunt",
  yandex_wordstat: "Яндекс Вордстат",
  telemetr: "Telemetr.io",
  vk_trends: "VK Тренды",
};

const SOURCE_COLORS: Record<string, string> = {
  hacker_news: "#ff6600",
  google_trends: "#4285f4",
  news_api: "#c62828",
  github_trending: "#24292e",
  product_hunt: "#da552f",
  yandex_wordstat: "#fc0",
  telemetr: "#0088cc",
  vk_trends: "#4a76a8",
};

const CATEGORY_LABELS: Record<string, string> = {
  tech: "технологии",
  ai: "ИИ",
  startup: "стартап",
  saas: "SaaS",
  crypto: "крипто",
  opensource: "open source",
  business: "бизнес",
  science: "наука",
  health: "здоровье",
  finance: "финансы",
};

export default function TrendsPage() {
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const fetchTrends = useCallback(async () => {
    setLoading(true);
    const url = filter === "all" ? "/api/trends" : `/api/trends?source=${filter}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      setTrends(data.trends || []);
    } catch {
      // Тихо игнорируем
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchTrends();
  }, [fetchTrends]);

  const sources = ["all", "hacker_news", "google_trends", "news_api", "github_trending", "product_hunt", "yandex_wordstat", "telemetr", "vk_trends"];

  return (
    <div className="mx-auto max-w-4xl animate-fade-in">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Тренды</h1>

      {/* Фильтр */}
      <div className="mb-6 flex flex-wrap gap-2">
        {sources.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className="cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200"
            style={{
              backgroundColor: filter === s ? "var(--primary)" : "var(--muted)",
              color: filter === s ? "white" : "var(--foreground)",
            }}
          >
            {s === "all" ? "Все" : SOURCE_LABELS[s] || s}
          </button>
        ))}
      </div>

      {/* Список */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-16 animate-skeleton-pulse rounded-xl"
              style={{ backgroundColor: "var(--muted)" }}
            />
          ))}
        </div>
      )}

      {!loading && trends.length === 0 && (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}
        >
          <div className="mb-3 text-4xl">📈</div>
          <h2 className="mb-2 text-xl font-semibold">Трендов пока нет</h2>
          <p style={{ color: "var(--muted-foreground)" }}>
            Тренды появятся после генерации первого отчёта
          </p>
        </div>
      )}

      {!loading && trends.length > 0 && (
        <div className="space-y-2">
          {trends.map((trend) => (
            <div
              key={trend.id}
              className="flex items-center gap-4 rounded-xl p-4 transition-all duration-200 hover:scale-[1.005]"
              style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}
            >
              {/* Очки */}
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                style={{ backgroundColor: SOURCE_COLORS[trend.sourceId] || "var(--primary)" }}
              >
                {trend.score}
              </div>

              {/* Контент */}
              <div className="min-w-0 flex-1">
                {trend.url ? (
                  <a
                    href={trend.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm font-medium transition-colors hover:opacity-70"
                  >
                    {trend.title}
                  </a>
                ) : (
                  <span className="block truncate text-sm font-medium">
                    {trend.title}
                  </span>
                )}
                <div className="mt-0.5 flex items-center gap-2">
                  <span
                    className="rounded px-1.5 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: `${SOURCE_COLORS[trend.sourceId] || "var(--muted)"}20`,
                      color: SOURCE_COLORS[trend.sourceId] || "var(--muted-foreground)",
                    }}
                  >
                    {SOURCE_LABELS[trend.sourceId] || trend.sourceId}
                  </span>
                  {trend.category && (
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      {CATEGORY_LABELS[trend.category] || trend.category}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
