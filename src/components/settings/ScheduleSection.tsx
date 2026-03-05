"use client";

interface ScheduleSectionProps {
  enabled: boolean;
  time: string;
  autoTelegram: boolean;
  onEnabledChange: (v: boolean) => void;
  onTimeChange: (v: string) => void;
  onAutoTelegramChange: (v: boolean) => void;
}

export function ScheduleSection({
  enabled,
  time,
  autoTelegram,
  onEnabledChange,
  onTimeChange,
  onAutoTelegramChange,
}: ScheduleSectionProps) {
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">Расписание</h2>

      {/* Переключатель */}
      <label className="mb-4 flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all duration-200" style={{
        borderColor: enabled ? "var(--primary)" : "var(--border)",
        backgroundColor: enabled ? "var(--primary-light, #0071e308)" : "transparent",
      }}>
        <div>
          <div className="text-sm font-medium">Автоматическая генерация</div>
          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Каждый день в заданное время создаётся новый отчёт
          </div>
        </div>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          className="h-5 w-5 cursor-pointer rounded accent-[var(--primary)]"
        />
      </label>

      {/* Время генерации */}
      {enabled && (
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
            Время генерации
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:ring-2"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
          />
          <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Отчёт будет создан автоматически после этого времени
          </p>
        </div>
      )}

      {/* Автоотправка в Telegram */}
      {enabled && (
        <label className="mb-6 flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all duration-200" style={{
          borderColor: autoTelegram ? "var(--primary)" : "var(--border)",
          backgroundColor: autoTelegram ? "var(--primary-light, #0071e308)" : "transparent",
        }}>
          <div>
            <div className="text-sm font-medium">Отправить в Telegram после генерации</div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              ТОП идей автоматически отправится в чат
            </div>
          </div>
          <input
            type="checkbox"
            checked={autoTelegram}
            onChange={(e) => onAutoTelegramChange(e.target.checked)}
            className="h-5 w-5 cursor-pointer rounded accent-[var(--primary)]"
          />
        </label>
      )}
    </>
  );
}
