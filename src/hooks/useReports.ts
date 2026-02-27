"use client";

import { useState, useEffect, useCallback } from "react";
import type { ReportDTO } from "@/lib/types";

export function useReports() {
  const [reports, setReports] = useState<ReportDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports");
      if (!res.ok) throw new Error("Ошибка загрузки отчётов");
      const data = await res.json();
      setReports(data.reports);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Неизвестная ошибка");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  return { reports, loading, error, refetch: fetch_ };
}
