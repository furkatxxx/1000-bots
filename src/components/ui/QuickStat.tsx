"use client";

import React from "react";

interface QuickStatProps {
  label: string;
  value: string | number;
  icon: string;
  trend?: string;
}

export const QuickStat = React.memo(function QuickStat({
  label,
  value,
  icon,
  trend,
}: QuickStatProps) {
  return (
    <div
      className="rounded-2xl p-5 transition-all duration-200 hover:scale-[1.02]"
      style={{
        backgroundColor: "var(--card)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        {trend && (
          <span
            className="text-xs font-medium"
            style={{ color: "var(--success)" }}
          >
            {trend}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      <div
        className="mt-1 text-sm"
        style={{ color: "var(--muted-foreground)" }}
      >
        {label}
      </div>
    </div>
  );
});
