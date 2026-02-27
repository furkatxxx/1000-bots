"use client";

import Link from "next/link";
import { useReports } from "@/hooks/useReports";
import { SkeletonCard } from "@/components/ui/SkeletonCard";

export default function ReportsPage() {
  const { reports, loading } = useReports();

  return (
    <div className="mx-auto max-w-4xl animate-fade-in">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Отчёты</h1>

      {loading && (
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!loading && reports.length === 0 && (
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            backgroundColor: "var(--card)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div className="mb-3 text-4xl">📊</div>
          <h2 className="mb-2 text-xl font-semibold">Отчётов пока нет</h2>
          <p style={{ color: "var(--muted-foreground)" }}>
            Сгенерируй первый отчёт на{" "}
            <Link href="/" className="font-medium" style={{ color: "var(--primary)" }}>
              дашборде
            </Link>
          </p>
        </div>
      )}

      {!loading && reports.length > 0 && (
        <div className="space-y-3">
          {reports.map((report) => (
            <Link
              key={report.id}
              href={`/reports/${report.id}`}
              className="block rounded-2xl p-5 transition-all duration-200 hover:scale-[1.01]"
              style={{
                backgroundColor: "var(--card)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <StatusBadge status={report.status} />
                  <div>
                    <div className="font-semibold">
                      {formatReportDate(report.date)}
                    </div>
                    <div
                      className="mt-0.5 text-sm"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {report.trendsCount} трендов → {report.ideasCount} идей
                    </div>
                  </div>
                </div>
                <div
                  className="text-sm"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {report.aiModel || "—"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { emoji: string; color: string }> = {
    complete: { emoji: "✅", color: "var(--success)" },
    generating: { emoji: "⏳", color: "var(--warning)" },
    failed: { emoji: "❌", color: "var(--destructive)" },
    pending: { emoji: "⏸", color: "var(--muted-foreground)" },
  };
  const c = config[status] || config.pending;

  return (
    <span className="text-2xl" title={status}>
      {c.emoji}
    </span>
  );
}

function formatReportDate(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const reportDate = new Date(date);
  reportDate.setHours(0, 0, 0, 0);

  const diffDays = Math.floor(
    (today.getTime() - reportDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Вчера";

  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
