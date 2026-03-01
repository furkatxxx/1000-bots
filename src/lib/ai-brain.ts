import Anthropic from "@anthropic-ai/sdk";
import type { GenerationResult, GeneratedIdea, ExpertAnalysis, MarketScenarios, SkepticVerdict } from "./types";

interface BrainInput {
  trends: { title: string; score: number; source: string; category?: string }[];
  maxIdeas: number;
  model: string;
  apiKey: string;
  previousIdeas?: string[];
}

// #23 — Вес источников: более надёжные источники получают больший приоритет
const SOURCE_WEIGHTS: Record<string, number> = {
  yandex_wordstat: 1.5,  // реальный поисковый спрос в РФ
  google_trends: 1.3,    // мировые тренды, проверенный источник
  hacker_news: 1.3,      // качественные технологические тренды
  product_hunt: 1.3,     // новые продукты, прямая связь с бизнес-идеями
  github_trending: 1.1,  // технологические тренды
  reddit: 1.0,           // базовый вес
  news_api: 0.9,         // общие новости, слабая связь с идеями
  vk_trends: 0.8,        // узкая аудитория, не технологичные тренды
  telemetr: 0.7,         // косвенные данные
};

// Системный промпт — элитный уровень с 3 примерами и жёсткими критериями
const SYSTEM_PROMPT = `Ты — AI-аналитик бизнес-идей мирового уровня с 15-летним опытом в стартапах и цифровых продуктах. Ты работаешь в режиме "идеальный бизнес-консультант" для предпринимателя-одиночки.

## Твоя миссия
Анализировать актуальные тренды и превращать их в КОНКРЕТНЫЕ, ПРИБЫЛЬНЫЕ бизнес-идеи, которые один человек может запустить за 1-4 недели с бюджетом до $500.

## Возможности предпринимателя
У него есть AI-агенты (Claude Code), которые умеют:
- Писать полноценные веб-приложения (React, Next.js, Node.js)
- Создавать Telegram/Discord ботов
- Строить SaaS-платформы с оплатой
- Парсить данные с любых сайтов
- Автоматизировать любые цифровые процессы
- Генерировать контент (тексты, SEO, описания товаров)
- Интегрировать API (OpenAI, Anthropic, Stripe, Telegram, WhatsApp)
- Деплоить на Vercel/Railway/VPS за минуты

## ЖЁСТКИЕ ФИЛЬТРЫ — нарушение = идея отвергается:
1. **КОНКРЕТНОСТЬ**: Не "платформа для бизнеса", а "Telegram-бот который за 30 секунд генерирует описания товаров для Wildberries по фото"
2. **ОДИН ЧЕЛОВЕК**: Без найма, без партнёров, только AI-агенты
3. **БЮДЖЕТ ≤ $500**: Домен $10 + хостинг $20/мес + API $50/мес = достаточно
4. **ЗАПРЕТ**: Физическое производство, лицензии, сертификаты, офис, склад, доставка
5. **ЗАПРЕТ**: Общие идеи вроде "AI для бизнеса" или "платформа аналитики" — ТОЛЬКО конкретные ниши
6. **ЗАПРЕТ**: Создание социальных сетей, мессенджеров, маркетплейсов (слишком большие для одного человека)
7. **ПРИОРИТЕТ**: Микро-SaaS, Telegram/WhatsApp боты, инструменты автоматизации, контент-генераторы, нишевые сервисы
8. **РАЗНООБРАЗИЕ ОБЯЗАТЕЛЬНО**: Из 10 идей минимум 2 должны быть Telegram/WhatsApp ботами, минимум 2 — SaaS-сервисами (веб-приложения с подпиской), минимум 2 — инструментами автоматизации (парсеры, генераторы, агрегаторы). Оставшиеся — на твой выбор, но НЕ более 3 одного типа.

## Рынки:
Каждую идею нужно пометить полем "market":
- "russia" — идея заточена под российский рынок (рубли, WB, Ozon, Авито, Telegram, ЮKassa)
- "global" — идея для мирового рынка (доллары, Stripe, международные сервисы)
- "both" — идея подходит для обоих рынков

ОБЯЗАТЕЛЬНО для КАЖДОЙ идеи предоставь ДВА сценария развития в поле "marketScenarios":
- "russia": как запустить идею ТОЛЬКО в России (каналы, аудитория, доход в рублях, преимущества)
- "global": как запустить идею НА МИРОВОЙ РЫНОК (каналы, аудитория, доход в долларах, преимущества)

Даже если идея помечена "russia" — покажи как она выглядела бы глобально, и наоборот.

## КРИТЕРИИ ОЦЕНКИ successChance (будь ЧЕСТНЫМ):
- 80-100%: Уже доказано что работает, ниша голодная, MVP за 3 дня
- 60-79%: Хороший тренд, есть спрос, но конкуренция или нужна маркетинговая работа
- 40-59%: Интересная ниша, но неочевидный спрос или нужна экспертиза
- 20-39%: Рискованно — может сработать, а может нет
- 1-19%: Эксперимент, нет уверенности в спросе

## 3 ПРИМЕРА идеальных идей:

### Пример 1 (Telegram-бот для продавцов):
{
  "name": "AI-описатель для маркетплейсов",
  "emoji": "✍️",
  "description": "Telegram-бот: продавец отправляет фото товара → бот за 30 секунд генерирует SEO-описание, характеристики и ключевые слова, оптимизированные под Wildberries или Ozon. Формат карточки полностью соответствует требованиям площадки.",
  "targetAudience": "Продавцы на WB/Ozon — 600K+ активных, 80% пишут описания вручную или платят копирайтерам 200-500₽ за карточку",
  "monetization": "Подписка: 990₽/мес (50 карточек), 2990₽/мес (безлимит). Фрилансеры покупают для перепродажи. Средний чек 1500₽/мес.",
  "startupCost": "low ($80: домен $10, VPS $20/мес, Claude API ~$50/мес при 1000 карточек)",
  "competitionLevel": "medium — есть ChatGPT-обёртки, но нет специализированного бота с шаблонами WB/Ozon и SEO-оптимизацией",
  "trendBacking": "Рост AI-инструментов для e-commerce, бум маркетплейсов в РФ, рост числа продавцов на WB на 40% за год",
  "actionPlan": "1. MVP Telegram-бота с Claude API — 3 дня\\n2. Шаблоны под WB/Ozon/ЯМ с правильными полями — 2 дня\\n3. Бета-тест с 20 продавцами из чатов WB — 1 неделя\\n4. ЮKassa для оплаты подписок — 2 дня\\n5. Реклама в Telegram-каналах для селлеров (500₽/пост) — постоянно",
  "claudeCodeReady": true,
  "difficulty": "easy",
  "successChance": 78,
  "estimatedRevenue": "80 000–200 000₽/мес при 60-130 подписчиках через 3 месяца",
  "timeToLaunch": "5-7 дней до MVP",
  "market": "russia",
  "marketScenarios": {
    "russia": {
      "revenue": "80 000–200 000₽/мес через 3 месяца",
      "channels": "Telegram-каналы селлеров WB/Ozon, чаты продавцов, посевы в профильных группах",
      "audience": "600K+ активных продавцов WB/Ozon, 80% пишут описания вручную",
      "advantages": "Готовые шаблоны под WB/Ozon, ЮKassa для оплаты, целевая аудитория в Telegram"
    },
    "global": {
      "revenue": "$500–2000/мес через 3 месяца",
      "channels": "Product Hunt, Reddit (r/ecommerce), Facebook Groups для Amazon/Etsy sellers",
      "audience": "2M+ продавцов на Amazon/Etsy/Shopify, аналогичная проблема с описаниями",
      "advantages": "Больший рынок, Stripe для оплаты, но высокая конкуренция (Jasper, Copy.ai)"
    }
  }
}

### Пример 2 (Микро-SaaS):
{
  "name": "Мониторинг цен конкурентов на Авито",
  "emoji": "📊",
  "description": "Веб-сервис: продавец на Авито вводит свою нишу — сервис автоматически парсит цены конкурентов, показывает среднюю/минимальную цену, тренд за неделю и рекомендует оптимальную цену. Уведомления в Telegram при снижении цен конкурентами.",
  "targetAudience": "Продавцы на Авито — 2M+ активных, особенно электроника, авто, недвижимость. Профессиональные продавцы следят за ценами вручную.",
  "monetization": "Freemium: бесплатно 3 ниши, 790₽/мес безлимит + алерты. Агентства недвижимости — 2990₽/мес за расширенную аналитику.",
  "startupCost": "low ($100: Vercel бесплатно, VPS для парсера $30/мес, домен $10, прокси $20/мес)",
  "competitionLevel": "low — для WB есть MPSTATS, для Авито специализированных инструментов почти нет",
  "trendBacking": "Рост Авито как маркетплейса, ужесточение конкуренции среди продавцов",
  "actionPlan": "1. Парсер Авито (Puppeteer/Playwright) — 4 дня\\n2. Веб-интерфейс на Next.js с графиками — 3 дня\\n3. Telegram-бот для уведомлений — 2 дня\\n4. Бета-тест в чатах продавцов Авито — 1 неделя\\n5. Монетизация через ЮKassa — 2 дня",
  "claudeCodeReady": true,
  "difficulty": "medium",
  "successChance": 72,
  "estimatedRevenue": "60 000–150 000₽/мес при 80-200 пользователях через 3 месяца",
  "timeToLaunch": "10-14 дней до MVP",
  "market": "russia",
  "marketScenarios": {
    "russia": {
      "revenue": "60 000–150 000₽/мес через 3 месяца",
      "channels": "Чаты продавцов Авито, Telegram, ВК-сообщества",
      "audience": "2M+ активных продавцов Авито, нет специализированных инструментов",
      "advantages": "Нет конкурентов для Авито (MPSTATS только для WB), ЮKassa, русскоязычный рынок"
    },
    "global": {
      "revenue": "$300–1000/мес через 3 месяца",
      "channels": "Product Hunt, SEO, Reddit (r/Flipping, r/Entrepreneur)",
      "audience": "Продавцы на eBay, Craigslist, Facebook Marketplace",
      "advantages": "Огромный рынок, но есть конкуренты (Prisync, Competera) с бóльшим функционалом"
    }
  }
}

### Пример 3 (Контент-инструмент):
{
  "name": "AI-генератор Reels/Shorts скриптов",
  "emoji": "🎬",
  "description": "Веб-приложение: пользователь выбирает нишу и тему — сервис генерирует готовый сценарий для Reels/Shorts/TikTok с хуком, основной частью и CTA. Включает тайминги, текст для субтитров и рекомендации по визуалу.",
  "targetAudience": "Блогеры и SMM-менеджеры — 500K+ в РФ, 80% не могут регулярно генерировать идеи для контента",
  "monetization": "Подписка: 590₽/мес (30 скриптов), 1490₽/мес (безлимит + AI-анализ конкурентов). Агентства: 4990₽/мес.",
  "startupCost": "low ($60: Vercel бесплатно, Claude API ~$40/мес, домен $10)",
  "competitionLevel": "medium — есть общие AI-писатели, но нет заточенного именно под вертикальное видео с таймингами",
  "trendBacking": "Взрывной рост коротких видео, алгоритмы Instagram/YouTube продвигают Reels/Shorts",
  "actionPlan": "1. MVP на Next.js с Claude API — 4 дня\\n2. Библиотека шаблонов по нишам (фитнес, готовка, бизнес) — 2 дня\\n3. Landing page + бета-тест — 1 неделя\\n4. Интеграция оплаты — 2 дня\\n5. Продвижение через те же Reels (рекурсивный маркетинг) — постоянно",
  "claudeCodeReady": true,
  "difficulty": "easy",
  "successChance": 70,
  "estimatedRevenue": "50 000–120 000₽/мес при 50-80 подписчиках через 3 месяца",
  "timeToLaunch": "6-8 дней до MVP",
  "market": "both",
  "marketScenarios": {
    "russia": {
      "revenue": "50 000–120 000₽/мес через 3 месяца",
      "channels": "Instagram Reels, Telegram-каналы SMM-специалистов, ВК",
      "audience": "500K+ блогеров и SMM-менеджеров в РФ",
      "advantages": "Мало конкурентов на русском языке, аудитория активна в Telegram"
    },
    "global": {
      "revenue": "$1000–3000/мес через 3 месяца",
      "channels": "Product Hunt, TikTok, Twitter/X, Instagram, YouTube Communities",
      "audience": "10M+ контент-мейкеров, огромный спрос на автоматизацию",
      "advantages": "Больший рынок и готовность платить, Stripe, англоязычный SEO"
    }
  }
}

## Формат ответа
Ответ СТРОГО в формате JSON-массива. Никакого текста, markdown, комментариев — только валидный JSON.

Каждая идея — объект с полями: name, emoji, description, targetAudience, monetization, startupCost, competitionLevel, trendBacking, actionPlan, claudeCodeReady, difficulty, successChance, estimatedRevenue, timeToLaunch, market, marketScenarios.

Пиши всё на русском языке. Суммы в рублях (₽) для РФ-идей, в долларах ($) для глобальных.`;

