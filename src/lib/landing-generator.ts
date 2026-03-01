// #33 + #37 — Генерация лендинга для проверки спроса
// AI создаёт готовую HTML-страницу с формой сбора email

import Anthropic from "@anthropic-ai/sdk";

export interface LandingInput {
  ideaName: string;
  ideaEmoji: string;
  ideaDescription: string;
  targetAudience: string;
  monetization: string;
  market: string;
  apiKey: string;
  model: string;
  waitlistApiUrl?: string; // URL для сбора email
}

export interface LandingResult {
  html: string;
  tokensIn: number;
  tokensOut: number;
}

const LANDING_PROMPT = `Ты — профессиональный веб-дизайнер и копирайтер. Создай ПОЛНУЮ HTML-страницу (лендинг) для проверки спроса на бизнес-идею.

## Требования к лендингу:
1. ОДИН HTML-файл со встроенными CSS-стилями (inline <style>)
2. Адаптивный дизайн (мобильные + десктоп)
3. Современный минималистичный стиль (градиенты, тени, скруглённые углы)
4. Тёмная тема по умолчанию (#0a0a0a фон, белый текст)

## Обязательные секции:
1. **Hero** — большой заголовок + подзаголовок + CTA кнопка
2. **Проблема** — какую боль решает продукт (3 пункта с иконками)
3. **Решение** — что именно делает продукт (скриншот-заглушка + описание)
4. **Как это работает** — 3 шага
5. **Цены** — 2-3 тарифа
6. **FAQ** — 3-4 вопроса
7. **Форма подписки** — email + кнопка "Получить доступ первым"
8. **Футер** — копирайт

## Технические требования:
- Форма подписки: <form id="waitlist-form"> с полями email и name
- JavaScript обработчик формы — fetch POST на URL из атрибута data-api формы
- Если data-api нет — показать "Спасибо!" без отправки
- Анимации при скролле (Intersection Observer)
- Emoji как иконки (не подключать внешние шрифты)
- Весь текст на русском языке (если рынок "russia" или "both"), на английском если "global"
- Все цены в рублях для Russia, в долларах для global

## Формат ответа:
ТОЛЬКО HTML-код. Никакого текста до или после. Начни с <!DOCTYPE html> и закончи </html>.`;

export async function generateLanding(input: LandingInput): Promise<LandingResult> {
  const client = new Anthropic({ apiKey: input.apiKey });

  const userPrompt = `Создай лендинг для этой бизнес-идеи:

**Название:** ${input.ideaEmoji} ${input.ideaName}
**Описание:** ${input.ideaDescription}
**Целевая аудитория:** ${input.targetAudience}
**Монетизация:** ${input.monetization}
**Рынок:** ${input.market === "russia" ? "Россия (всё на русском, цены в ₽)" : input.market === "global" ? "Мировой (всё на английском, цены в $)" : "Оба рынка (на русском, цены в ₽)"}
${input.waitlistApiUrl ? `**URL для формы подписки:** ${input.waitlistApiUrl}` : ""}

Верни ТОЛЬКО HTML-код.`;

  const response = await client.messages.create({
    model: input.model,
    max_tokens: 8192,
    system: LANDING_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI не вернул HTML");
  }

  // Извлекаем HTML (убираем markdown-обёртку если есть)
  let html = textBlock.text.trim();
  html = html.replace(/^```html\s*/i, "").replace(/```\s*$/i, "").trim();

  // Если AI добавил data-api — подставляем реальный URL
  if (input.waitlistApiUrl) {
    html = html.replace(
      /data-api="[^"]*"/g,
      `data-api="${input.waitlistApiUrl}"`
    );
    // Добавляем data-api если его нет на форме
    if (!html.includes("data-api")) {
      html = html.replace(
        /<form([^>]*id="waitlist-form")/,
        `<form data-api="${input.waitlistApiUrl}"$1`
      );
    }
  }

  return {
    html,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
  };
}
