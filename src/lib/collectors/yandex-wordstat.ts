import type { TrendCollector, TrendItem } from "./base";
import { detectCategory } from "./base";
import { fetchWithTimeout } from "@/lib/utils";

const WORDSTAT_API = "https://api.wordstat.yandex.net";

// Seed-фразы — широкий охват бизнес-проблем (не только маркетплейсы)
const SEED_PHRASES = [
  // Автоматизация — люди ищут замену ручному труду
  "автоматизация бизнес процессов",
  "замена сотрудника программой",
  "автоматизация рутины",
  "сервис автоматизации",
  "автоматизация отчётов",
  "автоматизация excel",
  // AI-инструменты
  "нейросеть для бизнеса",
  "ai помощник",
  "автоматизация с помощью ии",
  "нейросеть для текста",
  "ai агент",
  "искусственный интеллект для работы",
  // Малый бизнес — конкретные боли
  "crm для малого бизнеса",
  "онлайн запись клиентов",
  "учёт заказов",
  "бот для записи клиентов",
  "автоматизация бухгалтерии",
  "управление складом",
  "программа для доставки",
  // Маркетплейсы (оставляем часть, не доминируют)
  "wildberries аналитика",
  "ozon аналитика продавца",
  "автоматизация маркетплейс",
  // Контент и маркетинг
  "генератор контента",
  "контент план генератор",
  "автопостинг соцсети",
  "генерация лидов",
  "скрипт продаж",
  // Образование
  "платформа для курсов",
  "конструктор тестов",
  "онлайн обучение платформа",
  // Фриланс и удалёнка
  "парсинг данных",
  "автоматизация email",
  "управление проектами",
  "таск менеджер",
  // Финансы и аналитика
  "финансовый учёт ип",
  "аналитика продаж",
  "прогнозирование спроса",
  // Здоровье
  "телемедицина сервис",
  "бот для записи к врачу",
  "трекер привычек",
  // Еда и HoReCa
  "автоматизация ресторана",
  "бот для заказа еды",
  "управление меню ресторана",
  // Недвижимость
  "управление недвижимостью",
  "сервис аренды",
  "бот для риэлтора",
];

interface WordstatTopResponse {
  topRequests: Array<{
    phrase: string;
    count: number;
  }>;
  requestPhrase: string;
  totalCount: number;
}

interface WordstatDynamicsResponse {
  data: Array<{
    date: string;
    count: number;
    share: number;
  }>;
}


export class YandexWordstatCollector implements TrendCollector {
  sourceId = "yandex_wordstat";
  label = "Яндекс Вордстат";
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async collect(): Promise<TrendItem[]> {
    if (!this.token) {
      console.warn("[Wordstat] Токен не указан, пропускаем");
      return [];
    }

    const allItems: TrendItem[] = [];

    // Берём 8 случайных seed-фраз (чтобы не тратить все 1000 лимитов за раз)
    const shuffled = [...SEED_PHRASES].sort(() => Math.random() - 0.5);
    const selectedSeeds = shuffled.slice(0, 15);

    // Запрашиваем топ запросов по каждой seed-фразе параллельно
    const results = await Promise.allSettled(
      selectedSeeds.map((phrase) => this.getTopRequests(phrase))
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        allItems.push(...result.value);
      }
      // Молча пропускаем ошибки отдельных фраз
    }

    // Дедупликация по названию
    const seen = new Set<string>();
    const unique = allItems.filter((item) => {
      const key = item.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Нормализуем score (по абсолютной частотности)
    const maxCount = Math.max(...unique.map((i) => i.score), 1);
    return unique
      .sort((a, b) => b.score - a.score)
      .slice(0, 30) // Максимум 30 трендов
      .map((item) => ({
        ...item,
        score: Math.round((item.score / maxCount) * 100),
      }));
  }

  // Получить топ запросов по seed-фразе
  private async getTopRequests(seedPhrase: string): Promise<TrendItem[]> {
    try {
      const res = await fetchWithTimeout(`${WORDSTAT_API}/v1/topRequests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=utf-8",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          phrase: seedPhrase,
          regions: [225], // 225 = вся Россия
          devices: ["all"],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`[Wordstat] Ошибка topRequests для "${seedPhrase}": ${res.status} ${text}`);
        return [];
      }

      const data: WordstatTopResponse = await res.json();

      if (!data.topRequests || data.topRequests.length === 0) return [];

      // Берём топ-5 запросов из каждой seed-фразы
      return data.topRequests.slice(0, 5).map((q) => ({
        sourceId: this.sourceId,
        title: q.phrase,
        url: `https://wordstat.yandex.ru/#!/?words=${encodeURIComponent(q.phrase)}`,
        score: q.count, // Абсолютная частотность — будет нормализована позже
        summary: `${q.count.toLocaleString("ru-RU")} запросов/мес в Яндексе`,
        category: detectCategory(q.phrase),
        metadata: {
          seedPhrase,
          monthlySearches: q.count,
          source: "yandex_wordstat",
        },
      }));
    } catch (err) {
      console.error(`[Wordstat] Ошибка для "${seedPhrase}":`, err);
      return [];
    }
  }

  // Получить динамику запроса (можно вызвать отдельно для анализа)
  async getDynamics(phrase: string): Promise<WordstatDynamicsResponse | null> {
    try {
      // fromDate должен быть понедельником для weekly
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 90); // 3 месяца назад
      // Находим ближайший понедельник
      const day = fromDate.getDay();
      fromDate.setDate(fromDate.getDate() - ((day + 6) % 7));

      const res = await fetchWithTimeout(`${WORDSTAT_API}/v1/dynamics`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=utf-8",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          phrase,
          period: "weekly",
          fromDate: fromDate.toISOString().split("T")[0],
        }),
      });

      if (!res.ok) return null;

      return await res.json();
    } catch {
      return null;
    }
  }
}
