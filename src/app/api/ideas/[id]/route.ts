import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// PATCH /api/ideas/[id] — обновить рейтинг, избранное, архив
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 });
    }

    const existing = await prisma.businessIdea.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Идея не найдена" },
        { status: 404 }
      );
    }

    const data: Record<string, unknown> = {};

    if (typeof body.isFavorite === "boolean") {
      data.isFavorite = body.isFavorite;
    }
    if (typeof body.isArchived === "boolean") {
      data.isArchived = body.isArchived;
    }
    if (typeof body.userStatus === "string" && ["new", "interesting", "in_progress", "rejected"].includes(body.userStatus)) {
      data.userStatus = body.userStatus;
    }

    // Обратная связь: причина отклонения
    const validRejectReasons = ["vague", "crowded", "not_my_profile", "bad_economics", "boring"];
    if (typeof body.rejectReason === "string" && validRejectReasons.includes(body.rejectReason)) {
      data.rejectReason = body.rejectReason;
    }
    if (body.rejectReason === null) {
      data.rejectReason = null;
    }

    // Обратная связь: причины одобрения (мультиселект)
    const validLikeReasons = ["real_pain", "easy_start", "clear_audience", "good_money"];
    if (Array.isArray(body.likeReasons) && body.likeReasons.every((r: unknown) => typeof r === "string" && validLikeReasons.includes(r as string))) {
      data.likeReasons = JSON.stringify(body.likeReasons);
    }
    if (body.likeReasons === null) {
      data.likeReasons = null;
    }

    // Свободный комментарий
    if (typeof body.feedbackComment === "string") {
      data.feedbackComment = body.feedbackComment.slice(0, 500);
    }
    if (body.feedbackComment === null) {
      data.feedbackComment = null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Нет данных для обновления" },
        { status: 400 }
      );
    }

    const updated = await prisma.businessIdea.update({
      where: { id },
      data,
      include: { report: { select: { date: true } } },
    });

    let expertAnalysis = null;
    if (updated.expertAnalysis) {
      try { expertAnalysis = JSON.parse(updated.expertAnalysis); } catch { /* skip */ }
    }

    let marketScenarios = null;
    if (updated.marketScenarios) {
      try { marketScenarios = JSON.parse(updated.marketScenarios); } catch { /* skip */ }
    }

    let likeReasons = null;
    if (updated.likeReasons) {
      try { likeReasons = JSON.parse(updated.likeReasons); } catch { /* skip */ }
    }

    return NextResponse.json({
      idea: {
        ...updated,
        reportDate: updated.report.date.toISOString(),
        expertAnalysis,
        marketScenarios,
        likeReasons,
        landingHtml: updated.landingHtml ? "[html]" : null,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[API /ideas/id] Ошибка PATCH:", error);
    return NextResponse.json({ error: "Ошибка обновления идеи" }, { status: 500 });
  }
}

// GET /api/ideas/[id] — получить одну идею
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const idea = await prisma.businessIdea.findUnique({
      where: { id },
      include: { report: { select: { date: true } } },
    });

    if (!idea) {
      return NextResponse.json(
        { error: "Идея не найдена" },
        { status: 404 }
      );
    }

    let expertAnalysis = null;
    if (idea.expertAnalysis) {
      try { expertAnalysis = JSON.parse(idea.expertAnalysis); } catch { /* skip */ }
    }

    let marketScenarios = null;
    if (idea.marketScenarios) {
      try { marketScenarios = JSON.parse(idea.marketScenarios); } catch { /* skip */ }
    }

    let likeReasons = null;
    if (idea.likeReasons) {
      try { likeReasons = JSON.parse(idea.likeReasons); } catch { /* skip */ }
    }

    return NextResponse.json({
      idea: {
        ...idea,
        reportDate: idea.report.date.toISOString(),
        expertAnalysis,
        marketScenarios,
        likeReasons,
        // Не передаём тяжёлые данные целиком — только флаги наличия
        landingHtml: idea.landingHtml ? "[html]" : null,
        analogs: idea.analogs || null,
        marketAnalysis: idea.marketAnalysis || null,
        adCopy: idea.adCopy || null,
        createdAt: idea.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[API /ideas/id] Ошибка GET:", error);
    return NextResponse.json({ error: "Ошибка загрузки идеи" }, { status: 500 });
  }
}
