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
  elapsed: number;
  healthCheck: HealthCheckDTO | null;
  onResetError: () => void;
}

// 3 реальных этапа pipeline
const PIPELINE_STAGES = [
  { key: "stage-1" as const, label: "Сбор и анализ трендов", emoji: "📡" },
  { key: "stage-2" as const, label: "Генерация бизнес-идей", emoji: "🧠" },
  { key: "stage-3" as const, label: "Валидация и финализация", emoji: "✅" },
];

function getStageIndex(phase: GeneratePhase): number {
  if (phase === "stage-1") return 0;
  if (phase === "stage-2") return 1;
  if (phase === "stage-3") return 2;
  return -1;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} сек`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const TodayReport = React.memo(function TodayReport({
  report,
  onGenerate,
  generating,
  phase,
  elapsed,
  healthCheck,
  onResetError,
}: TodayReportProps) {
  // ─── Фаза: проверяем источники ───
  if (phase === "checking") {
    return (
      <Card>
        <div className="mb-4 flex justify-center">
          <span
            className="inline-block h-12 w-12 animate-spin rounded-full border-4"
            style={{
              borderRightColor: "var(--warning)",
              borderBottomColor: "var(--warning)",
              borderLeftColor: "var(--warning)",
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

  // ─── Фаза: генерируем отчёт (3 этапа с реальным прогрессом) ───
  if (phase === "stage-1" || phase === "stage-2" || phase === "stage-3") {
    const currentIdx = getStageIndex(phase);
    const progress = ((currentIdx + 0.5) / PIPELINE_STAGES.length) * 100;

    return (
      <Card>
        <div className="mb-4 flex justify-center">
          <span
            className="inline-block h-12 w-12 animate-spin rounded-full border-4"
            style={{
              borderRightColor: "var(--primary)",
              borderBottomColor: "var(--primary)",
              borderLeftColor: "var(--primary)",
              borderTopColor: "transparent",
            }}
          />
        </div>
        <h3 className="mb-2 text-lg font-semibold">Генерирую отчёт...</h3>

        {/* Текущий этап */}
        <div
          className="mb-3 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
          style={{ backgroundColor: "var(--muted)" }}
        >
          <span>{PIPELINE_STAGES[currentIdx].emoji}</span>
          <span>{PIPELINE_STAGES[currentIdx].label}</span>
        </div>

        {/* Прогресс-бар */}
        <div
          className="mx-auto mb-3 h-2 w-full max-w-xs overflow-hidden rounded-full"
          style={{ backgroundColor: "var(--muted)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${progress}%`,
              backgroundColor: "var(--primary)",
            }}
          />
        </div>

        {/* Таймер */}
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Прошло {formatTime(elapsed)} · обычно занимает ~3 минуты
        </p>

        {/* Подэтапы */}
        <div className="mt-4 space-y-1">
          {PIPELINE_STAGES.map((s, i) => {
            const isDone = i < currentIdx;
            const isCurrent = i === currentIdx;
            return (
              <div
                key={s.key}
                className="flex items-center gap-2 text-xs"
                style={{
                  color: isDone
                    ? "var(--success)"
                    : isCurrent
                    ? "var(--foreground)"
                    : "var(--muted-foreground)",
                  opacity: isDone || isCurrent ? 1 : 0.5,
                }}
              >
                <span>{isDone ? "✅" : isCurrent ? "⏳" : "○"}</span>
                <span className={isCurrent ? "font-medium" : ""}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
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
    // Проверяем: не застряла ли генерация (больше 10 минут)
    const startedAt = report.generatedAt || report.createdAt;
    const elapsedMs = Date.now() - new Date(startedAt).getTime();
    const isStuck = elapsedMs > 10 * 60 * 1000;

    if (isStuck) {
      return (
        <Card>
          <div className="mb-4 text-5xl">⚠️</div>
          <h3 className="mb-2 text-lg font-semibold">Генерация зависла</h3>
          <p
            className="mb-6 text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            Прошлая генерация не завершилась. Нажми кнопку, чтобы
            попробовать снова.
          </p>
          <GenerateButton
            onClick={onGenerate}
            disabled={generating}
            label="Попробовать снова"
          />
        </Card>
      );
    }

    return (
      <Card>
        <div className="mb-4 flex justify-center">
          <span
            className="inline-block h-12 w-12 animate-spin rounded-full border-4"
            style={{
              borderRightColor: "var(--primary)",
              borderBottomColor: "var(--primary)",
              borderLeftColor: "var(--primary)",
              borderTopColor: "transparent",
            }}
          />
        </div>
        <h3 className="mb-2 text-lg font-semibold">Генерирую отчёт...</h3>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Идёт генерация. Обычно занимает ~3 минуты.
          Обновите страницу через пару минут.
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
