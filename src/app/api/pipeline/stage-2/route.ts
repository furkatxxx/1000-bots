import { NextRequest, NextResponse } from "next/server";
import { runStage2 } from "@/lib/pipeline";

export const maxDuration = 180;

// POST /api/pipeline/stage-2 — генерация идей (Opus) + дедуп (Sonnet)
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

    const result = await runStage2(reportId);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      ideasCount: result.ideasCount,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Ошибка этапа 2";
    console.error("[Stage-2] Ошибка:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
