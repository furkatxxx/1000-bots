// #36 — Генерация рекламных текстов для тестирования спроса
// AI создаёт объявления для разных площадок

import Anthropic from "@anthropic-ai/sdk";

export interface AdVariant {
  platform: string;         // "Яндекс Директ", "Telegram Ads", "VK Реклама", "Google Ads", "Facebook Ads"
  headline: string;         // Заголовок объявления
  description: string;      // Текст объявления
  callToAction: string;     // Призыв к действию
  targetingTips: string;    // Рекомендации по таргетингу
}

export interface AdCopyResult {
  ads: AdVariant[];
  generalStrategy: string;  // Общая рекомендация по рекламе
  estimatedBudget: string;  // Рекомендуемый тестовый бюджет
}

export interface AdCopyResponse {
  result: AdCopyResult;
  tokensIn: number;
  tokensOut: number;
}

const AD_COPY_PROMPT = `Ты — копирайтер-маркетолог с 10-летним опытом создания рекламных объявлений для стартапов. Твоя задача — написать тексты объявлений для тестовой рекламной кампании.

## Требования:
- Пиши ПРОДАЮЩИЕ тексты — с болью, выгодой и призывом к действию
- Каждое объявление адаптировано под КОНКРЕТНУЮ площадку (формат, лимиты символов, стиль)
- Для российского рынка: Яндекс Директ, VK Реклама, Telegram Ads
- Для мирового рынка: Google Ads, Facebook/Instagram Ads, Twitter/X Ads
- Для обоих: 3 российских + 2 мировых

## Формат ответа — СТРОГО JSON:
{
  "ads": [
    {
      "platform": "название площадки",
      "headline": "заголовок (учитывай лимиты площадки)",
      "description": "текст объявления",
      "callToAction": "кнопка CTA",
      "targetingTips": "кому показывать: возраст, интересы, ключевые слова"
    }
  ],
  "generalStrategy": "общая стратегия тестирования в 2-3 предложениях",
  "estimatedBudget": "рекомендуемый тестовый бюджет на 1 неделю"
}`;

export async function generateAdCopy(input: {
  ideaName: string;
  ideaDescription: string;
  targetAudience: string;
  monetization: string;
  market: string;
  apiKey: string;
  model: string;
}): Promise<AdCopyResponse> {
  const client = new Anthropic({ apiKey: input.apiKey });

  const userPrompt = `Создай рекламные объявления для этой бизнес-идеи:

**Продукт:** ${input.ideaName}
**Описание:** ${input.ideaDescription}
**Целевая аудитория:** ${input.targetAudience}
**Монетизация:** ${input.monetization}
**Рынок:** ${input.market === "russia" ? "Россия (реклама на русском)" : input.market === "global" ? "Мировой (реклама на английском)" : "Оба рынка (3 рус + 2 англ)"}

Верни ТОЛЬКО JSON.`;

  const response = await client.messages.create({
    model: input.model,
    max_tokens: 4096,
    system: AD_COPY_PROMPT,
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

  const result: AdCopyResult = {
    ads: Array.isArray(parsed.ads)
      ? parsed.ads.map((ad: Record<string, unknown>) => ({
          platform: String(ad.platform || ""),
          headline: String(ad.headline || ""),
          description: String(ad.description || ""),
          callToAction: String(ad.callToAction || ""),
          targetingTips: String(ad.targetingTips || ""),
        }))
      : [],
    generalStrategy: String(parsed.generalStrategy || ""),
    estimatedBudget: String(parsed.estimatedBudget || ""),
  };

  return {
    result,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
  };
}
