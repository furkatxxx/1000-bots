import { prisma } from "@/lib/db";
import { collectAll } from "@/lib/collectors";
import { generateIdeas, filterTrends, semanticDedup, analyzeTrends, validateIdeas, generateConcepts, deepDiveIdea } from "@/lib/ai-brain";
import type { RawConcept } from "@/lib/ai-brain";
import {
  runHealthCheck,
  sendHealthTelegramAlert,
  isHealthyEnough,
  SOURCE_LABELS,
} from "@/lib/health-check";
import { parsePresets } from "@/lib/focus-presets";
import { buildTasteProfile } from "@/lib/taste-profile";

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
// ЭТАП 2: Генерация концептов (Opus) — грубые идеи
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

  // Прошлые идеи для дедупликации
  const recentIdeas = await prisma.businessIdea.findMany({
    where: { report: { id: { not: reportId }, status: "complete" } },
    select: { name: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  // Профиль вкуса основателя
  const tasteProfile = await buildTasteProfile();
  if (tasteProfile.promptBlock) {
    console.log(`[Pipeline] Профиль вкуса: ${tasteProfile.totalFeedback} оценок → встроен в промпт`);
  }

  // Генерация 7 грубых концептов — Opus
  console.log(`[Pipeline] Этап 2: Генерация концептов (Opus)...`);
  const conceptResult = await generateConcepts({
    trends: trendsForAI,
    apiKey: settings.anthropicApiKey,
    previousIdeas: recentIdeas.map((i) => i.name),
    trendAnalysis: report.trendAnalysis,
    tasteProfileBlock: tasteProfile.promptBlock || undefined,
  });
  console.log(`[Pipeline] Сгенерировано ${conceptResult.concepts.length} концептов`);

  // Сохраняем концепты в filteredTrendsJson (перезаписываем — тренды больше не нужны)
  await prisma.dailyReport.update({
    where: { id: reportId },
    data: {
      pipelineStage: "stage-2-concepts-done",
      filteredTrendsJson: JSON.stringify(conceptResult.concepts),
      aiTokensIn: (report.aiTokensIn || 0) + conceptResult.tokensIn,
      aiTokensOut: (report.aiTokensOut || 0) + conceptResult.tokensOut,
    },
  });

  // Удаляем старые идеи если были
  await prisma.businessIdea.deleteMany({ where: { reportId } });

  return {
    success: true,
    ideasCount: conceptResult.concepts.length,
    tokensIn: conceptResult.tokensIn,
    tokensOut: conceptResult.tokensOut,
  };
}

// ═══════════════════════════════════════════════════
// ЭТАП 2-DEEP: Глубокий анализ одного концепта (Opus)
// Вызывается несколько раз — по одному концепту за вызов
// ═══════════════════════════════════════════════════

export async function runStage2Deep(reportId: string): Promise<Stage2Result> {
  const report = await prisma.dailyReport.findUnique({ where: { id: reportId } });
  if (!report) {
    return { success: false, error: "Отчёт не найден", ideasCount: 0, tokensIn: 0, tokensOut: 0 };
  }
  if (!report.filteredTrendsJson) {
    return { success: false, error: "Нет концептов для анализа", ideasCount: 0, tokensIn: 0, tokensOut: 0 };
  }

  const settings = await prisma.settings.findUnique({ where: { id: "main" } });
  if (!settings?.anthropicApiKey) {
    return { success: false, error: "Нет API-ключа Anthropic", ideasCount: 0, tokensIn: 0, tokensOut: 0 };
  }

  await prisma.dailyReport.update({
    where: { id: reportId },
    data: { pipelineStage: "stage-2-deep" },
  });

  const concepts: RawConcept[] = JSON.parse(report.filteredTrendsJson);

  // Какие концепты уже обработаны?
  const existingIdeas = await prisma.businessIdea.findMany({
    where: { reportId },
    select: { name: true },
  });
  const processedNames = new Set(existingIdeas.map((i) => i.name));

  // Находим первый необработанный концепт
  const nextConcept = concepts.find((c) => !processedNames.has(c.name));

  if (!nextConcept) {
    // Все концепты обработаны
    const finalCount = existingIdeas.length;
    await prisma.dailyReport.update({
      where: { id: reportId },
      data: {
        pipelineStage: "stage-2-done",
        ideasCount: finalCount,
        aiModel: "claude-opus-4-6",
      },
    });
    console.log(`[Pipeline] Все концепты обработаны. Итого: ${finalCount} идей`);
    return { success: true, ideasCount: finalCount, tokensIn: 0, tokensOut: 0 };
  }

  // Глубокий анализ одного концепта
  const conceptIndex = concepts.indexOf(nextConcept) + 1;
  console.log(`[Pipeline] Deep dive ${conceptIndex}/${concepts.length}: "${nextConcept.name}"...`);

  const diveResult = await deepDiveIdea({
    concept: nextConcept,
    apiKey: settings.anthropicApiKey,
  });

  if (diveResult.result) {
    // Идея прошла проверку — сохраняем (name = оригинал концепта для трекинга)
    await prisma.businessIdea.create({
      data: {
        reportId,
        name: nextConcept.name,
        emoji: diveResult.result.emoji,
        description: diveResult.result.description,
        targetAudience: diveResult.result.targetAudience,
        monetization: diveResult.result.monetization,
        startupCost: diveResult.result.startupCost,
        competitionLevel: diveResult.result.competitionLevel,
        trendBacking: diveResult.result.trendBacking,
        actionPlan: diveResult.result.actionPlan,
        claudeCodeReady: diveResult.result.claudeCodeReady,
        difficulty: diveResult.result.difficulty,
        successChance: diveResult.result.successChance,
        estimatedRevenue: diveResult.result.estimatedRevenue,
        timeToLaunch: diveResult.result.timeToLaunch,
        market: diveResult.result.market,
        marketScenarios: JSON.stringify(diveResult.result.marketScenarios),
      },
    });
    console.log(`[Pipeline] "${nextConcept.name}" → ${diveResult.verdict} ✅`);
  } else {
    // Идея убита — сохраняем как заглушку чтобы не обрабатывать повторно
    await prisma.businessIdea.create({
      data: {
        reportId,
        name: nextConcept.name,
        emoji: "❌",
        description: `ОТКЛОНЕНО: ${diveResult.killReason || "не прошла глубокий анализ"}`,
        targetAudience: nextConcept.who,
        monetization: "",
        startupCost: "low",
        competitionLevel: "medium",
        trendBacking: nextConcept.whyNow,
        actionPlan: "KILLED",
        claudeCodeReady: false,
        difficulty: "hard",
        successChance: 0,
        estimatedRevenue: "",
        timeToLaunch: "",
        market: nextConcept.market,
      },
    });
    console.log(`[Pipeline] "${nextConcept.name}" → kill (${diveResult.killReason}) ❌`);
  }

  // Обновляем токены
  await prisma.dailyReport.update({
    where: { id: reportId },
    data: {
      pipelineStage: "stage-2-concepts-done", // Остаёмся в этом статусе пока не все обработаны
      aiTokensIn: (report.aiTokensIn || 0) + diveResult.tokensIn,
      aiTokensOut: (report.aiTokensOut || 0) + diveResult.tokensOut,
    },
  });

  // Проверяем: остались ли ещё необработанные?
  const remainingCount = concepts.length - processedNames.size - 1;
  if (remainingCount <= 0) {
    // Все обработаны — переходим к stage-2-done
    const allIdeas = await prisma.businessIdea.findMany({
      where: { reportId, actionPlan: { not: "KILLED" } },
    });
    await prisma.dailyReport.update({
      where: { id: reportId },
      data: {
        pipelineStage: "stage-2-done",
        ideasCount: allIdeas.length,
        aiModel: "claude-opus-4-6",
      },
    });
    console.log(`[Pipeline] Все концепты обработаны. Идей: ${allIdeas.length}`);
  }

  return {
    success: true,
    ideasCount: 1,
    tokensIn: diveResult.tokensIn,
    tokensOut: diveResult.tokensOut,
  };
}

// ═══════════════════════════════════════════════════
// ЭТАП 3: Финализация — очистка killed-идей + завершение
// (Валидация теперь происходит в deep dive)
// ═══════════════════════════════════════════════════

export async function runStage3(reportId: string): Promise<Stage3Result> {
  const report = await prisma.dailyReport.findUnique({ where: { id: reportId } });
  if (!report) {
    return { success: false, error: "Отчёт не найден", validCount: 0, removedCount: 0, tokensIn: 0, tokensOut: 0 };
  }
  if (report.pipelineStage !== "stage-2-done") {
    return { success: false, error: `Этап 2 не завершён (текущий: ${report.pipelineStage})`, validCount: 0, removedCount: 0, tokensIn: 0, tokensOut: 0 };
  }

  await prisma.dailyReport.update({
    where: { id: reportId },
    data: { pipelineStage: "stage-3" },
  });

  // Удаляем killed-идеи (actionPlan === "KILLED")
  const killed = await prisma.businessIdea.deleteMany({
    where: { reportId, actionPlan: "KILLED" },
  });
  console.log(`[Pipeline] Этап 3: Очистка — удалено ${killed.count} отклонённых концептов`);

  // Считаем оставшиеся
  const validIdeas = await prisma.businessIdea.findMany({
    where: { reportId },
    select: { id: true },
  });

  // Финализация
  await prisma.dailyReport.update({
    where: { id: reportId },
    data: {
      status: "complete",
      pipelineStage: null,
      ideasCount: validIdeas.length,
      generatedAt: new Date(),
      trendAnalysis: null,
      filteredTrendsJson: null,
    },
  });

  console.log(`[Pipeline] ═══ ГОТОВО ═══ ${validIdeas.length} идей прошли глубокий анализ`);

  return {
    success: true,
    validCount: validIdeas.length,
    removedCount: killed.count,
    tokensIn: 0,
    tokensOut: 0,
  };
}

// ═══════════════════════════════════════════════════
// runFullPipeline — запуск всех 3 этапов (для крона)
// ═══════════════════════════════════════════════════

export async function runFullPipeline(reportId: string): Promise<{ success: boolean; error?: string; ideasCount?: number; trendsCount?: number }> {
  // Этап 1: Сбор трендов + анализ
  const s1 = await runStage1(reportId);
  if (!s1.success) return { success: false, error: `Этап 1: ${s1.error}` };

  // Этап 2: Генерация концептов
  const s2 = await runStage2(reportId);
  if (!s2.success) return { success: false, error: `Этап 2: ${s2.error}` };

  // Этап 2-deep: Глубокий анализ каждого концепта (по одному за вызов)
  const MAX_DEEP_ITERATIONS = 15; // защита от бесконечного цикла
  for (let i = 0; i < MAX_DEEP_ITERATIONS; i++) {
    const report = await prisma.dailyReport.findUnique({ where: { id: reportId } });
    if (report?.pipelineStage === "stage-2-done") break;

    const deep = await runStage2Deep(reportId);
    if (!deep.success) return { success: false, error: `Этап 2-deep: ${deep.error}` };
  }

  // Этап 3: Финализация
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
        : pipelineStage === "stage-2-deep" ? "stage-2-concepts-done"
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
      console.log(`[Pipeline Advance] Запуск этапа 2 (концепты)...`);
      const r = await runStage2(reportId);
      return { action: "stage-2-concepts", success: r.success, error: r.error, reportId };
    }

    if (stage === "stage-2-concepts-done") {
      console.log(`[Pipeline Advance] Запуск deep dive...`);
      const r = await runStage2Deep(reportId);
      return { action: "stage-2-deep", success: r.success, error: r.error, reportId };
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
