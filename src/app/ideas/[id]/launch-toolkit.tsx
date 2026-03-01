"use client";

import { useState } from "react";
import type { AnalogsResult } from "@/lib/analog-search";
import type { MarketAnalysisResult } from "@/lib/market-analysis";
import type { AdCopyResult } from "@/lib/ad-copywriter";

interface LaunchToolkitProps {
  ideaId: string;
  hasLanding: boolean;
  hasAnalogs: boolean;
  hasMarketAnalysis: boolean;
  hasAdCopy: boolean;
  onLandingGenerated: (html: string) => void;
}

export function LaunchToolkit({
  ideaId,
  hasLanding,
  hasAnalogs,
  hasMarketAnalysis,
  hasAdCopy,
  onLandingGenerated,
}: LaunchToolkitProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Аналоги
  const [analogsLoading, setAnalogsLoading] = useState(false);
  const [analogs, setAnalogs] = useState<AnalogsResult | null>(null);

  // Лендинг
  const [landingLoading, setLandingLoading] = useState(false);
  const [landingReady, setLandingReady] = useState(hasLanding);

  // Анализ рынка
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketAnalysis, setMarketAnalysis] = useState<MarketAnalysisResult | null>(null);

  // Рекламные тексты
  const [adCopyLoading, setAdCopyLoading] = useState(false);
  const [adCopy, setAdCopy] = useState<AdCopyResult | null>(null);

  // Метрики
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [metricName, setMetricName] = useState("visitors");
  const [metricValue, setMetricValue] = useState("");
  const [metricsData, setMetricsData] = useState<{ name: string; value: number; date: string }[] | null>(null);
  const [waitlistCount, setWaitlistCount] = useState<number | null>(null);

  async function handleAnalogs() {
    setAnalogsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ideas/${ideaId}/analogs`, { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnalogs(data.analogs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setAnalogsLoading(false);
    }
  }

  async function handleLanding() {
    setLandingLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ideas/${ideaId}/landing`, { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLandingReady(true);
      onLandingGenerated(data.html);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLandingLoading(false);
    }
  }

  async function handleMarketAnalysis() {
    setMarketLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ideas/${ideaId}/market-analysis`, { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMarketAnalysis(data.analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setMarketLoading(false);
    }
  }

  async function handleAdCopy() {
    setAdCopyLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ideas/${ideaId}/ad-copy`, { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAdCopy(data.adCopy);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setAdCopyLoading(false);
    }
  }

  async function handleLoadMetrics() {
    try {
      const res = await fetch(`/api/ideas/${ideaId}/metrics`);
      const data = await res.json();
      setMetricsData(data.metrics || []);
      setWaitlistCount(data.waitlistCount || 0);
    } catch { /* skip */ }
  }

  async function handleAddMetric() {
    if (!metricValue) return;
    try {
      await fetch(`/api/ideas/${ideaId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: metricName, value: Number(metricValue) }),
      });
      setMetricValue("");
      handleLoadMetrics();
    } catch { /* skip */ }
  }

  const anyLoading = analogsLoading || landingLoading || marketLoading || adCopyLoading;

  return (
    <div className="mt-6">
      <button
        onClick={() => {
          setOpen(!open);
          if (!open && !metricsData) handleLoadMetrics();
        }}
        className="flex w-full cursor-pointer items-center justify-between rounded-2xl p-5 transition-all hover:scale-[1.005]"
        style={{
          backgroundColor: "var(--card)",
          boxShadow: "var(--shadow-sm)",
          border: "2px solid var(--primary)",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">🚀</span>
          <span className="text-sm font-bold" style={{ color: "var(--primary)" }}>Инструменты запуска</span>
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            аналоги, лендинг, рынок, реклама, метрики
          </span>
        </div>
        <span className="text-sm transition-transform" style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}>
          ▼
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 animate-fade-in">
          {error && (
            <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: "var(--destructive-light, #ff000010)", color: "var(--destructive)" }}>
              {error}
            </div>
          )}

          {/* Кнопки инструментов */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ToolButton
              emoji="🔍"
              label="Аналоги"
              sublabel={analogs || hasAnalogs ? "Готово" : "PH + GitHub"}
              loading={analogsLoading}
              done={!!analogs || hasAnalogs}
              onClick={handleAnalogs}
              disabled={anyLoading}
            />
            <ToolButton
              emoji="🌐"
              label="Лендинг"
              sublabel={landingReady ? "Готово" : "HTML-страница"}
              loading={landingLoading}
              done={landingReady}
              onClick={handleLanding}
              disabled={anyLoading}
            />
            <ToolButton
              emoji="📊"
              label="Рынок + SEO"
              sublabel={marketAnalysis || hasMarketAnalysis ? "Готово" : "TAM/SAM/SOM"}
              loading={marketLoading}
              done={!!marketAnalysis || hasMarketAnalysis}
              onClick={handleMarketAnalysis}
              disabled={anyLoading}
            />
            <ToolButton
              emoji="📝"
              label="Реклама"
              sublabel={adCopy || hasAdCopy ? "Готово" : "Тексты для рекламы"}
              loading={adCopyLoading}
              done={!!adCopy || hasAdCopy}
              onClick={handleAdCopy}
              disabled={anyLoading}
            />
          </div>

          {/* Результаты: Аналоги */}
          {analogs && <AnalogsPanel analogs={analogs} />}

          {/* Результаты: Лендинг */}
          {landingReady && (
            <div className="rounded-2xl p-4" style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>🌐</span>
                  <span className="text-sm font-semibold">Лендинг создан</span>
                </div>
                <a
                  href={`/api/ideas/${ideaId}/landing`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg px-3 py-1.5 text-xs font-medium"
                  style={{ backgroundColor: "var(--primary)", color: "white" }}
                >
                  Открыть в новой вкладке ↗
                </a>
              </div>
              <iframe
                src={`/api/ideas/${ideaId}/landing`}
                className="w-full rounded-xl border"
                style={{ height: "400px", border: "1px solid var(--muted)" }}
                title="Превью лендинга"
              />
            </div>
          )}

          {/* Результаты: Анализ рынка */}
          {marketAnalysis && <MarketAnalysisPanel analysis={marketAnalysis} />}

          {/* Результаты: Рекламные тексты */}
          {adCopy && <AdCopyPanel adCopy={adCopy} />}

          {/* Метрики (#38) */}
          <div className="rounded-2xl p-4" style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}>
            <button
              onClick={() => setMetricsOpen(!metricsOpen)}
              className="flex w-full cursor-pointer items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span>📈</span>
                <span className="text-sm font-semibold">Метрики</span>
                {waitlistCount !== null && waitlistCount > 0 && (
                  <span className="rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: "var(--primary-light, #0071e320)", color: "var(--primary)" }}>
                    {waitlistCount} подписчиков
                  </span>
                )}
              </div>
              <span className="text-sm transition-transform" style={{ transform: metricsOpen ? "rotate(180deg)" : "rotate(0)" }}>
                ▼
              </span>
            </button>

            {metricsOpen && (
              <div className="mt-3 animate-fade-in">
                {/* Добавить метрику */}
                <div className="mb-3 flex gap-2">
                  <select
                    value={metricName}
                    onChange={(e) => setMetricName(e.target.value)}
                    className="rounded-lg px-2 py-1.5 text-xs"
                    style={{ backgroundColor: "var(--muted)", border: "none" }}
                  >
                    <option value="visitors">Посетители</option>
                    <option value="signups">Регистрации</option>
                    <option value="revenue">Выручка</option>
                    <option value="conversion">Конверсия %</option>
                    <option value="retention">Удержание %</option>
                    <option value="mrr">MRR</option>
                  </select>
                  <input
                    type="number"
                    value={metricValue}
                    onChange={(e) => setMetricValue(e.target.value)}
                    placeholder="Значение"
                    className="flex-1 rounded-lg px-2 py-1.5 text-xs"
                    style={{ backgroundColor: "var(--muted)", border: "none" }}
                  />
                  <button
                    onClick={handleAddMetric}
                    className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={{ backgroundColor: "var(--primary)", color: "white" }}
                  >
                    +
                  </button>
                </div>

                {/* Последние метрики */}
                {metricsData && metricsData.length > 0 ? (
                  <div className="space-y-1">
                    {metricsData.slice(0, 10).map((m, i) => (
                      <div key={i} className="flex justify-between text-xs" style={{ color: "var(--muted-foreground)" }}>
                        <span>{metricLabels[m.name] || m.name}</span>
                        <span className="font-medium" style={{ color: "var(--foreground)" }}>
                          {m.value.toLocaleString("ru-RU")}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    Метрики пока не добавлены. Начни отслеживать показатели после запуска.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const metricLabels: Record<string, string> = {
  visitors: "Посетители",
  signups: "Регистрации",
  revenue: "Выручка",
  conversion: "Конверсия",
  retention: "Удержание",
  mrr: "MRR",
};

// Кнопка инструмента
function ToolButton({ emoji, label, sublabel, loading, done, onClick, disabled }: {
  emoji: string;
  label: string;
  sublabel: string;
  loading: boolean;
  done: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="cursor-pointer rounded-xl p-3 text-center transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        backgroundColor: done ? "var(--success)10" : "var(--muted)",
        border: done ? "1px solid var(--success)30" : "1px solid transparent",
      }}
    >
      <span className="text-xl">{loading ? "⏳" : done ? "✅" : emoji}</span>
      <div className="mt-1 text-xs font-semibold">{label}</div>
      <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>{sublabel}</div>
    </button>
  );
}

// Панель аналогов
function AnalogsPanel({ analogs }: { analogs: AnalogsResult }) {
  if (analogs.products.length === 0) {
    return (
      <div className="rounded-2xl p-4" style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}>
        <div className="flex items-center gap-2 text-sm">
          <span>🔍</span>
          <span className="font-semibold">Аналоги не найдены</span>
          <span style={{ color: "var(--muted-foreground)" }}> — по запросу &quot;{analogs.searchQuery}&quot;</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}>
      <div className="mb-3 flex items-center gap-2">
        <span>🔍</span>
        <span className="text-sm font-semibold">Найдено аналогов: {analogs.products.length}</span>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>по запросу &quot;{analogs.searchQuery}&quot;</span>
      </div>
      <div className="space-y-2">
        {analogs.products.map((p, i) => (
          <div key={i} className="rounded-xl p-3" style={{ backgroundColor: "var(--muted)" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: p.source === "github" ? "var(--foreground)" : "var(--primary)" }}>
                  {p.source === "github" ? "GitHub" : "Product Hunt"}
                </span>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline" style={{ color: "var(--primary)" }}>
                  {p.name}
                </a>
              </div>
              {p.stars !== undefined && (
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>⭐ {p.stars.toLocaleString()}</span>
              )}
            </div>
            {p.description && (
              <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{p.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Панель анализа рынка
function MarketAnalysisPanel({ analysis }: { analysis: MarketAnalysisResult }) {
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}>
      <div className="mb-4 flex items-center gap-2">
        <span>📊</span>
        <span className="text-sm font-semibold">Анализ рынка + SEO</span>
      </div>

      {/* TAM/SAM/SOM */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {([
          { key: "tam" as const, label: "TAM", desc: "Весь рынок", value: analysis.marketSize.tamValue },
          { key: "sam" as const, label: "SAM", desc: "Доступная часть", value: analysis.marketSize.samValue },
          { key: "som" as const, label: "SOM", desc: "Реалистичная доля", value: analysis.marketSize.somValue },
        ]).map((item) => (
          <div key={item.key} className="rounded-xl p-3 text-center" style={{ backgroundColor: "var(--muted)" }}>
            <div className="text-[10px] font-bold" style={{ color: "var(--primary)" }}>{item.label}</div>
            <div className="text-sm font-bold">{item.value}</div>
            <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>{item.desc}</div>
          </div>
        ))}
      </div>

      {/* Описания TAM/SAM/SOM */}
      <div className="mb-4 space-y-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
        <p><strong>TAM:</strong> {analysis.marketSize.tam}</p>
        <p><strong>SAM:</strong> {analysis.marketSize.sam}</p>
        <p><strong>SOM:</strong> {analysis.marketSize.som}</p>
      </div>

      {/* SEO Ключевые слова */}
      {analysis.seoKeywords.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>SEO: Ключевые слова</div>
          <div className="space-y-1">
            {analysis.seoKeywords.map((kw, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg px-3 py-1.5" style={{ backgroundColor: "var(--muted)" }}>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    kw.difficulty === "easy" ? "text-green-600 bg-green-100" :
                    kw.difficulty === "hard" ? "text-red-600 bg-red-100" : "text-yellow-600 bg-yellow-100"
                  }`}>
                    {kw.difficulty === "easy" ? "Лёгкий" : kw.difficulty === "hard" ? "Сложный" : "Средний"}
                  </span>
                  <span className="text-xs font-medium">{kw.keyword}</span>
                </div>
                <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>{kw.searchVolume}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Стратегия и тренды */}
      {analysis.seoStrategy && (
        <div className="mb-2 text-xs">
          <span style={{ color: "var(--muted-foreground)" }}>SEO-стратегия: </span>
          <span>{analysis.seoStrategy}</span>
        </div>
      )}
      {analysis.marketTrends && (
        <div className="mb-2 text-xs">
          <span style={{ color: "var(--muted-foreground)" }}>Тренды рынка: </span>
          <span>{analysis.marketTrends}</span>
        </div>
      )}
      {analysis.competitiveLandscape && (
        <div className="text-xs">
          <span style={{ color: "var(--muted-foreground)" }}>Конкуренция: </span>
          <span>{analysis.competitiveLandscape}</span>
        </div>
      )}
    </div>
  );
}