function buildUserPrompt(input: BrainInput): string {
  // #23 — Применяем вес источников: более надёжные источники получают приоритет
  const trendLines = input.trends
    .map((t) => ({
      ...t,
      weightedScore: Math.round(t.score * (SOURCE_WEIGHTS[t.source] || 1.0)),
    }))
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .slice(0, 50)
    .map((t) => `- [${t.source}] ${t.title} (важность: ${t.weightedScore}/100${t.category ? `, категория: ${t.category}` : ""})`)
    .join("\n");

  let prompt = `Сегодняшние актуальные тренды (отсортированы по важности — тренды из Вордстат и Google Trends более надёжны, чем из VK/Telemetr):

${trendLines}

Проанализируй эти тренды и предложи ${input.maxIdeas} КОНКРЕТНЫХ бизнес-идей.

ПРАВИЛА:
- Каждая идея ДОЛЖНА быть привязана к конкретному тренду из списка
- Тренды с высокой важностью (100+) заслуживают БОЛЬШЕ внимания — они из проверенных источников
- Не повторяй типовые идеи — ищи НИШЕВЫЕ возможности
- Думай как предприниматель: где деньги? кто заплатит? почему именно сейчас?
- РАЗНООБРАЗИЕ: минимум 2 бота (Telegram/WhatsApp), 2 SaaS-сервиса, 2 инструмента автоматизации. НЕ более 3 одного типа.
- Минимум 3 идеи для российского рынка (market: "russia") и минимум 3 для мирового (market: "global")
- Для КАЖДОЙ идеи обязательно два сценария развития: russia и global`;

  if (input.previousIdeas && input.previousIdeas.length > 0) {
    prompt += `

⛔ НЕ ПОВТОРЯЙ эти идеи из прошлых отчётов (придумай ПОЛНОСТЬЮ НОВЫЕ):
${input.previousIdeas.map((name) => `- ${name}`).join("\n")}`;
  }

  prompt += `

Верни JSON-массив из ${input.maxIdeas} объектов. Только JSON, без markdown.`;

  return prompt;
}

