import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { collectAll } from "@/lib/collectors";
import { generateIdeas } from "@/lib/ai-brain";

// GET /api/reports — список всех отчётов
export async function GET() {
  try {
    const reports = await prisma.dailyReport.findMany({
      orderBy: { date: "desc" },
      include: { _count: { select: { ideas: true } } },
    });

    const favoritesCount = await prisma.businessIdea.count({
      where: { isFavorite: true },
    });

    return NextResponse.json({
      reports: reports.map((r) => ({
        id: r.id,
        date: r.date.toISOString(),
        status: r.status,
        trendsCount: r.trendsCount,
        ideasCount: r._count.ideas,
        aiModel: r.aiModel,
        generatedAt: r.generatedAt?.toISOString() || null,
        createdAt: r.createdAt.toISOString(),
      })),
      favoritesCount,
    });
  } catch (error) {
    console.error("[API /reports] Ошибка GET:", error);
    return NextResponse.json({ error: "Ошибка загрузки отчётов" }, { status: 500 });
  }
}

// POST /api/reports — сгенерировать новый отчёт
export async function POST() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Проверяем: не генерируется ли уже отчёт?
  const existing = await prisma.dailyReport.findUnique({ where: { date: today } });
  if (existing?.status === "generating") {
    return NextResponse.json(
      { success: false, error: "Отчёт уже генерируется. Подождите завершения." },
      { status: 409 }
    );
  }

  const report = await prisma.dailyReport.upsert({
    where: { date: today },
    update: { status: "generating", error: null },
    create: { date: today, status: "generating" },
  });

  try {
    // 1. Собираем тренды
    const settings = await prisma.settings.findUnique({
      where: { id: "main" },
    });

    if (!settings?.anthropicApiKey) {
      throw new Error("Не указан API-ключ Anthropic. Добавьте его в настройках.");
    }

    const sources = await prisma.trendSource.findMany({
      where: { enabled: true },
    });
    const enabledSources = sources.map((s) => s.name);

    const trendItems = await collectAll({
      newsApiKey: settings.newsApiKey || undefined,
      wordstatToken: settings.wordstatToken || undefined,
      googleTrendsGeo: settings.googleTrendsGeo || "US",
      telemetrApiKey: settings.telemetrApiKey || undefined,
      vkServiceToken: settings.vkServiceToken || undefined,
      enabledSources: enabledSources.length > 0 ? enabledSources : undefined,
    });

    if (trendItems.length === 0) {
      throw new Error("Не удалось собрать тренды ни из одного источника. Проверьте настройки и подключение к интернету.");
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

    // 2. Дедупликация: прошлые идеи
    const recentIdeas = await prisma.businessIdea.findMany({
      where: {
        report: {
          id: { not: report.id },
          status: "complete",
        },
      },
      select: { name: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    const previousIdeas = recentIdeas.map((i) => i.name);

    // 3. Генерируем идеи через AI
    const result = await generateIdeas({
      trends: trendItems.map((t) => ({
        title: t.title,
        score: t.score,
        source: t.sourceId,
        category: t.category || undefined,
      })),
      maxIdeas: settings.maxIdeasPerReport || 10,
      model: settings.preferredModel || "claude-haiku-4-5-20251001",
      apiKey: settings.anthropicApiKey,
      previousIdeas,
    });

    // 4. Сохраняем идеи пакетно (вместо N+1 цикла)
    await prisma.businessIdea.createMany({
      data: result.ideas.map((idea) => ({
        reportId: report.id,
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
      })),
    });

    // 5. Обновляем отчёт
    const updated = await prisma.dailyReport.update({
      where: { id: report.id },
      data: {
        status: "complete",
        trendsCount: trendItems.length,
        ideasCount: result.ideas.length,
        aiModel: result.model,
        aiTokensIn: result.tokensIn,
        aiTokensOut: result.tokensOut,
        generatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      report: {
        id: updated.id,
        date: updated.date.toISOString(),
        status: updated.status,
        trendsCount: updated.trendsCount,
        ideasCount: updated.ideasCount,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка";
    try {
      await prisma.dailyReport.update({
        where: { id: report.id },
        data: { status: "failed", error: errorMessage },
      });
    } catch (dbError) {
      console.error("[API /reports] Ошибка обновления статуса:", dbError);
    }

    console.error("[API /reports] Ошибка генерации:", error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
