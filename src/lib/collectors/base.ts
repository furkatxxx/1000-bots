// Нормализованный тренд из любого источника
export interface TrendItem {
  sourceId: string;
  title: string;
  url: string | null;
  score: number; // 0-100 нормализованная популярность
  summary: string | null;
  category: string | null;
  metadata: Record<string, unknown>;
}

// Интерфейс, который должен реализовать каждый коллектор
export interface TrendCollector {
  sourceId: string;
  label: string;
  collect(): Promise<TrendItem[]>;
}
