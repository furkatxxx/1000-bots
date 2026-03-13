import Anthropic from "@anthropic-ai/sdk";
import type { GenerationResult, GeneratedIdea, ExpertAnalysis, MarketScenarios, SkepticVerdict } from "./types";
import { buildFocusBlock, type PresetId } from "./focus-presets";

interface BrainInput {
  trends: {
    title: string;
    score: number;
    source: string;
    category?: string;
    summary?: string | null;
    originalTitle?: string | null;
    metadata?: Record<string, unknown>;
  }[];
  maxIdeas: number;
  model: string;
  apiKey: string;
  previousIdeas?: string[];
  trendAnalysis?: string;
  focusPresets?: PresetId[];
}

// Вес источников: более надёжные получают приоритет
const SOURCE_WEIGHTS: Record<string, number> = {
  yandex_wordstat: 2.0,  // Прямой спрос в РФ — самый ценный источник
  product_hunt: 1.5,     // Реальные продукты с описаниями
  reddit: 1.2,           // Бизнес-боли из целевых сабреддитов
  google_trends: 1.0,    // Массовые тренды, средняя ценность
  news_api: 0.6,         // Журналистика, низкая ценность для бизнес-идей
  hacker_news: 0.7,      // Технический шум, мало про бизнес-боли
  github_trending: 0.5,  // Open-source проекты, не про деньги
  vk_trends: 0.5,        // Контент-маркетинг, низкая ценность
};

// ═══════════════════════════════════════════════════
// ФИЛЬТР ТРЕНДОВ: убираем спорт, развлечения, мусор
// ═══════════════════════════════════════════════════

const JUNK_PATTERNS = [
  // Спорт
  /\b(nba|nfl|mlb|nhl|ufc|fifa|premier league|champions league|лига чемпионов|чемпионат мира)\b/i,
  /\b(score|scores|матч|гол|финал|полуфинал|трансфер|standings|playoffs|draft)\b/i,
  /\b(basketball|football|soccer|baseball|hockey|tennis|boxing|mma|wrestling)\b/i,
  // Развлечения / celebrities
  /\b(movie|film|netflix|disney|concert|album|grammy|oscar|emmy|celebrity|kardashian|taylor swift)\b/i,
  /\b(фильм|сериал|кинопремьера|альбом|концерт|звезда|актёр|актриса)\b/i,
  // Игры (не бизнес)
  /\b(fortnite|minecraft|valorant|gta|playstation|xbox|steam sale|gaming|twitch|esports)\b/i,
  // Слишком общие
  /^(новости|погода|курс доллара|курс евро|биткоин цена|weather|news|bitcoin price)$/i,
  /^(нейросеть|искусственный интеллект|ai|machine learning)$/i,
  // Политика / скандалы
  /\b(скандал|арест|суд над|убийство|scandal|arrested|killed|impeach|election results)\b/i,
  // Погода / природные явления
  /\b(earthquake|hurricane|tornado|flood|ураган|землетрясение|наводнение)\b/i,
];

const JUNK_CATEGORIES = new Set([
  "sports", "entertainment", "gaming", "celebrity",
  "спорт", "развлечения", "игры",
]);

export function filterTrends<T extends { title: string; score: number; source: string; category?: string }>(
  trends: T[]
): T[] {
  return trends.filter((t) => {
    if (t.category && JUNK_CATEGORIES.has(t.category.toLowerCase())) return false;
    return !JUNK_PATTERNS.some((pattern) => pattern.test(t.title));
  });
}

// ═══════════════════════════════════════════════════
// СЕМАНТИЧЕСКАЯ ДЕДУПЛИКАЦИЯ
// ═══════════════════════════════════════════════════

