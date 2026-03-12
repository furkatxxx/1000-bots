# ЗАДАЧА: Полная переработка пайплайна генерации бизнес-идей

Ты — AI-партнёр Вася. Язык: русский. Внеси ВСЕ изменения ниже по порядку. После каждого блока проверяй `npm run build`. Если build падает — исправь до перехода к следующему блоку. Не задавай вопросов — просто делай.

---

## БЛОК A: КОЛЛЕКТОРЫ — починить сырьё

### A1. Изменить веса источников

**Файл:** `src/lib/ai-brain.ts`

Найди:
```ts
const SOURCE_WEIGHTS: Record<string, number> = {
  yandex_wordstat: 1.5,
  google_trends: 1.3,
  hacker_news: 1.3,
  product_hunt: 1.3,
  github_trending: 1.1,
  reddit: 1.0,
  news_api: 0.9,
  vk_trends: 0.8,
};
```

Замени на:
```ts
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
```

### A2. HackerNews — уменьшить лимит

**Файл:** `src/lib/collectors/hacker-news.ts`

Найди:
```ts
const TOP_STORIES_LIMIT = 30;
```

Замени на:
```ts
const TOP_STORIES_LIMIT = 15;
```

### A3. Reddit — заменить сабреддиты на бизнес-ориентированные

**Файл:** `src/lib/collectors/reddit.ts`

Найди:
```ts
const SUBREDDITS = [
  { name: "technology", weight: 1.0 },
  { name: "startups", weight: 1.2 },
  { name: "SideProject", weight: 1.3 },
  { name: "Entrepreneur", weight: 1.2 },
  { name: "artificial", weight: 1.1 },
];
```

Замени на:
```ts
const SUBREDDITS = [
  { name: "microsaas", weight: 1.5 },       // Реальные микро-бизнесы, цифры выручки
  { name: "indiehackers", weight: 1.4 },     // Соло-предприниматели, конкретные кейсы
  { name: "Entrepreneur", weight: 1.2 },     // Бизнес-вопросы и боли
  { name: "SideProject", weight: 1.1 },      // Люди показывают проекты — видно что востребовано
  { name: "slavelabour", weight: 1.3 },      // Люди платят за конкретные задачи — прямой спрос
];
```

### A4. Google Trends — переключить на РФ по умолчанию

**Файл:** `prisma/schema.prisma`

Найди:
```prisma
  googleTrendsGeo   String @default("US")
```

Замени на:
```prisma
  googleTrendsGeo   String @default("RU")
```

После этого выполни: `npx prisma generate`

**ВАЖНО:** Также нужно обновить значение в существующей записи Settings в БД. Если БД на Vercel (PostgreSQL) — обнови через Prisma Studio (`npx prisma studio`) или SQL: `UPDATE "Settings" SET "googleTrendsGeo" = 'RU' WHERE id = 'main';`

### A5. Яндекс Вордстат — расширить seed-фразы

**Файл:** `src/lib/collectors/yandex-wordstat.ts`

Найди:
```ts
const SEED_PHRASES = [
  // Бизнес и заработок
  "заработок онлайн",
  "бизнес идеи",
  "пассивный доход",
  // Технологии и AI
  "нейросеть",
  "искусственный интеллект",
  "чат бот",
  "автоматизация",
  // E-commerce
  "маркетплейс",
  "wildberries продавец",
  "товарный бизнес",
  // Контент и SMM
  "продвижение телеграм",
  "reels instagram",
  "контент план",
  // SaaS и инструменты
  "crm система",
  "парсинг данных",
  "сервис подписок",
];
```

Замени на:
```ts
const SEED_PHRASES = [
  // Прямой коммерческий спрос — люди ищут решение и готовы платить
  "купить бот телеграм",
  "заказать парсинг",
  "сервис автоматизации",
  "генератор контента",
  "бот для бизнеса",
  "автоматизация отчётов",
  "автоматизация excel",
  // Маркетплейсы — горящая боль селлеров
  "wildberries аналитика",
  "парсинг wildberries",
  "ozon аналитика продавца",
  "карточка товара wildberries",
  "автоматизация маркетплейс",
  "мониторинг цен конкурентов",
  // Telegram и боты
  "телеграм бот магазин",
  "бот для записи клиентов",
  "чат бот для сайта",
  "бот рассылка телеграм",
  "автоответчик телеграм",
  // AI-инструменты — растущий спрос
  "нейросеть для текста",
  "нейросеть для фото товара",
  "ai помощник",
  "генерация описаний товаров",
  "автоматизация с помощью ии",
  // SaaS и бизнес-инструменты
  "crm для малого бизнеса",
  "сервис подписок",
  "онлайн запись клиентов",
  "учёт заказов",
  "автоматизация бухгалтерии",
  // Контент и SMM
  "продвижение телеграм канала",
  "контент план генератор",
  "автопостинг соцсети",
  "парсинг инстаграм",
  // Фриланс и услуги
  "парсинг данных",
  "генерация лидов",
  "автоматизация email",
  "скрипт продаж",
  // Образование и курсы
  "платформа для курсов",
  "конструктор тестов",
  "бот для обучения",
];
```

