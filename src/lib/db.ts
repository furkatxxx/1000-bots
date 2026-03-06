import { PrismaClient } from "@prisma/client";

// Убираем channel_binding=require — не поддерживается на Vercel
function cleanDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return url;
  return url.replace(/[&?]channel_binding=require/g, "");
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasourceUrl: cleanDatabaseUrl(),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