export async function semanticDedup(input: {
  ideas: GeneratedIdea[];
  apiKey: string;
  model: string;
}): Promise<{ unique: GeneratedIdea[]; removed: number; tokensIn: number; tokensOut: number }> {
  if (input.ideas.length <= 3) {
    return { unique: input.ideas, removed: 0, tokensIn: 0, tokensOut: 0 };
  }

  const client = new Anthropic({ apiKey: input.apiKey, timeout: 60_000 });

  const summaries = input.ideas.map((idea, i) =>
    `${i + 1}. "${idea.name}" — ${idea.description.slice(0, 100)}`
  ).join("\n");

  try {
    const response = await client.messages.create({
      model: input.model,
      max_tokens: 512,
      messages: [{
        role: "user",
        content: `Найди ДУБЛИКАТЫ по смыслу (разные названия, одна суть):

${summaries}

Если дубликатов нет — верни [].
Если есть — верни массив групп: [[1, 5], [3, 7]] = идеи 1 и 5 — одно и то же (оставить первую), 3 и 7 — одно и то же.
Только JSON, без текста.`,
      }],
    });

    const text = response.content.find(b => b.type === "text");
    if (!text || text.type !== "text") {
      return { unique: input.ideas, removed: 0, tokensIn: response.usage.input_tokens, tokensOut: response.usage.output_tokens };
    }

    const cleaned = text.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { unique: input.ideas, removed: 0, tokensIn: response.usage.input_tokens, tokensOut: response.usage.output_tokens };
    }

    const groups: number[][] = JSON.parse(jsonMatch[0]);
    const toRemove = new Set<number>();

    for (const group of groups) {
      if (Array.isArray(group) && group.length > 1) {
        for (let i = 1; i < group.length; i++) {
          const idx = group[i] - 1;
          if (idx >= 0 && idx < input.ideas.length) {
            toRemove.add(idx);
          }
        }
      }
    }

    const unique = input.ideas.filter((_, i) => !toRemove.has(i));
    console.log(`[AI Brain] Дедупликация: ${input.ideas.length} → ${unique.length} (убрано ${toRemove.size})`);

    return {
      unique,
      removed: toRemove.size,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
    };
  } catch (error) {
    console.warn("[AI Brain] Дедупликация не удалась:", error);
    return { unique: input.ideas, removed: 0, tokensIn: 0, tokensOut: 0 };
  }
}

// ═══════════════════════════════════════════════════
// СМЫСЛОВАЯ ВАЛИДАЦИЯ — проверка реалистичности (Opus)
// ═══════════════════════════════════════════════════