Найди:
```ts
    const selectedSeeds = shuffled.slice(0, 8);
```

Замени на:
```ts
    const selectedSeeds = shuffled.slice(0, 15);
```

---

## БЛОК B: ПЕРЕДАЧА ДАННЫХ В AI — не терять контекст

### B1. Расширить интерфейс BrainInput

**Файл:** `src/lib/ai-brain.ts`

Найди:
```ts
interface BrainInput {
  trends: { title: string; score: number; source: string; category?: string }[];
```

Замени на:
```ts
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
```

### B2. Изменить формат трендов в промпте — передавать контекст

**Файл:** `src/lib/ai-brain.ts`

Найди в функции `buildUserPrompt` весь блок формирования trendLines:
```ts
  const trendLines = input.trends
    .map((t) => ({
      ...t,
      weightedScore: Math.round(t.score * (SOURCE_WEIGHTS[t.source] || 1.0)),
    }))
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .slice(0, 40)
    .map((t) => `- [${t.source}] ${t.title} (${t.weightedScore})`)
    .join("\n");
```

Замени на:
```ts
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
```

### B3. Сохранять оригинальный заголовок при переводе

**Файл:** `src/lib/collectors/index.ts`

Найди блок перевода:
```ts
  // Переводим заголовки на русский
  if (items.length > 0) {
    try {
      const titles = items.map((i) => i.title);
      const translated = await translateToRussian(titles);
      for (let i = 0; i < items.length; i++) {
        items[i].title = translated[i] || items[i].title;
      }
    } catch (err) {
      console.error("[Collectors] Ошибка перевода, оставляем оригиналы:", err);
    }
  }
```

Замени на:
```ts
  // Переводим заголовки на русский, сохраняя оригинал для AI
  if (items.length > 0) {
    try {
      const titles = items.map((i) => i.title);
      const translated = await translateToRussian(titles);
      for (let i = 0; i < items.length; i++) {
        items[i].metadata = { ...items[i].metadata, originalTitle: items[i].title };
        items[i].title = translated[i] || items[i].title;
      }
    } catch (err) {
      console.error("[Collectors] Ошибка перевода, оставляем оригиналы:", err);
    }
  }
```

### B4. Передавать расширенные данные трендов в пайплайн

**Файл:** `src/app/api/reports/route.ts`

Найди:
```ts
    const trendData = trendItems.map((t) => ({
      title: t.title,
      score: t.score,
      source: t.sourceId,
      category: t.category || undefined,
    }));
```

Замени на:
```ts
    const trendData = trendItems.map((t) => ({
      title: t.title,
      score: t.score,
      source: t.sourceId,
      category: t.category || undefined,
      summary: t.summary || undefined,
      originalTitle: (t.metadata?.originalTitle as string) || undefined,
      metadata: t.metadata || undefined,
    }));
```

**Файл:** `src/app/api/cron/generate/route.ts` — сделай точно такую же замену блока `trendData`.

### B5. Исправить filterTrends для расширенного типа

**Файл:** `src/lib/ai-brain.ts`

Найди:
```ts
export function filterTrends(
  trends: { title: string; score: number; source: string; category?: string }[]
): { title: string; score: number; source: string; category?: string }[] {
```

Замени на:
```ts
export function filterTrends<T extends { title: string; score: number; source: string; category?: string }>(
  trends: T[]
): T[] {
```

---

## БЛОК C: ПРОМПТ — глубина вместо ширины

### C1. Переписать системный промпт

**Файл:** `src/lib/ai-brain.ts`

Найди весь `SYSTEM_PROMPT` (от `const SYSTEM_PROMPT = \`` до закрывающей обратной кавычки с `;`) и замени целиком на:
```ts
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
```

### C2. Добавить поддержку анализа трендов в BrainInput и buildUserPrompt

**Файл:** `src/lib/ai-brain.ts`

В интерфейсе `BrainInput`, найди:
```ts
  previousIdeas?: string[];
```

Замени на:
```ts
  previousIdeas?: string[];
  trendAnalysis?: string;
```

В функции `buildUserPrompt`, найди от строки `let prompt = ` до конца функции (до `return prompt;` включительно) и замени на:
```ts
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
```

