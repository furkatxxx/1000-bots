// Форматирование даты на русском
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
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
