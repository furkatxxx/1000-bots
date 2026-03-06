import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const info: Record<string, unknown> = {
    hasDbUrl: !!process.env.DATABASE_URL,
    dbUrlPrefix: process.env.DATABASE_URL?.slice(0, 30) + "...",
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  };

  try {
    const count = await prisma.settings.count();
    info.dbConnection = "OK";
    info.settingsCount = count;
  } catch (error) {
    info.dbConnection = "FAILED";
    info.dbError = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json(info);
}
