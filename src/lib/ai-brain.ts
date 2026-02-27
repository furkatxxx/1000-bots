import Anthropic from "@anthropic-ai/sdk";
import type { GenerationResult, GeneratedIdea } from "./types";

interface BrainInput {
  trends: { title: string; score: number; source: string; category?: string }[];
  maxIdeas: number;
  model: string;
  apiKey: string;
}

// Системный промпт для Claude — генерация бизнес-идей на основе трендов
const SYSTEM_PROMPT = `Ты — AI-аналитик бизнес-идей. Твоя задача: на основе актуальных трендов и новостей предложить конкретные, реализуемые бизнес-идеи.

Правила:
1. Каждая идея должна быть конкретной — не "что-то с AI", а "SaaS-сервис для автоматической генерации описаний товаров"
2. Оценивай реалистичность — сможет ли один человек запустить это за 1-3 месяца?
3. Приоритет: идеи, которые можно реализовать с помощью AI-агентов (Claude Code)
4. Указывай конкретную монетизацию и целевую аудиторию
5. Пиши на русском языке

Ответ СТРОГО в формате JSON массива. Никакого текста до или после JSON.`;

function buildUserPrompt(input: BrainInput): string {
  const trendLines = input.trends
    .sort((a, b) => b.score - a.score)
    .slice(0, 50) // Берём топ-50 трендов
    .map((t) => `- [${t.source}] ${t.title} (популярность: ${t.score}/100${t.category ? `, категория: ${t.category}` : ""})`)
    .join("\n");

  return `Вот актуальные тренды на сегодня:

${trendLines}

На основе этих трендов предложи ${input.maxIdeas} бизнес-идей.

Для каждой идеи верни JSON-объект с полями:
- name: Короткое название идеи (2-5 слов)
- emoji: Один эмодзи, символизирующий идею
- description: Описание в 2-3 предложениях
- targetAudience: Для кого эта идея (конкретная аудитория)
- monetization: Как зарабатывать (подписка, фриланс, маркетплейс...)
- startupCost: "low" | "medium" | "high" + пояснение в скобках
- competitionLevel: "low" | "medium" | "high"
- trendBacking: Какие тренды из списка подтверждают эту идею
- actionPlan: Пошаговый план запуска (3-5 шагов, каждый с двоеточием)
- claudeCodeReady: true/false — можно ли основную часть реализовать через код
- difficulty: "easy" | "medium" | "hard"

Ответ — только JSON-массив, ничего больше.`;
}

// Парсим ответ Claude — извлекаем JSON из текста
function parseIdeas(text: string): GeneratedIdea[] {
  // Ищем JSON-массив в ответе
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("AI не вернул JSON-массив");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  if (!Array.isArray(parsed)) {
    throw new Error("AI вернул не массив");
  }

  // Валидируем и нормализуем каждую идею
  return parsed.map((item: Record<string, unknown>) => ({
    name: String(item.name || "Без названия"),
    emoji: String(item.emoji || "💡"),
    description: String(item.description || ""),
    targetAudience: String(item.targetAudience || ""),
    monetization: String(item.monetization || ""),
    startupCost: String(item.startupCost || "medium"),
    competitionLevel: String(item.competitionLevel || "medium"),
    trendBacking: String(item.trendBacking || ""),
    actionPlan: String(item.actionPlan || ""),
    claudeCodeReady: Boolean(item.claudeCodeReady),
    difficulty: String(item.difficulty || "medium"),
  }));
}

// Главная функция — генерация идей через Claude
export async function generateIdeas(input: BrainInput): Promise<GenerationResult> {
  if (!input.apiKey) {
    throw new Error("Не указан API-ключ Anthropic");
  }

  if (input.trends.length === 0) {
    throw new Error("Нет трендов для анализа. Сначала соберите тренды.");
  }

  const client = new Anthropic({ apiKey: input.apiKey });

  const response = await client.messages.create({
    model: input.model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildUserPrompt(input) },
    ],
  });

  // Извлекаем текст из ответа
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
}
