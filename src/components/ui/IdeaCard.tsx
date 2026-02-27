"use client";

import React from "react";
import Link from "next/link";
import type { IdeaDTO } from "@/lib/types";

interface IdeaCardProps {
  idea: IdeaDTO;
  onToggleFavorite?: (id: string, isFavorite: boolean) => void;
}

export const IdeaCard = React.memo(function IdeaCard({
  idea,
  onToggleFavorite,
}: IdeaCardProps) {
  const difficultyColors: Record<string, string> = {
    easy: "var(--success)",
    medium: "var(--warning)",
    hard: "var(--destructive)",
  };

  const difficultyLabels: Record<string, string> = {
    easy: "Легко",
    medium: "Средне",
    hard: "Сложно",
  };

  return (
    <div
      className="group rounded-2xl p-5 transition-all duration-200 hover:scale-[1.01]"
      style={{
        backgroundColor: "var(--card)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{idea.emoji}</span>
          <div>
            <Link
              href={`/ideas/${idea.id}`}
              className="text-base font-semibold transition-colors hover:opacity-70"
            >
              {idea.name}
            </Link>
            <div className="mt-0.5 flex items-center gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: `${difficultyColors[idea.difficulty] || "var(--muted)"}20`,
                  color: difficultyColors[idea.difficulty] || "var(--muted-foreground)",
                }}
              >
                {difficultyLabels[idea.difficulty] || idea.difficulty}
              </span>
              {idea.claudeCodeReady && (
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: "var(--primary-light, #0071e320)",
                    color: "var(--primary)",
                  }}
                >
                  Можно собрать в коде
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => onToggleFavorite?.(idea.id, !idea.isFavorite)}
          className="cursor-pointer text-xl opacity-50 transition-opacity hover:opacity-100"
          title={idea.isFavorite ? "Убрать из избранного" : "В избранное"}
        >
          {idea.isFavorite ? "⭐" : "☆"}
        </button>
      </div>

      <p
        className="mb-3 text-sm leading-relaxed"
        style={{ color: "var(--muted-foreground)" }}
      >
        {idea.description}
      </p>

      <div className="flex flex-wrap gap-2">
        <Tag label="Аудитория" value={idea.targetAudience} />
        <Tag label="Монетизация" value={idea.monetization} />
      </div>

      {idea.rating && (
        <div className="mt-3 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <span
              key={star}
              className="text-sm"
              style={{
                color: star <= idea.rating! ? "var(--warning)" : "var(--muted)",
              }}
            >
              ★
            </span>
          ))}
        </div>
      )}
    </div>
  );
});

const Tag = React.memo(function Tag({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  // Показываем только первые 50 символов
  const short = value.length > 50 ? value.slice(0, 47) + "..." : value;
  return (
    <span
      className="rounded-lg px-2.5 py-1 text-xs"
      style={{
        backgroundColor: "var(--muted)",
        color: "var(--muted-foreground)",
      }}
      title={value}
    >
      <span className="font-medium">{label}:</span> {short}
    </span>
  );
});
