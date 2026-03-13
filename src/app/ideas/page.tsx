"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { IdeaCard } from "@/components/ui/IdeaCard";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import type { IdeaDTO } from "@/lib/types";

type SortField = "date" | "expert" | "name";
type SortDir = "asc" | "desc";
type MarketFilter = "all" | "russia" | "global" | "both";
type DifficultyFilter = "all" | "easy" | "medium" | "hard";
type VerdictFilter = "all" | "launch" | "pivot" | "reject" | "none";
type PeriodFilter = "all" | "today" | "week" | "month";

// Направление по умолчанию для каждого поля
const DEFAULT_SORT_DIR: Record<SortField, SortDir> = {
  date: "desc",   // Сначала новые
  expert: "desc",  // Сначала высокий балл
  name: "asc",     // А-Я
};

const LIMIT = 20;

export default function AllIdeasPage() {
  const [ideas, setIdeas] = useState<IdeaDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);

  // Фильтры
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [market, setMarket] = useState<MarketFilter>("all");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [verdict, setVerdict] = useState<VerdictFilter>("all");
  const [period, setPeriod] = useState<PeriodFilter>("all");

  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const sortParam = `${sortField}_${sortDir}`;

  const buildQuery = useCallback(
    (off: number) => {
      const params = new URLSearchParams();
      params.set("sort", sortParam);
      params.set("limit", String(LIMIT));
      params.set("offset", String(off));
      if (market !== "all") params.set("market", market);
      if (difficulty !== "all") params.set("difficulty", difficulty);
      if (onlyFavorites) params.set("favorite", "true");
      if (showArchived) params.set("archived", "all");
      if (search.trim()) params.set("search", search.trim());
      if (verdict !== "all") params.set("verdict", verdict);
      if (period !== "all") params.set("period", period);
      return params.toString();
    },
    [sortParam, market, difficulty, onlyFavorites, showArchived, search, verdict, period]
  );

  const fetchIdeas = useCallback(
    async (off: number, append = false) => {
      if (!append) setLoading(true);
      else setLoadingMore(true);

      try {
        const res = await fetch(`/api/ideas?${buildQuery(off)}`);
        if (!res.ok) throw new Error("Ошибка загрузки");
        const data = await res.json();
        if (append) {
          setIdeas((prev) => [...prev, ...data.ideas]);
        } else {
          setIdeas(data.ideas);
        }
        setTotal(data.total);
        setOffset(off);
      } catch {
        // Молча — ошибки API логируются на сервере
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildQuery]
  );

  // Загрузка при смене фильтров (кроме поиска — там debounce)
  useEffect(() => {
    fetchIdeas(0);
  }, [sortField, sortDir, market, difficulty, onlyFavorites, showArchived, verdict, period]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce поиска
  useEffect(() => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchIdeas(0);
    }, 400);
    return () => clearTimeout(searchTimeout.current);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleLoadMore() {
    fetchIdeas(offset + LIMIT, true);
  }

  // Оптимистичное обновление избранного
  function handleToggleFavorite(ideaId: string, isFavorite: boolean) {
    setIdeas((prev) =>
      prev.map((idea) => (idea.id === ideaId ? { ...idea, isFavorite } : idea))
    );
    fetch(`/api/ideas/${ideaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite }),
    });
  }

  const hasMore = ideas.length < total;

  // Тогл-сортировка: клик = выбрать, повторный клик = сменить направление
  function handleSortToggle(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(DEFAULT_SORT_DIR[field]);
    }
  }

  const sortButtons: { field: SortField; label: string }[] = [
    { field: "date", label: "Дата" },
    { field: "expert", label: "Эксперты" },
    { field: "name", label: "Имя" },
  ];

  const marketOptions: { value: MarketFilter; label: string }[] = [
    { value: "all", label: "Все рынки" },
    { value: "russia", label: "🇷🇺 Россия" },
    { value: "global", label: "🌍 Мир" },
    { value: "both", label: "🇷🇺🌍 Оба" },
  ];

  const difficultyOptions: { value: DifficultyFilter; label: string }[] = [
    { value: "all", label: "Любая" },
    { value: "easy", label: "Легко" },
    { value: "medium", label: "Средне" },
    { value: "hard", label: "Сложно" },
  ];

  const verdictOptions: { value: VerdictFilter; label: string }[] = [
    { value: "all", label: "Все" },
    { value: "launch", label: "🟢 Запуск" },
    { value: "pivot", label: "🟡 Доработка" },
    { value: "reject", label: "🔴 Отказ" },
    { value: "none", label: "Без оценки" },
  ];

  const periodOptions: { value: PeriodFilter; label: string }[] = [
    { value: "all", label: "Всё время" },
    { value: "today", label: "Сегодня" },
    { value: "week", label: "Неделя" },
    { value: "month", label: "Месяц" },
  ];

  function handleExport() {
    const params = new URLSearchParams();
    if (market !== "all") params.set("market", market);
    if (difficulty !== "all") params.set("difficulty", difficulty);
    if (verdict !== "all") params.set("verdict", verdict);
    if (period !== "all") params.set("period", period);
    if (onlyFavorites) params.set("favorite", "true");
    if (search.trim()) params.set("search", search.trim());
    window.open(`/api/ideas/export?${params.toString()}`, "_blank");
  }

  return (
    <div className="mx-auto max-w-5xl animate-fade-in">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Все идеи</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
          {loading ? "Загрузка..." : `${total} идей за всё время`}
        </p>
      </div>

      {/* Поиск */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию или описанию..."
          className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all"
          style={{
            backgroundColor: "var(--card)",
            boxShadow: "var(--shadow-sm)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
          }}
        />
      </div>

      {/* Фильтры */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* Сортировка — тогл-кнопки */}
        <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: "var(--muted)" }}>
          {sortButtons.map((opt) => {
            const isActive = sortField === opt.field;
            const arrow = isActive ? (sortDir === "desc" ? " ↓" : " ↑") : "";
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

        {/* Рынок */}
        <FilterGroup
          options={marketOptions}
          value={market}
          onChange={(v) => setMarket(v as MarketFilter)}
        />

        {/* Сложность */}
        <FilterGroup
          options={difficultyOptions}
          value={difficulty}
          onChange={(v) => setDifficulty(v as DifficultyFilter)}
        />

        {/* Вердикт экспертов */}
        <FilterGroup
          options={verdictOptions}
          value={verdict}
          onChange={(v) => setVerdict(v as VerdictFilter)}
        />

        {/* Период */}
        <FilterGroup
          options={periodOptions}
          value={period}
          onChange={(v) => setPeriod(v as PeriodFilter)}
        />

        {/* Избранное */}
        <button
          onClick={() => setOnlyFavorites(!onlyFavorites)}
          className="cursor-pointer rounded-xl px-3 py-1.5 text-xs font-medium transition-all"
          style={{
            backgroundColor: onlyFavorites ? "var(--warning)" : "var(--muted)",
            color: onlyFavorites ? "#000" : "var(--muted-foreground)",
          }}
        >
          ⭐ Избранное
        </button>

        {/* Архив */}
        <button
          onClick={() => setShowArchived(!showArchived)}
          className="cursor-pointer rounded-xl px-3 py-1.5 text-xs font-medium transition-all"
          style={{
            backgroundColor: showArchived ? "var(--card)" : "var(--muted)",
            color: showArchived ? "var(--foreground)" : "var(--muted-foreground)",
            boxShadow: showArchived ? "var(--shadow-sm)" : "none",
          }}
        >
          📦 + Архив
        </button>

        {/* Экспорт */}
        <button
          onClick={handleExport}
          className="cursor-pointer rounded-xl px-3 py-1.5 text-xs font-medium transition-all"
          style={{
            backgroundColor: "var(--muted)",
            color: "var(--muted-foreground)",
          }}
        >
          📥 Выгрузить .md
        </button>
      </div>

      {/* Скелетон при загрузке */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
          <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
          <SkeletonCard /><SkeletonCard />
        </div>
      ) : ideas.length === 0 ? (
        <div
          className="rounded-2xl p-12 text-center"
          style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}
        >
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
            {search ? "Ничего не найдено по запросу" : "Идей пока нет"}
          </p>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="mt-3 cursor-pointer text-sm font-medium"
              style={{ color: "var(--primary)" }}
            >
              Сбросить поиск
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {ideas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </div>

          {/* Подгрузка ещё */}
          {hasMore && (
            <div className="mt-8 text-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="cursor-pointer rounded-xl px-6 py-3 text-sm font-medium transition-all hover:scale-[1.02]"
                style={{
                  backgroundColor: "var(--card)",
                  boxShadow: "var(--shadow-sm)",
                  color: "var(--foreground)",
                }}
              >
                {loadingMore ? (
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-4 w-4 animate-spin rounded-full border-2"
                      style={{
                        borderRightColor: "var(--primary)",
                        borderBottomColor: "var(--primary)",
                        borderLeftColor: "var(--primary)",
                        borderTopColor: "transparent",
                      }}
                    />
                    Загрузка...
                  </span>
                ) : (
                  `Показать ещё (${ideas.length} из ${total})`
                )}
              </button>
            </div>
          )}

          {/* Показано всё */}
          {!hasMore && ideas.length > 0 && (
            <p
              className="mt-6 text-center text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              Показано {ideas.length} из {total} идей
            </p>
          )}
        </>
      )}
    </div>
  );
}

// Группа кнопок-фильтров (переиспользуемый)
function FilterGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: "var(--muted)" }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap"
          style={{
            backgroundColor: value === opt.value ? "var(--card)" : "transparent",
            color: value === opt.value ? "var(--foreground)" : "var(--muted-foreground)",
            boxShadow: value === opt.value ? "var(--shadow-sm)" : "none",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
