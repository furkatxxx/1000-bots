// Нормализованный тренд из любого источника
export interface TrendItem {
  sourceId: string; // "hacker_news" | "google_trends" | "news_api"
  title: string;
  url: string | null;
  score: number; // 0-100 нормализованная популярность
  summary: string | null;
  category: string | null;
  metadata: Record<string, unknown>;
}

// Интерфейс коллектора трендов
export interface TrendCollector {
  sourceId: string;
  label: string;
  collect(): Promise<TrendItem[]>;
}

// Сгенерированная бизнес-идея от AI
export interface GeneratedIdea {
  name: string;
  emoji: string;
  description: string;
  targetAudience: string;
  monetization: string;
  startupCost: string;
  competitionLevel: string;
  trendBacking: string;
  actionPlan: string;
  claudeCodeReady: boolean;
  difficulty: string;
}

// Результат генерации отчёта
export interface GenerationResult {
  ideas: GeneratedIdea[];
  tokensIn: number;
  tokensOut: number;
  model: string;
}

// DTO для отчёта в API
export interface ReportDTO {
  id: string;
  date: string;
  status: string;
  trendsCount: number;
  ideasCount: number;
  aiModel: string | null;
  generatedAt: string | null;
  createdAt: string;
}

// DTO для идеи в API
export interface IdeaDTO {
  id: string;
  reportId: string;
  name: string;
  emoji: string;
  description: string;
  targetAudience: string;
  monetization: string;
  startupCost: string;
  competitionLevel: string;
  trendBacking: string;
  actionPlan: string;
  claudeCodeReady: boolean;
  difficulty: string;
  rating: number | null;
  isFavorite: boolean;
  isArchived: boolean;
  createdAt: string;
}
