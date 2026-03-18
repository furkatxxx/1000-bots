import { prisma } from "@/lib/db";
import { collectAll } from "@/lib/collectors";
import { generateIdeas, filterTrends, semanticDedup, analyzeTrends, validateIdeas } from "@/lib/ai-brain";
import {
  runHealthCheck,
  sendHealthTelegramAlert,
  isHealthyEnough,
  SOURCE_LABELS,
} from "@/lib/health-check";
import { parsePresets } from "@/lib/focus-presets";

// ═══════════════════════════════════════════════════
// Типы результатов каждого этапа
// ═══════════════════════════════════════════════════

export interface StageResult {
  success: boolean;
  error?: string;
}

export interface Stage1Result extends StageResult {
  reportId: string;
  trendsCount: number;
  filteredCount: number;
  tokensIn: number;
  tokensOut: number;
}

export interface Stage2Result extends StageResult {
  ideasCount: number;
  tokensIn: number;
  tokensOut: number;
}

export interface Stage3Result extends StageResult {
  validCount: number;
  removedCount: number;
  tokensIn: number;
  tokensOut: number;
}

export interface HealthCheckResult {
  ok: boolean;
  healthCheck?: ReturnType<typeof runHealthCheck> extends Promise<infer T> ? T : never;
  error?: string;
}

// ═══════════════════════════════════════════════════
// createOrGetTodayReport — создать или получить отчёт
// ═══════════════════════════════════════════════════

export async function createOrGetTodayReport(): Promise<{ reportId: string; isNew: boolean } | { error: string }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await prisma.dailyReport.findUnique({ where: { date: today } });

  if (existing) {
    // Отчёт уже готов
    if (existing.status === "complete") {
      return { error: "Отчёт за сегодня уже есть" };
    }

    // Генерация идёт — проверяем не зависла ли
    if (existing.status === "generating") {
      const stuckThreshold = 10 * 60 * 1000; // 10 мин
      const createdTime = existing.generatedAt?.getTime() || existing.createdAt.getTime();
      const isStuck = Date.now() - createdTime > stuckThreshold;

      if (!isStuck) {
        // Можно продолжить с текущего этапа (retry)
        if (existing.pipelineStage?.endsWith("-done")) {
          return { reportId: existing.id, isNew: false };
        }
        return { error: "Отчёт уже генерируется. Подождите (~3-5 минут)." };
      }
      console.warn("[Pipeline] Генерация зависла, перезапуск...");
    }

    // failed или stuck — перезапускаем
    await prisma.dailyReport.update({
      where: { id: existing.id },
      data: { status: "generating", error: null, pipelineStage: null },
    });
    return { reportId: existing.id, isNew: false };
  }

  // Новый отчёт
  const report = await prisma.dailyReport.create({
    data: { date: today, status: "generating" },
  });
  return { reportId: report.id, isNew: true };
}

// ═══════════════════════════════════════════════════
// checkHealth — проверка здоровья источников
// ═══════════════════════════════════════════════════

export async function checkHealth(settings: {
  googleTrendsGeo: string;
  newsApiKey: string | null;
  vkServiceToken: string | null;
  wordstatToken: string | null;
  telegramBotToken: string | null;
  telegramChatId: string | null;
}): Promise<HealthCheckResult> {
  const healthResult = await runHealthCheck({
    googleTrendsGeo: settings.googleTrendsGeo || "US",
    newsApiKey: settings.newsApiKey,
    vkServiceToken: settings.vkServiceToken,
    wordstatToken: settings.wordstatToken,
  });

  if (!isHealthyEnough(healthResult)) {
    const failedNames = healthResult.results
      .filter((r) => !r.ok)
      .map((r) => r.label)
      .join(", ");

    if (settings.telegramBotToken && settings.telegramChatId) {
      await sendHealthTelegramAlert(settings.telegramBotToken, settings.telegramChatId, healthResult, "pre-report");
    }

    return {
      ok: false,
      healthCheck: healthResult,
      error: `Мало рабочих источников. Не работают: ${failedNames}`,
    };
  }

  return { ok: true, healthCheck: healthResult };
}

// ═══════════════════════════════════════════════════
// ЭТАП 1: Сбор трендов + анализ болей (Opus)
// ═══════════════════════════════════════════════════

