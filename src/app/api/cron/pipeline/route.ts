import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { advancePipeline, checkHealth } from "@/lib/pipeline";

export const maxDuration = 180;

// GET /api/cron/pipeline — один этап pipeline за вызов
// Вызывается: Vercel Cron раз в день (кикстартер) + cron-job.org каждые 10 мин
export async function GET(request: NextRequest) {
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

    // Проверка здоровья — только если нет активного generating отчёта
    // (для retry зависших отчётов health-check не нужен)
    const activeReport = await prisma.dailyReport.findFirst({
      where: { status: "generating" },
    });

    if (!activeReport) {
      const health = await checkHealth(settings);
      if (!health.ok) {
        return NextResponse.json({ skipped: true, reason: health.error });
      }
    }

    const result = await advancePipeline();

    console.log(`[Cron Pipeline] ${result.action}: ${result.success ? "OK" : result.error}${result.complete ? " (ГОТОВО)" : ""}`);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Cron Pipeline] Ошибка:", error);
    return NextResponse.json({ error: "Ошибка pipeline" }, { status: 500 });
  }
}