---

## БЛОК D: ДВУХШАГОВАЯ ГЕНЕРАЦИЯ — сначала анализ болей, потом идеи

### D1. Добавить функцию анализа трендов (Opus)

**Файл:** `src/lib/ai-brain.ts`

Добавь ПЕРЕД функцией `generateIdeas` новую функцию:

```ts
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
```

### D2. Добавить функцию смысловой валидации (Opus)

**Файл:** `src/lib/ai-brain.ts`

Добавь ПОСЛЕ функции `semanticDedup` новую функцию:

```ts
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
          console.log(`[Validation] ❌ "${input.ideas[idx].name}" — ${v.reason || "нереалистично"}`);
        }
      }
      if (v.verdict === "fix" && v.suggestion) {
        const idx = v.index - 1;
        if (idx >= 0 && idx < input.ideas.length) {
          console.log(`[Validation] ⚠️ "${input.ideas[idx].name}" — ${v.suggestion}`);
          input.ideas[idx].description += ` [⚠️ Замечание: ${v.suggestion}]`;
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
```

### D3. Встроить новый пайплайн в генерацию отчёта

**Файл:** `src/app/api/reports/route.ts`

Обнови импорт в начале файла:
```ts
import { generateIdeas, filterTrends, semanticDedup, analyzeTrends, validateIdeas } from "@/lib/ai-brain";
```

Найди:
```ts
    const generationModel = "claude-sonnet-4-6";
    const expertModel = settings.expertModel || "claude-haiku-4-5-20251001";
```

Замени на:
```ts
    const generationModel = "claude-opus-4-6";
    const expertModel = settings.expertModel || "claude-sonnet-4-6";
```

Найди весь блок от ШАГ 3 до конца ШАГ 4 (включая `const finalIdeas`):
```ts
    // ═══════════════════════════════════════════════════
    // ШАГ 3: ГЕНЕРАЦИЯ 10 ИДЕЙ (Sonnet, один проход)
    // ═══════════════════════════════════════════════════
    console.log(`[Gen] Шаг 3: Генерация 10 идей (${generationModel})...`);
    const genResult = await generateIdeas({
      trends: trendsForAI,
      maxIdeas: 10,
      model: generationModel,
      apiKey: settings.anthropicApiKey,
      previousIdeas,
    });
    totalTokensIn += genResult.tokensIn;
    totalTokensOut += genResult.tokensOut;
    console.log(`[Gen] Сгенерировано: ${genResult.ideas.length} идей`);

    // ═══════════════════════════════════════════════════
    // ШАГ 4: СЕМАНТИЧЕСКАЯ ДЕДУПЛИКАЦИЯ
    // ═══════════════════════════════════════════════════
    console.log("[Gen] Шаг 4: Семантическая дедупликация...");
    const dedupResult = await semanticDedup({
      ideas: genResult.ideas,
      apiKey: settings.anthropicApiKey,
      model: expertModel,
    });
    totalTokensIn += dedupResult.tokensIn;
    totalTokensOut += dedupResult.tokensOut;
    const finalIdeas = dedupResult.unique;
    console.log(`[Gen] После дедупликации: ${finalIdeas.length} уникальных идей`);
```

Замени на:
```ts
    // ═══════════════════════════════════════════════════
    // ШАГ 3а: АНАЛИЗ ТРЕНДОВ — выявление болей (Opus)
    // ═══════════════════════════════════════════════════
    console.log("[Gen] Шаг 3а: Анализ трендов — выявление болей (Opus)...");
    const analysisResult = await analyzeTrends({
      trends: trendsForAI,
      apiKey: settings.anthropicApiKey,
    });
    totalTokensIn += analysisResult.tokensIn;
    totalTokensOut += analysisResult.tokensOut;
    console.log(`[Gen] Анализ трендов завершён`);

    // ═══════════════════════════════════════════════════
    // ШАГ 3б: ГЕНЕРАЦИЯ ИДЕЙ на основе анализа (Opus)
    // ═══════════════════════════════════════════════════
    console.log(`[Gen] Шаг 3б: Генерация 7 идей на основе анализа (${generationModel})...`);
    const genResult = await generateIdeas({
      trends: trendsForAI,
      maxIdeas: 7,
      model: generationModel,
      apiKey: settings.anthropicApiKey,
      previousIdeas,
      trendAnalysis: analysisResult.analysis,
    });
    totalTokensIn += genResult.tokensIn;
    totalTokensOut += genResult.tokensOut;
    console.log(`[Gen] Сгенерировано: ${genResult.ideas.length} идей`);

    // ═══════════════════════════════════════════════════
    // ШАГ 4: СЕМАНТИЧЕСКАЯ ДЕДУПЛИКАЦИЯ (Sonnet)
    // ═══════════════════════════════════════════════════
    console.log("[Gen] Шаг 4: Семантическая дедупликация (Sonnet)...");
    const dedupResult = await semanticDedup({
      ideas: genResult.ideas,
      apiKey: settings.anthropicApiKey,
      model: "claude-sonnet-4-6",
    });
    totalTokensIn += dedupResult.tokensIn;
    totalTokensOut += dedupResult.tokensOut;
    console.log(`[Gen] После дедупликации: ${dedupResult.unique.length} уникальных идей`);

    // ═══════════════════════════════════════════════════
    // ШАГ 5: СМЫСЛОВАЯ ВАЛИДАЦИЯ (Opus)
    // ═══════════════════════════════════════════════════
    console.log("[Gen] Шаг 5: Смысловая валидация (Opus)...");
    const validationResult = await validateIdeas({
      ideas: dedupResult.unique,
      apiKey: settings.anthropicApiKey,
    });
    totalTokensIn += validationResult.tokensIn;
    totalTokensOut += validationResult.tokensOut;
    const finalIdeas = validationResult.valid;
    console.log(`[Gen] После валидации: ${finalIdeas.length} реалистичных идей`);
```