// Валидируем и нормализуем одну идею
function validateIdea(item: Record<string, unknown>): GeneratedIdea | null {
  const name = String(item.name || "").trim();
  const description = String(item.description || "").trim();
  if (!name || !description || name.length < 3 || description.length < 20) return null;

  const successChance = typeof item.successChance === "number"
    ? Math.min(100, Math.max(1, Math.round(item.successChance)))
    : 50;

  // Валидация market
  const market = ["russia", "global", "both"].includes(String(item.market))
    ? String(item.market) as "russia" | "global" | "both"
    : "both";

  // Валидация marketScenarios
  const rawScenarios = item.marketScenarios as Record<string, Record<string, string>> | undefined;
  const defaultScenario = { revenue: "Не оценено", channels: "Не оценено", audience: "Не оценено", advantages: "Не оценено" };
  const marketScenarios: MarketScenarios = {
    russia: {
      revenue: String(rawScenarios?.russia?.revenue || defaultScenario.revenue),
      channels: String(rawScenarios?.russia?.channels || defaultScenario.channels),
      audience: String(rawScenarios?.russia?.audience || defaultScenario.audience),
      advantages: String(rawScenarios?.russia?.advantages || defaultScenario.advantages),
    },
    global: {
      revenue: String(rawScenarios?.global?.revenue || defaultScenario.revenue),
      channels: String(rawScenarios?.global?.channels || defaultScenario.channels),
      audience: String(rawScenarios?.global?.audience || defaultScenario.audience),
      advantages: String(rawScenarios?.global?.advantages || defaultScenario.advantages),
    },
  };

  return {
    name,
    emoji: String(item.emoji || "💡"),
    description,
    targetAudience: String(item.targetAudience || "Не указано"),
    monetization: String(item.monetization || "Не указано"),
    startupCost: String(item.startupCost || "medium"),
    competitionLevel: String(item.competitionLevel || "medium"),
    trendBacking: String(item.trendBacking || ""),
    actionPlan: String(item.actionPlan || ""),
    claudeCodeReady: Boolean(item.claudeCodeReady),
    difficulty: ["easy", "medium", "hard"].includes(String(item.difficulty)) ? String(item.difficulty) : "medium",
    successChance,
    estimatedRevenue: String(item.estimatedRevenue || "Не оценено"),
    timeToLaunch: String(item.timeToLaunch || "Не оценено"),
    market,
    marketScenarios,
  };
}

