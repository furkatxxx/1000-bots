// Цепочка экспертов — каждый видит АРГУМЕНТЫ предыдущих, но НЕ оценки.
// Только модератор видит все оценки для финального вердикта.

import Anthropic from "@anthropic-ai/sdk";
import type {
  ExpertAnalysis,
  TrackerVerdict,
  MarketerVerdict,
  ProductVerdict,
  FinancierVerdict,
  SkepticVerdict,
} from "./types";

// === ПРОМПТЫ ДЛЯ КАЖДОГО ЭКСПЕРТА ===

const CALIBRATION_RULES = `
## КАЛИБРОВКА ОЦЕНОК (ОБЯЗАТЕЛЬНО):
- 9-10: Боль ДОКАЗАНА (люди УЖЕ платят за похожее), но идея предлагает НОВЫЙ подход/формат/аудиторию. Unit-экономика сходится. MVP за 1 неделю. Редкость — 1 из 20.
- 7-8: Спрос на боль подтверждён косвенно (запросы, рост ниши), идея уникальна, экономика сходится на бумаге.
- 5-6: Боль есть, но неясно заплатят ли за именно ЭТОТ формат решения. Нужна проверка гипотез.
- 3-4: Боль размытая, аудитория непонятна, или уже есть бесплатный аналог который закрывает 90% потребности.
- 1-2: Нет боли, нет рынка, или нереализуемо одним человеком за $500.
- НЕ БОЙСЯ ставить 3-4. Большинство идей — средние. Оценка 7+ = ты готов вложить свои $500.
- Нулевой спрос в Вордстат по НАЗВАНИЮ продукта ≠ отсутствие рынка. Люди ищут ПРОБЛЕМУ, не продукт.
- Наличие конкурентов = рынок существует (позитивный сигнал)
- Главный критерий: можно ли ПРОВЕРИТЬ спрос за $100 и 3 дня? Если да — это уже 5+`;

const TRACKER_PROMPT = `Ты — Трекер стартапов с 10-летним опытом работы в акселераторах (YC, 500 Startups).
Специализация: оценка бизнес-моделей, product-market fit, масштабируемость.

Задача: оцени жизнеспособность бизнес-идеи как стартапа.

${CALIBRATION_RULES}

## ФОРМАТ ОТВЕТА (строго JSON, без markdown):
{
  "score": число 1-10,
  "verdict": "go" | "pivot" | "no-go",
  "risks": ["риск 1", "риск 2", "риск 3"],
  "recommendation": "текст рекомендации 2-3 предложения"
}`;

const MARKETER_PROMPT = `Ты — Маркетолог-стратег с 8-летним опытом в digital-маркетинге стартапов.
Специализация: привлечение первых клиентов, каналы, стоимость привлечения (CAC).

Задача: оцени маркетинговый потенциал бизнес-идеи.
Ты ВИДИШЬ аргументы Трекера — можешь соглашаться или спорить.

${CALIBRATION_RULES}
- Низкий поисковый спрос — сигнал для осторожности, но НЕ потолок.

## ФОРМАТ ОТВЕТА (строго JSON, без markdown):
{
  "score": число 1-10,
  "channels": ["канал 1", "канал 2", "канал 3"],
  "cac": "стоимость привлечения клиента",
  "recommendation": "текст рекомендации 2-3 предложения"
}`;

const PRODUCT_PROMPT = `Ты — Продакт-менеджер с 7-летним опытом создания цифровых продуктов.
Специализация: MVP, конкуренты, уникальное предложение.

Задача: оцени продуктовый потенциал бизнес-идеи.
Ты ВИДИШЬ аргументы Трекера и Маркетолога — можешь соглашаться или спорить.

${CALIBRATION_RULES}
- Много конкурентов = рынок доказан. Вопрос: есть ли уникальный угол?

## ФОРМАТ ОТВЕТА (строго JSON, без markdown):
{
  "score": число 1-10,
  "mvpFeatures": ["фича 1", "фича 2", "фича 3"],
  "competitors": ["конкурент 1", "конкурент 2"],
  "uniqueness": "в чём уникальность идеи",
  "recommendation": "текст рекомендации 2-3 предложения"
}`;

const FINANCIER_PROMPT = `Ты — Финансовый аналитик с 6-летним опытом в стартап-финансах.
Специализация: юнит-экономика (LTV, CAC, маржа), точка безубыточности.

Задача: оцени финансовую привлекательность бизнес-идеи.
Ты ВИДИШЬ аргументы Трекера, Маркетолога и Продакта — можешь спорить.

${CALIBRATION_RULES}

## ФОРМАТ ОТВЕТА (строго JSON, без markdown):
{
  "score": число 1-10,
  "breakeven": "когда выйдет в ноль",
  "unitEconomics": "LTV/CAC/маржа — кратко",
  "recommendation": "текст рекомендации 2-3 предложения"
}`;