export async function validateIdeas(input: {
  ideas: GeneratedIdea[];
  apiKey: string;
}): Promise<{ valid: GeneratedIdea[]; removed: number; tokensIn: number; tokensOut: number }> {
  if (input.ideas.length === 0) {
    return { valid: [], removed: 0, tokensIn: 0, tokensOut: 0 };
  }

  const client = new Anthropic({ apiKey: input.apiKey, timeout: 60_000 });

  const summaries = input.ideas.map((idea, i) =>
    `${i + 1}. "${idea.name}" — ${idea.description}\n   Аудитория: ${idea.targetAudience}\n   Монетизация: ${idea.monetization}`
  ).join("\n\n");

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: `Ты — жёсткий скептик-инвестор. Проверь каждую бизнес-идею на реалистичность.

Критерии ОТБРАКОВКИ (любой = выкинуть):
- Невозможно сделать одному человеку за $500 и 2-4 недели
- Нет конкретной аудитории которая заплатит (не "бизнес", а конкретный сегмент)
- Есть десятки бесплатных аналогов и нет причины платить
- Идея слишком абстрактная ("AI для чего-то")
- Нереалистичные цифры дохода

Для каждой идеи верни:
- "keep" — реалистичная, оставить
- "fix" — есть потенциал, но нужно исправить (укажи ЧТО)
- "remove" — нереалистичная, выкинуть (укажи ПОЧЕМУ)

Идеи:

${summaries}

Верни JSON-массив:
[
  { "index": 1, "verdict": "keep" },
  { "index": 2, "verdict": "fix", "suggestion": "сузить аудиторию до..." },
  { "index": 3, "verdict": "remove", "reason": "есть 50 бесплатных аналогов" }
]

Будь жёстким. Лучше пропустить 3 хороших чем оставить 1 мусорную. Только JSON, без markdown.`,
      }],
    });

    const text = response.content.find(b => b.type === "text");
    if (!text || text.type !== "text") {
      return { valid: input.ideas, removed: 0, tokensIn: response.usage.input_tokens, tokensOut: response.usage.output_tokens };
    }

    const cleaned = text.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { valid: input.ideas, removed: 0, tokensIn: response.usage.input_tokens, tokensOut: response.usage.output_tokens };
    }

    const verdicts: { index: number; verdict: string; suggestion?: string; reason?: string }[] = JSON.parse(jsonMatch[0]);
    const toRemove = new Set<number>();

    for (const v of verdicts) {
      if (v.verdict === "remove") {
        const idx = v.index - 1;
        if (idx >= 0 && idx < input.ideas.length) {
          toRemove.add(idx);
          console.log(`[Validation] "${input.ideas[idx].name}" — ${v.reason || "нереалистично"}`);
        }
      }
      if (v.verdict === "fix" && v.suggestion) {
        const idx = v.index - 1;
        if (idx >= 0 && idx < input.ideas.length) {
          console.log(`[Validation] "${input.ideas[idx].name}" — ${v.suggestion}`);
          input.ideas[idx].description += ` [Замечание: ${v.suggestion}]`;
        }
      }
    }

    const valid = input.ideas.filter((_, i) => !toRemove.has(i));
    console.log(`[Validation] Итог: ${input.ideas.length} → ${valid.length} (отбраковано ${toRemove.size})`);

    return {
      valid,
      removed: toRemove.size,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
    };
  } catch (error) {
    console.warn("[Validation] Валидация не удалась:", error);
    return { valid: input.ideas, removed: 0, tokensIn: 0, tokensOut: 0 };
  }
}

// ═══════════════════════════════════════════════════
// ЛЁГКИЙ ПРОМПТ — фокус на качестве, без примеров
// ═══════════════════════════════════════════════════

const SYSTEM_PROMPT = `Ты — опытный бизнес-аналитик. Анализируешь тренды и находишь конкретные бизнес-идеи для соло-предпринимателя с AI-агентами (Claude Code).

## Возможности предпринимателя:
- Создание веб-приложений, SaaS, Telegram/WhatsApp ботов
- Парсинг данных, автоматизация процессов, API-интеграции
- Генерация контента (тексты, SEO, описания)
- Бюджет: до $500. Команда: один человек + AI.

## Правила:
1. КОНКРЕТНОСТЬ: не "AI для бизнеса", а "бот для генерации описаний товаров на Wildberries по фото". Конкретная ниша, конкретный клиент, конкретная цена.
2. ПРИВЯЗКА К ТРЕНДАМ: каждая идея привязана к тренду из списка. Объясни ПОЧЕМУ этот тренд = бизнес-возможность СЕЙЧАС.
3. РАЗНООБРАЗИЕ: разные типы продуктов (боты, SaaS, инструменты). Разные рынки (РФ и мировой). Не делай все идеи одного типа.
4. РЕАЛИЗМ: один человек, ≤$500, запуск за 1-4 недели. Без физпроизводства, лицензий, найма.
5. ПЛАТФОРМЫ: не предлагай СОЗДАНИЕ новых соцсетей или маркетплейсов. Но инструменты и боты ДЛЯ существующих платформ (Telegram, Wildberries, Ozon, Instagram, WhatsApp) — приветствуются. Это лучшие ниши.
6. ДУМАЙ ГЛУБОКО: не хватай первую очевидную идею от тренда. Тренд "рост AI" ≠ "сделай AI-помощника". Ищи НЕОЧЕВИДНЫЕ ниши и ПЕРЕСЕЧЕНИЯ трендов. Лучше 1 нестандартная идея, чем 3 банальных.
7. БОЛЬ И ДЕНЬГИ: для каждой идеи чётко ответь — какую конкретную БОЛЬ людей ты решаешь? Почему они ЗАПЛАТЯТ, а не сделают сами или найдут бесплатный аналог?

## Формат — JSON-массив. Каждый объект:
{
  "name": "Название (3-5 слов)",
  "emoji": "подходящий эмодзи",
  "description": "Что за продукт, кому, зачем, как работает. 2-3 конкретных предложения.",
  "targetAudience": "Кто заплатит, сколько их, где их найти (с цифрами)",
  "monetization": "Модель дохода, конкретные цены, средний чек, почему заплатят а не найдут бесплатное",
  "whyNow": "КАКОЙ тренд из списка + ПОЧЕМУ он создаёт возможность именно сейчас",
  "difficulty": "easy | medium | hard",
  "market": "russia | global | both"
}

Всё на русском. Суммы в рублях для РФ, в долларах для глобальных.`;