// Панель рекламных текстов
function AdCopyPanel({ adCopy }: { adCopy: AdCopyResult }) {
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: "var(--card)", boxShadow: "var(--shadow-sm)" }}>
      <div className="mb-4 flex items-center gap-2">
        <span>📝</span>
        <span className="text-sm font-semibold">Рекламные тексты</span>
      </div>

      <div className="space-y-3">
        {adCopy.ads.map((ad, i) => (
          <div key={i} className="rounded-xl p-3" style={{ backgroundColor: "var(--muted)" }}>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: "var(--primary-light, #0071e320)", color: "var(--primary)" }}>
                {ad.platform}
              </span>
            </div>
            <div className="mb-1 text-sm font-bold">{ad.headline}</div>
            <div className="mb-2 text-xs leading-relaxed">{ad.description}</div>
            <div className="mb-2 text-xs">
              <span className="font-medium" style={{ color: "var(--primary)" }}>CTA: </span>
              {ad.callToAction}
            </div>
            <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
              Таргетинг: {ad.targetingTips}
            </div>
          </div>
        ))}
      </div>

      {adCopy.generalStrategy && (
        <div className="mt-3 text-xs">
          <span style={{ color: "var(--muted-foreground)" }}>Стратегия: </span>
          <span>{adCopy.generalStrategy}</span>
        </div>
      )}
      {adCopy.estimatedBudget && (
        <div className="mt-1 text-xs">
          <span style={{ color: "var(--muted-foreground)" }}>Тестовый бюджет: </span>
          <span className="font-medium">{adCopy.estimatedBudget}</span>
        </div>
      )}
    </div>
  );
}
