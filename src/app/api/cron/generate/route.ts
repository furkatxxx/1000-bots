import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createOrGetTodayReport, checkHealth, runFullPipeline } from "@/lib/pipeline";

export const maxDuration = 300;

// GET /api/cron/generate — Vercel Cron вызывает каждый день (8:00 МСК)
export async function GET(request: NextRequest) {
  // Защита: только Vercel Cron или запрос с правильным ключом
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }

  try {
    const settings = await prisma.settings.findUnique({ where: { id: "main" } });

    if (!settings?.anthropicApiKey) {
      return NextResponse.json({ skipped: true, reason: "Нет API-ключа Anthropic" });
    }

    // Проверка здоровья источников
    const health = await checkHealth(settings);
    if (!health.ok) {
      return NextResponse.json({ skipped: true, reason: health.error });
    }

    // Создать или получить отчёт
    const reportResult = await createOrGetTodayReport();
    if ("error" in reportResult) {
      return NextResponse.json({ skipped: true, reason: reportResult.error });
    }

    // Запуск полного pipeline (3 этапа)
    console.log("[Cron] Запускаю автогенерацию отчёта");
    const result = await runFullPipeline(reportResult.reportId);

    if (!result.success) {
      console.error("[Cron] Ошибка pipeline:", result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    console.log(`[Cron] Отчёт создан: ${result.ideasCount} идей (эксперты оценят в 9:00 МСК)`);
    return NextResponse.json({
      success: true,
      ideasCount: result.ideasCount,
      trendsCount: result.trendsCount,
    });
  } catch (error) {
    console.error("[Cron] Ошибка:", error);
    return NextResponse.json({ error: "Ошибка cron-задачи" }, { status: 500 });
  }
}