function buildUserPrompt(input: BrainInput): string {
  const enrichedTrends = input.trends
    .map((t) => ({
      ...t,
      weightedScore: Math.round(t.score * (SOURCE_WEIGHTS[t.source] || 1.0)),
    }))
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .slice(0, 15);

  const trendLines = enrichedTrends
    .map((t) => {
      const title = t.originalTitle || t.title;
      let line = `- [${t.source}] ${title} (${t.weightedScore})`;
      if (t.summary) {
        line += `\n  Контекст: ${t.summary}`;
      }
      if (t.metadata?.monthlySearches) {
        line += `\n  Спрос в Яндексе: ${Number(t.metadata.monthlySearches).toLocaleString("ru-RU")} запросов/мес`;
      }
      if (t.metadata?.stars) {
        line += `\n  GitHub: ${Number(t.metadata.stars).toLocaleString()} звёзд`;
      }
      return line;
    })
    .join("\n");

  let prompt = "";

  if (input.trendAnalysis) {
    prompt += `## Анализ трендов (боли и возможности):\n\n${input.trendAnalysis}\n\n`;
    prompt += `## Исходные тренды:\n\n${trendLines}\n\n`;
    prompt += `На основе анализа болей предложи ${input.maxIdeas} КОНКРЕТНЫХ бизнес-идей.\nКаждая идея должна решать конкретную боль конкретных людей из анализа выше.`;
  } else {
    prompt += `Тренды (отсортированы по важности):\n\n${trendLines}\n\n`;
    prompt += `Для каждого тренда сначала определи: какую БОЛЬ людей он отражает? Кто эти люди? За что они УЖЕ платят?\nЗатем предложи ${input.maxIdeas} КОНКРЕТНЫХ бизнес-идей.\nИщи неочевидные ниши и пересечения трендов.`;
  }

  if (input.previousIdeas && input.previousIdeas.length > 0) {
    prompt += `\n\n⛔ НЕ ПОВТОРЯЙ эти идеи:\n${input.previousIdeas.map((name) => `- ${name}`).join("\n")}`;
  }

  prompt += `\n\nВерни JSON-массив из ${input.maxIdeas} объектов. Только JSON, без markdown.`;

  return prompt;
}

// Валидация — с дефолтами для полей, которые AI больше не генерирует
function validateIdea(item: Record<string, unknown>): GeneratedIdea | null {
  const name = String(item.name || "").trim();
  const description = String(item.description || "").trim();
  if (!name || !description || name.length < 3 || description.length < 20) return null;

  const market = ["russia", "global", "both"].includes(String(item.market))
    ? String(item.market) as "russia" | "global" | "both"
    : "both";

  const defaultScenario = { revenue: "", channels: "", audience: "", advantages: "" };

  return {
    name,
    emoji: String(item.emoji || "💡"),
    description,
    targetAudience: String(item.targetAudience || "Не указано"),
    monetization: String(item.monetization || "Не указано"),
    startupCost: "low",
    competitionLevel: "medium",
    trendBacking: String(item.whyNow || item.trendBacking || ""),
    actionPlan: "",
    claudeCodeReady: true,
    difficulty: ["easy", "medium", "hard"].includes(String(item.difficulty)) ? String(item.difficulty) : "medium",
    successChance: 0,
    estimatedRevenue: "",
    timeToLaunch: "",
    market,
    marketScenarios: { russia: { ...defaultScenario }, global: { ...defaultScenario } },
  };
}

