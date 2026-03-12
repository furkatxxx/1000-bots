import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/ideas/export — выгрузка идей в Markdown
// Поддерживает те же фильтры что и GET /api/ideas
export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl;
    const market = url.searchParams.get("market");
    const difficulty = url.searchParams.get("difficulty");
    const favorite = url.searchParams.get("favorite");
    const verdict = url.searchParams.get("verdict");
    const period = url.searchParams.get("period");
    const search = url.searchParams.get("search");

    const where: Record<string, unknown> = {};

    if (market === "russia") {
      where.market = { in: ["russia", "both"] };
    } else if (market === "global") {
      where.market = { in: ["global", "both"] };
    } else if (market === "both") {
      where.market = "both";
    }
    if (difficulty && ["easy", "medium", "hard"].includes(difficulty)) {
      where.difficulty = difficulty;
    }
    if (favorite === "true") {
      where.isFavorite = true;
    }
    if (period === "today") {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      where.createdAt = { gte: today };
    } else if (period === "week") {
      const d = new Date(); d.setDate(d.getDate() - 7);
      where.createdAt = { gte: d };
    } else if (period === "month") {
      const d = new Date(); d.setMonth(d.getMonth() - 1);
      where.createdAt = { gte: d };
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }
    where.isArchived = false;
    where.report = { status: "complete" };

    const ideas = await prisma.businessIdea.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { report: { select: { date: true, aiModel: true } } },
    });

    // Фильтр по вердикту (в памяти)
    let filtered = ideas;
    if (verdict === "launch" || verdict === "pivot" || verdict === "reject") {
      filtered = ideas.filter((idea) => {
        if (!idea.expertAnalysis) return false;
        try {
          const ea = JSON.parse(idea.expertAnalysis);
          return ea.finalVerdict === verdict;
        } catch { return false; }
      });
    } else if (verdict === "none") {
      filtered = ideas.filter((idea) => !idea.expertAnalysis);
    }

    // Генерируем Markdown
    const now = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
    let md = `# Экспорт идей — 1000 ботов\n\n`;
    md += `**Дата выгрузки:** ${now}\n`;
    md += `**Всего идей:** ${filtered.length}\n`;
    md += `**Фильтры:** ${[
      market && market !== "all" ? `рынок=${market}` : null,
      difficulty ? `сложность=${difficulty}` : null,
      verdict && verdict !== "all" ? `вердикт=${verdict}` : null,
      period && period !== "all" ? `период=${period}` : null,
      favorite === "true" ? "только избранные" : null,
      search ? `поиск="${search}"` : null,
    ].filter(Boolean).join(", ") || "без фильтров"}\n\n---\n\n`;

    for (const idea of filtered) {
      let expertAnalysis = null;
      if (idea.expertAnalysis) {
        try { expertAnalysis = JSON.parse(idea.expertAnalysis); } catch { /* skip */ }
      }

      md += `## ${idea.emoji} ${idea.name}\n\n`;
      md += `- **Дата:** ${idea.report.date.toLocaleDateString("ru-RU")}\n`;
      md += `- **Рынок:** ${idea.market === "russia" ? "Россия" : idea.market === "global" ? "Мир" : "Оба"}\n`;
      md += `- **Сложность:** ${idea.difficulty}\n`;
      md += `- **Стоимость запуска:** ${idea.startupCost}\n`;
      md += `- **Конкуренция:** ${idea.competitionLevel}\n`;

      if (expertAnalysis) {
        md += `- **Экспертная оценка:** ${expertAnalysis.finalScore}/10 → ${expertAnalysis.finalVerdict === "launch" ? "ЗАПУСКАТЬ" : expertAnalysis.finalVerdict === "pivot" ? "ДОРАБОТАТЬ" : "ОТКАЗАТЬСЯ"}\n`;
      } else {
        md += `- **Экспертная оценка:** не проведена\n`;
      }

      md += `\n### Описание\n${idea.description}\n`;
      md += `\n### Целевая аудитория\n${idea.targetAudience}\n`;
      md += `\n### Монетизация\n${idea.monetization}\n`;

      if (idea.trendBacking && idea.trendBacking.trim()) {
        md += `\n### Подтверждение трендами\n${idea.trendBacking}\n`;
      }

      if (expertAnalysis) {
        md += `\n### Экспертный совет\n`;
        md += `- **Итог:** ${expertAnalysis.summary}\n`;
        md += `- **Трекер:** ${expertAnalysis.tracker.score}/10 — ${expertAnalysis.tracker.recommendation}\n`;
        md += `- **Маркетолог:** ${expertAnalysis.marketer.score}/10 — ${expertAnalysis.marketer.recommendation}\n`;
        md += `- **Продакт:** ${expertAnalysis.product.score}/10 — ${expertAnalysis.product.recommendation}\n`;
        md += `- **Финансист:** ${expertAnalysis.financier.score}/10 — ${expertAnalysis.financier.recommendation}\n`;
        if (expertAnalysis.skeptic) {
          md += `- **Скептик:** ${expertAnalysis.skeptic.score}/10 — ${expertAnalysis.skeptic.recommendation}\n`;
        }
        if (expertAnalysis.debates) {
          md += `\n**Дебаты экспертов:**\n${expertAnalysis.debates}\n`;
        }
      }

      if (idea.deepDive) {
        md += `\n### Deep Dive\n${idea.deepDive}\n`;
      }

      md += `\n---\n\n`;
    }

    return new NextResponse(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="ideas-export-${new Date().toISOString().split("T")[0]}.md"`,
      },
    });
  } catch (error) {
    console.error("[API /ideas/export] Ошибка:", error);
    return NextResponse.json({ error: "Ошибка экспорта" }, { status: 500 });
  }
}