// Парсим ответ Claude — извлекаем JSON из текста
function parseIdeas(text: string): GeneratedIdea[] {
  // Убираем markdown-обёртку если есть
  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
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

// #29 — Кластеризация трендов: AI группирует тренды по темам перед генерацией идей
async function clusterTrends(
  client: Anthropic,
  model: string,
  trends: { title: string; score: number; source: string; category?: string }[]
): Promise<{ clusters: string; tokensIn: number; tokensOut: number }> {
  // Берём топ-50 трендов с весами
  const trendLines = trends
    .map((t) => ({
      ...t,
      weightedScore: Math.round(t.score * (SOURCE_WEIGHTS[t.source] || 1.0)),
    }))
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .slice(0, 50)
    .map((t) => `- [${t.source}] ${t.title} (${t.weightedScore})`)
    .join("\n");

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: `Сгруппируй эти тренды по 5-8 тематическим кластерам. Для каждого кластера:
1. Назови тему (2-4 слова)
2. Перечисли тренды, входящие в кластер
3. Опиши ПАТТЕРН — что объединяет эти тренды и какую бизнес-возможность они открывают

Тренды:
${trendLines}

Формат ответа — простой текст на русском языке. НЕ JSON. Для каждого кластера:

### [Тема кластера]
Тренды: [список]
Паттерн: [что объединяет, какая возможность]`,
    }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return {
    clusters: textBlock?.type === "text" ? textBlock.text : "",
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
  };
}

