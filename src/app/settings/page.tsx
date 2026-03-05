"use client";

import { useState, useEffect } from "react";
import { useSettings } from "@/hooks/useSettings";
import { useToast } from "@/components/ui/Toast";
import { ScheduleSection } from "@/components/settings/ScheduleSection";

interface BalanceResult {
  service: string;
  balance: number | null;
  currency: string;
  status: "ok" | "low" | "critical" | "error";
  error?: string;
}

export default function SettingsPage() {
  const { settings, loading, saving, save } = useSettings();
  const { showToast } = useToast();
  const [balanceChecking, setBalanceChecking] = useState(false);
  const [balanceResults, setBalanceResults] = useState<BalanceResult[] | null>(null);

  const [anthropicKey, setAnthropicKey] = useState("");
  const [newsKey, setNewsKey] = useState("");
  const [wordstatToken, setWordstatToken] = useState("");
  const [geo, setGeo] = useState("US");
  const [maxIdeas, setMaxIdeas] = useState(10);
  const [model, setModel] = useState("claude-haiku-4-5-20251001");
  const [tgBotToken, setTgBotToken] = useState("");
  const [tgChatId, setTgChatId] = useState("");
  const [dadataKey, setDadataKey] = useState("");
  const [vkToken, setVkToken] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [expertModel, setExpertModel] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("08:00");
  const [scheduleAutoTelegram, setScheduleAutoTelegram] = useState(false);
  const [sources, setSources] = useState<Record<string, boolean>>({
    hacker_news: true,
    google_trends: true,
    news_api: true,
    github_trending: true,
    product_hunt: true,
    yandex_wordstat: true,
    vk_trends: false,
  });

  // Заполняем форму когда настройки загрузились
  useEffect(() => {
    if (settings) {
      setAnthropicKey(settings.anthropicApiKey || "");
      setNewsKey(settings.newsApiKey || "");
      setWordstatToken(settings.wordstatToken || "");
      setGeo(settings.googleTrendsGeo || "US");
      setMaxIdeas(settings.maxIdeasPerReport || 10);
      setModel(settings.preferredModel || "claude-haiku-4-5-20251001");
      setTgBotToken(settings.telegramBotToken || "");
      setTgChatId(settings.telegramChatId || "");
      setDadataKey(settings.dadataApiKey || "");
      setVkToken(settings.vkServiceToken || "");
      setSiteUrl(settings.siteUrl || "");
      setExpertModel(settings.expertModel || "");
      setScheduleEnabled(settings.scheduleEnabled ?? false);
      setScheduleTime(settings.scheduleTime || "08:00");
      setScheduleAutoTelegram(settings.scheduleAutoTelegram ?? false);
    }
  }, [settings]);

  // Загружаем состояние источников
  useEffect(() => {
    fetch("/api/trends/sources")
      .then((r) => r.json())
      .then((data) => {
        if (data.sources) {
          const map: Record<string, boolean> = {};
          for (const s of data.sources) {
            map[s.name] = s.enabled;
          }
          setSources((prev) => ({ ...prev, ...map }));
        }
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    const updates: Record<string, unknown> = {
      googleTrendsGeo: geo,
      maxIdeasPerReport: maxIdeas,
      preferredModel: model,
    };

    // Сохраняем состояние источников
    fetch("/api/trends/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sources }),
    }).catch(() => {});

    // Отправляем ключи только если пользователь ввёл новые (не маскированные)
    if (anthropicKey && !anthropicKey.includes("••••")) {
      updates.anthropicApiKey = anthropicKey;
    }
    if (newsKey && !newsKey.includes("••••")) {
      updates.newsApiKey = newsKey;
    }
    if (wordstatToken && !wordstatToken.includes("••••")) {
      updates.wordstatToken = wordstatToken;
    }
    if (tgBotToken && !tgBotToken.includes("••••")) {
      updates.telegramBotToken = tgBotToken;
    }
    if (tgChatId) {
      updates.telegramChatId = tgChatId;
    }
    if (dadataKey && !dadataKey.includes("••••")) {
      updates.dadataApiKey = dadataKey;
    }
    if (vkToken && !vkToken.includes("••••")) {
      updates.vkServiceToken = vkToken;
    }
    if (siteUrl !== undefined) {
      updates.siteUrl = siteUrl;
    }
    updates.expertModel = expertModel;
    updates.scheduleEnabled = scheduleEnabled;
    updates.scheduleTime = scheduleTime;
    updates.scheduleAutoTelegram = scheduleAutoTelegram;

    const ok = await save(updates);
    if (ok) {
      showToast("Настройки сохранены", "success");
    } else {
      showToast("Ошибка сохранения", "error");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Настройки</h1>
        <div className="h-64 animate-skeleton-pulse rounded-2xl" style={{ backgroundColor: "var(--muted)" }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Настройки</h1>

      <div
        className="rounded-2xl p-6"
        style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}
      >
        {/* API-ключи */}
        <h2 className="mb-4 text-lg font-semibold">API-ключи</h2>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
            Ключ API Anthropic
          </label>
          <input
            type="password"
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
            placeholder="sk-ant-..."
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:ring-2"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
          />
          <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Нужен для генерации идей через Claude
          </p>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
            Ключ NewsAPI
          </label>
          <input
            type="password"
            value={newsKey}
            onChange={(e) => setNewsKey(e.target.value)}
            placeholder="Ключ от newsapi.org"
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:ring-2"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
          />
          <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Для сбора новостей (необязательно)
          </p>
        </div>

        <div className="mb-6">
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
            Токен Яндекс Вордстат
          </label>
          <input
            type="password"
            value={wordstatToken}
            onChange={(e) => setWordstatToken(e.target.value)}
            placeholder="OAuth-токен Яндекса"
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:ring-2"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
          />
          <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Для трендов рунета. Получить:{" "}
            <a
              href="https://oauth.yandex.ru/client/new/id/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: "var(--primary)" }}
            >
              oauth.yandex.ru
            </a>
            {" "}→ подать заявку на API Вордстата
          </p>
        </div>

        <div className="mb-6">
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
            Ключ DaData
          </label>
          <input
            type="password"
            value={dadataKey}
            onChange={(e) => setDadataKey(e.target.value)}
            placeholder="API-ключ от dadata.ru"
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:ring-2"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
          />
          <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Для валидации ниш (конкуренты, ОКВЭД). Бесплатно 10K запр/день.{" "}
            <a
              href="https://dadata.ru/api/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: "var(--primary)" }}
            >
              Получить ключ
            </a>
          </p>
        </div>

        {/* Параметры */}
        <h2 className="mb-4 text-lg font-semibold">Параметры</h2>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
            Регион Google Trends
          </label>
          <select
            value={geo}
            onChange={(e) => setGeo(e.target.value)}
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:ring-2"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
          >
            <option value="US">США</option>
            <option value="RU">Россия</option>
            <option value="GB">Великобритания</option>
            <option value="DE">Германия</option>
            <option value="">Весь мир</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
            Модель Claude
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:ring-2"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
          >
            <option value="claude-haiku-4-5-20251001">Haiku 4.5 (быстро, дёшево ~$0.02)</option>
            <option value="claude-sonnet-4-6">Sonnet 4.6 (умнее, ~$0.15)</option>
          </select>
          <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Haiku — быстрый и дешёвый, Sonnet — глубже анализирует
          </p>
        </div>

        <div className="mb-6">
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
            Максимум идей в отчёте
          </label>
          <input
            type="number"
            min={1}
            max={30}
            value={maxIdeas}
            onChange={(e) => setMaxIdeas(Number(e.target.value))}
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:ring-2"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
          />
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
            Модель для экспертов
          </label>
          <select
            value={expertModel}
            onChange={(e) => setExpertModel(e.target.value)}
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:ring-2"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
          >
            <option value="">Как основная ({model === "claude-sonnet-4-6" ? "Sonnet" : "Haiku"})</option>
            <option value="claude-haiku-4-5-20251001">Haiku 4.5 (быстро, ~$0.02/идею)</option>
            <option value="claude-sonnet-4-6">Sonnet 4.6 (точнее, ~$0.15/идею)</option>
          </select>
          <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Цепочка из 6 экспертов вызывается для каждой идеи. Sonnet точнее, но дороже.
          </p>
        </div>

        <div className="mb-6">
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
            VK сервисный токен
          </label>
          <input
            type="password"
            value={vkToken}
            onChange={(e) => setVkToken(e.target.value)}
            placeholder="Сервисный токен VK"
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:ring-2"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
          />
          <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Тренды ВКонтакте.{" "}
            <a href="https://dev.vk.com/ru" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--primary)" }}>
              Создать приложение VK
            </a>
            {" "}→ сервисный ключ
          </p>
        </div>

        {/* Telegram */}
        <h2 className="mb-4 text-lg font-semibold">Telegram-уведомления</h2>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
            URL сервиса
          </label>
          <input
            type="url"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="https://1000bots.railway.app"
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:ring-2"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
          />
          <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Публичный адрес сервиса. Нужен для кликабельных ссылок на идеи в Telegram.
          </p>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
            Токен бота
          </label>
          <input
            type="password"
            value={tgBotToken}
            onChange={(e) => setTgBotToken(e.target.value)}
            placeholder="123456:ABC-DEF..."
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:ring-2"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
          />
          <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Создай бота через{" "}
            <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--primary)" }}>
              @BotFather
            </a>
            {" "}и вставь токен
          </p>
        </div>

        <div className="mb-6">
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
            Chat ID
          </label>
          <input
            type="text"
            value={tgChatId}
            onChange={(e) => setTgChatId(e.target.value)}
            placeholder="123456789"
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:ring-2"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
          />
          <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Узнай свой Chat ID через{" "}
            <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--primary)" }}>
              @userinfobot
            </a>
          </p>
        </div>

        {/* Расписание */}
        <ScheduleSection
          enabled={scheduleEnabled}
          time={scheduleTime}
          autoTelegram={scheduleAutoTelegram}
          onEnabledChange={setScheduleEnabled}
          onTimeChange={setScheduleTime}
          onAutoTelegramChange={setScheduleAutoTelegram}
        />

        {/* Мониторинг балансов */}
        <h2 className="mb-4 text-lg font-semibold">Мониторинг балансов</h2>
        <div className="mb-6">
          <button
            onClick={async () => {
              setBalanceChecking(true);
              try {
                const res = await fetch("/api/health/balances", { method: "POST" });
                const data = await res.json();
                if (data.results) {
                  setBalanceResults(data.results);
                  if (data.hasProblems) {
                    showToast("Обнаружены проблемы с балансами!", "error");
                  } else {
                    showToast("Все сервисы работают", "success");
                  }
                }
              } catch {
                showToast("Ошибка проверки балансов", "error");
              } finally {
                setBalanceChecking(false);
              }
            }}
            disabled={balanceChecking}
            className="w-full cursor-pointer rounded-xl border-2 border-dashed px-4 py-3 text-sm font-medium transition-all hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: "var(--warning, #f59e0b)", color: "var(--warning, #f59e0b)" }}
          >
            {balanceChecking ? "Проверяю балансы..." : "Проверить балансы API"}
          </button>
          <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Проверит работоспособность Anthropic и DaData. Если есть проблемы — пришлёт в Telegram.
          </p>

          {balanceResults && (
            <div className="mt-3 space-y-2">
              {balanceResults.map((r) => (
                <div
                  key={r.service}
                  className="flex items-center justify-between rounded-xl px-4 py-2.5 text-sm"
                  style={{
                    backgroundColor: r.status === "ok" ? "rgba(34, 197, 94, 0.08)" : "rgba(239, 68, 68, 0.08)",
                  }}
                >
                  <span className="font-medium">
                    {r.status === "ok" ? "✅" : r.status === "critical" ? "🚨" : "❌"} {r.service}
                  </span>
                  <span className="text-xs" style={{
                    color: r.status === "ok" ? "var(--success, #22c55e)" : "var(--destructive, #ef4444)",
                  }}>
                    {r.status === "ok" ? "Работает" : r.error || "Ошибка"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Источники трендов */}
        <h2 className="mb-4 text-lg font-semibold">Источники трендов</h2>

        <div className="mb-6 space-y-3">
          {[
            { key: "hacker_news", label: "Hacker News", desc: "Технологии, стартапы, программирование" },
            { key: "yandex_wordstat", label: "Яндекс Вордстат", desc: "Поисковые тренды рунета — реальный спрос в РФ (нужен токен)" },
            { key: "github_trending", label: "GitHub Trending", desc: "Новые популярные репозитории — AI, SaaS, инструменты" },
            { key: "product_hunt", label: "Product Hunt", desc: "Новые стартапы и продукты каждый день" },
            { key: "google_trends", label: "Google Trends", desc: "Популярные поисковые запросы (глобально)" },
            { key: "news_api", label: "NewsAPI", desc: "Новости и статьи (нужен ключ)" },
            { key: "vk_trends", label: "VK Тренды", desc: "Популярные посты ВКонтакте (нужен сервисный токен)" },
          ].map((source) => (
            <label
              key={source.key}
              className="flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all duration-200"
              style={{
                borderColor: sources[source.key] ? "var(--primary)" : "var(--border)",
                backgroundColor: sources[source.key] ? "var(--primary-light, #0071e308)" : "transparent",
              }}
            >
              <div>
                <div className="text-sm font-medium">{source.label}</div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {source.desc}
                </div>
              </div>
              <input
                type="checkbox"
                checked={sources[source.key] ?? true}
                onChange={(e) => setSources((prev) => ({ ...prev, [source.key]: e.target.checked }))}
                className="h-5 w-5 cursor-pointer rounded accent-[var(--primary)]"
              />
            </label>
          ))}
        </div>

        {/* Кнопка сохранения */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full cursor-pointer rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: "var(--primary)" }}
        >
          {saving ? "Сохраняю..." : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
