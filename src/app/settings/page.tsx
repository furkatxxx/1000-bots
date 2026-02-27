"use client";

import { useState, useEffect } from "react";
import { useSettings } from "@/hooks/useSettings";
import { useToast } from "@/components/ui/Toast";

export default function SettingsPage() {
  const { settings, loading, saving, save } = useSettings();
  const { showToast } = useToast();

  const [anthropicKey, setAnthropicKey] = useState("");
  const [newsKey, setNewsKey] = useState("");
  const [geo, setGeo] = useState("US");
  const [maxIdeas, setMaxIdeas] = useState(10);

  // Заполняем форму когда настройки загрузились
  useEffect(() => {
    if (settings) {
      setAnthropicKey(settings.anthropicApiKey || "");
      setNewsKey(settings.newsApiKey || "");
      setGeo(settings.googleTrendsGeo || "US");
      setMaxIdeas(settings.maxIdeasPerReport || 10);
    }
  }, [settings]);

  async function handleSave() {
    const updates: Record<string, unknown> = {
      googleTrendsGeo: geo,
      maxIdeasPerReport: maxIdeas,
    };

    // Отправляем ключи только если пользователь ввёл новые (не маскированные)
    if (anthropicKey && !anthropicKey.includes("••••")) {
      updates.anthropicApiKey = anthropicKey;
    }
    if (newsKey && !newsKey.includes("••••")) {
      updates.newsApiKey = newsKey;
    }

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

        <div className="mb-6">
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