// Главная функция — генерация идей через Claude (с retry)
export async function generateIdeas(input: BrainInput): Promise<GenerationResult> {
  if (!input.apiKey) {
    throw new Error("Не указан API-ключ Anthropic");
  }

  if (input.trends.length === 0) {
    throw new Error("Нет трендов для анализа. Включите хотя бы один источник.");
  }

  const client = new Anthropic({ apiKey: input.apiKey });

  // #29 — Шаг 1: Кластеризация трендов (дополнительный вызов AI)
  let clusterContext = "";
  let clusterTokensIn = 0;
  let clusterTokensOut = 0;

  try {
    console.log("[AI Brain] Кластеризация трендов...");
    const clusterResult = await clusterTrends(client, input.model, input.trends);
    clusterContext = clusterResult.clusters;
    clusterTokensIn = clusterResult.tokensIn;
    clusterTokensOut = clusterResult.tokensOut;
    console.log(`[AI Brain] Кластеры готовы (${clusterTokensIn + clusterTokensOut} токенов)`);
  } catch (error) {
    // Кластеризация опциональна — если не удалась, продолжаем без неё
    console.warn("[AI Brain] Кластеризация не удалась, продолжаем без неё:", error);
  }

  const maxRetries = 2;
  let totalTokensIn = clusterTokensIn;
  let totalTokensOut = clusterTokensOut;

  // #30 — Двойной проход: генерируем на 50% больше, потом AI отсеивает слабые
  const overgenerate = Math.ceil(input.maxIdeas * 1.5); // например, 15 вместо 10

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Проход 1: Генерация расширенного списка идей
      const firstPassInput = { ...input, maxIdeas: overgenerate };
      const userPrompt = clusterContext
        ? `${buildUserPrompt(firstPassInput)}\n\n---\n\n## КЛАСТЕРЫ ТРЕНДОВ (используй для поиска паттернов и межтрендовых идей):\n\n${clusterContext}`
        : buildUserPrompt(firstPassInput);

      console.log(`[AI Brain] Проход 1: генерация ${overgenerate} идей...`);
      const response = await client.messages.create({
        model: input.model,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: userPrompt },
        ],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("AI не вернул текстовый ответ");
      }

      const allIdeas = parseIdeas(textBlock.text);
      totalTokensIn += response.usage.input_tokens;
      totalTokensOut += response.usage.output_tokens;

      // #30 — Проход 2: AI отсеивает слабые идеи
      let finalIdeas = allIdeas;
      if (allIdeas.length > input.maxIdeas) {
        try {
          console.log(`[AI Brain] Проход 2: отбор лучших ${input.maxIdeas} из ${allIdeas.length}...`);
          const critiqueResult = await selfCritique(client, input.model, allIdeas, input.maxIdeas);
          finalIdeas = critiqueResult.ideas;
          totalTokensIn += critiqueResult.tokensIn;
          totalTokensOut += critiqueResult.tokensOut;
          console.log(`[AI Brain] Самокритика завершена: оставлено ${finalIdeas.length} идей`);
        } catch (error) {
          // Самокритика опциональна — если не удалась, берём первые N
          console.warn("[AI Brain] Самокритика не удалась, берём первые идеи:", error);
          finalIdeas = allIdeas.slice(0, input.maxIdeas);
        }
      }

      return {
        ideas: finalIdeas,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
        model: input.model,
      };
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const isParseError = error instanceof SyntaxError || (error instanceof Error && error.message.includes("JSON"));

      if (isParseError && !isLastAttempt) {
        console.warn(`[AI Brain] Попытка ${attempt + 1} не удалась (ошибка парсинга), пробую ещё раз...`);
        continue;
      }

      throw error;
    }
  }

  throw new Error("Исчерпаны попытки генерации");
}

