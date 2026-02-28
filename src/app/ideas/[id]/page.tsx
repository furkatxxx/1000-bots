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
  const [error, setError] = useState<string | null>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/ideas/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Не удалось загрузить идею");
        return r.json();
      })
      .then((data) => setIdea(data.idea))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleRate(rating: number) {
    if (!idea) return;
    const res = await fetch(`/api/ideas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: idea.rating === rating ? null : rating }),
    });
    if (res.ok) {
      const data = await res.json();
      setIdea(data.idea);
    }
  }

  async function handleToggleFavorite() {
    if (!idea) return;
    const res = await fetch(`/api/ideas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: !idea.isFavorite }),
    });
    if (res.ok) {
      const data = await res.json();
      setIdea(data.idea);
    }
  }

  async function handleDeepDive() {
    if (!idea || deepDiveLoading) return;
    setDeepDiveLoading(true);
    try {
      const res = await fetch(`/api/ideas/${id}/deep-dive`, { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setIdea((prev) => prev ? { ...prev, deepDive: data.deepDive } : prev);
      }
    } catch {
      setError("Ошибка генерации Deep Dive");
    } finally {
      setDeepDiveLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl animate-fade-in">
        <div className="mb-6 h-8 w-48 animate-skeleton-pulse rounded" style={{ backgroundColor: "var(--muted)" }} />
        <div className="h-64 animate-skeleton-pulse rounded-2xl" style={{ backgroundColor: "var(--muted)" }} />
      </div>
    );
  }

  if (error && !idea) {
    return (
      <div className="mx-auto max-w-3xl animate-fade-in">
        <h1 className="mb-4 text-3xl font-bold">Ошибка</h1>
        <p className="mb-4 text-sm" style={{ color: "var(--destructive)" }}>{error}</p>
        <Link href="/" className="text-sm font-medium" style={{ color: "var(--primary)" }}>
          ← На дашборд
        </Link>
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

      {/* Ошибка */}
      {error && (
        <div className="mb-4 rounded-xl p-3 text-sm" style={{ backgroundColor: "var(--destructive-light, #ff000010)", color: "var(--destructive)" }}>
          {error}
        </div>
      )}

      {/* Ключевые метрики */}
      {(idea.successChance != null || idea.estimatedRevenue || idea.timeToLaunch) && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          {idea.successChance != null && (
            <div
              className="rounded-2xl p-4 text-center"
              style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}
            >
              <div className="mb-1 text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
                Шанс успеха
              </div>
              <div className="text-2xl font-bold" style={{
                color: idea.successChance >= 70 ? "var(--success)" : idea.successChance >= 40 ? "var(--warning)" : "var(--destructive)",
              }}>
                {idea.successChance}%
              </div>
              <div className="mx-auto mt-2 h-1.5 w-full max-w-[80px] overflow-hidden rounded-full" style={{ backgroundColor: "var(--muted)" }}>
                <div className="h-full rounded-full" style={{
                  width: `${idea.successChance}%`,
                  backgroundColor: idea.successChance >= 70 ? "var(--success)" : idea.successChance >= 40 ? "var(--warning)" : "var(--destructive)",
                }} />
              </div>
            </div>
          )}
          {idea.estimatedRevenue && (
            <div
              className="rounded-2xl p-4 text-center"
              style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}
            >
              <div className="mb-1 text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
                Доход за 3 мес.
              </div>
              <div className="text-sm font-bold" style={{ color: "var(--success)" }}>
                {idea.estimatedRevenue}
              </div>
            </div>
          )}
          {idea.timeToLaunch && (
            <div
              className="rounded-2xl p-4 text-center"
              style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}
            >
              <div className="mb-1 text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
                Время до MVP
              </div>
              <div className="text-sm font-bold" style={{ color: "var(--primary)" }}>
                {idea.timeToLaunch}
              </div>
            </div>
          )}
        </div>
      )}

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

      {/* Deep Dive — развёрнутый план */}
      <div className="mt-6">
        {idea.deepDive ? (
          <div
            className="rounded-2xl p-6"
            style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="text-xl">🔬</span>
              <h3 className="text-lg font-bold">Deep Dive — Полный план реализации</h3>
            </div>
            <div className="prose prose-sm max-w-none whitespace-pre-line text-sm leading-relaxed">
              {idea.deepDive}
            </div>
          </div>
        ) : (
          <button
            onClick={handleDeepDive}
            disabled={deepDiveLoading}
            className="w-full cursor-pointer rounded-2xl p-5 text-center transition-all duration-200 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: "var(--card)",
              boxShadow: "var(--shadow-sm)",
              border: "2px dashed var(--primary)",
            }}
          >
            <span className="text-2xl">{deepDiveLoading ? "⏳" : "🔬"}</span>
            <div className="mt-2 text-sm font-semibold" style={{ color: "var(--primary)" }}>
              {deepDiveLoading ? "Генерирую полный план..." : "Deep Dive — Развернуть в полный план реализации"}
            </div>
            <div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
              {deepDiveLoading
                ? "AI анализирует идею и создаёт детальный план..."
                : "AI создаст: техническую архитектуру, MVP план, стратегию привлечения клиентов, монетизацию и риски"}
            </div>
          </button>
        )}
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
