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
  vc_ru: 1.8,            // Реальные боли предпринимателей РФ
  reddit_pains: 1.6,     // Прямые жалобы и запросы помощи
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

const SYSTEM_PROMPT = `Ты — бизнес-разведчик. Твоя задача — найти ПРОБЛЕМЫ за которые люди готовы платить, и предложить решения только если видишь уникальный угол.

## Подход: ПРОБЛЕМЫ → РЕШЕНИЯ (не наоборот!)
Сначала найди в трендах БОЛЬ (люди жалуются, ищут, тратят время/деньги).
Потом проверь: есть ли уже решение? Если да — НЕ предлагай, ЕСЛИ у тебя нет принципиально другого подхода.
Лучше вернуть 2 сильные идеи, чем 5 средних. Если сегодня нет ничего стоящего — верни 2-3 лучших из того что есть, но не заполняй квоту мусором.

## Для кого ищем:
- Предприниматель с командой на WB (12 чел), отошёл от управления
- Ищет НОВЫЙ цифровой бизнес параллельно, 1-2 часа/день
- Бюджет: до $500. Запуск: 1-4 недели
- Умеет: AI-автоматизация, веб-приложения, SaaS, боты, парсинг, API
- Суперсила: доступ к комьюнити селлеров WB, знание болей e-commerce изнутри
- Каналы продаж: Telegram-каналы, сарафан, комьюнити
- НЕ делает: холодные звонки, контент (блог/YouTube), физпроизводство, найм, лицензии
- ПРИОРИТЕТ: идеи где опыт в маркетплейсах и AI-навыки дают несправедливое преимущество

## Правила:
1. ПРОБЛЕМА ПЕРВИЧНА: начни с боли. "Люди тратят X часов/рублей на Y" → "вот решение". Без конкретной боли — нет идеи.
2. ПРИВЯЗКА К ТРЕНДАМ: каждая идея привязана к тренду из списка. Объясни ПОЧЕМУ этот тренд = возможность СЕЙЧАС.
3. РАЗНООБРАЗИЕ: разные ниши, рынки (РФ и мировой), типы продуктов. НЕ делай все идеи одного типа.
4. РЕАЛИЗМ: один человек, ≤$500, 1-4 недели. Без физпроизводства, лицензий, найма.
5. ДУМАЙ ГЛУБОКО: тренд "рост AI" ≠ "сделай AI-помощника". Ищи НЕОЧЕВИДНЫЕ ниши и ПЕРЕСЕЧЕНИЯ трендов.
6. БОЛЬ И ДЕНЬГИ: какую конкретную БОЛЬ решаешь? Почему ЗАПЛАТЯТ, а не найдут бесплатное?
7. ГОЛУБОЙ ОКЕАН: кто из СУЩЕСТВУЮЩИХ продуктов закрывает эту боль? Если > 70% — нужен принципиально другой формат/аудитория/функция. Назови 1-2 конкурента и чем отличаешься. "Лучше/дешевле" — не ответ.
8. КОНКРЕТНОСТЬ: не "AI для бизнеса", а конкретная ниша, конкретный клиент, конкретная цена.

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

// ═══════════════════════════════════════════════════
// ГЕНЕРАЦИЯ КОНЦЕПТОВ — грубые идеи для дальнейшей проработки
// ═══════════════════════════════════════════════════

export interface RawConcept {
  name: string;
  pain: string;
  solution: string;
  who: string;
  whyNow: string;
  market: "russia" | "global" | "both";
}

const CONCEPTS_PROMPT = `Ты — бизнес-разведчик. Найди КОНКРЕТНЫЕ БОЛИ в трендах и предложи КРАТКИЕ концепты решений.

## Профиль основателя:
- Управляет командой на Wildberries — знает боли селлеров изнутри
- Навыки: AI-автоматизация, веб-приложения, боты, парсинг, API
- Время: 1-2 часа/день. Бюджет: до $500. Запуск: 1-4 недели
- НЕ делает: физпроизводство, найм, лицензии, холодные продажи, ежедневный контент
- ПРЕИМУЩЕСТВО: e-commerce + AI. Идеи на пересечении — в приоритете, но не ограничивайся

