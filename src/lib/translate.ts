import translate from "google-translate-api-x";

const CHUNK_SIZE = 30; // Максимум строк за один запрос

// Переводит массив строк на русский (пакетно, с разбиением на чанки)
export async function translateToRussian(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];

  try {
    // Разбиваем на чанки чтобы не перегружать API
    const results: string[] = [];

    for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
      const chunk = texts.slice(i, i + CHUNK_SIZE);

      const translated = await translate(chunk, { from: "en", to: "ru" });

      if (Array.isArray(translated)) {
        results.push(...translated.map((r: { text: string }) => r.text));
      } else {
        results.push((translated as { text: string }).text);
      }
    }

    return results;
  } catch (err) {
    console.error("[Translate] Ошибка перевода:", err);
    return texts;
  }
}
