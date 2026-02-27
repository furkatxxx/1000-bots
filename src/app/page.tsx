"use client";

import { useReports } from "@/hooks/useReports";
import { useGenerate } from "@/hooks/useGenerate";
import { useToast } from "@/components/ui/Toast";
import { QuickStat } from "@/components/ui/QuickStat";
import { TodayReport } from "@/components/dashboard/TodayReport";
import { IdeaCard } from "@/components/ui/IdeaCard";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { useReport } from "@/hooks/useReport";

export default function DashboardPage() {
  const { reports, loading: loadingReports, refetch: refetchReports } = useReports();
  const { generate, generating } = useGenerate();
  const { showToast } = useToast();

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
        <QuickStat icon="⭐" label="Избранных" value="—" />
      </div>

      {/* Сегодняшний отчёт */}
      <div className="mb-8">
        <TodayReport
          report={todayReport}
          onGenerate={handleGenerate}
          generating={generating}
        />
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

// Подкомпонент для топ-идей из отчёта
function TopIdeas({ reportId }: { reportId: string }) {
  const { report, loading } = useReport(reportId);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!report || report.ideas.length === 0) return null;

  // Показываем первые 4 идеи
  const topIdeas = report.ideas.slice(0, 4);

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">Топ идеи</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {topIdeas.map((idea) => (
          <IdeaCard key={idea.id} idea={idea} />
        ))}
      </div>
    </div>
  );
}
