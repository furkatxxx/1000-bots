"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import type { IdeaDTO, ExpertAnalysis, MarketScenarios } from "@/lib/types";
import { getDifficultyLabel, getDifficultyColor } from "@/lib/utils";

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
  const [feedbackMode, setFeedbackMode] = useState<"none" | "like" | "reject">("none");
  const [selectedLikeReasons, setSelectedLikeReasons] = useState<string[]>([]);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState("");

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

  async function handleSetStatus(status: string, extra?: Record<string, unknown>) {
    if (!idea) return;
    const body: Record<string, unknown> = { userStatus: status, ...extra };
    const res = await fetch(`/api/ideas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      setIdea(data.idea);
    }
    setFeedbackMode("none");
    setSelectedLikeReasons([]);
    setComment("");
    setCommentOpen(false);
  }

  async function handleReject(reason: string) {
    await handleSetStatus("rejected", {
      rejectReason: reason,
      ...(comment ? { feedbackComment: comment } : {}),
    });
  }

  async function handleLike() {
    await handleSetStatus("interesting", {
      likeReasons: selectedLikeReasons.length > 0 ? selectedLikeReasons : null,
      ...(comment ? { feedbackComment: comment } : {}),
    });
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
                  backgroundColor: `${getDifficultyColor(idea.difficulty) || "var(--muted)"}20`,
                  color: getDifficultyColor(idea.difficulty) || "var(--muted-foreground)",
                }}
              >
                {getDifficultyLabel(idea.difficulty) || idea.difficulty}
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
              {idea.reportDate && (
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {new Date(idea.reportDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
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

      {/* Обратная связь */}
      <FeedbackBlock
        idea={idea}
        feedbackMode={feedbackMode}
        setFeedbackMode={setFeedbackMode}
        selectedLikeReasons={selectedLikeReasons}
        setSelectedLikeReasons={setSelectedLikeReasons}
        commentOpen={commentOpen}
        setCommentOpen={setCommentOpen}
        comment={comment}
        setComment={setComment}
        onReject={handleReject}
        onLike={handleLike}
        onSetStatus={handleSetStatus}
      />

      {/* Ошибка */}
      {error && (
        <div className="mb-4 rounded-xl p-3 text-sm" style={{ backgroundColor: "var(--destructive-light, #ff000010)", color: "var(--destructive)" }}>
          {error}
        </div>
      )}

      {/* Ключевые метрики */}
      {(idea.successChance != null || idea.expertAnalysis || idea.estimatedRevenue || idea.timeToLaunch) && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Экспертная оценка (если есть) или шанс успеха */}
          {idea.expertAnalysis?.finalScore != null ? (
            <div
              className="rounded-2xl p-4 text-center"
              style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}
            >
              <div className="mb-1 text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
                Экспертная оценка
              </div>
              <div className="text-2xl font-bold" style={{
                color: idea.expertAnalysis.finalScore >= 7 ? "var(--success)" : idea.expertAnalysis.finalScore >= 5 ? "var(--warning)" : "var(--destructive)",
              }}>
                {idea.expertAnalysis.finalScore}/10
              </div>
              <div className="mt-1 text-xs font-medium" style={{
                color: idea.expertAnalysis.finalVerdict === "launch" ? "var(--success)" : idea.expertAnalysis.finalVerdict === "pivot" ? "var(--warning)" : "var(--destructive)",
              }}>
                {idea.expertAnalysis.finalVerdict === "launch" ? "Запускать" : idea.expertAnalysis.finalVerdict === "pivot" ? "Доработать" : "Отказаться"}
              </div>
            </div>
          ) : null}
          {idea.estimatedRevenue && idea.estimatedRevenue.trim() !== "" && (
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
          {idea.timeToLaunch && idea.timeToLaunch.trim() !== "" && (
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
      {(() => {
        const validatorMatch = idea.description.match(/\[(?:⚠️\s*)?Замечание(?:\s*валидатора)?:\s*(.*?)\]$/);
        const cleanDescription = validatorMatch ? idea.description.replace(validatorMatch[0], "").trim() : idea.description;
        const validatorNote = validatorMatch ? validatorMatch[1] : null;
        return (
          <>
            <InfoBlock title="Описание" content={cleanDescription} />
            {validatorNote && (
              <div
                className="mt-3 rounded-2xl p-4"
                style={{ backgroundColor: "var(--warning, #f59e0b)10", border: "1px solid var(--warning, #f59e0b)30" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span>⚠️</span>
                  <span className="text-sm font-semibold">Замечание валидатора</span>
                </div>
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{validatorNote}</p>
              </div>
            )}
          </>
        );
      })()}

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
            {idea.targetAudience && idea.targetAudience !== "Не указано" && (
              <InfoBlock title="Целевая аудитория" content={idea.targetAudience} />
            )}
            {idea.monetization && idea.monetization !== "Не указано" && (
              <InfoBlock title="Монетизация" content={idea.monetization} />
            )}
            <InfoBlock title="Стоимость запуска" content={
              idea.startupCost === "low" ? "Низкая (до $500)" :
              idea.startupCost === "medium" ? "Средняя ($500-2000)" :
              idea.startupCost === "high" ? "Высокая (>$2000)" :
              idea.startupCost
            } />
            <InfoBlock title="Конкуренция" content={
              idea.competitionLevel === "low" ? "Низкая — мало конкурентов" :
              idea.competitionLevel === "medium" ? "Средняя — рынок есть, но не перенасыщен" :
              idea.competitionLevel === "high" ? "Высокая — много конкурентов" :
              idea.competitionLevel
            } />
            {idea.trendBacking && idea.trendBacking.trim() !== "" && (
              <InfoBlock title="Подтверждение трендами" content={idea.trendBacking} />
            )}
            {idea.actionPlan && idea.actionPlan.trim() !== "" && (
              <InfoBlock title="План действий" content={idea.actionPlan} />
            )}
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
              {expertLoading ? "Экспертный совет анализирует..." : "Экспертный совет — 5 специалистов оценят идею"}
            </div>
            <div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
              {expertLoading
                ? "Трекер, маркетолог, продакт, финансист и скептик анализируют идею..."
                : "Трекер, маркетолог, продакт, финансист и скептик дадут оценку, риски и дебаты"}
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

  const experts: { emoji: string; title: string; score: number; verdict?: string; verdictColor?: string; content: React.ReactNode }[] = [
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

  // #25 — Скептик (если есть — добавляем 5-ю карточку)
  if (analysis.skeptic) {
    experts.push({
      emoji: "😈",
      title: "Скептик",
      score: analysis.skeptic.score,
      content: (
        <>
          <div className="mb-2">
            <span className="text-xs font-medium" style={{ color: "var(--destructive, #ef4444)" }}>Главные риски провала:</span>
            <ul className="mt-1 space-y-0.5">
              {analysis.skeptic.killerRisks.map((risk, i) => (
                <li key={i} className="text-xs">• {risk}</li>
              ))}
            </ul>
          </div>
          {analysis.skeptic.failureScenario && (
            <div className="mb-2 text-xs">
              <span style={{ color: "var(--muted-foreground)" }}>Сценарий провала: </span>
              <span>{analysis.skeptic.failureScenario}</span>
            </div>
          )}
          {analysis.skeptic.counterArguments && (
            <div className="mb-2 text-xs">
              <span style={{ color: "var(--muted-foreground)" }}>Контраргументы: </span>
              <span>{analysis.skeptic.counterArguments}</span>
            </div>
          )}
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{analysis.skeptic.recommendation}</p>
        </>
      ),
    });
  }

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

      {/* #27 — Дебаты между экспертами */}
      {analysis.debates && (
        <div
          className="mb-5 rounded-xl p-4"
          style={{ backgroundColor: "var(--warning, #f59e0b)10", border: "1px solid var(--warning, #f59e0b)30" }}
        >
          <div className="mb-2 flex items-center gap-2">
            <span>⚔️</span>
            <span className="text-sm font-semibold">Дебаты экспертов</span>
          </div>
          <p className="whitespace-pre-line text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
            {analysis.debates}
          </p>
        </div>
      )}

      {/* 5 карточек экспертов */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {experts.map((expert) => (
          <div
            key={expert.title}
            className="rounded-xl p-4"
            style={{
              backgroundColor: "var(--background)",
              border: expert.title === "Скептик" ? "1px solid var(--destructive, #ef4444)30" : "1px solid var(--muted)",
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>{expert.emoji}</span>
                <span className="text-sm font-semibold">{expert.title}</span>
              </div>
              <div className="flex items-center gap-2">
                {expert.verdict && expert.verdictColor && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-bold"
                    style={{ color: expert.verdictColor }}
                  >
                    {expert.verdict}
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
    (f) => (!scenarios.russia[f.key] || scenarios.russia[f.key] === "Не оценено" || scenarios.russia[f.key].trim() === "")
      && (!scenarios.global[f.key] || scenarios.global[f.key] === "Не оценено" || scenarios.global[f.key].trim() === "")
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

const REJECT_REASONS = [
  { code: "vague", label: "Абстрактно", emoji: "🌫️" },
  { code: "crowded", label: "Уже есть решения", emoji: "🏪" },
  { code: "not_my_profile", label: "Не моё", emoji: "🚫" },
  { code: "bad_economics", label: "Не сойдётся", emoji: "📉" },
  { code: "boring", label: "Не цепляет", emoji: "😴" },
];

const LIKE_REASONS = [
  { code: "real_pain", label: "Боль реальная", emoji: "🎯" },
  { code: "easy_start", label: "Быстрый старт", emoji: "🚀" },
  { code: "clear_audience", label: "Понятно кому", emoji: "👥" },
  { code: "good_money", label: "Деньги понятны", emoji: "💰" },
];

function FeedbackBlock({
  idea,
  feedbackMode,
  setFeedbackMode,
  selectedLikeReasons,
  setSelectedLikeReasons,
  commentOpen,
  setCommentOpen,
  comment,
  setComment,
  onReject,
  onLike,
  onSetStatus,
}: {
  idea: IdeaDTO;
  feedbackMode: "none" | "like" | "reject";
  setFeedbackMode: (m: "none" | "like" | "reject") => void;
  selectedLikeReasons: string[];
  setSelectedLikeReasons: (r: string[]) => void;
  commentOpen: boolean;
  setCommentOpen: (o: boolean) => void;
  comment: string;
  setComment: (c: string) => void;
  onReject: (reason: string) => void;
  onLike: () => void;
  onSetStatus: (status: string, extra?: Record<string, unknown>) => void;
}) {
  // Уже оценено — показываем результат
  if (idea.userStatus === "rejected") {
    const reason = REJECT_REASONS.find((r) => r.code === idea.rejectReason);
    return (
      <div className="mb-6 rounded-2xl p-4" style={{ backgroundColor: "var(--destructive-light, #ff000010)", border: "1px solid var(--destructive)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>{reason?.emoji || "❌"}</span>
            <span className="text-sm font-medium">Отброшена: {reason?.label || idea.rejectReason}</span>
          </div>
          <button
            onClick={() => onSetStatus("new", { rejectReason: null, likeReasons: null, feedbackComment: null })}
            className="cursor-pointer text-xs underline"
            style={{ color: "var(--muted-foreground)" }}
          >
            Сбросить
          </button>
        </div>
        {idea.feedbackComment && (
          <p className="mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>{idea.feedbackComment}</p>
        )}
      </div>
    );
  }

  if (idea.userStatus === "interesting") {
    return (
      <div className="mb-6 rounded-2xl p-4" style={{ backgroundColor: "var(--primary-light, #0071e310)", border: "1px solid var(--primary)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">Интересно</span>
            {idea.likeReasons && idea.likeReasons.map((code) => {
              const reason = LIKE_REASONS.find((r) => r.code === code);
              return (
                <span key={code} className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "var(--primary)", color: "#fff" }}>
                  {reason?.emoji} {reason?.label || code}
                </span>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSetStatus("in_progress")}
              className="cursor-pointer rounded-full px-3 py-1 text-xs font-medium"
              style={{ backgroundColor: "var(--success)", color: "#fff" }}
            >
              В работе
            </button>
            <button
              onClick={() => onSetStatus("new", { rejectReason: null, likeReasons: null, feedbackComment: null })}
              className="cursor-pointer text-xs underline"
              style={{ color: "var(--muted-foreground)" }}
            >
              Сбросить
            </button>
          </div>
        </div>
        {idea.feedbackComment && (
          <p className="mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>{idea.feedbackComment}</p>
        )}
      </div>
    );
  }

  if (idea.userStatus === "in_progress") {
    return (
      <div className="mb-6 rounded-2xl p-4" style={{ backgroundColor: "var(--success-light, #00c85310)", border: "1px solid var(--success)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>🚧</span>
            <span className="text-sm font-medium">В работе</span>
          </div>
          <button
            onClick={() => onSetStatus("new", { rejectReason: null, likeReasons: null, feedbackComment: null })}
            className="cursor-pointer text-xs underline"
            style={{ color: "var(--muted-foreground)" }}
          >
            Сбросить
          </button>
        </div>
      </div>
    );
  }

  // Не оценено — показываем кнопки действий
  return (
    <div className="mb-6">
      {/* Основные кнопки */}
      {feedbackMode === "none" && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFeedbackMode("like")}
            className="cursor-pointer rounded-2xl px-5 py-2.5 text-sm font-medium transition-all hover:scale-[1.02]"
            style={{ backgroundColor: "var(--primary)", color: "#fff" }}
          >
            👍 Интересно
          </button>
          <button
            onClick={() => setFeedbackMode("reject")}
            className="cursor-pointer rounded-2xl px-5 py-2.5 text-sm font-medium transition-all hover:scale-[1.02]"
            style={{ backgroundColor: "var(--muted)", color: "var(--foreground)" }}
          >
            👎 Отбросить
          </button>
          <button
            onClick={() => setCommentOpen(!commentOpen)}
            className="cursor-pointer rounded-2xl px-3 py-2.5 text-sm transition-all hover:scale-[1.05]"
            style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}
            title="Комментарий"
          >
            💬
          </button>
        </div>
      )}

      {/* Причины одобрения — мультиселект */}
      {feedbackMode === "like" && (
        <div className="animate-fade-in">
          <div className="mb-2 text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>Чем зацепило?</div>
          <div className="flex flex-wrap gap-2">
            {LIKE_REASONS.map((r) => {
              const selected = selectedLikeReasons.includes(r.code);
              return (
                <button
                  key={r.code}
                  onClick={() => {
                    setSelectedLikeReasons(
                      selected
                        ? selectedLikeReasons.filter((c) => c !== r.code)
                        : [...selectedLikeReasons, r.code]
                    );
                  }}
                  className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-all"
                  style={{
                    backgroundColor: selected ? "var(--primary)" : "var(--muted)",
                    color: selected ? "#fff" : "var(--foreground)",
                  }}
                >
                  {r.emoji} {r.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={onLike}
              className="cursor-pointer rounded-2xl px-4 py-2 text-xs font-medium transition-all hover:scale-[1.02]"
              style={{ backgroundColor: "var(--primary)", color: "#fff" }}
            >
              Готово
            </button>
            <button
              onClick={() => { setFeedbackMode("none"); setSelectedLikeReasons([]); }}
              className="cursor-pointer text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Причины отклонения — одиночный выбор */}
      {feedbackMode === "reject" && (
        <div className="animate-fade-in">
          <div className="mb-2 text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>Почему не подходит?</div>
          <div className="flex flex-wrap gap-2">
            {REJECT_REASONS.map((r) => (
              <button
                key={r.code}
                onClick={() => onReject(r.code)}
                className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-all hover:scale-[1.02]"
                style={{ backgroundColor: "var(--muted)", color: "var(--foreground)" }}
              >
                {r.emoji} {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setFeedbackMode("none")}
            className="mt-2 cursor-pointer text-xs"
            style={{ color: "var(--muted-foreground)" }}
          >
            Отмена
          </button>
        </div>
      )}

      {/* Комментарий */}
      {commentOpen && feedbackMode === "none" && (
        <div className="mt-3 animate-fade-in">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Если причина не из списка — напиши в 2-3 словах"
            className="w-full rounded-xl border p-3 text-sm"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--muted)", color: "var(--foreground)" }}
            rows={2}
            maxLength={500}
          />
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
