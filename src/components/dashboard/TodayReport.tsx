"use client";

import React from "react";
import Link from "next/link";
import type { ReportDTO } from "@/lib/types";
import type { GeneratePhase, HealthCheckDTO } from "@/hooks/useGenerate";

interface TodayReportProps {
  report: ReportDTO | null;
  onGenerate: () => void;
  generating: boolean;
  phase: GeneratePhase;
  healthCheck: HealthCheckDTO | null;
  onResetError: () => void;
}

export const TodayReport = React.memo(function TodayReport({
  report,
  onGenerate,
  generating,
  phase,
  healthCheck,
  onResetError,
}: TodayReportProps) {
  // ─── Фаза: проверяем источники ───
  if (phase === "checking") {
    return (
      <Card>
        <div className="mb-4 flex justify-center">
          <span
            className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-t-transparent"
            style={{
              borderColor: "var(--warning)",
              borderTopColor: "transparent",
            }}
          />
        </div>
        <h3 className="mb-2 text-lg font-semibold">Проверяю источники...</h3>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Убеждаюсь, что все источники трендов работают, прежде чем тратить
          деньги на AI
        </p>
      </Card>
    );
  }

  // ─── Фаза: генерируем отчёт ───
  if (phase === "generating") {
    return (
      <Card>
        <div className="mb-4 flex justify-center">
          <span
            className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-t-transparent"
            style={{
              borderColor: "var(--primary)",
              borderTopColor: "transparent",
            }}
          />
        </div>
        <h3 className="mb-2 text-lg font-semibold">Генерирую отчёт...</h3>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Источники в порядке ✅ Изучаю тренды и создаю бизнес-идеи. Это
          займёт 15-30 секунд.
        </p>
      </Card>
    );
  }

  // ─── Ошибка: источники не прошли проверку ───
  if (healthCheck && healthCheck.failed > 0) {
    const percent = Math.round(
      (healthCheck.working / healthCheck.total) * 100
    );

    return (
      <div
        className="rounded-2xl p-6"
        style={{
          backgroundColor: "var(--card)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div className="mb-4 text-center">
          <div className="mb-3 text-4xl">🚫</div>
          <h3 className="mb-1 text-lg font-semibold">
            Источники не готовы к генерации
          </h3>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Работают {healthCheck.working} из {healthCheck.total} ({percent}%).
            Нужно минимум 60%.
          </p>
        </div>

        {/* Список источников */}
        <div className="mb-4 space-y-2">
          {healthCheck.results.map((source) => (
            <div
              key={source.id}
              className="flex items-center justify-between rounded-xl px-4 py-2.5 text-sm"
              style={{
                backgroundColor: source.ok
                  ? "rgba(34, 197, 94, 0.08)"
                  : "rgba(239, 68, 68, 0.08)",
              }}
            >
              <div className="flex items-center gap-2">
                <span>{source.ok ? "✅" : "❌"}</span>
                <span className="font-medium">{source.label}</span>
              </div>
              <div
                className="text-xs"
                style={{
                  color: source.ok
                    ? "var(--success, #22c55e)"
                    : "var(--destructive, #ef4444)",
                }}
              >
                {source.ok
                  ? `${source.items} элементов`
                  : source.error || "0 элементов"}
              </div>
            </div>
          ))}
        </div>

        {/* Подпись и кнопка */}
        <p
          className="mb-4 text-center text-xs"
          style={{ color: "var(--muted-foreground)" }}
        >
          Уведомление отправлено в Telegram. Исправьте проблемы и попробуйте
          снова.
        </p>
        <div className="flex justify-center">
          <button
            onClick={() => {
              onResetError();
              onGenerate();
            }}
            disabled={generating}
            className="cursor-pointer rounded-xl px-8 py-3 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: "var(--primary)" }}
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  // ─── Нет отчёта — кнопка генерации ───
  if (!report) {
    return (
      <Card>
        <div className="mb-4 text-5xl">🔍</div>
        <h3 className="mb-2 text-lg font-semibold">
          Сегодня ещё нет отчёта
        </h3>
        <p
          className="mb-6 text-sm"
          style={{ color: "var(--muted-foreground)" }}
        >
          Нажми кнопку, чтобы изучить тренды и сгенерировать бизнес-идеи
        </p>
        <GenerateButton
          onClick={onGenerate}
          disabled={generating}
          label="Сгенерировать отчёт"
        />
      </Card>
    );
  }

  // ─── Отчёт генерируется (из БД — например при перезагрузке страницы) ───
  if (report.status === "generating") {
    return (
      <Card>
        <div className="mb-4 flex justify-center">
          <span
            className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-t-transparent"
            style={{
              borderColor: "var(--primary)",
              borderTopColor: "transparent",
            }}
          />
        </div>
        <h3 className="mb-2 text-lg font-semibold">Генерирую отчёт...</h3>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Изучаю тренды и создаю бизнес-идеи. Это займёт 15-30 секунд.
        </p>
      </Card>
    );
  }

  // ─── Ошибка генерации (из БД) ───
  if (report.status === "failed") {
    return (
      <Card>
        <div className="mb-4 text-5xl">❌</div>
        <h3 className="mb-2 text-lg font-semibold">Ошибка генерации</h3>
        <p
          className="mb-6 text-sm"
          style={{ color: "var(--muted-foreground)" }}
        >
          Проверьте настройки API-ключей и попробуйте снова
        </p>
        <GenerateButton
          onClick={onGenerate}
          disabled={generating}
          label="Попробовать снова"
        />
      </Card>
    );
  }

  // ─── Отчёт готов ───
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
          <p
            className="text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            {report.trendsCount} трендов → {report.ideasCount} идей
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onGenerate}
            disabled={generating}
            className="cursor-pointer rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: "var(--muted)",
              color: "var(--foreground)",
            }}
          >
            {generating ? "⏳ Генерирую..." : "🔄 Обновить"}
          </button>
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
      </div>

      <div className="flex gap-4">
        <MiniStat value={report.trendsCount} label="трендов" />
        <MiniStat value={report.ideasCount} label="идей" />
        <MiniStat value={report.aiModel || "—"} label="модель" />
      </div>
    </div>
  );
});

// ─── Вспомогательные компоненты ───

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{
        backgroundColor: "var(--card)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {children}
    </div>
  );
}

function GenerateButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer rounded-xl px-8 py-3 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      style={{ backgroundColor: "var(--primary)" }}
    >
      {disabled ? (
        <span className="flex items-center gap-2">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          Генерирую...
        </span>
      ) : (
        label
      )}
    </button>
  );
}

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
      <div
        className="text-xs"
        style={{ color: "var(--muted-foreground)" }}
      >
        {label}
      </div>
    </div>
  );
});