export async function runStage1(reportId: string): Promise<Stage1Result> {
  const settings = await prisma.settings.findUnique({ where: { id: "main" } });
  if (!settings?.anthropicApiKey) {
    return { success: false, error: "Нет API-ключа Anthropic", reportId, trendsCount: 0, filteredCount: 0, tokensIn: 0, tokensOut: 0 };
  }

  await prisma.dailyReport.update({
    where: { id: reportId },
    data: { pipelineStage: "stage-1" },
  });

  const sources = await prisma.trendSource.findMany({ where: { enabled: true } });
  const enabledSources = sources.map((s) => s.name);

  // Сбор трендов
  console.log("[Pipeline] Этап 1: Сбор трендов...");
  const trendItems = await collectAll({
    newsApiKey: settings.newsApiKey || undefined,
    wordstatToken: settings.wordstatToken || undefined,
    googleTrendsGeo: settings.googleTrendsGeo || "US",
    vkServiceToken: settings.vkServiceToken || undefined,
    enabledSources: enabledSources.length > 0 ? enabledSources : undefined,
  });

  if (trendItems.length === 0) {
    throw new Error("Не удалось собрать тренды ни из одного источника.");
  }

  const activeSourceIds = new Set(trendItems.map((t) => t.sourceId));
  const silentSources = enabledSources.filter((s) => !activeSourceIds.has(s));
  if (silentSources.length > 0) {
    console.warn(`[Pipeline] Источники без данных: ${silentSources.map((s) => SOURCE_LABELS[s] || s).join(", ")}`);
  }

  // Сохраняем тренды
  await prisma.trendData.createMany({
    data: trendItems.map((item) => ({
      sourceId: item.sourceId,
      title: item.title,
      url: item.url,
      score: item.score,
      summary: item.summary,
      category: item.category,
      metadata: JSON.stringify(item.metadata),
    })),
  });

  // Фильтрация мусора
  const trendData = trendItems.map((t) => ({
    title: t.title,
    score: t.score,
    source: t.sourceId,
    category: t.category || undefined,
    summary: t.summary || undefined,
    originalTitle: (t.metadata?.originalTitle as string) || undefined,
    metadata: t.metadata || undefined,
  }));

  const filtered = filterTrends(trendData);
  console.log(`[Pipeline] Фильтр: ${trendData.length} → ${filtered.length}`);

  if (filtered.length < 5) {
    console.warn(`[Pipeline] Мало трендов после фильтра (${filtered.length}), используем все`);
  }
  const trendsForAI = filtered.length >= 5 ? filtered : trendData;

  // Анализ трендов — Opus
  console.log("[Pipeline] Анализ трендов (Opus)...");
  const analysisResult = await analyzeTrends({
    trends: trendsForAI,
    apiKey: settings.anthropicApiKey,
  });
  console.log("[Pipeline] Анализ завершён");

  // Сохраняем промежуточные данные в БД
  await prisma.dailyReport.update({
    where: { id: reportId },
    data: {
      pipelineStage: "stage-1-done",
      trendsCount: trendItems.length,
      trendAnalysis: analysisResult.analysis,
      filteredTrendsJson: JSON.stringify(trendsForAI),
      aiTokensIn: analysisResult.tokensIn,
      aiTokensOut: analysisResult.tokensOut,
    },
  });

  return {
    success: true,
    reportId,
    trendsCount: trendItems.length,
    filteredCount: trendsForAI.length,
    tokensIn: analysisResult.tokensIn,
    tokensOut: analysisResult.tokensOut,
  };
}

// ═══════════════════════════════════════════════════
// ЭТАП 2: Генерация идей (Opus) + дедуп (Sonnet)
// ═══════════════════════════════════════════════════

