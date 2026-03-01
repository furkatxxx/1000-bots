"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import type { IdeaDTO, ExpertAnalysis, MarketScenarios } from "@/lib/types";

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
  const [expertLoading, setExpertLoading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

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

  async function handleExpertCouncil() {
    if (!idea || expertLoading) return;
    setExpertLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ideas/${id}/expert-council`, { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setIdea((prev) => prev ? { ...prev, expertAnalysis: data.analysis } : prev);
      }
    } catch {
      setError("Ошибка экспертного совета");
    } finally {
      setExpertLoading(false);
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
      <div className="mb-6 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <span className="text-3xl sm:text-5xl shrink-0">{idea.emoji}</span>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight break-words">{idea.name}</h1>
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
              {idea.market && idea.market !== "both" && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: "var(--muted)" }}>
                  {idea.market === "russia" ? "🇷🇺 Россия" : "🌍 Мир"}
                </span>
              )}
              {idea.market === "both" && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: "var(--muted)" }}>
                  🇷🇺🌍 Оба рынка
                </span>
              )}
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
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
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

      {/* Описание — всегда видно */}
      <InfoBlock title="Описание" content={idea.description} />

      {/* Сценарии по рынкам */}
      {idea.marketScenarios && (
        <MarketScenariosBlock scenarios={idea.marketScenarios} />
      )}

      {/* Подробные данные — сворачиваемый блок */}
      <div className="mt-4">
        <button
          onClick={() => setDetailsOpen(!detailsOpen)}
          className="flex w-full cursor-pointer items-center justify-between rounded-2xl p-4 transition-all hover:scale-[1.005]"
          style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <span className="text-sm font-semibold">Подробные данные</span>
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              аудитория, монетизация, конкуренция, план
            </span>
          </div>
          <span className="text-sm transition-transform" style={{ transform: detailsOpen ? "rotate(180deg)" : "rotate(0)" }}>
            ▼
          </span>
        </button>

        {detailsOpen && (
          <div className="mt-2 space-y-3 animate-fade-in">
            <InfoBlock title="Целевая аудитория" content={idea.targetAudience} />
            <InfoBlock title="Монетизация" content={idea.monetization} />
            <InfoBlock title="Стоимость запуска" content={idea.startupCost} />
            <InfoBlock title="Конкуренция" content={idea.competitionLevel} />
            <InfoBlock title="Подтверждение трендами" content={idea.trendBacking} />
            <InfoBlock title="План действий" content={idea.actionPlan} />
          </div>
        )}
      </div>

      {/* Экспертный совет */}
      <div className="mt-6">
        {idea.expertAnalysis ? (
          <ExpertCouncilPanel analysis={idea.expertAnalysis} />
        ) : (
          <button
            onClick={handleExpertCouncil}
            disabled={expertLoading}
            className="w-full cursor-pointer rounded-2xl p-5 text-center transition-all duration-200 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: "var(--card)",
              boxShadow: "var(--shadow-sm)",
              border: "2px dashed var(--warning, #f59e0b)",
            }}
          >
            <span className="text-2xl">{expertLoading ? "⏳" : "🧠"}</span>
            <div className="mt-2 text-sm font-semibold" style={{ color: "var(--warning, #f59e0b)" }}>
              {expertLoading ? "Экспертный совет анализирует..." : "Экспертный совет — 4 специалиста оценят идею"}
            </div>
            <div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
              {expertLoading
                ? "Трекер, маркетолог, продакт и финансист анализируют идею..."
                : "Трекер, маркетолог, продакт-менеджер и финансист дадут оценку, риски и рекомендации"}
            </div>
          </button>
        )}
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

// Панель экспертного совета
function ExpertCouncilPanel({ analysis }: { analysis: ExpertAnalysis }) {
  const verdictLabels: Record<string, string> = {
    launch: "Запускать", pivot: "Доработать", reject: "Отказаться",
  };
  const verdictColors: Record<string, string> = {
    launch: "var(--success)", pivot: "var(--warning)", reject: "var(--destructive)",
  };

  const scoreColor = (score: number) =>
    score >= 7 ? "var(--success)" : score >= 5 ? "var(--warning)" : "var(--destructive)";

  const experts = [
    {
      emoji: "🎯",
      title: "Трекер стартапов",
      score: analysis.tracker.score,
      verdict: analysis.tracker.verdict === "go" ? "GO" : analysis.tracker.verdict === "pivot" ? "PIVOT" : "NO-GO",
      verdictColor: analysis.tracker.verdict === "go" ? "var(--success)" : analysis.tracker.verdict === "pivot" ? "var(--warning)" : "var(--destructive)",
      content: (
        <>
          <div className="mb-2">
            <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>Риски:</span>
            <ul className="mt-1 space-y-0.5">
              {analysis.tracker.risks.map((risk, i) => (
                <li key={i} className="text-xs">• {risk}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{analysis.tracker.recommendation}</p>
        </>
      ),
    },
    {
      emoji: "📢",
      title: "Маркетолог",
      score: analysis.marketer.score,
      content: (
        <>
          <div className="mb-2">
            <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>Каналы:</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {analysis.marketer.channels.map((ch, i) => (
                <span key={i} className="rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: "var(--muted)", color: "var(--foreground)" }}>
                  {ch}
                </span>
              ))}
            </div>
          </div>
          <div className="mb-2 text-xs">
            <span style={{ color: "var(--muted-foreground)" }}>CAC: </span>
            <span className="font-medium">{analysis.marketer.cac}</span>
          </div>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{analysis.marketer.recommendation}</p>
        </>
      ),
    },
    {
      emoji: "🛠",
      title: "Продакт-менеджер",
      score: analysis.product.score,
      content: (
        <>
          <div className="mb-2">
            <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>MVP:</span>
            <ul className="mt-1 space-y-0.5">
              {analysis.product.mvpFeatures.map((f, i) => (
                <li key={i} className="text-xs">• {f}</li>
              ))}
            </ul>
          </div>
          <div className="mb-2">
            <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>Конкуренты:</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {analysis.product.competitors.map((c, i) => (
                <span key={i} className="rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: "var(--muted)", color: "var(--foreground)" }}>
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div className="mb-2 text-xs">
            <span style={{ color: "var(--muted-foreground)" }}>Уникальность: </span>
            <span>{analysis.product.uniqueness}</span>
          </div>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{analysis.product.recommendation}</p>
        </>
      ),
    },
    {
      emoji: "💰",
      title: "Финансист",
      score: analysis.financier.score,
      content: (
        <>
          <div className="mb-2 text-xs">
            <span style={{ color: "var(--muted-foreground)" }}>Безубыточность: </span>
            <span className="font-medium">{analysis.financier.breakeven}</span>
          </div>
          <div className="mb-2 text-xs">
            <span style={{ color: "var(--muted-foreground)" }}>Unit-экономика: </span>
            <span className="font-medium">{analysis.financier.unitEconomics}</span>
          </div>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{analysis.financier.recommendation}</p>
        </>
      ),
    },
  ];

  return (
    <div
      className="rounded-2xl p-6"
      style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}
    >
      {/* Заголовок + итоговый вердикт */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🧠</span>
          <h3 className="text-lg font-bold">Экспертный совет</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-2xl font-bold" style={{ color: scoreColor(analysis.finalScore) }}>
              {analysis.finalScore}/10
            </div>
          </div>
          <span
            className="rounded-full px-3 py-1 text-xs font-bold uppercase"
            style={{
              backgroundColor: `${verdictColors[analysis.finalVerdict] || "var(--muted)"}20`,
              color: verdictColors[analysis.finalVerdict] || "var(--muted-foreground)",
            }}
          >
            {verdictLabels[analysis.finalVerdict] || analysis.finalVerdict}
          </span>
        </div>
      </div>

      {/* Итог */}
      <div
        className="mb-5 rounded-xl p-3 text-sm leading-relaxed"
        style={{ backgroundColor: "var(--muted)" }}
      >
        {analysis.summary}
      </div>

      {/* 4 карточки экспертов */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {experts.map((expert) => (
          <div
            key={expert.title}
            className="rounded-xl p-4"
            style={{ backgroundColor: "var(--background)", border: "1px solid var(--muted)" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>{expert.emoji}</span>
                <span className="text-sm font-semibold">{expert.title}</span>
              </div>
              <div className="flex items-center gap-2">
                {"verdict" in expert && "verdictColor" in expert && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-bold"
                    style={{ color: expert.verdictColor as string }}
                  >
                    {expert.verdict as string}
                  </span>
                )}
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-bold"
                  style={{
                    backgroundColor: `${scoreColor(expert.score)}20`,
                    color: scoreColor(expert.score),
                  }}
                >
                  {expert.score}/10
                </span>
              </div>
            </div>
            {expert.content}
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketScenariosBlock({ scenarios }: { scenarios: MarketScenarios }) {
  const [open, setOpen] = useState(false);

  const scenarioFields = [
    { key: "revenue" as const, label: "Доход" },
    { key: "channels" as const, label: "Каналы" },
    { key: "audience" as const, label: "Аудитория" },
    { key: "advantages" as const, label: "Преимущества" },
  ];

  const allDefault = scenarioFields.every(
    (f) => scenarios.russia[f.key] === "Не оценено" && scenarios.global[f.key] === "Не оценено"
  );
  if (allDefault) return null;

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between rounded-2xl p-4 transition-all hover:scale-[1.005]"
        style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🌐</span>
          <span className="text-sm font-semibold">Сценарии по рынкам</span>
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Россия vs Мир
          </span>
        </div>
        <span className="text-sm transition-transform" style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}>
          ▼
        </span>
      </button>

      {open && (
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 animate-fade-in">
          {/* Россия */}
          <div className="rounded-2xl p-5" style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)", borderLeft: "4px solid #dc3545" }}>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xl">🇷🇺</span>
              <h4 className="text-sm font-bold">Россия</h4>
            </div>
            {scenarioFields.map((f) => (
              <div key={f.key} className="mb-2">
                <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{f.label}</div>
                <div className="text-sm leading-relaxed">{scenarios.russia[f.key]}</div>
              </div>
            ))}
          </div>

          {/* Мир */}
          <div className="rounded-2xl p-5" style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)", borderLeft: "4px solid #0071e3" }}>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xl">🌍</span>
              <h4 className="text-sm font-bold">Мировой рынок</h4>
            </div>
            {scenarioFields.map((f) => (
              <div key={f.key} className="mb-2">
                <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{f.label}</div>
                <div className="text-sm leading-relaxed">{scenarios.global[f.key]}</div>
              </div>
            ))}
          </div>
        </div>
      )}
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
