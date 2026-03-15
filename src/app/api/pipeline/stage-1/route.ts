import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createOrGetTodayReport, checkHealth, runStage1 } from "@/lib/pipeline";

export const maxDuration = 180;

// Дедлайн: 2026-03-07 12:00 МСК (09:00 UTC)
const LOCK_AFTER = new Date("2026-03-07T09:00:00Z");
const GENERATE_PASSWORD = process.env.GENERATE_PASSWORD || "";

// POST /api/pipeline/stage-1 — сбор трендов + анализ (Opus)
export async function POST(request: NextRequest) {
  // Защита паролем после дедлайна
  let password: string | undefined;
  if (Date.now() > LOCK_AFTER.getTime()) {
    try {
      const body = await request.json();
      password = body?.password;
      if (password !== GENERATE_PASSWORD) {
        return NextResponse.json(
          { success: false, error: "Требуется пароль для генерации", needPassword: true },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, error: "Требуется пароль для генерации", needPassword: true },
        { status: 403 }
      );
    }
  }

  try {
    const settings = await prisma.settings.findUnique({ where: { id: "main" } });
    if (!settings?.anthropicApiKey) {
      return NextResponse.json(
        { success: false, error: "Не указан API-ключ Anthropic. Добавьте его в настройках." },
        { status: 400 }
      );
    }

    // Проверка здоровья источников
    const health = await checkHealth(settings);
    if (!health.ok) {
      return NextResponse.json(
        { success: false, error: health.error, healthCheck: health.healthCheck },
        { status: 503 }
      );
    }

    // Создать или получить отчёт
    const reportResult = await createOrGetTodayReport();
    if ("error" in reportResult) {
      return NextResponse.json({ success: false, error: reportResult.error }, { status: 409 });
    }

    // Запуск этапа 1
    const result = await runStage1(reportResult.reportId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      reportId: result.reportId,
      trendsCount: result.trendsCount,
      filteredCount: result.filteredCount,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Ошибка этапа 1";
    console.error("[Stage-1] Ошибка:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