export async function runStage2(reportId: string): Promise<Stage2Result> {
  const report = await prisma.dailyReport.findUnique({ where: { id: reportId } });
  if (!report) {
    return { success: false, error: "Отчёт не найден", ideasCount: 0, tokensIn: 0, tokensOut: 0 };
  }
  if (report.pipelineStage !== "stage-1-done") {
    return { success: false, error: `Этап 1 не завершён (текущий: ${report.pipelineStage})`, ideasCount: 0, tokensIn: 0, tokensOut: 0 };
  }
  if (!report.trendAnalysis || !report.filteredTrendsJson) {
    return { success: false, error: "Нет данных от этапа 1", ideasCount: 0, tokensIn: 0, tokensOut: 0 };
  }

  const settings = await prisma.settings.findUnique({ where: { id: "main" } });
  if (!settings?.anthropicApiKey) {
    return { success: false, error: "Нет API-ключа Anthropic", ideasCount: 0, tokensIn: 0, tokensOut: 0 };
  }

  await prisma.dailyReport.update({
    where: { id: reportId },
    data: { pipelineStage: "stage-2" },
  });

  const trendsForAI = JSON.parse(report.filteredTrendsJson);
  const generationModel = "claude-opus-4-6";

  // Дедупликация: прошлые идеи
  const recentIdeas = await prisma.businessIdea.findMany({
    where: { report: { id: { not: reportId }, status: "complete" } },
    select: { name: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  // Генерация идей — Opus
  const focusPresets = parsePresets(settings.focusPresets);
  console.log(`[Pipeline] Этап 2: Генерация 7 идей (${generationModel}, фокус: ${focusPresets.length > 0 ? focusPresets.join("+") : "универсальный"})...`);

  const genResult = await generateIdeas({
    trends: trendsForAI,
    maxIdeas: 5,
    model: generationModel,
    apiKey: settings.anthropicApiKey,
    previousIdeas: recentIdeas.map((i) => i.name),
    trendAnalysis: report.trendAnalysis,
    focusPresets,
  });
  console.log(`[Pipeline] Сгенерировано: ${genResult.ideas.length} идей`);

  let totalTokensIn = genResult.tokensIn;
  let totalTokensOut = genResult.tokensOut;

  // Семантическая дедупликация — Sonnet
  console.log("[Pipeline] Дедупликация (Sonnet)...");
  const dedupResult = await semanticDedup({
    ideas: genResult.ideas,
    apiKey: settings.anthropicApiKey,
    model: "claude-sonnet-4-6",
  });
  totalTokensIn += dedupResult.tokensIn;
  totalTokensOut += dedupResult.tokensOut;
  console.log(`[Pipeline] После дедупа: ${dedupResult.unique.length} уникальных`);

  // Сохраняем идеи в БД
  await prisma.businessIdea.deleteMany({ where: { reportId } });
  await prisma.businessIdea.createMany({
    data: dedupResult.unique.map((idea) => ({
      reportId,
      name: idea.name,
      emoji: idea.emoji,
      description: idea.description,
      targetAudience: idea.targetAudience,
      monetization: idea.monetization,
      startupCost: idea.startupCost,
      competitionLevel: idea.competitionLevel,
      trendBacking: idea.trendBacking,
      actionPlan: idea.actionPlan,
      claudeCodeReady: idea.claudeCodeReady,
      difficulty: idea.difficulty,
      successChance: idea.successChance,
      estimatedRevenue: idea.estimatedRevenue,
      timeToLaunch: idea.timeToLaunch,
      market: idea.market,
      marketScenarios: JSON.stringify(idea.marketScenarios),
    })),
  });

  await prisma.dailyReport.update({
    where: { id: reportId },
    data: {
      pipelineStage: "stage-2-done",
      ideasCount: dedupResult.unique.length,
      aiModel: generationModel,
      aiTokensIn: (report.aiTokensIn || 0) + totalTokensIn,
      aiTokensOut: (report.aiTokensOut || 0) + totalTokensOut,
    },
  });

  return {
    success: true,
    ideasCount: dedupResult.unique.length,
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
  };
}

// ═══════════════════════════════════════════════════
// ЭТАП 3: Валидация (Opus) + финализация
// ═══════════════════════════════════════════════════

export async function runStage3(reportId: string): Promise<Stage3Result> {
  const report = await prisma.dailyReport.findUnique({ where: { id: reportId } });
  if (!report) {
    return { success: false, error: "Отчёт не найден", validCount: 0, removedCount: 0, tokensIn: 0, tokensOut: 0 };
  }
  if (report.pipelineStage !== "stage-2-done") {
    return { success: false, error: `Этап 2 не завершён (текущий: ${report.pipelineStage})`, validCount: 0, removedCount: 0, tokensIn: 0, tokensOut: 0 };
  }

  const settings = await prisma.settings.findUnique({ where: { id: "main" } });
  if (!settings?.anthropicApiKey) {
    return { success: false, error: "Нет API-ключа Anthropic", validCount: 0, removedCount: 0, tokensIn: 0, tokensOut: 0 };
  }

  await prisma.dailyReport.update({
    where: { id: reportId },
    data: { pipelineStage: "stage-3" },
  });

  // Читаем идеи из БД
  const ideas = await prisma.businessIdea.findMany({
    where: { reportId },
    select: {
      id: true, name: true, emoji: true, description: true,
      targetAudience: true, monetization: true, startupCost: true,
      competitionLevel: true, trendBacking: true, actionPlan: true,
      claudeCodeReady: true, difficulty: true, successChance: true,
      estimatedRevenue: true, timeToLaunch: true, market: true,
      marketScenarios: true,
    },
  });

  // Валидация — Opus
  console.log("[Pipeline] Этап 3: Валидация (Opus)...");
  const ideasForValidation = ideas.map((i) => ({
    ...i,
    successChance: i.successChance ?? 0,
    estimatedRevenue: i.estimatedRevenue ?? "",
    timeToLaunch: i.timeToLaunch ?? "",
    market: (i.market as "russia" | "global" | "both") || "both",
    marketScenarios: i.marketScenarios ? JSON.parse(i.marketScenarios) : { russia: { revenue: "", channels: "", audience: "", advantages: "" }, global: { revenue: "", channels: "", audience: "", advantages: "" } },
  }));

  const validationResult = await validateIdeas({
    ideas: ideasForValidation,
    apiKey: settings.anthropicApiKey,
  });
  console.log(`[Pipeline] После валидации: ${validationResult.valid.length} реалистичных (убрано ${validationResult.removed})`);

  // Удаляем отклонённые идеи
  const validNames = new Set(validationResult.valid.map((i) => i.name));
  const toDelete = ideas.filter((i) => !validNames.has(i.name)).map((i) => i.id);
  if (toDelete.length > 0) {
    await prisma.businessIdea.deleteMany({
      where: { id: { in: toDelete } },
    });
  }

  // Финализация
  await prisma.dailyReport.update({
    where: { id: reportId },
    data: {
      status: "complete",
      pipelineStage: null,
      ideasCount: validationResult.valid.length,
      aiTokensIn: (report.aiTokensIn || 0) + validationResult.tokensIn,
      aiTokensOut: (report.aiTokensOut || 0) + validationResult.tokensOut,
      generatedAt: new Date(),
      // Очищаем промежуточные данные
      trendAnalysis: null,
      filteredTrendsJson: null,
    },
  });

  console.log(`[Pipeline] ═══ ГОТОВО ═══ ${validationResult.valid.length} идей (эксперты оценят в 9:00 МСК)`);

  return {
    success: true,
    validCount: validationResult.valid.length,
    removedCount: validationResult.removed,
    tokensIn: validationResult.tokensIn,
    tokensOut: validationResult.tokensOut,
  };
}

// ═══════════════════════════════════════════════════
// runFullPipeline — запуск всех 3 этапов (для крона)
// ═══════════════════════════════════════════════════

export async function runFullPipeline(reportId: string): Promise<{ success: boolean; error?: string; ideasCount?: number; trendsCount?: number }> {
  // Этап 1
  const s1 = await runStage1(reportId);
  if (!s1.success) return { success: false, error: `Этап 1: ${s1.error}` };

  // Этап 2
  const s2 = await runStage2(reportId);
  if (!s2.success) return { success: false, error: `Этап 2: ${s2.error}` };

  // Этап 3
  const s3 = await runStage3(reportId);
  if (!s3.success) return { success: false, error: `Этап 3: ${s3.error}` };

  return {
    success: true,
    ideasCount: s3.validCount,
    trendsCount: s1.trendsCount,
  };
}

// ═══════════════════════════════════════════════════
// findActiveReport — ищет ЛЮБОЙ generating отчёт
// ═══════════════════════════════════════════════════

const STUCK_THRESHOLD_MS = 15 * 60 * 1000; // 15 минут

export async function findActiveReport(): Promise<{
  reportId: string;
  pipelineStage: string | null;
  isStuck: boolean;
  hasIdeas: boolean;
} | null> {
  const report = await prisma.dailyReport.findFirst({
    where: { status: "generating" },
    orderBy: { date: "desc" },
    include: { _count: { select: { ideas: true } } },
  });

  if (!report) return null;

  const lastActivity = report.updatedAt || report.createdAt;
  const isStuck = Date.now() - lastActivity.getTime() > STUCK_THRESHOLD_MS;

  return {
    reportId: report.id,
    pipelineStage: report.pipelineStage,
    isStuck,
    hasIdeas: report._count.ideas > 0,
  };
}

// ═══════════════════════════════════════════════════
// advancePipeline — один этап за вызов
// ═══════════════════════════════════════════════════

export async function advancePipeline(): Promise<{
  action: string;
  success: boolean;
  error?: string;
  complete?: boolean;
  reportId?: string;
}> {
  // 1. Ищем активный generating отчёт
  const active = await findActiveReport();

  if (active) {
    const { reportId, pipelineStage, isStuck, hasIdeas } = active;

    // Если завис и уже есть идеи — просто завершаем (этапы 1+2 прошли)
    if (isStuck && hasIdeas && (pipelineStage === "stage-3" || pipelineStage === "stage-2-done")) {
      // Попробуем завершить stage-3
      const report = await prisma.dailyReport.findUnique({ where: { id: reportId } });
      if (report && !report.trendAnalysis) {
        // Промежуточные данные очищены — нельзя повторить валидацию
        // Просто помечаем как complete (идеи уже есть)
        await prisma.dailyReport.update({
          where: { id: reportId },
          data: {
            status: "complete",
            pipelineStage: null,
            generatedAt: new Date(),
            trendAnalysis: null,
            filteredTrendsJson: null,
          },
        });
        console.log(`[Pipeline Advance] Отчёт ${reportId} — завершён принудительно (идеи есть, валидация не нужна)`);
        return { action: "force-complete", success: true, complete: true, reportId };
      }
    }

    // Если завис — откатываем к последнему завершённому этапу
    if (isStuck) {
      const resetStage = pipelineStage === "stage-1" ? null
        : pipelineStage === "stage-2" ? "stage-1-done"
        : pipelineStage === "stage-3" ? "stage-2-done"
        : pipelineStage; // уже "-done", не трогаем

      if (resetStage !== pipelineStage) {
        await prisma.dailyReport.update({
          where: { id: reportId },
          data: { pipelineStage: resetStage },
        });
        console.log(`[Pipeline Advance] Откат ${pipelineStage} → ${resetStage}`);
      }

      return await runNextStage(reportId, resetStage);
    }

    // Не завис — продвигаем
    return await runNextStage(reportId, pipelineStage);
  }

  // 2. Нет активного отчёта — создаём за сегодня
  const reportResult = await createOrGetTodayReport();
  if ("error" in reportResult) {
    return { action: "skip", success: true, error: reportResult.error };
  }

  return await runNextStage(reportResult.reportId, null);
}

async function runNextStage(reportId: string, stage: string | null): Promise<{
  action: string;
  success: boolean;
  error?: string;
  complete?: boolean;
  reportId?: string;
}> {
  try {
    if (!stage || stage === "stage-1") {
      console.log(`[Pipeline Advance] Запуск этапа 1...`);
      const r = await runStage1(reportId);
      return { action: "stage-1", success: r.success, error: r.error, reportId };
    }

    if (stage === "stage-1-done") {
      console.log(`[Pipeline Advance] Запуск этапа 2...`);
      const r = await runStage2(reportId);
      return { action: "stage-2", success: r.success, error: r.error, reportId };
    }

    if (stage === "stage-2-done") {
      console.log(`[Pipeline Advance] Запуск этапа 3...`);
      const r = await runStage3(reportId);
      return { action: "stage-3", success: r.success, error: r.error, complete: r.success, reportId };
    }

    return { action: "none", success: true, complete: true, reportId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
    console.error(`[Pipeline Advance] Ошибка:`, err);
    return { action: stage || "unknown", success: false, error: msg, reportId };
  }
}
