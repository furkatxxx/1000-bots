"use client";

import { useState } from "react";
import { useReports } from "@/hooks/useReports";
import { useGenerate } from "@/hooks/useGenerate";
import { useToast } from "@/components/ui/Toast";
import { QuickStat } from "@/components/ui/QuickStat";
import { TodayReport } from "@/components/dashboard/TodayReport";
import { IdeaCard } from "@/components/ui/IdeaCard";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { useReport } from "@/hooks/useReport";

export default function DashboardPage() {
  const { reports, favoritesCount, loading: loadingReports, refetch: refetchReports } = useReports();
  const { generate, generating, phase, elapsed, healthCheck, resetError } = useGenerate();
  const { showToast } = useToast();
  const [sendingTg, setSendingTg] = useState(false);

  // Сегодняшний отчёт — первый в списке (отсортированы по дате desc)
  const todayReport = reports.length > 0 ? reports[0] : null;

  // Статистика
  const totalReports = reports.length;
  const totalIdeas = reports.reduce((sum, r) => sum + r.ideasCount, 0);
  const totalTrends = reports.reduce((sum, r) => sum + r.trendsCount, 0);

  async function handleGenerate() {
    const result = await generate();
    if (result?.success) {
      showToast(`Отчёт готов! ${result.report?.ideasCount} идей`, "success");
      refetchReports();
    } else {
      showToast(result?.error || "Ошибка генерации", "error");
      refetchReports();
    }
  }

  async function handleSendTelegram() {
    setSendingTg(true);
    try {
      const res = await fetch("/api/telegram/send-top", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showToast(`ТОП-${data.sentCount} отправлено в Telegram!`, "success");
      } else {
        showToast(data.error || "Ошибка отправки", "error");
      }
    } catch {
      showToast("Ошибка отправки в Telegram", "error");
    } finally {
      setSendingTg(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl animate-fade-in">
      {/* Заголовок */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Дашборд</h1>
        <p className="mt-2 text-base" style={{ color: "var(--muted-foreground)" }}>
          Ежедневный поиск бизнес-идей на основе трендов
        </p>
      </div>

      {/* Быстрая сводка */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <QuickStat icon="📊" label="Отчётов" value={totalReports} />
        <QuickStat icon="💡" label="Идей" value={totalIdeas} />
        <QuickStat icon="📈" label="Трендов" value={totalTrends} />
        <QuickStat icon="⭐" label="Избранных" value={favoritesCount} />
      </div>

      {/* Сегодняшний отчёт + кнопка Telegram */}
      <div className="mb-8">
        <TodayReport
          report={todayReport}
          onGenerate={handleGenerate}
          generating={generating}
          phase={phase}
          elapsed={elapsed}
          healthCheck={healthCheck}
          onResetError={resetError}
        />
        {todayReport && todayReport.status === "complete" && (
          <button
            onClick={handleSendTelegram}
            disabled={sendingTg}
            className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-3 text-sm font-medium transition-all hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: "#0088cc", color: "#0088cc" }}
          >
            {sendingTg ? (
              <>⏳ Отправляю...</>
            ) : (
              <>✈️ Отправить ТОП-5 в Telegram</>
            )}
          </button>
        )}
      </div>

      {/* Топ идеи из последнего отчёта */}
      {todayReport && todayReport.status === "complete" && (
        <TopIdeas reportId={todayReport.id} />
      )}

      {/* Скелетоны при загрузке */}
      {loadingReports && (
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}
    </div>
  );
}

// Подкомпонент для топ-идей из отчёта (только лучшие по шансу + быстрый запуск)
function TopIdeas({ reportId }: { reportId: string }) {
  const { report, loading } = useReport(reportId);
  const [marketFilter, setMarketFilter] = useState<"all" | "russia" | "global">("all");

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!report || report.ideas.length === 0) return null;

  // Умная сортировка: экспертная оценка (если есть) или шанс успеха * коэффициент сложности
  const diffWeight: Record<string, number> = { easy: 1.3, medium: 1.0, hard: 0.7 };
  const topIdeas = [...report.ideas]
    .filter((idea) => !idea.isArchived)
    .filter((idea) => marketFilter === "all" || idea.market === marketFilter || idea.market === "both")
    .map((idea) => {
      const expertScore = idea.expertAnalysis?.finalScore;
      const baseScore = expertScore != null ? expertScore * 10 : (idea.successChance || 0);
      return { ...idea, _rank: baseScore * (diffWeight[idea.difficulty] || 1) };
    })
    .sort((a, b) => b._rank - a._rank)
    .slice(0, 4);

  if (topIdeas.length === 0 && marketFilter === "all") return null;

  const marketOptions = [
    { value: "all" as const, label: "Все" },
    { value: "russia" as const, label: "🇷🇺 Россия" },
    { value: "global" as const, label: "🌍 Мир" },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">🏆 Лучшие идеи</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Отсортированы по экспертной оценке и скорости запуска
          </p>
        </div>
        <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: "var(--muted)" }}>
          {marketOptions.map((opt) => (
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
      {topIdeas.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {topIdeas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl p-6 text-center text-sm" style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)", color: "var(--muted-foreground)" }}>
          Нет идей для выбранного рынка
        </div>
      )}
    </div>
  );
}
