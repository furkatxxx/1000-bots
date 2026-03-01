// Нормализованный тренд из любого источника
export interface TrendItem {
  sourceId: string; // "hacker_news" | "google_trends" | "news_api" | "github_trending" | "product_hunt"
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
  successChance: number;
  estimatedRevenue: string;
  timeToLaunch: string;
  market: "russia" | "global" | "both";
  marketScenarios: MarketScenarios;
}

// Сценарий развития для конкретного рынка
export interface MarketScenario {
  revenue: string;      // Ожидаемый доход
  channels: string;     // Каналы привлечения
  audience: string;     // Целевая аудитория
  advantages: string;   // Преимущества на этом рынке
}

// Два сценария: Россия и мировой рынок
export interface MarketScenarios {
  russia: MarketScenario;
  global: MarketScenario;
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

// Оценка одного эксперта
export interface ExpertVerdict {
  score: number; // 1-10
  recommendation: string;
}

// Трекер стартапов
export interface TrackerVerdict extends ExpertVerdict {
  verdict: "go" | "pivot" | "no-go";
  risks: string[];
}

// Маркетолог
export interface MarketerVerdict extends ExpertVerdict {
  channels: string[];
  cac: string; // стоимость привлечения клиента
}

// Продакт-менеджер
export interface ProductVerdict extends ExpertVerdict {
  mvpFeatures: string[];
  competitors: string[];
  uniqueness: string;
}

// Финансист
export interface FinancierVerdict extends ExpertVerdict {
  breakeven: string;
  unitEconomics: string;
}

// Скептик (адвокат дьявола)
export interface SkepticVerdict extends ExpertVerdict {
  killerRisks: string[];     // «убийственные» риски — причины полного провала
  failureScenario: string;   // самый вероятный сценарий неудачи
  counterArguments: string;  // контраргументы к оптимистичным оценкам других экспертов
}

// Совокупный результат экспертного совета
export interface ExpertAnalysis {
  tracker: TrackerVerdict;
  marketer: MarketerVerdict;
  product: ProductVerdict;
  financier: FinancierVerdict;
  skeptic?: SkepticVerdict;  // 5-й эксперт, опционально для обратной совместимости
  finalVerdict: "launch" | "pivot" | "reject";
  finalScore: number; // средняя оценка 1-10
  summary: string;
  debates?: string; // где эксперты не согласны друг с другом
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
  successChance: number | null;
  estimatedRevenue: string | null;
  timeToLaunch: string | null;
  market: string;
  marketScenarios: MarketScenarios | null;
  deepDive: string | null;
  expertAnalysis: ExpertAnalysis | null;
  rating: number | null;
  isFavorite: boolean;
  isArchived: boolean;
  createdAt: string;
}