## Правила:
1. Начни с БОЛИ, не с решения. "Люди тратят X на Y" → только потом решение
2. Каждый концепт привязан к тренду. Объясни ПОЧЕМУ сейчас
3. РАЗНЫЕ ниши — минимум 3 разных отрасли из 7 концептов
4. Конкретность: не "AI для бизнеса", а "бот который за селлера отвечает на вопросы покупателей WB"
5. Проверь: есть ли БЕСПЛАТНЫЙ аналог? Если да и он закрывает 80%+ — не предлагай

## Формат — JSON-массив из 7 объектов:
{
  "name": "Короткое название (3-5 слов)",
  "pain": "Конкретная боль: кто, что, сколько теряет",
  "solution": "Одно предложение: что делает продукт",
  "who": "Конкретный сегмент + сколько их",
  "whyNow": "Какой тренд + почему возможность СЕЙЧАС",
  "market": "russia | global | both"
}

Всё на русском. Только JSON, без markdown.`;

export async function generateConcepts(input: {
  trends: BrainInput["trends"];
  apiKey: string;
  previousIdeas?: string[];
  trendAnalysis?: string;
}): Promise<{ concepts: RawConcept[]; tokensIn: number; tokensOut: number }> {
  const client = new Anthropic({ apiKey: input.apiKey, timeout: 5 * 60 * 1000 });

  const enrichedTrends = input.trends
    .map((t) => ({
      ...t,
      weightedScore: Math.round(t.score * (SOURCE_WEIGHTS[t.source] || 1.0)),
    }))
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .slice(0, 15);

  const trendLines = enrichedTrends
    .map((t) => {
      let line = `- [${t.source}] ${t.originalTitle || t.title} (${t.weightedScore})`;
      if (t.summary) line += `\n  Контекст: ${t.summary}`;
      if (t.metadata?.monthlySearches) line += `\n  Спрос: ${Number(t.metadata.monthlySearches).toLocaleString("ru-RU")} запросов/мес`;
      return line;
    })
    .join("\n");

  let userPrompt = "";
  if (input.trendAnalysis) {
    userPrompt += `## Анализ болей:\n${input.trendAnalysis}\n\n`;
  }
  userPrompt += `## Тренды:\n${trendLines}\n\n`;
  userPrompt += `Найди 7 концептов. Каждый = конкретная боль + краткое решение.`;

  if (input.previousIdeas && input.previousIdeas.length > 0) {
    userPrompt += `\n\n⛔ НЕ ПОВТОРЯЙ:\n${input.previousIdeas.map((n) => `- ${n}`).join("\n")}`;
  }
  userPrompt += `\n\nВерни JSON-массив из 7 объектов. Только JSON, без markdown.`;

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    system: CONCEPTS_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI не вернул текстовый ответ");
  }

  const cleaned = textBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("AI не вернул JSON-массив концептов");

  const parsed = JSON.parse(jsonMatch[0]) as RawConcept[];
  const valid = parsed.filter((c) => c.name && c.pain && c.solution);

  console.log(`[AI Brain] Сгенерировано ${valid.length} концептов`);

  return {
    concepts: valid,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
  };
}

// ═══════════════════════════════════════════════════
// ГЛУБОКАЯ ПРОРАБОТКА — один концепт → полная идея
// ═══════════════════════════════════════════════════

