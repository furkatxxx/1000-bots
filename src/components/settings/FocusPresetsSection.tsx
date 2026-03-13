"use client";

import React from "react";
import { FOCUS_PRESETS, PRESET_IDS, MAX_PRESETS, type PresetId } from "@/lib/focus-presets";

interface FocusPresetsSectionProps {
  selected: PresetId[];
  onChange: (presets: PresetId[]) => void;
}

function FocusPresetsSectionInner({ selected, onChange }: FocusPresetsSectionProps) {
  function togglePreset(id: PresetId) {
    if (selected.includes(id)) {
      // Убираем
      onChange(selected.filter((p) => p !== id));
    } else if (selected.length < MAX_PRESETS) {
      // Добавляем (максимум 3)
      onChange([...selected, id]);
    }
  }

  const isMaxReached = selected.length >= MAX_PRESETS;

  return (
    <div className="mb-6">
      <h2 className="mb-2 text-lg font-semibold">Фокус генерации</h2>
      <p className="mb-4 text-xs" style={{ color: "var(--muted-foreground)" }}>
        Выберите до {MAX_PRESETS} направлений. AI будет искать идеи {selected.length > 1 ? "на стыке выбранных направлений" : "в выбранном направлении"}.
        {selected.length === 0 && " Без выбора — универсальный режим."}
      </p>

      <div className="space-y-2">
        {PRESET_IDS.map((id) => {
          const preset = FOCUS_PRESETS[id];
          const isSelected = selected.includes(id);
          const isDisabled = !isSelected && isMaxReached;

          return (
            <button
              key={id}
              type="button"
              onClick={() => !isDisabled && togglePreset(id)}
              disabled={isDisabled}
              className="flex w-full cursor-pointer items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                borderColor: isSelected ? "var(--primary)" : "var(--border)",
                backgroundColor: isSelected ? "var(--primary-light, rgba(0, 113, 227, 0.06))" : "transparent",
              }}
            >
              <span className="text-2xl leading-none">{preset.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{preset.name}</span>
                  {isSelected && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                      style={{ backgroundColor: "var(--primary)" }}
                    >
                      Активен
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {preset.short}
                </p>
                <p className="mt-1 text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                  👤 {preset.client} · 💰 {preset.revenue} · 🌍 {preset.market}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Подсказка о режиме */}
      {selected.length > 0 && (
        <div
          className="mt-3 rounded-xl px-4 py-3 text-xs"
          style={{ backgroundColor: "var(--primary-light, rgba(0, 113, 227, 0.06))" }}
        >
          {selected.length === 1 ? (
            <span>
              🎯 <strong>Глубокий фокус:</strong> AI будет искать идеи только в направлении «{FOCUS_PRESETS[selected[0]].name}»
            </span>
          ) : (
            <span>
              ⚡ <strong>Поиск на стыке:</strong> AI будет искать идеи на пересечении{" "}
              {selected.map((id) => `«${FOCUS_PRESETS[id].name}»`).join(" + ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export const FocusPresetsSection = React.memo(FocusPresetsSectionInner);
