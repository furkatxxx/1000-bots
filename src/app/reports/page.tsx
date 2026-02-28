"use client";

import { useState } from "react";
import Link from "next/link";
import { useReports } from "@/hooks/useReports";
import { SkeletonCard } from "@/components/ui/SkeletonCard";

export default function ReportsPage() {
  const { reports, loading } = useReports();
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");

  const filteredReports = reports.filter((r) => {
    if (dateFilter === "all") return true;
    const d = new Date(r.date);
    const now = new Date();
    if (dateFilter === "today") return d.toDateString() === now.toDateString();
    if (dateFilter === "week") return d >= new Date(now.getTime() - 7 * 86400000);
    if (dateFilter === "month") return d >= new Date(now.getTime() - 30 * 86400000);
    return true;
  });

  const dateOptions = [
    { value: "all" as const, label: "Все" },
    { value: "today" as const, label: "Сегодня" },
    { value: "week" as const, label: "Неделя" },
    { value: "month" as const, label: "Месяц" },
  ];

  return (
    <div className="mx-auto max-w-4xl animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Отчёты</h1>
        <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: "var(--muted)" }}>
          {dateOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDateFilter(opt.value)}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
              style={{
                backgroundColor: dateFilter === opt.value ? "var(--card)" : "transparent",
                color: dateFilter === opt.value ? "var(--foreground)" : "var(--muted-foreground)",
                boxShadow: dateFilter === opt.value ? "var(--shadow-sm)" : "none",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!loading && filteredReports.length === 0 && (
        <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}>
          <div className="mb-3 text-4xl">📊</div>
          <h2 className="mb-2 text-xl font-semibold">
            {dateFilter === "all" ? "Отчётов пока нет" : "Нет отчётов за этот период"}
          </h2>
          <p style={{ color: "var(--muted-foreground)" }}>
            {dateFilter === "all" ? (
              <>Сгенерируй первый отчёт на{" "}
                <Link href="/" className="font-medium" style={{ color: "var(--primary)" }}>дашборде</Link></>
            ) : (
              <button onClick={() => setDateFilter("all")} className="cursor-pointer font-medium" style={{ color: "var(--primary)" }}>
                Показать все отчёты
              </button>
            )}
          </p>
        </div>
      )}

      {!loading && filteredReports.length > 0 && (
        <div className="space-y-3">
          {filteredReports.map((report) => (
            <Link key={report.id} href={`/reports/${report.id}`}
              className="block rounded-2xl p-5 transition-all duration-200 hover:scale-[1.01]"
              style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <StatusBadge status={report.status} />
                  <div>
                    <div className="font-semibold">{formatReportDate(report.date)}</div>
                    <div className="mt-0.5 text-sm" style={{ color: "var(--muted-foreground)" }}>
                      {report.trendsCount} трендов → {report.ideasCount} идей
                    </div>
                  </div>
                </div>
                <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>{report.aiModel || "—"}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { emoji: string }> = {
    complete: { emoji: "✅" }, generating: { emoji: "⏳" }, failed: { emoji: "❌" }, pending: { emoji: "⏸" },
  };
  return <span className="text-2xl" title={status}>{(config[status] || config.pending).emoji}</span>;
}

function formatReportDate(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const reportDate = new Date(date);
  reportDate.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - reportDate.getTime()) / 86400000);
  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Вчера";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}