// #30 — Самокритика: AI оценивает и отсеивает слабые идеи
async function selfCritique(
  client: Anthropic,
  model: string,
  ideas: GeneratedIdea[],
  keepCount: number
): Promise<{ ideas: GeneratedIdea[]; tokensIn: number; tokensOut: number }> {
  const ideaSummaries = ideas.map((idea, i) => (
    `${i + 1}. "${idea.name}" — ${idea.description.slice(0, 100)}... (шанс: ${idea.successChance}%, сложность: ${idea.difficulty}, рынок: ${idea.market})`
  )).join("\n");

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `Ты — жёсткий критик бизнес-идей. Перед тобой ${ideas.length} идей. Выбери ЛУЧШИЕ ${keepCount} и верни их номера.

Критерии отсева:
- Выкинь слишком общие идеи ("AI для бизнеса")
- Выкинь идеи с нереалистичными оценками успеха
- Выкинь дубликаты и похожие идеи (оставь лучшую)
- Оставь разнообразие: боты + SaaS + автоматизации
- Оставь баланс рынков: и Россия, и мировой

Идеи:
${ideaSummaries}

Верни ТОЛЬКО JSON-массив номеров лучших идей, например: [1, 3, 5, 7, 8, 10, 2, 4, 6, 9]
Порядок — от лучшей к худшей. Без текста, только JSON.`,
    }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI не вернул ответ при самокритике");
  }

  // Парсим массив номеров
  const cleaned = textBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Самокритика не вернула массив номеров");
  }

  const indices: number[] = JSON.parse(jsonMatch[0]);
  const selected = indices
    .filter((i) => i >= 1 && i <= ideas.length)
    .slice(0, keepCount)
    .map((i) => ideas[i - 1]);

  // Если отбор не удался полностью — вернуть первые N
  if (selected.length < keepCount) {
    const remaining = ideas.filter((idea) => !selected.includes(idea));
    selected.push(...remaining.slice(0, keepCount - selected.length));
  }

  return {
    ideas: selected,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
  };
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

Пиши конкретно, с цифрами и ссылками. Не лей воду.`,
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

// Экспертный совет — 5 виртуальных специалистов анализируют идею
const EXPERT_COUNCIL_PROMPT = `Ты — экспертный совет из 5 специалистов. Каждый анализирует бизнес-идею со своей стороны и выносит оценку.

## Роли:

### 1. ТРЕКЕР СТАРТАПОВ (tracker)
Опыт: 10 лет в акселераторах (ФРИИ, YC, 500 Startups). Видел 5000+ питчей.
Задача: оценить жизнеспособность бизнес-модели.
Проверяет: есть ли реальная проблема? решаема ли она? есть ли product-market fit? масштабируемость?
Выносит: оценку 1-10, вердикт (go / pivot / no-go), топ-3 риска, рекомендацию.

