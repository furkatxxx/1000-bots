"use client";

import { useState, useEffect, useCallback } from "react";

interface Settings {
  anthropicApiKey: string;
  newsApiKey: string;
  wordstatToken: string;
  googleTrendsGeo: string;
  maxIdeasPerReport: number;
  preferredModel: string;
  telegramBotToken: string;
  telegramChatId: string;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setSettings(data.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  async function save(updates: Partial<Settings>): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Ошибка сохранения");
      const data = await res.json();
      setSettings(data.settings);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { settings, loading, saving, error, save, refetch: fetch_ };
}
