"use client";

import React from "react";

export const SkeletonCard = React.memo(function SkeletonCard() {
  return (
    <div
      className="animate-skeleton-pulse rounded-2xl p-5"
      style={{
        backgroundColor: "var(--card)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="mb-3 flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-xl"
          style={{ backgroundColor: "var(--muted)" }}
        />
        <div className="flex-1">
          <div
            className="mb-2 h-4 w-3/4 rounded"
            style={{ backgroundColor: "var(--muted)" }}
          />
          <div
            className="h-3 w-1/2 rounded"
            style={{ backgroundColor: "var(--muted)" }}
          />
        </div>
      </div>
      <div
        className="mb-2 h-3 w-full rounded"
        style={{ backgroundColor: "var(--muted)" }}
      />
      <div
        className="h-3 w-2/3 rounded"
        style={{ backgroundColor: "var(--muted)" }}
      />
    </div>
  );
});
