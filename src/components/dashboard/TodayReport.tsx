"use client";

import React from "react";
import Link from "next/link";
import type { ReportDTO } from "@/lib/types";

interface TodayReportProps {
  report: ReportDTO | null;
  onGenerate: () => void;
  generating: boolean;
}

export const TodayReport = React.memo(function TodayReport({
  report,
  onGenerate,
  generating,
}: TodayReportProps) {
  if (!report) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{
          backgroundColor: "var(--card)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div className="mb-4 text-5xl">🔍</div>
        <h3 className="mb-2 text-lg font-semibold">Сегодня ещё нет отчёта</h3>
        <p
          className="mb-6 text-sm"
          style={{ color: "var(--muted-foreground)" }}
        >
          Нажми кнопку, чтобы изучить тренды и сгенерировать бизнес-идеи
        </p>
        <button
          onClick={onGenerate}
          disabled={generating}
          className="cursor-pointer rounded-xl px-8 py-3 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: "var(--primary)" }}
        >
          {generating ? (
            <span className="flex items-center gap-2">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Генерирую...
            </span>
          ) : (
            "Сгенерировать отчёт"
          )}
        </button>
      </div>
    );
  }

  if (report.status === "generating") {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{
          backgroundColor: "var(--card)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div className="mb-4 flex justify-center">
          <span className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
        </div>
        <h3 className="mb-2 text-lg font-semibold">Генерирую отчёт...</h3>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Изучаю тренды и создаю бизнес-идеи. Это займёт 15-30 секунд.
        </p>
      </div>
    );
  }

  if (report.status === "failed") {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{
          backgroundColor: "var(--card)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div className="mb-4 text-5xl">❌</div>
        <h3 className="mb-2 text-lg font-semibold">Ошибка генерации</h3>
        <p
          className="mb-6 text-sm"
          style={{ color: "var(--muted-foreground)" }}
        >
          Проверьте настройки API-ключей и попробуйте снова
        </p>
        <button
          onClick={onGenerate}
          disabled={generating}
          className="cursor-pointer rounded-xl px-8 py-3 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: "var(--primary)" }}
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  // Отчёт готов
  return (
    <div
      className="rounded-2xl p-6"
      style={{
        backgroundColor: "var(--card)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Сегодняшний отчёт</h3>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {report.trendsCount} трендов → {report.ideasCount} идей
          </p>
        </div>
        <Link
          href={`/reports/${report.id}`}
          className="rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 hover:opacity-80"
          style={{
            backgroundColor: "var(--primary)",
            color: "white",
          }}
        >
          Посмотреть
        </Link>
      </div>

      <div className="flex gap-4">
        <MiniStat value={report.trendsCount} label="трендов" />
        <MiniStat value={report.ideasCount} label="идей" />
        <MiniStat value={report.aiModel || "—"} label="модель" />
      </div>
    </div>
  );
});

const MiniStat = React.memo(function MiniStat({
  value,
  label,
}: {
  value: string | number;
  label: string;
}) {
  return (
    <div
      className="flex-1 rounded-xl p-3 text-center"
      style={{ backgroundColor: "var(--muted)" }}
    >
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        {label}
      </div>
    </div>
  );
});
