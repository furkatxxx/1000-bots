"use client";

import { use } from "react";
import Link from "next/link";
import { useReport } from "@/hooks/useReport";
import { IdeaCard } from "@/components/ui/IdeaCard";
import { SkeletonCard } from "@/components/ui/SkeletonCard";

export default function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { report, loading, error, refetch } = useReport(id);

  async function handleToggleFavorite(ideaId: string, isFavorite: boolean) {
    await fetch(`/api/ideas/${ideaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite }),
    });
    refetch();
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl animate-fade-in">
        <div className="mb-6 h-8 w-48 animate-skeleton-pulse rounded" style={{ backgroundColor: "var(--muted)" }} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="mx-auto max-w-4xl animate-fade-in">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Ошибка</h1>
        <p style={{ color: "var(--destructive)" }}>{error || "Отчёт не найден"}</p>
        <Link href="/reports" className="mt-4 inline-block text-sm font-medium" style={{ color: "var(--primary)" }}>
          ← К списку отчётов
        </Link>
      </div>
    );
  }

  const date = new Date(report.date);
  const formattedDate = date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-4xl animate-fade-in">
      {/* Шапка */}
      <div className="mb-2">
        <Link href="/reports" className="text-sm font-medium" style={{ color: "var(--primary)" }}>
          ← Отчёты
        </Link>
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
      <div className="mb-8 grid grid-cols-3 gap-4">
        <MetricBox label="Трендов" value={report.trendsCount} />
        <MetricBox label="Идей" value={report.ideas.length} />
        <MetricBox label="Токенов" value={(report.aiTokensIn || 0) + (report.aiTokensOut || 0)} />
      </div>

      {/* Список идей */}
      {report.ideas.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}>
          <p style={{ color: "var(--muted-foreground)" }}>В этом отчёте нет идей</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {report.ideas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              onToggleFavorite={handleToggleFavorite}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    complete: { label: "Готов", color: "var(--success)", bg: "var(--success)" },
    generating: { label: "Генерация...", color: "var(--warning)", bg: "var(--warning)" },
    failed: { label: "Ошибка", color: "var(--destructive)", bg: "var(--destructive)" },
    pending: { label: "Ожидание", color: "var(--muted-foreground)", bg: "var(--muted)" },
  };
  const c = config[status] || config.pending;

  return (
    <span
      className="rounded-full px-3 py-1 text-xs font-semibold text-white"
      style={{ backgroundColor: c.bg }}
    >
      {c.label}
    </span>
  );
}

function MetricBox({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="rounded-xl p-4 text-center"
      style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}
    >
      <div className="text-2xl font-bold">{value.toLocaleString("ru-RU")}</div>
      <div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
        {label}
      </div>
    </div>
  );
}