// Парсим ответ Claude — извлекаем JSON из текста
function parseIdeas(text: string): GeneratedIdea[] {
  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  let jsonMatch = cleaned.match(/\[[\s\S]*\]/);

  // Если JSON обрезан (нет закрывающей ]) — пытаемся спасти
  if (!jsonMatch) {
    const bracketPos = cleaned.indexOf("[");
    if (bracketPos >= 0) {
      const partial = cleaned.substring(bracketPos);
      let found = false;
      let searchFrom = partial.length;
      for (let attempts = 0; attempts < 30 && !found; attempts++) {
        const bracePos = partial.lastIndexOf("}", searchFrom - 1);
        if (bracePos <= 0) break;
        const salvaged = partial.substring(0, bracePos + 1) + "]";
        try {
          const test = JSON.parse(salvaged);
          if (Array.isArray(test) && test.length > 0) {
            jsonMatch = [salvaged];
            console.warn(`[AI Brain] JSON обрезан — спасено ${test.length} идей`);
            found = true;
          }
        } catch {
          // Пробуем предыдущий }
        }
        searchFrom = bracePos;
      }
    }
  }

  if (!jsonMatch) {
    throw new Error("AI не вернул JSON-массив");
  }

  let parsed: unknown[];
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new SyntaxError(`Невалидный JSON от AI: ${e instanceof Error ? e.message : "неизвестная ошибка"}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("AI вернул не массив");
  }

  const ideas: GeneratedIdea[] = [];
  for (const item of parsed) {
    if (item && typeof item === "object") {
      const idea = validateIdea(item as Record<string, unknown>);
      if (idea) ideas.push(idea);
    }
  }

  if (ideas.length === 0) {
    throw new Error("AI не вернул ни одной валидной идеи");
  }

  return ideas;
}

// ═══════════════════════════════════════════════════
// ШАГ 1: АНАЛИЗ ТРЕНДОВ — выявление болей (Opus)
// ═══════════════════════════════════════════════════

const TREND_ANALYSIS_PROMPT = `Ты — эксперт по выявлению бизнес-возможностей. Твоя задача — проанализировать тренды и найти БОЛИ реальных людей, за решение которых они готовы платить.

Для каждого тренда определи:
1. БОЛЬ: Какую конкретную проблему испытывают люди? Не абстрактную, а ежедневную.
2. КТО страдает: Конкретный сегмент (не "бизнес", а "селлеры на WB с 10-50 товарами")
3. ДЕНЬГИ: За что они уже платят сейчас? Сколько? Какие есть платные решения?
4. ДЫРА: Что не закрыто текущими решениями? Почему люди недовольны?
5. ПЕРЕСЕЧЕНИЯ: Какие тренды усиливают друг друга?

Формат ответа — JSON-массив:
[
  {
    "trend": "название тренда",
    "pain": "конкретная боль",
    "who": "кто страдает (сегмент и размер)",
    "currentSpend": "за что и сколько уже платят",
    "gap": "что не закрыто",
    "crosses": ["какие другие тренды усиливают"]
  }
]

Будь конкретен. Не пиши "бизнесу нужна автоматизация". Пиши "селлеры на Wildberries тратят 3 часа в день на ручное обновление цен, платят 5-15 тыс руб/мес за MPStats, но он слишком сложный для мелких продавцов".
Только JSON, без markdown.`;

export async function analyzeTrends(input: {
  trends: BrainInput["trends"];
  apiKey: string;
}): Promise<{ analysis: string; tokensIn: number; tokensOut: number }> {
  const client = new Anthropic({ apiKey: input.apiKey, timeout: 5 * 60 * 1000 });

  const enrichedTrends = input.trends
    .slice(0, 15)
    .map((t) => {
      const title = t.originalTitle || t.title;
      let line = `- [${t.source}] ${title}`;
      if (t.summary) line += ` — ${t.summary}`;
      if (t.metadata?.monthlySearches) {
        line += ` (${Number(t.metadata.monthlySearches).toLocaleString("ru-RU")} запросов/мес в Яндексе)`;
      }
      return line;
    })
    .join("\n");

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    system: TREND_ANALYSIS_PROMPT,
    messages: [{
      role: "user",
      content: `Проанализируй эти тренды и найди бизнес-боли:\n\n${enrichedTrends}\n\nВерни JSON-массив. Только JSON, без markdown.`,
    }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI не вернул текстовый ответ при анализе трендов");
  }

  return {
    analysis: textBlock.text,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
  };
}

// Главная функция — генерация идей (один проход, без батчей)
export async function generateIdeas(input: BrainInput): Promise<GenerationResult> {
  if (!input.apiKey) {
    throw new Error("Не указан API-ключ Anthropic");
  }

  if (input.trends.length === 0) {
    throw new Error("Нет трендов для анализа. Включите хотя бы один источник.");
  }

  const client = new Anthropic({ apiKey: input.apiKey, timeout: 5 * 60 * 1000 });

  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const userPrompt = buildUserPrompt(input);
      const focusBlock = buildFocusBlock(input.focusPresets || []);
      const systemPrompt = focusBlock
        ? `${SYSTEM_PROMPT}\n\n${focusBlock}`
        : SYSTEM_PROMPT;

      console.log(`[AI Brain] Генерация ${input.maxIdeas} идей (модель: ${input.model}, фокус: ${input.focusPresets?.join("+") || "универсальный"})...`);
      const response = await client.messages.create({
        model: input.model,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      if (response.stop_reason === "max_tokens") {
        console.warn("[AI Brain] Ответ AI обрезан (max_tokens) — спасаем частичный JSON");
      }

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("AI не вернул текстовый ответ");
      }

      const ideas = parseIdeas(textBlock.text);

      return {
        ideas: ideas.slice(0, input.maxIdeas),
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens,
        model: input.model,
      };
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const isParseError = error instanceof SyntaxError || (error instanceof Error && error.message.includes("JSON"));
      if (isParseError) {
        console.warn(`[AI Brain] Попытка ${attempt + 1} (ошибка парсинга), повтор...`);
        continue;
      }
      throw error;
    }
  }

  throw new Error("Исчерпаны попытки генерации");
}

// Deep Dive — детальный анализ одной идеи
export async function deepDiveIdea(input: {
  idea: { name: string; description: string; targetAudience: string; monetization: string; actionPlan: string };
  apiKey: string;
  model: string;
}): Promise<{ deepDive: string; tokensIn: number; tokensOut: number }> {
  const client = new Anthropic({ apiKey: input.apiKey });

  const response = await client.messages.create({
    model: input.model,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Ты — опытный стартап-консультант. Разверни эту бизнес-идею в ПОЛНЫЙ план реализации.

Идея: ${input.idea.name}
Описание: ${input.idea.description}
Аудитория: ${input.idea.targetAudience}
Монетизация: ${input.idea.monetization}
Текущий план: ${input.idea.actionPlan}

Напиши ДЕТАЛЬНЫЙ план реализации на русском языке:

## 1. Техническая архитектура
- Какие технологии использовать (стек)
- Структура проекта
- Ключевые API/интеграции

## 2. MVP за первую неделю
- Что ИМЕННО должен уметь MVP (минимум функций)
- Пошаговые инструкции для создания
- Какие задачи дать AI-агенту (Claude Code)

## 3. Привлечение первых 10 клиентов
- Конкретные площадки и каналы
- Текст для первого поста/объявления
- Бюджет на привлечение

## 4. Монетизация: детали
- Ценовая сетка (с обоснованием)
- Система оплаты (ЮKassa, Stripe, etc.)
- Когда вводить платные фичи

## 5. Масштабирование (месяцы 2-6)
- Что добавить после MVP
- Как вырасти с 10 до 100 клиентов
- Ключевые метрики для отслеживания

## 6. Риски и подводные камни
- Топ-3 главных риска
- Как их минимизировать

Пиши конкретно, с цифрами. Не лей воду.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI не вернул текстовый ответ");
  }

  return {
    deepDive: textBlock.text,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
  };
}

// Legacy: экспертный совет (одним вызовом) — для ручного запуска
const EXPERT_COUNCIL_PROMPT = `Ты — экспертный совет из 5 специалистов. Каждый анализирует бизнес-идею со своей стороны.

## Роли:

### 1. ТРЕКЕР СТАРТАПОВ (tracker)
Оценить жизнеспособность бизнес-модели. Вердикт: go / pivot / no-go, топ-3 риска.

### 2. МАРКЕТОЛОГ-СТРАТЕГ (marketer)
Определить каналы привлечения и стоимость (CAC). 3-5 конкретных каналов.

### 3. ПРОДАКТ-МЕНЕДЖЕР (product)
Минимальный MVP (3-5 фич), конкуренты, уникальность.

### 4. ФИНАНСИСТ (financier)
Точка безубыточности, unit-экономика (LTV, CAC).

### 5. СКЕПТИК (skeptic)
Найти ВСЕ причины провала. Жёсткий стресс-тест.

## КАЛИБРОВКА:
- Средняя оценка ~5.0 из 10. Оценка 8+ только для выдающихся идей.
- Скептик ставит ниже среднего.
- Честная 5 полезнее фальшивой 8.

## ДЕБАТЫ (ОБЯЗАТЕЛЬНО):
2-3 вопроса где эксперты НЕ СОГЛАСНЫ. Кто прав и почему.

## Формат — JSON:
{
  "tracker": { "score": 1-10, "verdict": "go|pivot|no-go", "risks": [...], "recommendation": "..." },
  "marketer": { "score": 1-10, "channels": [...], "cac": "...", "recommendation": "..." },
  "product": { "score": 1-10, "mvpFeatures": [...], "competitors": [...], "uniqueness": "...", "recommendation": "..." },
  "financier": { "score": 1-10, "breakeven": "...", "unitEconomics": "...", "recommendation": "..." },
  "skeptic": { "score": 1-10, "killerRisks": [...], "failureScenario": "...", "counterArguments": "...", "recommendation": "..." },
  "debates": "...",
  "finalVerdict": "launch|pivot|reject",
  "finalScore": число,
  "summary": "итог 2-3 предложения"
}`;

export async function expertCouncil(input: {
  idea: {
    name: string;
    description: string;
    targetAudience: string;
    monetization: string;
    startupCost: string;
    competitionLevel: string;
    actionPlan: string;
    estimatedRevenue?: string | null;
  };
  apiKey: string;
  model: string;
  validationContext?: string;
}): Promise<{ analysis: ExpertAnalysis; tokensIn: number; tokensOut: number }> {
  const client = new Anthropic({ apiKey: input.apiKey });

  const userPrompt = `Проанализируй эту бизнес-идею:

**Идея:** ${input.idea.name}
**Описание:** ${input.idea.description}
**Аудитория:** ${input.idea.targetAudience}
**Монетизация:** ${input.idea.monetization}
**Стоимость запуска:** ${input.idea.startupCost}
**Конкуренция:** ${input.idea.competitionLevel}
**План:** ${input.idea.actionPlan}
${input.idea.estimatedRevenue ? `**Доход:** ${input.idea.estimatedRevenue}` : ""}
${input.validationContext || ""}

Верни ТОЛЬКО валидный JSON.`;

  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model: input.model,
        max_tokens: 8192,
        system: EXPERT_COUNCIL_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("AI не вернул текстовый ответ");
      }

      const analysis = parseExpertAnalysis(textBlock.text);

      return {
        analysis,
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens,
      };
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const isParseError = error instanceof SyntaxError || (error instanceof Error && error.message.includes("JSON"));
      if (isParseError) {
        console.warn(`[Expert Council] Попытка ${attempt + 1}, повтор...`);
        continue;
      }
      throw error;
    }
  }

  throw new Error("Исчерпаны попытки экспертного совета");
}

function parseExpertAnalysis(text: string): ExpertAnalysis {
  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new SyntaxError("Экспертный совет не вернул JSON");

  const parsed = JSON.parse(jsonMatch[0]);

  if (!parsed.tracker || !parsed.marketer || !parsed.product || !parsed.financier) {
    throw new Error("Экспертный совет вернул неполные данные");
  }

  const clampScore = (s: unknown) => Math.min(10, Math.max(1, Math.round(Number(s) || 5)));

  const tracker = {
    score: clampScore(parsed.tracker.score),
    verdict: (["go", "pivot", "no-go"].includes(parsed.tracker.verdict) ? parsed.tracker.verdict : "pivot") as "go" | "pivot" | "no-go",
    risks: Array.isArray(parsed.tracker.risks) ? parsed.tracker.risks.map(String) : [],
    recommendation: String(parsed.tracker.recommendation || ""),
  };

  const marketer = {
    score: clampScore(parsed.marketer.score),
    channels: Array.isArray(parsed.marketer.channels) ? parsed.marketer.channels.map(String) : [],
    cac: String(parsed.marketer.cac || "Не оценено"),
    recommendation: String(parsed.marketer.recommendation || ""),
  };

  const product = {
    score: clampScore(parsed.product.score),
    mvpFeatures: Array.isArray(parsed.product.mvpFeatures) ? parsed.product.mvpFeatures.map(String) : [],
    competitors: Array.isArray(parsed.product.competitors) ? parsed.product.competitors.map(String) : [],
    uniqueness: String(parsed.product.uniqueness || ""),
    recommendation: String(parsed.product.recommendation || ""),
  };

  const financier = {
    score: clampScore(parsed.financier.score),
    breakeven: String(parsed.financier.breakeven || "Не оценено"),
    unitEconomics: String(parsed.financier.unitEconomics || "Не оценено"),
    recommendation: String(parsed.financier.recommendation || ""),
  };

  let skeptic: SkepticVerdict | undefined;
  if (parsed.skeptic) {
    skeptic = {
      score: clampScore(parsed.skeptic.score),
      killerRisks: Array.isArray(parsed.skeptic.killerRisks) ? parsed.skeptic.killerRisks.map(String) : [],
      failureScenario: String(parsed.skeptic.failureScenario || ""),
      counterArguments: String(parsed.skeptic.counterArguments || ""),
      recommendation: String(parsed.skeptic.recommendation || ""),
    };
  }

  const debates = parsed.debates ? String(parsed.debates) : undefined;

  const scores = [tracker.score, marketer.score, product.score, financier.score];
  if (skeptic) scores.push(skeptic.score);
  const avgScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;

  const finalVerdict = (["launch", "pivot", "reject"].includes(parsed.finalVerdict)
    ? parsed.finalVerdict
    : avgScore >= 7 ? "launch" : avgScore >= 5 ? "pivot" : "reject") as "launch" | "pivot" | "reject";

  return {
    tracker,
    marketer,
    product,
    financier,
    skeptic,
    finalVerdict,
    finalScore: parsed.finalScore ? Math.round(Number(parsed.finalScore) * 10) / 10 : avgScore,
    summary: String(parsed.summary || "Анализ завершён."),
    debates,
  };
}