const DEEP_DIVE_PROMPT = `Ты — жёсткий бизнес-аналитик. Твоя задача — превратить ГРУБЫЙ КОНЦЕПТ в проработанную бизнес-идею ИЛИ честно сказать что идея не стоит внимания.

## Профиль основателя:
- Опыт: Wildberries (команда), AI-автоматизация, веб/боты/API
- Время: 1-2 ч/день. Бюджет: $500. Один человек.
- НЕ делает: найм, физтовары, холодные продажи, ежедневный контент

## Что нужно проверить:
1. БОЛЬ — реальная ли? Люди УЖЕ платят за решение похожей проблемы?
2. КОНКУРЕНТЫ — кто уже решает это? (назови 2-3 конкретных продукта, их цены, слабые места)
3. УНИКАЛЬНЫЙ УГОЛ — чем ты отличаешься? "Дешевле/лучше" — не ответ. Нужен ДРУГОЙ подход
4. ЭКОНОМИКА — сколько стоит клиент, сколько платит, сходится ли юнит-экономика?
5. РЕАЛИЗМ — можно ли сделать за $500 и 2-4 недели одному?

## Вердикт:
- "build" — идея сильная, стоит делать
- "maybe" — есть потенциал, но нужна доработка (укажи что)
- "kill" — не стоит внимания (укажи почему)

## Формат — JSON:
{
  "verdict": "build | maybe | kill",
  "killReason": "только если kill — почему",
  "name": "Финальное название (3-5 слов)",
  "emoji": "подходящий эмодзи",
  "description": "Полное описание: что, кому, как работает (3-5 предложений)",
  "targetAudience": "Кто, сколько их, где найти (с цифрами)",
  "monetization": "Модель, цены, средний чек, почему заплатят",
  "competitors": "2-3 конкурента: название, цена, слабое место",
  "uniqueAngle": "Чем принципиально отличаешься",
  "unitEconomics": "CAC, LTV, срок окупаемости",
  "whyNow": "Тренд + почему возможность именно сейчас",
  "difficulty": "easy | medium | hard",
  "market": "russia | global | both"
}

Будь жёстким. Лучше честный "kill" чем оптимистичный "build" на слабой идее.
Всё на русском. Только JSON, без markdown.`;

export async function deepDiveIdea(input: {
  concept: RawConcept;
  apiKey: string;
}): Promise<{
  result: GeneratedIdea | null;
  verdict: string;
  killReason?: string;
  competitors?: string;
  uniqueAngle?: string;
  unitEconomics?: string;
  tokensIn: number;
  tokensOut: number;
}> {
  const client = new Anthropic({ apiKey: input.apiKey, timeout: 3 * 60 * 1000 });

  const userPrompt = `Проанализируй этот концепт:

**Название:** ${input.concept.name}
**Боль:** ${input.concept.pain}
**Решение:** ${input.concept.solution}
**Кто:** ${input.concept.who}
**Почему сейчас:** ${input.concept.whyNow}
**Рынок:** ${input.concept.market}

Проведи глубокий анализ и верни JSON. Только JSON, без markdown.`;

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    system: DEEP_DIVE_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI не вернул текстовый ответ");
  }

  const cleaned = textBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI не вернул JSON");

  const parsed = JSON.parse(jsonMatch[0]);
  const verdict = parsed.verdict || "kill";

  console.log(`[AI Brain] Deep dive "${input.concept.name}" → ${verdict}`);

  if (verdict === "kill") {
    return {
      result: null,
      verdict,
      killReason: parsed.killReason,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
    };
  }

  const market = ["russia", "global", "both"].includes(parsed.market) ? parsed.market : input.concept.market;
  const defaultScenario = { revenue: "", channels: "", audience: "", advantages: "" };

  const idea: GeneratedIdea = {
    name: parsed.name || input.concept.name,
    emoji: parsed.emoji || "💡",
    description: parsed.description || input.concept.solution,
    targetAudience: parsed.targetAudience || input.concept.who,
    monetization: parsed.monetization || "",
    startupCost: "low",
    competitionLevel: "medium",
    trendBacking: parsed.whyNow || input.concept.whyNow,
    actionPlan: "",
    claudeCodeReady: true,
    difficulty: ["easy", "medium", "hard"].includes(parsed.difficulty) ? parsed.difficulty : "medium",
    successChance: 0,
    estimatedRevenue: "",
    timeToLaunch: "",
    market,
    marketScenarios: { russia: { ...defaultScenario }, global: { ...defaultScenario } },
  };

  return {
    result: idea,
    verdict,
    competitors: parsed.competitors,
    uniqueAngle: parsed.uniqueAngle,
    unitEconomics: parsed.unitEconomics,
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
