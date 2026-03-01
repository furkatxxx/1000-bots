"use client";

import { use } from "react";
import Link from "next/link";

// Полноэкранный предпросмотр лендинга
export default function LandingPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div className="flex flex-col" style={{ height: "100vh" }}>
      {/* Тулбар */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ backgroundColor: "var(--card)", borderBottom: "1px solid var(--muted)" }}
      >
        <Link
          href={`/ideas/${id}`}
          className="text-sm font-medium"
          style={{ color: "var(--primary)" }}
        >
          ← Назад к идее
        </Link>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Предпросмотр лендинга
        </span>
        <a
          href={`/api/ideas/${id}/landing`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: "var(--primary)", color: "white" }}
        >
          Открыть отдельно ↗
        </a>
      </div>

      {/* iframe с лендингом */}
      <iframe
        src={`/api/ideas/${id}/landing`}
        className="flex-1 w-full"
        style={{ border: "none" }}
        title="Лендинг"
      />
    </div>
  );
}
