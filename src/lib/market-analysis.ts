// #34 + #35 — Оценка рынка (TAM/SAM/SOM) + SEO-анализ
// Один AI-вызов: расчёт размера рынка + анализ ключевых слов

import Anthropic from "@anthropic-ai/sdk";

export interface MarketSize {
  tam: string;        // Total Addressable Market
  tamValue: string;   // "$5B" или "500 млрд ₽"
  sam: string;        // Serviceable Addressable Market
  samValue: string;
  som: string;        // Serviceable Obtainable Market
  somValue: string;
}

export interface SeoKeyword {
  keyword: string;
  difficulty: "easy" | "medium" | "hard";
  searchVolume: string;      // "10K/мес"
  recommendation: string;
}

export interface MarketAnalysisResult {
  marketSize: MarketSize;
  seoKeywords: SeoKeyword[];
  seoStrategy: string;
  marketTrends: string;
  competitiveLandscape: string;
}

export interface MarketAnalysisResponse {
  analysis: MarketAnalysisResult;
  tokensIn: number;
  tokensOut: number;
}

const MARKET_ANALYSIS_PROMPT = `Ты — аналитик рынков и SEO-специалист. Проведи комплексный анализ рынка и SEO для бизнес-идеи.

## Задача 1: Размер рынка (TAM/SAM/SOM)
- TAM (Total Addressable Market) — весь рынок: сколько людей/компаний МОГУТ быть клиентами
- SAM (Serviceable Addressable Market) — доступная часть: сколько из TAM ты реально можешь охватить (география, язык, канал)
- SOM (Serviceable Obtainable Market) — реалистичная доля: сколько клиентов реально получить за 1 год при бюджете до $500/мес
- Для каждого уровня: описание + денежная оценка

## Задача 2: SEO-анализ ключевых слов
- Подбери 5-8 ключевых запросов, по которым потенциальные клиенты будут искать продукт
- Для каждого: оценка сложности продвижения (easy/medium/hard), примерный объём поиска, рекомендация
- Общая SEO-стратегия: с чего начать, что приоритетнее

## Задача 3: Конкурентный ландшафт
- Краткий обзор конкурентной ситуации
- Тренды рынка: растёт/стабилен/падает

## Формат ответа — СТРОГО JSON:
{
  "marketSize": {
    "tam": "описание TAM",
    "tamValue": "денежная оценка TAM",
    "sam": "описание SAM",
    "samValue": "денежная оценка SAM",
    "som": "описание SOM",
    "somValue": "денежная оценка SOM"
  },
  "seoKeywords": [
    {
      "keyword": "запрос",
      "difficulty": "easy|medium|hard",
      "searchVolume": "примерный объём/мес",
      "recommendation": "как использовать"
    }
  ],
  "seoStrategy": "общая SEO-стратегия в 2-3 предложениях",
  "marketTrends": "тренды рынка в 2-3 предложениях",
  "competitiveLandscape": "конкурентный ландшафт в 2-3 предложениях"
}`;

export async function analyzeMarket(input: {
  ideaName: string;
  ideaDescription: string;
  targetAudience: string;
  monetization: string;
  market: string;
  validationContext?: string; // данные из Вордстат/DaData если есть
  apiKey: string;
  model: string;
}): Promise<MarketAnalysisResponse> {
  const client = new Anthropic({ apiKey: input.apiKey });

  const lang = input.market === "global" ? "английском" : "русском";
  const currency = input.market === "global" ? "долларах" : "рублях";

  const userPrompt = `Проанализируй рынок и SEO для этой бизнес-идеи:

**Идея:** ${input.ideaName}
**Описание:** ${input.ideaDescription}
**Целевая аудитория:** ${input.targetAudience}
**Монетизация:** ${input.monetization}
**Рынок:** ${input.market === "russia" ? "Россия" : input.market === "global" ? "Мировой" : "Оба"}
${input.validationContext || ""}

Все оценки в ${currency}. Ключевые слова на ${lang} языке.
Верни ТОЛЬКО JSON.`;

  const response = await client.messages.create({
    model: input.model,
    max_tokens: 4096,
    system: MARKET_ANALYSIS_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI не вернул ответ");
  }

  const cleaned = textBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new SyntaxError("AI не вернул JSON");

  const parsed = JSON.parse(jsonMatch[0]);

  const analysis: MarketAnalysisResult = {
    marketSize: {
      tam: String(parsed.marketSize?.tam || "Не оценено"),
      tamValue: String(parsed.marketSize?.tamValue || "—"),
      sam: String(parsed.marketSize?.sam || "Не оценено"),
      samValue: String(parsed.marketSize?.samValue || "—"),
      som: String(parsed.marketSize?.som || "Не оценено"),
      somValue: String(parsed.marketSize?.somValue || "—"),
    },
    seoKeywords: Array.isArray(parsed.seoKeywords)
      ? parsed.seoKeywords.map((k: Record<string, unknown>) => ({
          keyword: String(k.keyword || ""),
          difficulty: (["easy", "medium", "hard"].includes(String(k.difficulty))
            ? String(k.difficulty) : "medium") as "easy" | "medium" | "hard",
          searchVolume: String(k.searchVolume || "—"),
          recommendation: String(k.recommendation || ""),
        }))
      : [],
    seoStrategy: String(parsed.seoStrategy || ""),
    marketTrends: String(parsed.marketTrends || ""),
    competitiveLandscape: String(parsed.competitiveLandscape || ""),
  };

  return {
    analysis,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
  };
}
