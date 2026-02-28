// fetch с таймаутом — предотвращает зависание при недоступных API
export async function fetchWithTimeout(
  url: string | URL,
  options: RequestInit = {},
  timeoutMs: number = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url.toString(), {
      ...options,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// Параллельное выполнение с ограничением одновременных запросов
export async function concurrentMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number = 5
): Promise<R[]> {
  const results: R[] = [];
  const queue = [...items];
  const executing: Promise<void>[] = [];

  for (const item of queue) {
    const p = fn(item).then((r) => {
      results.push(r);
    });
    executing.push(p);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      executing.splice(
        executing.findIndex((e) => e === p),
        1
      );
    }
  }

  await Promise.all(executing);
  return results;
}

// Форматирование даты на русском
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "Неверная дата";
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Короткая дата: "26 фев"
export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

// Сложность на русском
export function getDifficultyLabel(difficulty: string): string {
  const labels: Record<string, string> = {
    easy: "Легко",
    medium: "Средне",
    hard: "Сложно",
  };
  return labels[difficulty] || difficulty;
}

// Цвет сложности
export function getDifficultyColor(difficulty: string): string {
  const colors: Record<string, string> = {
    easy: "var(--success)",
    medium: "var(--warning)",
    hard: "var(--destructive)",
  };
  return colors[difficulty] || "var(--muted-foreground)";
}

// Конкуренция на русском
export function getCompetitionLabel(level: string): string {
  const labels: Record<string, string> = {
    low: "Низкая",
    medium: "Средняя",
    high: "Высокая",
  };
  return labels[level] || level;
}

// Стоимость запуска на русском
export function getCostLabel(cost: string): string {
  const labels: Record<string, string> = {
    low: "Низкие",
    medium: "Средние",
    high: "Высокие",
  };
  return labels[cost] || cost;
}
