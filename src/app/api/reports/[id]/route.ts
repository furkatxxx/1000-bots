import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/reports/[id] — один отчёт со всеми идеями
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const report = await prisma.dailyReport.findUnique({
      where: { id },
      include: {
        ideas: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!report) {
      return NextResponse.json(
        { error: "Отчёт не найден" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      report: {
        id: report.id,
        date: report.date.toISOString(),
        status: report.status,
        trendsCount: report.trendsCount,
        ideasCount: report.ideas.length,
        aiModel: report.aiModel,
        aiTokensIn: report.aiTokensIn,
        aiTokensOut: report.aiTokensOut,
        error: report.error,
        generatedAt: report.generatedAt?.toISOString() || null,
        createdAt: report.createdAt.toISOString(),
        ideas: report.ideas.map((idea) => ({
          id: idea.id,
          reportId: idea.reportId,
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
          marketScenarios: idea.marketScenarios ? (() => { try { return JSON.parse(idea.marketScenarios); } catch { return null; } })() : null,
          expertAnalysis: idea.expertAnalysis ? (() => { try { return JSON.parse(idea.expertAnalysis); } catch { return null; } })() : null,
          rating: idea.rating,
          isFavorite: idea.isFavorite,
          isArchived: idea.isArchived,
          createdAt: idea.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("[API /reports/id] Ошибка:", error);
    return NextResponse.json({ error: "Ошибка загрузки отчёта" }, { status: 500 });
  }
}
