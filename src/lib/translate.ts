import translate from "google-translate-api-x";

// Переводит массив строк на русский (пакетно, чтобы не делать 50 запросов)
export async function translateToRussian(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];

  try {
    // Переводим пакетом — библиотека поддерживает массивы
    const results = await translate(texts, { from: "en", to: "ru" });

    if (Array.isArray(results)) {
      return results.map((r: { text: string }) => r.text);
    }

    // Если вернулся один результат (для одной строки)
    return [(results as { text: string }).text];
  } catch (err) {
    console.error("[Translate] Ошибка перевода:", err);
    // При ошибке возвращаем оригиналы
    return texts;
  }
}
