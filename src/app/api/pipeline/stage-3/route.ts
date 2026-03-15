import { NextRequest, NextResponse } from "next/server";
import { runStage3 } from "@/lib/pipeline";

export const maxDuration = 120;

// POST /api/pipeline/stage-3 — валидация (Opus) + финализация
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const reportId = body?.reportId;

    if (!reportId) {
      return NextResponse.json(
        { success: false, error: "Не указан reportId" },
        { status: 400 }
      );
    }

    const result = await runStage3(reportId);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      validCount: result.validCount,
      removedCount: result.removedCount,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Ошибка этапа 3";
    console.error("[Stage-3] Ошибка:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
