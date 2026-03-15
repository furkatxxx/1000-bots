"use client";

import React from "react";
import Link from "next/link";
import type { IdeaDTO } from "@/lib/types";
import { getDifficultyLabel, getDifficultyColor } from "@/lib/utils";

interface IdeaCardProps {
  idea: IdeaDTO;
  onToggleFavorite?: (id: string, isFavorite: boolean) => void;
}

export const IdeaCard = React.memo(function IdeaCard({
  idea,
  onToggleFavorite,
}: IdeaCardProps) {

  const hasExpert = idea.expertAnalysis?.finalScore != null;
  const displayScore = idea.expertAnalysis?.finalScore;
  const displayVerdict = idea.expertAnalysis?.finalVerdict;

  // Убираем замечание валидатора из описания для карточки
  const cleanDescription = idea.description.replace(/\[(?:⚠️\s*)?Замечание.*?\]$/, "").trim();
  const shortDescription = cleanDescription.length > 120 ? cleanDescription.slice(0, 117) + "..." : cleanDescription;

  return (
    <Link
      href={`/ideas/${idea.id}`}
      className="block rounded-2xl p-5 transition-all duration-200 hover:scale-[1.01]"
      style={{
        backgroundColor: "var(--card)",
        boxShadow: hasExpert && displayScore && displayScore >= 7
          ? `0 0 0 1px var(--success), var(--shadow-sm)`
          : "var(--shadow-sm)",
      }}
    >
      {/* Шапка: эмодзи + название + оценка */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl shrink-0">{idea.emoji}</span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">{idea.name}</h3>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: `${getDifficultyColor(idea.difficulty) || "var(--muted)"}20`,
                  color: getDifficultyColor(idea.difficulty) || "var(--muted-foreground)",
                }}
              >
                {getDifficultyLabel(idea.difficulty) || idea.difficulty}
              </span>
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: "var(--muted)" }}>
                {idea.market === "russia" ? "🇷🇺" : idea.market === "global" ? "🌍" : "🇷🇺🌍"}
              </span>
              {idea.reportDate && (
                <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                  {new Date(idea.reportDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Оценка или звёздочка */}
        <div className="flex items-center gap-2 shrink-0">
          {hasExpert && displayScore != null && displayVerdict ? (
            <div className="text-right">
              <div className="text-lg font-bold" style={{
                color: displayScore >= 7 ? "var(--success)" : displayScore >= 5 ? "var(--warning)" : "var(--destructive)",
              }}>
                {displayScore}
              </div>
              <div className="text-[9px] font-medium" style={{
                color: displayVerdict === "launch" ? "var(--success)" : displayVerdict === "pivot" ? "var(--warning)" : "var(--destructive)",
              }}>
                {displayVerdict === "launch" ? "запуск" : displayVerdict === "pivot" ? "доработка" : "отказ"}
              </div>
            </div>
          ) : (
            <span
              className="rounded-full px-2 py-0.5 text-[10px]"
              style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}
            >
              Не оценено
            </span>
          )}

          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite?.(idea.id, !idea.isFavorite);
            }}
            className="cursor-pointer text-lg opacity-40 transition-opacity hover:opacity-100"
            title={idea.isFavorite ? "Убрать из избранного" : "В избранное"}
          >
            {idea.isFavorite ? "⭐" : "☆"}
          </button>
        </div>
      </div>

      {/* Описание — 2 строки максимум */}
      <p
        className="text-xs leading-relaxed"
        style={{ color: "var(--muted-foreground)" }}
      >
        {shortDescription}
      </p>

      {/* Прогресс-бар оценки */}
      {hasExpert && displayScore != null && (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--muted)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${displayScore * 10}%`,
              backgroundColor: displayScore >= 7 ? "var(--success)" : displayScore >= 5 ? "var(--warning)" : "var(--destructive)",
            }}
          />
        </div>
      )}
    </Link>
  );
});
