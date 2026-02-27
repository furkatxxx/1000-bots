"use client";

import { useState } from "react";

interface GenerateResult {
  success: boolean;
  report?: {
    id: string;
    ideasCount: number;
    trendsCount: number;
  };
  error?: string;
}

export function useGenerate() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(): Promise<GenerateResult | null> {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", { method: "POST" });
      const data = await res.json();

      if (!res.ok || !data.success) {
        const msg = data.error || "Ошибка генерации";
        setError(msg);
        return { success: false, error: msg };
      }

      return {
        success: true,
        report: {
          id: data.report.id,
          ideasCount: data.report.ideasCount,
          trendsCount: data.report.trendsCount,
        },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка сети";
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setGenerating(false);
    }
  }

  return { generate, generating, error };
}
