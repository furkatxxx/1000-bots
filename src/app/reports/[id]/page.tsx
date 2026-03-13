"use client";

import { use, useState, useMemo } from "react";
import Link from "next/link";
import { useReport } from "@/hooks/useReport";
import { IdeaCard } from "@/components/ui/IdeaCard";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import type { IdeaDTO } from "@/lib/types";

type SortField = "default" | "expert" | "revenue" | "difficulty";
type SortDir = "asc" | "desc";
type ViewMode = "cards" | "list";
type MarketFilter = "all" | "russia" | "global";

// Направление по умолчанию
const DEFAULT_SORT_DIR: Record<SortField, SortDir> = {
  default: "desc",
  expert: "desc",     // Сначала высокий балл
  revenue: "desc",    // Сначала высокий доход
  difficulty: "asc",  // Сначала лёгкие
};

export default function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { report, setReport, loading, error } = useReport(id);
  const [sortField, setSortField] = useState<SortField>("default");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");

  function handleSortToggle(field: SortField) {
    if (field === "default") {
      setSortField("default");
      setSortDir("desc");
      return;
    }
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(DEFAULT_SORT_DIR[field]);
    }
  }

  async function handleToggleFavorite(ideaId: string, isFavorite: boolean) {
    // Оптимистичное обновление — звёздочка меняется мгновенно, без перезагрузки
    if (report) {
      setReport({
        ...report,
        ideas: report.ideas.map((idea) =>
          idea.id === ideaId ? { ...idea, isFavorite } : idea
        ),
      });
    }
    // Сохраняем на сервер в фоне
    fetch(`/api/ideas/${ideaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite }),
    });
  }

  const sortedIdeas = useMemo(() => {
    if (!report) return [];
    let ideas = [...report.ideas];

    // Фильтр по рынку
    if (marketFilter !== "all") {
      ideas = ideas.filter((i) => i.market === marketFilter || i.market === "both");
    }

    // Тогл-сортировка с направлением
    if (sortField === "expert") {
      ideas.sort((a, b) => {
        const diff = (a.expertAnalysis?.finalScore || 0) - (b.expertAnalysis?.finalScore || 0);
        return sortDir === "desc" ? -diff : diff;
      });
    }
    if (sortField === "revenue") {
      ideas.sort((a, b) => {
        const diff = parseRevenue(a.estimatedRevenue) - parseRevenue(b.estimatedRevenue);
        return sortDir === "desc" ? -diff : diff;
      });
    }
    if (sortField === "difficulty") {
      const order: Record<string, number> = { easy: 0, medium: 1, hard: 2 };
      ideas.sort((a, b) => {
        const diff = (order[a.difficulty] ?? 1) - (order[b.difficulty] ?? 1);
        return sortDir === "asc" ? diff : -diff;
      });
    }
    return ideas;
  }, [report, sortField, sortDir, marketFilter]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl animate-fade-in">
        <div className="mb-6 h-8 w-48 animate-skeleton-pulse rounded" style={{ backgroundColor: "var(--muted)" }} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="mx-auto max-w-4xl animate-fade-in">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Ошибка</h1>
        <p style={{ color: "var(--destructive)" }}>{error || "Отчёт не найден"}</p>
        <Link href="/reports" className="mt-4 inline-block text-sm font-medium" style={{ color: "var(--primary)" }}>← К списку отчётов</Link>
      </div>
    );
  }

  const date = new Date(report.date);
  const formattedDate = date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

  const sortButtons: { field: SortField; label: string }[] = [
    { field: "default", label: "Все" },
    { field: "expert", label: "Эксперты" },
    { field: "revenue", label: "Доход" },
    { field: "difficulty", label: "Сложность" },
  ];

  return (
    <div className="mx-auto max-w-4xl animate-fade-in">
      <div className="mb-2">
        <Link href="/reports" className="text-sm font-medium" style={{ color: "var(--primary)" }}>← Отчёты</Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Отчёт за {formattedDate}</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            {report.trendsCount} трендов → {report.ideas.length} идей · {report.aiModel || "—"}
          </p>
        </div>
        <StatusPill status={report.status} />
      </div>

      {/* Метрики */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <MetricBox label="Трендов" value={report.trendsCount} />
        <MetricBox label="Идей" value={report.ideas.length} />
        <MetricBox label="Токенов" value={(report.aiTokensIn || 0) + (report.aiTokensOut || 0)} />
      </div>

      {/* Панель фильтров + вид */}
      {report.ideas.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {/* Сортировка — тогл-кнопки */}
            <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: "var(--muted)" }}>
              {sortButtons.map((opt) => {
                const isActive = sortField === opt.field;
                const arrow = isActive && opt.field !== "default"
                  ? (sortDir === "desc" ? " ↓" : " ↑")
                  : "";
                return (
                  <button
                    key={opt.field}
                    onClick={() => handleSortToggle(opt.field)}
                    className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap"
                    style={{
                      backgroundColor: isActive ? "var(--card)" : "transparent",
                      color: isActive ? "var(--foreground)" : "var(--muted-foreground)",
                      boxShadow: isActive ? "var(--shadow-sm)" : "none",
                    }}
                  >
                    {opt.label}{arrow}
                  </button>
                );
              })}
            </div>

            {/* Фильтр по рынку */}
            <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: "var(--muted)" }}>
              {([
                { value: "all" as MarketFilter, label: "Все" },
                { value: "russia" as MarketFilter, label: "🇷🇺 Россия" },
                { value: "global" as MarketFilter, label: "🌍 Мир" },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMarketFilter(opt.value)}
                  className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                  style={{
                    backgroundColor: marketFilter === opt.value ? "var(--card)" : "transparent",
                    color: marketFilter === opt.value ? "var(--foreground)" : "var(--muted-foreground)",
                    boxShadow: marketFilter === opt.value ? "var(--shadow-sm)" : "none",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Переключатель вида */}
          <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: "var(--muted)" }}>
            <button
              onClick={() => setViewMode("cards")}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-xs transition-all"
              style={{
                backgroundColor: viewMode === "cards" ? "var(--card)" : "transparent",
                boxShadow: viewMode === "cards" ? "var(--shadow-sm)" : "none",
              }}
              title="Карточки"
            >
              ▦
            </button>
            <button
              onClick={() => setViewMode("list")}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-xs transition-all"
              style={{
                backgroundColor: viewMode === "list" ? "var(--card)" : "transparent",
                boxShadow: viewMode === "list" ? "var(--shadow-sm)" : "none",
              }}
              title="Список"
            >
              ≡
            </button>
          </div>
        </div>
      )}

      {/* Список идей */}
      {report.ideas.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}>
          <p style={{ color: "var(--muted-foreground)" }}>В этом отчёте нет идей</p>
        </div>
      ) : viewMode === "cards" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {sortedIdeas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} onToggleFavorite={handleToggleFavorite} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {sortedIdeas.map((idea) => (
            <IdeaListItem key={idea.id} idea={idea} onToggleFavorite={handleToggleFavorite} />
          ))}
        </div>
      )}
    </div>
  );
}

// Строчный вид идеи
function IdeaListItem({ idea, onToggleFavorite }: { idea: IdeaDTO; onToggleFavorite?: (id: string, fav: boolean) => void }) {
  const expertScore = idea.expertAnalysis?.finalScore;
  const hasExpert = expertScore != null;
  const scoreValue = hasExpert ? expertScore : (idea.successChance || 0);
  const scoreColor = hasExpert
    ? (expertScore >= 7 ? "var(--success)" : expertScore >= 5 ? "var(--warning)" : "var(--destructive)")
    : ((idea.successChance || 0) >= 70 ? "var(--success)" : (idea.successChance || 0) >= 40 ? "var(--warning)" : "var(--destructive)");
  const diffLabels: Record<string, string> = { easy: "Легко", medium: "Средне", hard: "Сложно" };

  return (
    <div
      className="flex items-center gap-4 rounded-xl p-4 transition-all hover:scale-[1.005]"
      style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}
    >
      <span className="text-2xl">{idea.emoji}</span>

      <div className="min-w-0 flex-1">
        <Link href={`/ideas/${idea.id}`} className="text-sm font-semibold hover:opacity-70">
          {idea.name}
        </Link>
        <div className="mt-0.5 flex items-center gap-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
          {idea.market && idea.market !== "both" && (
            <span>{idea.market === "russia" ? "🇷🇺" : "🌍"}</span>
          )}
          {idea.market === "both" && <span>🇷🇺🌍</span>}
          <span>{diffLabels[idea.difficulty] || idea.difficulty}</span>
          {idea.timeToLaunch && <span>· {idea.timeToLaunch}</span>}
        </div>
      </div>

      <div className="text-right">
        <div className="text-sm font-bold" style={{ color: scoreColor }}>
          {hasExpert ? `${expertScore}/10` : scoreValue != null ? `${scoreValue}%` : "—"}
        </div>
        <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          {hasExpert ? "эксперты" : "шанс"}
        </div>
      </div>

      {idea.estimatedRevenue && (
        <div className="hidden text-right sm:block">
          <div className="text-xs font-medium" style={{ color: "var(--success)" }}>{idea.estimatedRevenue}</div>
        </div>
      )}

      <button
        onClick={() => onToggleFavorite?.(idea.id, !idea.isFavorite)}
        className="cursor-pointer text-lg opacity-50 hover:opacity-100"
      >
        {idea.isFavorite ? "⭐" : "☆"}
      </button>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const config: Record<string, { label: string; bg: string }> = {
    complete: { label: "Готов", bg: "var(--success)" },
    generating: { label: "Генерация...", bg: "var(--warning)" },
    failed: { label: "Ошибка", bg: "var(--destructive)" },
    pending: { label: "Ожидание", bg: "var(--muted)" },
  };
  const c = config[status] || config.pending;
  return (
    <span className="rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ backgroundColor: c.bg }}>{c.label}</span>
  );
}

function MetricBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl p-4 text-center" style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}>
      <div className="text-2xl font-bold">{value.toLocaleString("ru-RU")}</div>
      <div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{label}</div>
    </div>
  );
}

// Парсим доход из строки для сортировки (берём первое число)
function parseRevenue(s: string | null | undefined): number {
  if (!s) return 0;
  const match = s.replace(/\s/g, "").match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}
