import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  schedulerStarted?: boolean;
};

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Запускаем планировщик один раз (только на сервере, НЕ при сборке)
if (
  typeof window === "undefined" &&
  !globalForPrisma.schedulerStarted &&
  process.env.NEXT_PHASE !== "phase-production-build"
) {
  globalForPrisma.schedulerStarted = true;
  import("./scheduler").then((m) => m.startScheduler()).catch(() => {});
}