Обнови итоговые логи — найди:
```ts
    console.log(`[Gen] ═══ ИТОГ ═══`);
    console.log(`[Gen] Тренды: ${trendItems.length} собрано, ${trendsForAI.length} после фильтра`);
    console.log(`[Gen] Идеи: ${genResult.ideas.length} → ${finalIdeas.length} (после дедупа)`);
    console.log(`[Gen] Токены: ${totalTokensIn} in, ${totalTokensOut} out`);
```

Замени на:
```ts
    console.log(`[Gen] ═══ ИТОГ ═══`);
    console.log(`[Gen] Тренды: ${trendItems.length} собрано → ${trendsForAI.length} после фильтра`);
    console.log(`[Gen] Идеи: ${genResult.ideas.length} сгенерировано → ${dedupResult.unique.length} после дедупа → ${finalIdeas.length} после валидации`);
    console.log(`[Gen] Модели: Opus (анализ + генерация + валидация), Sonnet (дедупликация)`);
    console.log(`[Gen] Токены: ${totalTokensIn} in, ${totalTokensOut} out`);
```

### D4. То же самое для cron/generate

**Файл:** `src/app/api/cron/generate/route.ts`

Примени точно такие же изменения что и в D3:
- Обнови импорт (добавь `analyzeTrends`, `validateIdeas`)
- Замени модель генерации на `"claude-opus-4-6"`
- Замени модель экспертов на `"claude-sonnet-4-6"`
- Встрой шаг анализа трендов перед генерацией
- Встрой шаг валидации после дедупликации
- Замени `maxIdeas: 10` на `maxIdeas: 7`

---

## БЛОК E: МЕЛКИЕ НО ВАЖНЫЕ ИСПРАВЛЕНИЯ

### E1. Убрать хардкод пароля

**Файл:** `src/app/api/reports/route.ts`

Найди:
```ts
const GENERATE_PASSWORD = "0811";
```

Замени на:
```ts
const GENERATE_PASSWORD = process.env.GENERATE_PASSWORD || "";
```

Добавь `GENERATE_PASSWORD=0811` в `.env` файл (создай если нет) и в Vercel Environment Variables.

---

## ИТОГОВЫЙ ПАЙПЛАЙН

```
15 трендов с контекстом (summary, спрос, описания, оригинальные заголовки)
  → Opus: анализ трендов — боли, аудитории, деньги, дыры, пересечения
    → Opus: генерация 7 идей на основе анализа болей
      → Sonnet: семантическая дедупликация
        → Opus: смысловая валидация — отсев нереалистичного
          → Sonnet: экспертный совет (5 экспертов + модератор)
            → Реалистичные, проверенные бизнес-идеи
```

---

## ПОСЛЕ ВСЕХ ИЗМЕНЕНИЙ

1. `npm run build` — убедись что нет ошибок
2. Если ошибки типов TypeScript — исправь, не меняя логику
3. `git add -A && git commit -m "feat: полная переработка пайплайна — Opus на входе, контекст трендов, двухшаговая генерация, смысловая валидация"`

## НЕ ДЕЛАЙ

- Не меняй UI-компоненты
- Не добавляй новые страницы
- Не трогай expert-chain.ts (он используется отдельно)
- Не меняй типы в types.ts без крайней необходимости
- Не задавай вопросы — просто делай
