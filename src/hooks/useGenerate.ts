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

// Фазы генерации: проверка источников → генерация → готово
export type GeneratePhase = "idle" | "checking" | "generating";

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
    if (phase === "generating") {
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      if (phase === "idle") setElapsed(0);
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
        // Слишком мало источников — отменяем
        setHealthCheck(healthData);

        const failedNames = healthData.results
          .filter((r) => !r.ok)
          .map((r) => r.label)
          .join(", ");

        const msg = `Работают только ${healthData.working} из ${healthData.total} источников. Не работают: ${failedNames}`;
        setError(msg);

        // Дублируем в Telegram (POST вместо GET)
        try {
          await fetch("/api/health/sources", { method: "POST" });
        } catch {
          // Не ломаем из-за Telegram
        }

        return { success: false, error: msg, healthCheck: healthData };
      }

      // ═══════════════════════════════════════════
      // ФАЗА 2: Генерируем отчёт
      // ═══════════════════════════════════════════
      setPhase("generating");

      const fetchOpts: RequestInit = {
        method: "POST",
        ...(password ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        } : {}),
      };
      const res = await fetch("/api/reports", fetchOpts);
      const data = await res.json();

      if (!res.ok || !data.success) {
        const msg = data.error || "Ошибка генерации";
        setError(msg);

        if (data.needPassword) {
          return { success: false, error: msg, needPassword: true };
        }

        if (data.healthCheck) {
          setHealthCheck(data.healthCheck);
        }

        return { success: false, error: msg, healthCheck: data.healthCheck };
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