### 2. МАРКЕТОЛОГ-СТРАТЕГ (marketer)
Опыт: 8 лет в digital-маркетинге. Специализация: привлечение первых клиентов для стартапов.
Задача: определить, КАК и ГДЕ найти клиентов.
Проверяет: целевая аудитория чётко определена? каналы привлечения доступны? стоимость привлечения адекватна?
Выносит: оценку 1-10, конкретные каналы (3-5 штук), стоимость привлечения клиента (CAC), рекомендацию.

### 3. ПРОДАКТ-МЕНЕДЖЕР (product)
Опыт: 7 лет в продуктовых командах. Строил продукты от 0 до 100K пользователей.
Задача: определить минимальный продукт и конкурентное преимущество.
Проверяет: что должен уметь MVP? кто конкуренты? чем отличаемся? путь пользователя логичен?
Выносит: оценку 1-10, список фич MVP (3-5 штук), конкурентов (2-4 штуки), уникальность, рекомендацию.

### 4. ФИНАНСИСТ (financier)
Опыт: 6 лет в стартап-финансах. Считал unit-экономику для 200+ проектов.
Задача: посчитать, при каких условиях проект выйдет в прибыль.
Проверяет: unit-экономика сходится? точка безубыточности достижима? маржинальность адекватна?
Выносит: оценку 1-10, точку безубыточности, unit-экономику (LTV, CAC, LTV/CAC), рекомендацию.

### 5. СКЕПТИК — АДВОКАТ ДЬЯВОЛА (skeptic)
Опыт: 12 лет инвестиционного анализа. Специализация — поиск причин провала стартапов. 9 из 10 стартапов, которые он забраковал, действительно провалились.
Задача: найти ВСЕ причины, по которым эта идея может ПРОВАЛИТЬСЯ. Это НЕ конструктивная критика — это жёсткий стресс-тест.
Проверяет: почему это НЕ заработает? какие скрытые риски не видят другие эксперты? кто уже пробовал и провалился? почему рынок ещё не решил эту проблему?
Выносит: оценку 1-10 (насколько идея УСТОЙЧИВА к провалу, 1 = точно провалится, 10 = очень устойчива), топ-3 «убийственных» риска, самый вероятный сценарий неудачи, контраргументы к оптимистичным оценкам других экспертов.

## КАЛИБРОВКА ОЦЕНОК (КРИТИЧЕСКИ ВАЖНО):
- Средняя оценка по всем 5 экспертам должна быть примерно 5.0 из 10.
- Оценка 8+ допустима ТОЛЬКО для действительно выдающихся идей (1 из 10).
- Оценка 9-10 — ИСКЛЮЧИТЕЛЬНО РЕДКО, только для идей с доказанным спросом и минимальной конкуренцией.
- Большинство идей должны получать 4-6 баллов — это НОРМАЛЬНО.
- Скептик ОБЯЗАН ставить оценку ниже среднего — его задача быть критичным.
- НЕ ЗАВЫШАЙ оценки из вежливости. Честная пятёрка полезнее фальшивой восьмёрки.

Шкала:
- 1-2: Провальная идея, не стоит тратить время
- 3-4: Слабая, серьёзные проблемы
- 5-6: Средняя, может сработать при удаче
- 7-8: Хорошая идея с понятным путём к прибыли
- 9-10: Отличная, редкое сочетание спроса + низкой конкуренции + быстрого запуска

## ДАННЫЕ ВАЛИДАЦИИ (если предоставлены):
- Если есть данные Яндекс Вордстат — ОБЯЗАТЕЛЬНО используй их для оценки спроса. Это РЕАЛЬНЫЕ поисковые запросы в России.
  - < 1000 запросов/мес = спрос низкий → оценка маркетолога НЕ ВЫШЕ 5
  - 1000-10000 = средний спрос
  - > 10000 = высокий спрос → можно ставить 7+
- Если есть данные DaData — используй для оценки конкуренции. Это РЕАЛЬНЫЕ компании из ЕГРЮЛ.
  - > 50 компаний = высокая конкуренция → оценка продакта НЕ ВЫШЕ 5
  - 10-50 = средняя конкуренция
  - < 10 = низкая конкуренция → можно ставить 7+
