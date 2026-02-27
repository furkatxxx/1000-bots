"use client";

import { useState, useEffect, useCallback } from "react";
import type { IdeaDTO } from "@/lib/types";

interface ReportDetail {
  id: string;
  date: string;
  status: string;
  trendsCount: number;
  ideasCount: number;
  aiModel: string | null;
  aiTokensIn: number | null;
  aiTokensOut: number | null;
  error: string | null;
  generatedAt: string | null;
  createdAt: string;
  ideas: IdeaDTO[];
}

export function useReport(id: string) {
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${id}`);
      if (!res.ok) throw new Error("Отчёт не найден");
      const data = await res.json();
      setReport(data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Неизвестная ошибка");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  return { report, loading, error, refetch: fetch_ };
}
