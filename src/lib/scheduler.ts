// Планировщик: автоматическая генерация отчётов по расписанию (#40)
import { prisma } from "./db";

const CHECK_INTERVAL = 60_000; // Проверяем каждую минуту
let intervalId: ReturnType<typeof setInterval> | null = null;
let lastTriggeredDate: string | null = null; // Защита от повторного запуска в тот же день

// Получить базовый URL для внутренних fetch-запросов
function getBaseUrl(): string {
  return `http://localhost:${process.env.PORT || 1000}`;
}

// Проверка: пора ли генерировать отчёт?
async function checkAndRun() {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: "main" } });
    if (!settings?.scheduleEnabled) return;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10); // "2026-03-02"

    // Уже запускали сегодня — пропускаем
    if (lastTriggeredDate === todayStr) return;

    // Парсим время расписания (HH:MM)
    const [targetH, targetM] = (settings.scheduleTime || "08:00").split(":").map(Number);
    const currentH = now.getHours();
    const currentM = now.getMinutes();

    // Проверяем: текущее время >= время расписания?
    if (currentH > targetH || (currentH === targetH && currentM >= targetM)) {
      // Проверяем: нет ли уже отчёта за сегодня?
      const todayStart = new Date(todayStr);
      const todayEnd = new Date(todayStr);
      todayEnd.setDate(todayEnd.getDate() + 1);

      const existing = await prisma.dailyReport.findFirst({
        where: {
          date: { gte: todayStart, lt: todayEnd },
          status: { in: ["complete", "generating"] },
        },
      });

      if (existing) {
        // Отчёт уже есть — помечаем день как обработанный
        lastTriggeredDate = todayStr;
        return;
      }

      // Генерируем отчёт!
      console.log(`[Scheduler] Запускаю автогенерацию отчёта (${settings.scheduleTime})`);
      lastTriggeredDate = todayStr;

      try {
        const res = await fetch(`${getBaseUrl()}/api/reports`, { method: "POST" });
        const data = await res.json();

        if (data.report) {
          console.log(`[Scheduler] Отчёт создан: ${data.report.ideasCount} идей`);

          // Автоотправка в Telegram если включена
          if (settings.scheduleAutoTelegram) {
            try {
              await fetch(`${getBaseUrl()}/api/telegram/send-top`, { method: "POST" });
              console.log("[Scheduler] ТОП отправлен в Telegram");
            } catch (tgErr) {
              console.error("[Scheduler] Ошибка отправки в Telegram:", tgErr);
            }
          }
        } else {
          console.error("[Scheduler] Ошибка генерации:", data.error);
        }
      } catch (fetchErr) {
        console.error("[Scheduler] Ошибка запроса генерации:", fetchErr);
        // Сбрасываем дату чтобы попробовать ещё раз
        lastTriggeredDate = null;
      }
    }
  } catch (err) {
    console.error("[Scheduler] Ошибка проверки:", err);
  }
}

// Запустить планировщик (вызывается один раз при старте)
export function startScheduler() {
  if (intervalId) return; // Уже запущен

  console.log("[Scheduler] Планировщик запущен (проверка каждые 60с)");
  intervalId = setInterval(checkAndRun, CHECK_INTERVAL);

  // Первая проверка через 10 секунд (дать серверу время подняться)
  setTimeout(checkAndRun, 10_000);
}

// Остановить планировщик
export function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[Scheduler] Планировщик остановлен");
  }
}