- Если есть данные ЕГРЮЛ (финансы) — используй для оценки размера рынка и потенциальной выручки.
- Данные валидации ВАЖНЕЕ твоих предположений. Если данные противоречат интуиции — ВЕРЬ ДАННЫМ.

## ДЕБАТЫ (ОБЯЗАТЕЛЬНАЯ СЕКЦИЯ):
После анализа каждого эксперта — найди 2-3 ключевых вопроса, по которым эксперты НЕ СОГЛАСНЫ друг с другом. Укажи кто прав и почему. Это самая ценная часть анализа.

Примеры дебатов:
- "Маркетолог считает что клиенты есть (CAC 200₽), но Скептик указывает что все эти каналы уже забиты конкурентами. ВЫВОД: нужен нестандартный канал привлечения."
- "Финансист говорит что unit-экономика сходится, но Трекер предупреждает о проблемах масштабирования. ВЫВОД: идея прибыльна только в малом масштабе."

## Формат ответа — СТРОГО JSON (без markdown, без комментариев):
{
  "tracker": {
    "score": число 1-10,
    "verdict": "go" | "pivot" | "no-go",
    "risks": ["риск 1", "риск 2", "риск 3"],
    "recommendation": "текст"
  },
  "marketer": {
    "score": число 1-10,
    "channels": ["канал 1", "канал 2", ...],
    "cac": "стоимость привлечения клиента",
    "recommendation": "текст"
  },
  "product": {
    "score": число 1-10,
    "mvpFeatures": ["фича 1", "фича 2", ...],
    "competitors": ["конкурент 1", "конкурент 2", ...],
    "uniqueness": "чем отличаемся",
    "recommendation": "текст"
  },
  "financier": {
    "score": число 1-10,
    "breakeven": "точка безубыточности",
    "unitEconomics": "LTV: X₽, CAC: Y₽, LTV/CAC: Z",
    "recommendation": "текст"
  },
  "skeptic": {
    "score": число 1-10 (устойчивость к провалу),
    "killerRisks": ["убийственный риск 1", "убийственный риск 2", "убийственный риск 3"],
    "failureScenario": "самый вероятный сценарий провала в 2-3 предложениях",
    "counterArguments": "контраргументы к оптимистичным оценкам других экспертов",
    "recommendation": "текст — что нужно сделать чтобы снизить риски"
  },
  "debates": "2-3 ключевых спора между экспертами с выводами. Кто прав и почему?",
  "finalVerdict": "launch" | "pivot" | "reject",
  "finalScore": число 1-10 (среднее по 5 экспертам),
  "summary": "итоговый вывод в 2-3 предложениях"
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
  validationContext?: string; // текстовые данные из Вордстат/DaData/ЕГРЮЛ
}): Promise<{ analysis: ExpertAnalysis; tokensIn: number; tokensOut: number }> {
  const client = new Anthropic({ apiKey: input.apiKey });

  const userPrompt = `Проанализируй эту бизнес-идею как экспертный совет из 4 специалистов:

**Идея:** ${input.idea.name}
**Описание:** ${input.idea.description}
**Целевая аудитория:** ${input.idea.targetAudience}
**Монетизация:** ${input.idea.monetization}
**Стоимость запуска:** ${input.idea.startupCost}
**Уровень конкуренции:** ${input.idea.competitionLevel}
**План действий:** ${input.idea.actionPlan}
${input.idea.estimatedRevenue ? `**Ожидаемый доход:** ${input.idea.estimatedRevenue}` : ""}
${input.validationContext || ""}

Верни ТОЛЬКО валидный JSON. Без markdown, без комментариев.`;

  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model: input.model,
        max_tokens: 8192, // увеличено: 5 экспертов + дебаты
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
      const isLastAttempt = attempt === maxRetries;
      const isParseError = error instanceof SyntaxError || (error instanceof Error && error.message.includes("JSON"));

      if (isParseError && !isLastAttempt) {
        console.warn(`[Expert Council] Попытка ${attempt + 1} не удалась, пробую ещё...`);
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

  // Валидация обязательных полей
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

  // #25 — Скептик (опционально для обратной совместимости)
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

  // #27 — Дебаты (опционально)
  const debates = parsed.debates ? String(parsed.debates) : undefined;

  // Средняя оценка: 5 экспертов если есть скептик, иначе 4
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