const SKEPTIC_PROMPT = `Ты — Скептик-инвестор с 12-летним опытом. «Адвокат дьявола».
Специализация: поиск причин ПРОВАЛА, скрытые риски, контраргументы.

Задача: найди причины НЕ делать эту идею. Оценивай НЕЗАВИСИМО — свою оценку ставишь сам.
Ты ВИДИШЬ аргументы всех 4 экспертов — ищи где они ошибаются, что упустили.

${CALIBRATION_RULES}
- Если не нашёл критических проблем — ставь 6-7. Если нашёл хоть одну — ставь 3-4. Не бойся низких оценок.
- Будь жёстким, но конструктивным

## ФОРМАТ ОТВЕТА (строго JSON, без markdown):
{
  "score": число 1-10,
  "killerRisks": ["убийственный риск 1", "риск 2", "риск 3"],
  "failureScenario": "самый вероятный сценарий провала",
  "counterArguments": "контраргументы к оптимистичным оценкам",
  "recommendation": "текст рекомендации 2-3 предложения"
}`;

const MODERATOR_PROMPT = `Ты — Модератор экспертного совета. Собираешь итог.

Ты ВИДИШЬ ВСЕ мнения и оценки 5 экспертов.

Задача:
1. Найти 2-3 ключевых РАЗНОГЛАСИЯ между экспертами
2. Рассчитать финальную оценку (можешь дать взвешенную, не обязательно среднее)
3. Вынести вердикт: "launch" (≥7), "pivot" (≥5), "reject" (<5)
4. Краткое резюме (2-3 предложения)

## КАЛИБРОВОЧНЫЕ ПРИМЕРЫ:
- 3/10: «Агрегатор погоды с AI» — нет монетизации, бесплатная конкуренция
- 6/10: «AI-помощник для резюме, $19/мес» — есть спрос, понятная модель, конкуренция
- 8/10: «Автогенерация карточек для WB из фото» — горящая боль, люди уже платят

Секция «Где не согласны?» — САМАЯ ЦЕННАЯ часть.

## ФОРМАТ ОТВЕТА (строго JSON, без markdown):
{
  "debates": "2-3 ключевых разногласия, кто прав и почему",
  "finalVerdict": "launch" | "pivot" | "reject",
  "finalScore": число с 1 знаком,
  "summary": "итог 2-3 предложения"
}`;

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampScore(score: number): number {
  return Math.max(1, Math.min(10, Math.round(score * 10) / 10));
}

// Убрать оценку из ответа эксперта (против эхо-камеры)
function stripScore(parsed: Record<string, unknown>): Record<string, unknown> {
  const { score, ...rest } = parsed;
  return rest;
}

async function callExpert(
  client: Anthropic,
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  expertName: string,
): Promise<{ parsed: Record<string, unknown>; tokensIn: number; tokensOut: number }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      const tokensIn = response.usage?.input_tokens || 0;
      const tokensOut = response.usage?.output_tokens || 0;

      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(`${expertName}: JSON не найден в ответе`);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return { parsed, tokensIn, tokensOut };
    } catch (error) {
      lastError = error as Error;
      console.warn(`[Expert Chain] ${expertName} попытка ${attempt + 1}/3:`, (error as Error).message);
      if (attempt < 2) await sleep(1000);
    }
  }

  throw lastError || new Error(`${expertName}: все попытки исчерпаны`);
}

function formatIdeaForPrompt(idea: ExpertChainInput["idea"], validationContext?: string): string {
  let text = `**Название:** ${idea.name}
**Описание:** ${idea.description}
**Целевая аудитория:** ${idea.targetAudience}
**Монетизация:** ${idea.monetization}`;

  if (idea.startupCost && idea.startupCost !== "low") {
    text += `\n**Стартовые вложения:** ${idea.startupCost}`;
  }
  if (idea.competitionLevel && idea.competitionLevel !== "medium") {
    text += `\n**Уровень конкуренции:** ${idea.competitionLevel}`;
  }
  if (idea.trendBacking) {
    text += `\n\n## ТРЕНДЫ:\n${idea.trendBacking}`;
  }
  if (validationContext) {
    text += `\n\n${validationContext}`;
  }

  return text;
}

// === ОСНОВНАЯ ФУНКЦИЯ ===

