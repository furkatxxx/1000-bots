import { NextRequest, NextResponse } from "next/server";
import { sendTopToTelegram } from "@/lib/telegram";

// POST /api/telegram/send-top — отправить ТОП идей в Telegram
// ?force=true — отправить ТОП-5 по шансу (без фильтра по экспертам)
export async function POST(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get("force") === "true";
    const result = await sendTopToTelegram({ force });

    if (!result.success && !result.sentCount) {
      return NextResponse.json(
        { error: result.error || "Ошибка отправки" },
        { status: result.error?.includes("Не настроен") ? 400 : 500 }
      );
    }

    return NextResponse.json({
      success: result.success,
      sentCount: result.sentCount,
      messageId: result.messageId,
      ...(result.error ? { message: result.error } : {}),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Ошибка отправки";
    console.error("[Telegram] Ошибка:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
