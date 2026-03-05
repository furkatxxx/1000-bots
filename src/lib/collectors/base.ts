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

// Единая функция определения категории по тексту (EN + RU)
export function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  // AI / ML
  if (/\bai\b|artificial intelligence|llm|gpt|claude|openai|anthropic|machine.?learning|neural|transformer|нейросет|искусственн/.test(lower)) return "ai";
  // Стартапы / Бизнес
  if (/startup|funding|vc|raise|seed|series|founder|mvp|бизнес|заработ|доход|стартап/.test(lower)) return "business";
  // SaaS
  if (/saas|subscription|mrr|arr|crm|сервис|парсинг|автоматизац/.test(lower)) return "saas";
  // E-commerce
  if (/ecommerce|marketplace|маркетплейс|wildberries|ozon|авито|товар/.test(lower)) return "ecommerce";
  // Маркетинг
  if (/marketing|seo|growth|ads|analytics|продвижени|контент|smm|instagram|reels/.test(lower)) return "marketing";
  // Крипто
  if (/crypto|bitcoin|blockchain|web3/.test(lower)) return "crypto";
  // DevTools / Open Source
  if (/developer|code|programming|api|open.?source|github|repo/.test(lower)) return "devtools";
  // Боты
  if (/bot|telegram|discord|slack|chatbot|бот/.test(lower)) return "bot";
  // Продуктивность
  if (/automation|workflow|productivity|tool/.test(lower)) return "productivity";
  // Дизайн
  if (/design|ui|ux|figma/.test(lower)) return "design";
  // По умолчанию
  return "tech";
}

// Извлечение содержимого XML-тега (с поддержкой CDATA)
export function extractXmlTag(xml: string, tag: string): string {
  const cdataMatch = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`));
  if (cdataMatch) return cdataMatch[1].trim();
  const simpleMatch = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return simpleMatch ? simpleMatch[1].trim() : "";
}