export interface ExpertChainInput {
  idea: {
    name: string;
    description: string;
    targetAudience: string;
    monetization: string;
    startupCost: string;
    competitionLevel: string;
    actionPlan: string;
    estimatedRevenue?: string | null;
    trendBacking?: string | null;
  };
  apiKey: string;
  model: string;
  validationContext?: string;
}

export async function expertChain(input: ExpertChainInput): Promise<{
  analysis: ExpertAnalysis;
  tokensIn: number;
  tokensOut: number;
}> {
  const client = new Anthropic({ apiKey: input.apiKey, timeout: 2 * 60 * 1000 });
  const model = input.model;
  let totalTokensIn = 0;
  let totalTokensOut = 0;

  const ideaText = formatIdeaForPrompt(input.idea, input.validationContext);

  // 1. ТРЕКЕР — анализирует независимо
  console.log(`  [Chain] Трекер...`);
  const tracker = await callExpert(
    client, model, TRACKER_PROMPT,
    `Проанализируй эту бизнес-идею:\n\n${ideaText}\n\nВерни ТОЛЬКО валидный JSON.`,
    2048, "Трекер",
  );
  totalTokensIn += tracker.tokensIn;
  totalTokensOut += tracker.tokensOut;
  await sleep(300);

  // 2. МАРКЕТОЛОГ — видит АРГУМЕНТЫ трекера, но НЕ оценку
  console.log(`  [Chain] Маркетолог...`);
  const marketer = await callExpert(
    client, model, MARKETER_PROMPT,
    `Проанализируй маркетинговый потенциал:\n\n${ideaText}\n\n## Аргументы Трекера:\n${JSON.stringify(stripScore(tracker.parsed), null, 2)}\n\nВерни ТОЛЬКО валидный JSON.`,
    2048, "Маркетолог",
  );
  totalTokensIn += marketer.tokensIn;
  totalTokensOut += marketer.tokensOut;
  await sleep(300);

  // 3. ПРОДАКТ — видит аргументы трекера и маркетолога, без оценок
  console.log(`  [Chain] Продакт...`);
  const product = await callExpert(
    client, model, PRODUCT_PROMPT,
    `Проанализируй продуктовый потенциал:\n\n${ideaText}\n\n## Аргументы Трекера:\n${JSON.stringify(stripScore(tracker.parsed), null, 2)}\n\n## Аргументы Маркетолога:\n${JSON.stringify(stripScore(marketer.parsed), null, 2)}\n\nВерни ТОЛЬКО валидный JSON.`,
    2048, "Продакт",
  );
  totalTokensIn += product.tokensIn;
  totalTokensOut += product.tokensOut;
  await sleep(300);

  // 4. ФИНАНСИСТ — видит аргументы всех, без оценок
  console.log(`  [Chain] Финансист...`);
  const financier = await callExpert(
    client, model, FINANCIER_PROMPT,
    `Проанализируй финансовую привлекательность:\n\n${ideaText}\n\n## Аргументы Трекера:\n${JSON.stringify(stripScore(tracker.parsed), null, 2)}\n\n## Аргументы Маркетолога:\n${JSON.stringify(stripScore(marketer.parsed), null, 2)}\n\n## Аргументы Продакта:\n${JSON.stringify(stripScore(product.parsed), null, 2)}\n\nВерни ТОЛЬКО валидный JSON.`,
    2048, "Финансист",
  );
  totalTokensIn += financier.tokensIn;
  totalTokensOut += financier.tokensOut;
  await sleep(300);

  // 5. СКЕПТИК — видит аргументы всех, без оценок
  console.log(`  [Chain] Скептик...`);
  const skeptic = await callExpert(
    client, model, SKEPTIC_PROMPT,
    `Найди ВСЕ слабые места идеи:\n\n${ideaText}\n\n## Аргументы Трекера:\n${JSON.stringify(stripScore(tracker.parsed), null, 2)}\n\n## Аргументы Маркетолога:\n${JSON.stringify(stripScore(marketer.parsed), null, 2)}\n\n## Аргументы Продакта:\n${JSON.stringify(stripScore(product.parsed), null, 2)}\n\n## Аргументы Финансиста:\n${JSON.stringify(stripScore(financier.parsed), null, 2)}\n\nВерни ТОЛЬКО валидный JSON.`,
    2048, "Скептик",
  );
  totalTokensIn += skeptic.tokensIn;
  totalTokensOut += skeptic.tokensOut;
  await sleep(300);

  // 6. МОДЕРАТОР — ЕДИНСТВЕННЫЙ кто видит ВСЕ оценки
  console.log(`  [Chain] Модератор...`);
  const moderator = await callExpert(
    client, model, MODERATOR_PROMPT,
    `Собери итог экспертного совета по идее "${input.idea.name}":\n\n## Трекер (${tracker.parsed.score}/10):\n${JSON.stringify(tracker.parsed, null, 2)}\n\n## Маркетолог (${marketer.parsed.score}/10):\n${JSON.stringify(marketer.parsed, null, 2)}\n\n## Продакт (${product.parsed.score}/10):\n${JSON.stringify(product.parsed, null, 2)}\n\n## Финансист (${financier.parsed.score}/10):\n${JSON.stringify(financier.parsed, null, 2)}\n\n## Скептик (${skeptic.parsed.score}/10):\n${JSON.stringify(skeptic.parsed, null, 2)}\n\nВерни ТОЛЬКО валидный JSON.`,
    3072, "Модератор",
  );
  totalTokensIn += moderator.tokensIn;
  totalTokensOut += moderator.tokensOut;

  // Собираем ExpertAnalysis
  const trackerData = tracker.parsed;
  const marketerData = marketer.parsed;
  const productData = product.parsed;
  const financierData = financier.parsed;
  const skepticData = skeptic.parsed;
  const moderatorData = moderator.parsed;

  const scores = [
    clampScore(Number(trackerData.score) || 5),
    clampScore(Number(marketerData.score) || 5),
    clampScore(Number(productData.score) || 5),
    clampScore(Number(financierData.score) || 5),
    clampScore(Number(skepticData.score) || 5),
  ];
  let avgScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;

  // Cap rule: если скептик нашёл серьёзные проблемы (< 5), ограничиваем потолок
  const skepticScore = clampScore(Number(skepticData.score) || 5);
  if (skepticScore < 5) {
    avgScore = Math.min(avgScore, Math.round((skepticScore + 2) * 10) / 10);
  }

  const finalScore = Number(moderatorData.finalScore) || avgScore;

  let finalVerdict: "launch" | "pivot" | "reject";
  if (moderatorData.finalVerdict === "launch" || moderatorData.finalVerdict === "pivot" || moderatorData.finalVerdict === "reject") {
    finalVerdict = moderatorData.finalVerdict as "launch" | "pivot" | "reject";
  } else if (finalScore >= 7) {
    finalVerdict = "launch";
  } else if (finalScore >= 5) {
    finalVerdict = "pivot";
  } else {
    finalVerdict = "reject";
  }

  const analysis: ExpertAnalysis = {
    tracker: {
      score: clampScore(Number(trackerData.score) || 5),
      verdict: (trackerData.verdict as "go" | "pivot" | "no-go") || "pivot",
      risks: Array.isArray(trackerData.risks) ? trackerData.risks.map(String) : [],
      recommendation: String(trackerData.recommendation || ""),
    } as TrackerVerdict,
    marketer: {
      score: clampScore(Number(marketerData.score) || 5),
      channels: Array.isArray(marketerData.channels) ? marketerData.channels.map(String) : [],
      cac: String(marketerData.cac || ""),
      recommendation: String(marketerData.recommendation || ""),
    } as MarketerVerdict,
    product: {
      score: clampScore(Number(productData.score) || 5),
      mvpFeatures: Array.isArray(productData.mvpFeatures) ? productData.mvpFeatures.map(String) : [],
      competitors: Array.isArray(productData.competitors) ? productData.competitors.map(String) : [],
      uniqueness: String(productData.uniqueness || ""),
      recommendation: String(productData.recommendation || ""),
    } as ProductVerdict,
    financier: {
      score: clampScore(Number(financierData.score) || 5),
      breakeven: String(financierData.breakeven || ""),
      unitEconomics: String(financierData.unitEconomics || ""),
      recommendation: String(financierData.recommendation || ""),
    } as FinancierVerdict,
    skeptic: {
      score: clampScore(Number(skepticData.score) || 3),
      killerRisks: Array.isArray(skepticData.killerRisks) ? skepticData.killerRisks.map(String) : [],
      failureScenario: String(skepticData.failureScenario || ""),
      counterArguments: String(skepticData.counterArguments || ""),
      recommendation: String(skepticData.recommendation || ""),
    } as SkepticVerdict,
    debates: String(moderatorData.debates || ""),
    finalVerdict,
    finalScore: clampScore(finalScore),
    summary: String(moderatorData.summary || ""),
  };

  console.log(`  [Chain] Итог: ${finalScore}/10 → ${finalVerdict}`);

  return { analysis, tokensIn: totalTokensIn, tokensOut: totalTokensOut };
}
