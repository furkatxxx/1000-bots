"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import type { IdeaDTO } from "@/lib/types";

export default function IdeaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [idea, setIdea] = useState<IdeaDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/ideas/${id}`)
      .then((r) => r.json())
      .then((data) => setIdea(data.idea))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function handleRate(rating: number) {
    if (!idea) return;
    await fetch(`/api/ideas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: idea.rating === rating ? null : rating }),
    });
    const res = await fetch(`/api/ideas/${id}`);
    const data = await res.json();
    setIdea(data.idea);
  }

  async function handleToggleFavorite() {
    if (!idea) return;
    await fetch(`/api/ideas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: !idea.isFavorite }),
    });
    const res = await fetch(`/api/ideas/${id}`);
    const data = await res.json();
    setIdea(data.idea);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl animate-fade-in">
        <div className="mb-6 h-8 w-48 animate-skeleton-pulse rounded" style={{ backgroundColor: "var(--muted)" }} />
        <div className="h-64 animate-skeleton-pulse rounded-2xl" style={{ backgroundColor: "var(--muted)" }} />
      </div>
    );
  }

  if (!idea) {
    return (
      <div className="mx-auto max-w-3xl animate-fade-in">
        <h1 className="mb-4 text-3xl font-bold">Идея не найдена</h1>
        <Link href="/" className="text-sm font-medium" style={{ color: "var(--primary)" }}>
          ← На дашборд
        </Link>
      </div>
    );
  }

  const difficultyLabels: Record<string, string> = {
    easy: "Легко", medium: "Средне", hard: "Сложно",
  };
  const difficultyColors: Record<string, string> = {
    easy: "var(--success)", medium: "var(--warning)", hard: "var(--destructive)",
  };

  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <div className="mb-2">
        <Link href={`/reports/${idea.reportId}`} className="text-sm font-medium" style={{ color: "var(--primary)" }}>
          ← К отчёту
        </Link>
      </div>

      {/* Заголовок */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-4">
          <span className="text-5xl">{idea.emoji}</span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{idea.name}</h1>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: `${difficultyColors[idea.difficulty] || "var(--muted)"}20`,
                  color: difficultyColors[idea.difficulty] || "var(--muted-foreground)",
                }}
              >
                {difficultyLabels[idea.difficulty] || idea.difficulty}
              </span>
              {idea.claudeCodeReady && (
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: "var(--primary-light, #0071e320)", color: "var(--primary)" }}
                >
                  Можно собрать в коде
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={handleToggleFavorite}
          className="cursor-pointer text-3xl transition-transform hover:scale-110"
        >
          {idea.isFavorite ? "⭐" : "☆"}
        </button>
      </div>

      {/* Рейтинг */}
      <div className="mb-6 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => handleRate(star)}
            className="cursor-pointer text-2xl transition-transform hover:scale-110"
            style={{
              color: star <= (idea.rating || 0) ? "var(--warning)" : "var(--muted)",
            }}
          >
            ★
          </button>
        ))}
        <span className="ml-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
          {idea.rating ? `${idea.rating}/5` : "Не оценено"}
        </span>
      </div>

      {/* Карточки с деталями */}
      <div className="space-y-4">
        <InfoBlock title="Описание" content={idea.description} />
        <InfoBlock title="Целевая аудитория" content={idea.targetAudience} />
        <InfoBlock title="Монетизация" content={idea.monetization} />
        <InfoBlock title="Стоимость запуска" content={idea.startupCost} />
        <InfoBlock title="Конкуренция" content={idea.competitionLevel} />
        <InfoBlock title="Подтверждение трендами" content={idea.trendBacking} />
        <InfoBlock title="План действий" content={idea.actionPlan} />
      </div>
    </div>
  );
}

function InfoBlock({ title, content }: { title: string; content: string }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}
    >
      <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--muted-foreground)" }}>
        {title}
      </h3>
      <p className="whitespace-pre-line text-sm leading-relaxed">{content}</p>
    </div>
  );
}
