import Anthropic from "@anthropic-ai/sdk";
import type { GenerationResult, GeneratedIdea } from "./types";

interface BrainInput {
  trends: { title: string; score: number; source: string; category?: string }[];
  maxIdeas: number;
  model: string;
  apiKey: string;
  previousIdeas?: string[]; // Названия идей из прошлых отчётов (для дедупликации)
}

// Системный промпт — подробный, с примерами и фильтрами
const SYSTEM_PROMPT = `Ты — AI-аналитик бизнес-идей мирового уровня. Твоя задача: на основе актуальных трендов предлагать КОНКРЕТНЫЕ, реализуемые бизнес-идеи, которые один человек может запустить за 1-3 месяца.

## Контекст
У тебя есть доступ к AI-агентам (Claude Code), которые умеют:
- Писать код (сайты, боты, API, SaaS)
- Автоматизировать процессы (парсинг, рассылки, аналитика)
- Создавать контент (тексты, описания, переводы)
- Работать с данными (скрейпинг, обработка, отчёты)

## Фильтры качества — ОБЯЗАТЕЛЬНО соблюдай:
1. КОНКРЕТНОСТЬ: не "SaaS для бизнеса", а "Телеграм-бот для автоматической генерации описаний товаров на Wildberries"
2. РЕАЛИЗУЕМОСТЬ: один человек + AI-агенты, без найма сотрудников
3. БЮДЖЕТ: стартовые затраты до $1000 (хостинг, домен, API)
4. НЕ предлагай идеи, требующие: физическое производство, лицензии/сертификаты, большую команду, офис
5. ПРИОРИТЕТ: цифровые продукты, автоматизация, SaaS, боты, контент-инструменты

## Формат ответа
Ответ СТРОГО в формате JSON-массива. Никакого текста до или после JSON.

## Пример идеальной идеи:
{
  "name": "AI-копирайтер для маркетплейсов",
  "emoji": "✍️",
  "description": "Телеграм-бот + веб-панель, которые автоматически генерируют SEO-оптимизированные описания товаров для Wildberries, Ozon, Яндекс.Маркет. Продавец загружает фото — бот выдаёт готовое описание, характеристики и ключевые слова.",
  "targetAudience": "Продавцы на маркетплейсах (WB, Ozon) — 500K+ активных продавцов в РФ, большинство пишут описания вручную",
  "monetization": "Подписка: 990 руб/мес за 100 описаний, 2990 руб/мес безлимит. Фрилансеры покупают для перепродажи услуг.",
  "startupCost": "low (домен ~$10, хостинг ~$20/мес, Claude API ~$50/мес при 1000 описаний)",
  "competitionLevel": "medium — есть ChatGPT-обёртки, но нет специализированного инструмента для маркетплейсов РФ",
  "trendBacking": "Рост AI-инструментов для e-commerce, бум маркетплейсов в РФ",
  "actionPlan": "1. Создать MVP Телеграм-бота с Claude API (3 дня)\\n2. Добавить шаблоны под WB/Ozon/ЯМ (2 дня)\\n3. Запустить бета-тест с 20 продавцами из чатов WB (1 неделя)\\n4. Подключить оплату через ЮKassa (2 дня)\\n5. Масштабировать через рекламу в Telegram-каналах для селлеров",
  "claudeCodeReady": true,
  "difficulty": "easy",
  "successChance": 75,
  "estimatedRevenue": "50 000–150 000 руб/мес через 3 месяца при 50-150 платных подписчиках",
  "timeToLaunch": "7-10 дней до MVP"
}

Пиши на русском языке.`;

function buildUserPrompt(input: BrainInput): string {
  const trendLines = input.trends
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map((t) => `- [${t.source}] ${t.title} (популярность: ${t.score}/100${t.category ? `, категория: ${t.category}` : ""})`)
    .join("\n");

  let prompt = `Вот актуальные тренды на сегодня:

${trendLines}

На основе этих трендов предложи ${input.maxIdeas} бизнес-идей.`;

  // Дедупликация — не повторяй прошлые идеи
  if (input.previousIdeas && input.previousIdeas.length > 0) {
    prompt += `

ВАЖНО: Не повторяй эти идеи из прошлых отчётов, придумай НОВЫЕ:
${input.previousIdeas.map((name) => `- ${name}`).join("\n")}`;
  }

  prompt += `

Для каждой идеи верни JSON-объект с полями:
- name: Короткое название (2-5 слов)
- emoji: Один эмодзи
- description: Описание в 2-3 предложениях — ЧТО конкретно делает продукт
- targetAudience: Кто будет платить (с цифрами: размер аудитории, где её найти)
- monetization: Конкретная модель (цены, тарифы)
- startupCost: "low" | "medium" | "high" + пояснение с цифрами в скобках
- competitionLevel: "low" | "medium" | "high" + кто конкуренты
- trendBacking: Какие тренды из списка подтверждают спрос
- actionPlan: Пошаговый план запуска (5 шагов с конкретными сроками)
- claudeCodeReady: true/false — можно ли основную часть реализовать через код
- difficulty: "easy" | "medium" | "hard"
- successChance: число 1-100 — оценка шанса успеха (учитывай: размер рынка, конкуренцию, сложность, тренд)
- estimatedRevenue: ожидаемый доход за первые 3 месяца (диапазон в рублях)
- timeToLaunch: время до первого работающего MVP (в днях)

Ответ — только JSON-массив, ничего больше.`;

  return prompt;
}

// Валидируем и нормализуем одну идею
function validateIdea(item: Record<string, unknown>): GeneratedIdea | null {
  const name = String(item.name || "").trim();
  const description = String(item.description || "").trim();
  if (!name || !description) return null;

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
    successChance: typeof item.successChance === "number" ? Math.min(100, Math.max(1, Math.round(item.successChance))) : 50,
    estimatedRevenue: String(item.estimatedRevenue || "Не оценено"),
    timeToLaunch: String(item.timeToLaunch || "Не оценено"),
  };
}

// Парсим ответ Claude — извлекаем JSON из текста
function parseIdeas(text: string): GeneratedIdea[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("AI не вернул JSON-массив");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) {
    throw new Error("AI вернул не массив");
  }

  // Валидируем каждую идею, пропуская кривые
  const ideas: GeneratedIdea[] = [];
  for (const item of parsed) {
    const idea = validateIdea(item as Record<string, unknown>);
    if (idea) ideas.push(idea);
  }

  if (ideas.length === 0) {
    throw new Error("AI не вернул ни одной валидной идеи");
  }

  return ideas;
}

// Главная функция — генерация идей через Claude (с retry)
export async function generateIdeas(input: BrainInput): Promise<GenerationResult> {
  if (!input.apiKey) {
    throw new Error("Не указан API-ключ Anthropic");
  }

  if (input.trends.length === 0) {
    throw new Error("Нет трендов для анализа. Сначала соберите тренды.");
  }

  const client = new Anthropic({ apiKey: input.apiKey });
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model: input.model,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: buildUserPrompt(input) },
        ],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("AI не вернул текстовый ответ");
      }

      const ideas = parseIdeas(textBlock.text);

      return {
        ideas,
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens,
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
