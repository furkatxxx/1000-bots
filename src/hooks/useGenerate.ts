"use client";

import { useState, useEffect, useRef } from "react";

// Результат проверки одного источника (от /api/health/sources)
export interface SourceCheckDTO {
  id: string;
  label: string;
  ok: boolean;
  items: number;
  error?: string;
  ms: number;
}

// Полный результат проверки здоровья
export interface HealthCheckDTO {
  ok: boolean;
  total: number;
  working: number;
  failed: number;
  results: SourceCheckDTO[];
  checkedAt: string;
}

interface GenerateResult {
  success: boolean;
  report?: {
    id: string;
    ideasCount: number;
    trendsCount: number;
  };
  error?: string;
  needPassword?: boolean;
  healthCheck?: HealthCheckDTO;
}

// Фазы генерации: проверка → 3 этапа pipeline → готово
export type GeneratePhase = "idle" | "checking" | "stage-1" | "stage-2" | "stage-3";

// Минимальный процент работающих источников (синхронизирован с бэкендом)
const MIN_HEALTHY_PERCENT = 60;

export function useGenerate() {
  const [generating, setGenerating] = useState(false);
  const [phase, setPhase] = useState<GeneratePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [healthCheck, setHealthCheck] = useState<HealthCheckDTO | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Таймер прошедшего времени — тикает каждую секунду пока идёт генерация
  useEffect(() => {
    if (phase !== "idle") {
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => clearInterval(timerRef.current);
  }, [phase]);

  async function generate(password?: string): Promise<GenerateResult | null> {
    setGenerating(true);
    setError(null);
    setHealthCheck(null);

    try {
      // ═══════════════════════════════════════════
      // ФАЗА 1: Проверяем источники данных
      // ═══════════════════════════════════════════
      setPhase("checking");

      const healthRes = await fetch("/api/health/sources");
      const healthData: HealthCheckDTO = await healthRes.json();

      const healthyPercent =
        healthData.total > 0
          ? (healthData.working / healthData.total) * 100
          : 0;

      if (healthyPercent < MIN_HEALTHY_PERCENT) {
        setHealthCheck(healthData);

        const failedNames = healthData.results
          .filter((r) => !r.ok)
          .map((r) => r.label)
          .join(", ");

        const msg = `Работают только ${healthData.working} из ${healthData.total} источников. Не работают: ${failedNames}`;
        setError(msg);

        try {
          await fetch("/api/health/sources", { method: "POST" });
        } catch {
          // Не ломаем из-за Telegram
        }

        return { success: false, error: msg, healthCheck: healthData };
      }

      // ═══════════════════════════════════════════
      // ЭТАП 1: Сбор трендов + анализ болей (Opus)
      // ═══════════════════════════════════════════
      setPhase("stage-1");

      const stage1Body: Record<string, string> = {};
      if (password) stage1Body.password = password;

      const s1Res = await fetch("/api/pipeline/stage-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stage1Body),
      });
      const s1Data = await s1Res.json();

      if (!s1Res.ok || !s1Data.success) {
        if (s1Data.needPassword) {
          return { success: false, error: s1Data.error, needPassword: true };
        }
        if (s1Data.healthCheck) {
          setHealthCheck(s1Data.healthCheck);
        }
        setError(s1Data.error || "Ошибка этапа 1");
        return { success: false, error: s1Data.error, healthCheck: s1Data.healthCheck };
      }

      const reportId = s1Data.reportId;

      // ═══════════════════════════════════════════
      // ЭТАП 2: Генерация идей (Opus) + дедуп (Sonnet)
      // ═══════════════════════════════════════════
      setPhase("stage-2");

      const s2Res = await fetch("/api/pipeline/stage-2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId }),
      });
      const s2Data = await s2Res.json();

      if (!s2Res.ok || !s2Data.success) {
        setError(s2Data.error || "Ошибка этапа 2");
        return { success: false, error: s2Data.error };
      }

      // ═══════════════════════════════════════════
      // ЭТАП 3: Валидация (Opus) + финализация
      // ═══════════════════════════════════════════
      setPhase("stage-3");

      const s3Res = await fetch("/api/pipeline/stage-3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId }),
      });
      const s3Data = await s3Res.json();

      if (!s3Res.ok || !s3Data.success) {
        setError(s3Data.error || "Ошибка этапа 3");
        return { success: false, error: s3Data.error };
      }

      return {
        success: true,
        report: {
          id: reportId,
          ideasCount: s3Data.validCount,
          trendsCount: s1Data.trendsCount,
        },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка сети";
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setGenerating(false);
      setPhase("idle");
    }
  }

  // Сброс ошибки (например, когда пользователь хочет попробовать снова)
  function resetError() {
    setError(null);
    setHealthCheck(null);
  }

  return { generate, generating, phase, elapsed, error, healthCheck, resetError };
}
