# ЗАДАЧА: Автоэксперты, UI карточек, фильтры, поля идеи, экспорт

Ты — AI-партнёр Вася. Язык: русский. Внеси ВСЕ изменения по порядку. После каждого блока — `npm run build`. Не задавай вопросов.

---

## БЛОК 1: АВТОМАТИЧЕСКИЙ ЭКСПЕРТНЫЙ СОВЕТ В ПАЙПЛАЙНЕ

### 1.1. Встроить экспертный совет после сохранения идей

**Файл:** `src/app/api/reports/route.ts`

Добавь импорт в начало файла:
```ts
import { expertChain } from "@/lib/expert-chain";
import { collectValidationData, formatValidationForPrompt } from "@/lib/validators";
```

Найди комментарий и блок:
```ts
    // ═══════════════════════════════════════════════════
    // ШАГ 6: ФИНАЛИЗАЦИЯ (экспертов запустит фронтенд отдельно)
    // ═══════════════════════════════════════════════════
```

Замени ШАГ 6 ЦЕЛИКОМ (от этого комментария до `console.log(\`[Gen] Токены:`) на:
```ts
    // ═══════════════════════════════════════════════════
    // ШАГ 7: ЭКСПЕРТНЫЙ СОВЕТ для каждой идеи (Sonnet)
    // ═══════════════════════════════════════════════════
    console.log("[Gen] Шаг 7: Экспертный совет для каждой идеи (Sonnet)...");
    const savedIdeas = await prisma.businessIdea.findMany({
      where: { reportId: report.id },
      select: { id: true, name: true, description: true, targetAudience: true, monetization: true, startupCost: true, competitionLevel: true, actionPlan: true, estimatedRevenue: true, trendBacking: true },
    });

    let expertsDone = 0;
    for (const idea of savedIdeas) {
      try {
        console.log(`  [Expert] ${expertsDone + 1}/${savedIdeas.length}: "${idea.name}"...`);

        // Собираем данные валидации (Вордстат, DaData, ЕГРЮЛ)
        const validationData = await collectValidationData({
          ideaName: idea.name,
          ideaDescription: idea.description,
          targetAudience: idea.targetAudience,
          wordstatToken: settings.wordstatToken || undefined,
          dadataApiKey: settings.dadataApiKey || undefined,
        });
        const validationContext = formatValidationForPrompt(validationData);

        // Запускаем цепочку экспертов
        const expertResult = await expertChain({
          idea: {
            name: idea.name,
            description: idea.description,
            targetAudience: idea.targetAudience,
            monetization: idea.monetization,
            startupCost: idea.startupCost,
            competitionLevel: idea.competitionLevel,
            actionPlan: idea.actionPlan,
            estimatedRevenue: idea.estimatedRevenue,
            trendBacking: idea.trendBacking,
          },
          apiKey: settings.anthropicApiKey,
          model: expertModel,
          validationContext: validationContext || undefined,
        });

        // Сохраняем результат
        await prisma.businessIdea.update({
          where: { id: idea.id },
          data: { expertAnalysis: JSON.stringify(expertResult.analysis) },
        });

        totalTokensIn += expertResult.tokensIn;
        totalTokensOut += expertResult.tokensOut;
        expertsDone++;
        console.log(`  [Expert] "${idea.name}": ${expertResult.analysis.finalScore}/10 → ${expertResult.analysis.finalVerdict}`);
      } catch (err) {
        console.error(`  [Expert] Ошибка для "${idea.name}":`, err);
        // Продолжаем с остальными идеями
      }
    }
    console.log(`[Gen] Экспертный совет: ${expertsDone}/${savedIdeas.length} идей оценены`);

    // ═══════════════════════════════════════════════════
    // ШАГ 8: ФИНАЛИЗАЦИЯ
    // ═══════════════════════════════════════════════════
    console.log(`[Gen] ═══ ИТОГ ═══`);
    console.log(`[Gen] Тренды: ${trendItems.length} собрано → ${trendsForAI.length} после фильтра`);
    console.log(`[Gen] Идеи: ${genResult.ideas.length} сгенерировано → ${dedupResult.unique.length} после дедупа → ${finalIdeas.length} после валидации`);
    console.log(`[Gen] Эксперты: ${expertsDone}/${savedIdeas.length} оценены (Sonnet)`);
    console.log(`[Gen] Токены: ${totalTokensIn} in, ${totalTokensOut} out`);
```

### 1.2. То же самое для cron/generate

**Файл:** `src/app/api/cron/generate/route.ts`

Добавь те же импорты (`expertChain`, `collectValidationData`, `formatValidationForPrompt`) и встрой точно такой же блок экспертного совета после сохранения идей в БД, перед финализацией.

---

## БЛОК 2: ПОЧИНИТЬ ПОЛЯ ИДЕИ

### 2.1. Убрать мёртвые поля с UI страницы идеи

**Файл:** `src/app/ideas/[id]/page.tsx`

**2.1а — Убрать блок «Шанс успеха (самооценка)».**

Найди весь блок который начинается с:
```tsx
          ) : idea.successChance != null ? (
```
и заканчивается на:
```tsx
          ) : null}
```
(это блок с текстом «Шанс успеха (самооценка)» и прогресс-баром)

Удали этот блок целиком. Оставь только блок экспертной оценки (`idea.expertAnalysis?.finalScore`).

**2.1б — Убрать «Доход за 3 мес» и «Время до MVP» если пустые.**

Найди блоки `{idea.estimatedRevenue && (` и `{idea.timeToLaunch && (` — они уже условные, это ок. Но добавь проверку что значение не пустая строка:

Замени `{idea.estimatedRevenue && (` на `{idea.estimatedRevenue && idea.estimatedRevenue.trim() !== "" && (`
Замени `{idea.timeToLaunch && (` на `{idea.timeToLaunch && idea.timeToLaunch.trim() !== "" && (`

**2.1в — Скрыть «Сценарии по рынкам» если все поля пустые.**

Это уже реализовано в `MarketScenariosBlock` — проверка `allDefault`. Но сейчас дефолт — пустая строка `""`, а проверка сравнивает с `"Не оценено"`. Исправь:

В функции `MarketScenariosBlock`, найди:
```ts
  const allDefault = scenarioFields.every(
    (f) => scenarios.russia[f.key] === "Не оценено" && scenarios.global[f.key] === "Не оценено"
  );
```

Замени на:
```ts
  const allDefault = scenarioFields.every(
    (f) => (!scenarios.russia[f.key] || scenarios.russia[f.key] === "Не оценено" || scenarios.russia[f.key].trim() === "")
      && (!scenarios.global[f.key] || scenarios.global[f.key] === "Не оценено" || scenarios.global[f.key].trim() === "")
  );
```

### 2.2. Локализовать сырые значения

**Файл:** `src/app/ideas/[id]/page.tsx`

В блоке «Подробные данные» (внутри `{detailsOpen && (`), найди:
```tsx
            <InfoBlock title="Стоимость запуска" content={idea.startupCost} />
            <InfoBlock title="Конкуренция" content={idea.competitionLevel} />
```

Замени на:
```tsx
            <InfoBlock title="Стоимость запуска" content={
              idea.startupCost === "low" ? "Низкая (до $500)" :
              idea.startupCost === "medium" ? "Средняя ($500-2000)" :
              idea.startupCost === "high" ? "Высокая (>$2000)" :
              idea.startupCost
            } />
            <InfoBlock title="Конкуренция" content={
              idea.competitionLevel === "low" ? "Низкая — мало конкурентов" :
              idea.competitionLevel === "medium" ? "Средняя — рынок есть, но не перенасыщен" :
              idea.competitionLevel === "high" ? "Высокая — много конкурентов" :
              idea.competitionLevel
            } />
```

### 2.3. Вынести замечание валидатора из описания

**Файл:** `src/app/ideas/[id]/page.tsx`

Найди блок описания:
```tsx
      {/* Описание — всегда видно */}
      <InfoBlock title="Описание" content={idea.description} />
```

Замени на:
```tsx
      {/* Описание — всегда видно */}
      {(() => {
        const validatorMatch = idea.description.match(/\[(?:⚠️\s*)?Замечание(?:\s*валидатора)?:\s*(.*?)\]$/);
        const cleanDescription = validatorMatch ? idea.description.replace(validatorMatch[0], "").trim() : idea.description;
        const validatorNote = validatorMatch ? validatorMatch[1] : null;
        return (
          <>
            <InfoBlock title="Описание" content={cleanDescription} />
            {validatorNote && (
              <div
                className="mt-3 rounded-2xl p-4"
                style={{ backgroundColor: "var(--warning, #f59e0b)10", border: "1px solid var(--warning, #f59e0b)30" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span>⚠️</span>
                  <span className="text-sm font-semibold">Замечание валидатора</span>
                </div>
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{validatorNote}</p>
              </div>
            )}
          </>
        );
      })()}
```

### 2.4. Скрывать пустые поля в подробных данных

**Файл:** `src/app/ideas/[id]/page.tsx`

В блоке `{detailsOpen && (`, оберни каждый InfoBlock проверкой на пустоту. Замени весь блок:
```tsx
          <div className="mt-2 space-y-3 animate-fade-in">
            <InfoBlock title="Целевая аудитория" content={idea.targetAudience} />
            <InfoBlock title="Монетизация" content={idea.monetization} />
            <InfoBlock title="Стоимость запуска" content={idea.startupCost} />
            <InfoBlock title="Конкуренция" content={idea.competitionLevel} />
            <InfoBlock title="Подтверждение трендами" content={idea.trendBacking} />
            <InfoBlock title="План действий" content={idea.actionPlan} />
          </div>
```

Замени на:
```tsx
          <div className="mt-2 space-y-3 animate-fade-in">
            {idea.targetAudience && idea.targetAudience !== "Не указано" && (
              <InfoBlock title="Целевая аудитория" content={idea.targetAudience} />
            )}
            {idea.monetization && idea.monetization !== "Не указано" && (
              <InfoBlock title="Монетизация" content={idea.monetization} />
            )}
            <InfoBlock title="Стоимость запуска" content={
              idea.startupCost === "low" ? "Низкая (до $500)" :
              idea.startupCost === "medium" ? "Средняя ($500-2000)" :
              idea.startupCost === "high" ? "Высокая (>$2000)" :
              idea.startupCost
            } />
            <InfoBlock title="Конкуренция" content={
              idea.competitionLevel === "low" ? "Низкая — мало конкурентов" :
              idea.competitionLevel === "medium" ? "Средняя — рынок есть, но не перенасыщен" :
              idea.competitionLevel === "high" ? "Высокая — много конкурентов" :
              idea.competitionLevel
            } />
            {idea.trendBacking && idea.trendBacking.trim() !== "" && (
              <InfoBlock title="Подтверждение трендами" content={idea.trendBacking} />
            )}
            {idea.actionPlan && idea.actionPlan.trim() !== "" && (
              <InfoBlock title="План действий" content={idea.actionPlan} />
            )}
          </div>
```

---

## БЛОК 3: UI КАРТОЧЕК (страница «Все идеи»)

### 3.1. Сделать карточки компактнее

**Файл:** `src/components/ui/IdeaCard.tsx`

Замени содержимое файла ЦЕЛИКОМ на:
```tsx
"use client";

import React from "react";
import Link from "next/link";
import type { IdeaDTO } from "@/lib/types";
import { getDifficultyLabel, getDifficultyColor } from "@/lib/utils";

interface IdeaCardProps {
  idea: IdeaDTO;
  onToggleFavorite?: (id: string, isFavorite: boolean) => void;
}

export const IdeaCard = React.memo(function IdeaCard({
  idea,
  onToggleFavorite,
}: IdeaCardProps) {

  const hasExpert = idea.expertAnalysis?.finalScore != null;
  const displayScore = idea.expertAnalysis?.finalScore;
  const displayVerdict = idea.expertAnalysis?.finalVerdict;

  // Убираем замечание валидатора из описания для карточки
  const cleanDescription = idea.description.replace(/\[(?:⚠️\s*)?Замечание.*?\]$/, "").trim();
  const shortDescription = cleanDescription.length > 120 ? cleanDescription.slice(0, 117) + "..." : cleanDescription;

  return (
    <Link
      href={`/ideas/${idea.id}`}
      className="block rounded-2xl p-5 transition-all duration-200 hover:scale-[1.01]"
      style={{
        backgroundColor: "var(--card)",
        boxShadow: hasExpert && displayScore && displayScore >= 7
          ? `0 0 0 1px var(--success), var(--shadow-sm)`
          : "var(--shadow-sm)",
      }}
    >
      {/* Шапка: эмодзи + название + оценка */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl shrink-0">{idea.emoji}</span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">{idea.name}</h3>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: `${getDifficultyColor(idea.difficulty) || "var(--muted)"}20`,
                  color: getDifficultyColor(idea.difficulty) || "var(--muted-foreground)",
                }}
              >
                {getDifficultyLabel(idea.difficulty) || idea.difficulty}
              </span>
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: "var(--muted)" }}>
                {idea.market === "russia" ? "🇷🇺" : idea.market === "global" ? "🌍" : "🇷🇺🌍"}
              </span>
            </div>
          </div>
        </div>

        {/* Оценка или звёздочка */}
        <div className="flex items-center gap-2 shrink-0">
          {hasExpert && displayScore != null && displayVerdict ? (
            <div className="text-right">
              <div className="text-lg font-bold" style={{
                color: displayScore >= 7 ? "var(--success)" : displayScore >= 5 ? "var(--warning)" : "var(--destructive)",
              }}>
                {displayScore}
              </div>
              <div className="text-[9px] font-medium" style={{
                color: displayVerdict === "launch" ? "var(--success)" : displayVerdict === "pivot" ? "var(--warning)" : "var(--destructive)",
              }}>
                {displayVerdict === "launch" ? "запуск" : displayVerdict === "pivot" ? "доработка" : "отказ"}
              </div>
            </div>
          ) : (
            <span
              className="rounded-full px-2 py-0.5 text-[10px]"
              style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}
            >
              Не оценено
            </span>
          )}

          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite?.(idea.id, !idea.isFavorite);
            }}
            className="cursor-pointer text-lg opacity-40 transition-opacity hover:opacity-100"
            title={idea.isFavorite ? "Убрать из избранного" : "В избранное"}
          >
            {idea.isFavorite ? "⭐" : "☆"}
          </button>
        </div>
      </div>

      {/* Описание — 2 строки максимум */}
      <p
        className="text-xs leading-relaxed"
        style={{ color: "var(--muted-foreground)" }}
      >
        {shortDescription}
      </p>

      {/* Прогресс-бар оценки */}
      {hasExpert && displayScore != null && (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--muted)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${displayScore * 10}%`,
              backgroundColor: displayScore >= 7 ? "var(--success)" : displayScore >= 5 ? "var(--warning)" : "var(--destructive)",
            }}
          />
        </div>
      )}
    </Link>
  );
});
```

---

## БЛОК 4: ФИЛЬТРЫ

### 4.1. Обновить типы и опции фильтров на фронтенде

**Файл:** `src/app/ideas/page.tsx`

Замени типы и добавь новые состояния. Найди:
```ts
type SortBy = "date" | "expert" | "chance" | "revenue";
type MarketFilter = "all" | "russia" | "global" | "both";
type DifficultyFilter = "all" | "easy" | "medium" | "hard";
```

Замени на:
```ts
type SortBy = "date" | "expert" | "name_asc" | "name_desc";
type MarketFilter = "all" | "russia" | "global" | "both";
type DifficultyFilter = "all" | "easy" | "medium" | "hard";
type VerdictFilter = "all" | "launch" | "pivot" | "reject" | "none";
type PeriodFilter = "all" | "today" | "week" | "month";
```

Найди блок состояний фильтров и добавь два новых:
```ts
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
```

Замени на:
```ts
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [verdict, setVerdict] = useState<VerdictFilter>("all");
  const [period, setPeriod] = useState<PeriodFilter>("all");
```

В `buildQuery`, после строки `if (search.trim()) params.set("search", search.trim());` добавь:
```ts
      if (verdict !== "all") params.set("verdict", verdict);
      if (period !== "all") params.set("period", period);
```

В `useEffect` для фильтров добавь `verdict` и `period` в зависимости:
```ts
  }, [sort, market, difficulty, onlyFavorites, showArchived, verdict, period]);
```

Замени `sortOptions`:
```ts
  const sortOptions: { value: SortBy; label: string }[] = [
    { value: "date", label: "Новые" },
    { value: "expert", label: "По экспертам ↓" },
    { value: "name_asc", label: "А-Я" },
    { value: "name_desc", label: "Я-А" },
  ];
```

Добавь новые группы опций ПОСЛЕ `difficultyOptions`:
```ts
  const verdictOptions: { value: VerdictFilter; label: string }[] = [
    { value: "all", label: "Все" },
    { value: "launch", label: "🟢 Запуск" },
    { value: "pivot", label: "🟡 Доработка" },
    { value: "reject", label: "🔴 Отказ" },
    { value: "none", label: "Без оценки" },
  ];

  const periodOptions: { value: PeriodFilter; label: string }[] = [
    { value: "all", label: "Всё время" },
    { value: "today", label: "Сегодня" },
    { value: "week", label: "Неделя" },
    { value: "month", label: "Месяц" },
  ];
```

В JSX, после FilterGroup для сложности добавь:
```tsx
        {/* Вердикт экспертов */}
        <FilterGroup
          options={verdictOptions}
          value={verdict}
          onChange={(v) => setVerdict(v as VerdictFilter)}
        />

        {/* Период */}
        <FilterGroup
          options={periodOptions}
          value={period}
          onChange={(v) => setPeriod(v as PeriodFilter)}
        />
```

### 4.2. Обновить бэкенд фильтров

**Файл:** `src/app/api/ideas/route.ts`

Добавь новые параметры. После строки `const sort = url.searchParams.get("sort") || "date";` добавь:
```ts
    const verdict = url.searchParams.get("verdict");
    const period = url.searchParams.get("period");
```

Исправить фильтр рынка — «Россия» должен включать «both». Замени:
```ts
    if (market && ["russia", "global", "both"].includes(market)) {
      where.market = market;
    }
```

На:
```ts
    if (market === "russia") {
      where.market = { in: ["russia", "both"] };
    } else if (market === "global") {
      where.market = { in: ["global", "both"] };
    } else if (market === "both") {
      where.market = "both";
    }
```

Добавь фильтр по периоду ПЕРЕД строкой `where.report = { status: "complete" };`:
```ts
    if (period === "today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      where.createdAt = { gte: today };
    } else if (period === "week") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      where.createdAt = { gte: weekAgo };
    } else if (period === "month") {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      where.createdAt = { gte: monthAgo };
    }
```

Обнови сортировку. Замени:
```ts
    let orderBy: Record<string, string> = { createdAt: "desc" };
    if (sort === "chance") orderBy = { successChance: "desc" };
    if (sort === "date") orderBy = { createdAt: "desc" };
```

На:
```ts
    let orderBy: Record<string, string> = { createdAt: "desc" };
    if (sort === "date") orderBy = { createdAt: "desc" };
    if (sort === "name_asc") orderBy = { name: "asc" };
    if (sort === "name_desc") orderBy = { name: "desc" };
```

Обнови сортировку по экспертам И добавь фильтр по вердикту. Замени:
```ts
    // Сортировка по экспертам (в памяти, т.к. это JSON-поле)
    if (sort === "expert") {
      mapped = mapped.sort((a, b) =>
        (b.expertAnalysis?.finalScore || 0) - (a.expertAnalysis?.finalScore || 0)
      );
    }
```

На:
```ts
    // Фильтр по вердикту экспертов (в памяти, т.к. это JSON-поле)
    if (verdict === "launch" || verdict === "pivot" || verdict === "reject") {
      mapped = mapped.filter((idea) => idea.expertAnalysis?.finalVerdict === verdict);
    } else if (verdict === "none") {
      mapped = mapped.filter((idea) => !idea.expertAnalysis);
    }

    // Пересчитываем total после фильтрации по вердикту
    const filteredTotal = verdict && verdict !== "all" ? mapped.length : total;

    // Сортировка по экспертам (в памяти, т.к. это JSON-поле)
    if (sort === "expert") {
      mapped = mapped.sort((a, b) =>
        (b.expertAnalysis?.finalScore || 0) - (a.expertAnalysis?.finalScore || 0)
      );
    }
```

Обнови JSON ответа — замени `total` на `filteredTotal`:
```ts
    return NextResponse.json({
      ideas: mapped,
      total: filteredTotal ?? total,
      limit,
      offset,
    });
```

---

## БЛОК 5: ЭКСПОРТ ИДЕЙ ДЛЯ АНАЛИЗА

### 5.1. Создать API-роут для экспорта

**Создай файл:** `src/app/api/ideas/export/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/ideas/export — выгрузка идей в Markdown
// Поддерживает те же фильтры что и GET /api/ideas
export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl;
    const market = url.searchParams.get("market");
    const difficulty = url.searchParams.get("difficulty");
    const favorite = url.searchParams.get("favorite");
    const verdict = url.searchParams.get("verdict");
    const period = url.searchParams.get("period");
    const search = url.searchParams.get("search");

    const where: Record<string, unknown> = {};

    if (market === "russia") {
      where.market = { in: ["russia", "both"] };
    } else if (market === "global") {
      where.market = { in: ["global", "both"] };
    } else if (market === "both") {
      where.market = "both";
    }
    if (difficulty && ["easy", "medium", "hard"].includes(difficulty)) {
      where.difficulty = difficulty;
    }
    if (favorite === "true") {
      where.isFavorite = true;
    }
    if (period === "today") {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      where.createdAt = { gte: today };
    } else if (period === "week") {
      const d = new Date(); d.setDate(d.getDate() - 7);
      where.createdAt = { gte: d };
    } else if (period === "month") {
      const d = new Date(); d.setMonth(d.getMonth() - 1);
      where.createdAt = { gte: d };
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }
    where.isArchived = false;
    where.report = { status: "complete" };

    const ideas = await prisma.businessIdea.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { report: { select: { date: true, aiModel: true } } },
    });

    // Фильтр по вердикту (в памяти)
    let filtered = ideas;
    if (verdict === "launch" || verdict === "pivot" || verdict === "reject") {
      filtered = ideas.filter((idea) => {
        if (!idea.expertAnalysis) return false;
        try {
          const ea = JSON.parse(idea.expertAnalysis);
          return ea.finalVerdict === verdict;
        } catch { return false; }
      });
    } else if (verdict === "none") {
      filtered = ideas.filter((idea) => !idea.expertAnalysis);
    }

    // Генерируем Markdown
    const now = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
    let md = `# Экспорт идей — 1000 ботов\n\n`;
    md += `**Дата выгрузки:** ${now}\n`;
    md += `**Всего идей:** ${filtered.length}\n`;
    md += `**Фильтры:** ${[
      market && market !== "all" ? `рынок=${market}` : null,
      difficulty ? `сложность=${difficulty}` : null,
      verdict && verdict !== "all" ? `вердикт=${verdict}` : null,
      period && period !== "all" ? `период=${period}` : null,
      favorite === "true" ? "только избранные" : null,
      search ? `поиск="${search}"` : null,
    ].filter(Boolean).join(", ") || "без фильтров"}\n\n---\n\n`;

    for (const idea of filtered) {
      let expertAnalysis = null;
      if (idea.expertAnalysis) {
        try { expertAnalysis = JSON.parse(idea.expertAnalysis); } catch { /* skip */ }
      }

      md += `## ${idea.emoji} ${idea.name}\n\n`;
      md += `- **Дата:** ${idea.report.date.toLocaleDateString("ru-RU")}\n`;
      md += `- **Рынок:** ${idea.market === "russia" ? "Россия" : idea.market === "global" ? "Мир" : "Оба"}\n`;
      md += `- **Сложность:** ${idea.difficulty}\n`;
      md += `- **Стоимость запуска:** ${idea.startupCost}\n`;
      md += `- **Конкуренция:** ${idea.competitionLevel}\n`;

      if (expertAnalysis) {
        md += `- **Экспертная оценка:** ${expertAnalysis.finalScore}/10 → ${expertAnalysis.finalVerdict === "launch" ? "ЗАПУСКАТЬ" : expertAnalysis.finalVerdict === "pivot" ? "ДОРАБОТАТЬ" : "ОТКАЗАТЬСЯ"}\n`;
      } else {
        md += `- **Экспертная оценка:** не проведена\n`;
      }

      md += `\n### Описание\n${idea.description}\n`;
      md += `\n### Целевая аудитория\n${idea.targetAudience}\n`;
      md += `\n### Монетизация\n${idea.monetization}\n`;

      if (idea.trendBacking && idea.trendBacking.trim()) {
        md += `\n### Подтверждение трендами\n${idea.trendBacking}\n`;
      }

      if (expertAnalysis) {
        md += `\n### Экспертный совет\n`;
        md += `- **Итог:** ${expertAnalysis.summary}\n`;
        md += `- **Трекер:** ${expertAnalysis.tracker.score}/10 — ${expertAnalysis.tracker.recommendation}\n`;
        md += `- **Маркетолог:** ${expertAnalysis.marketer.score}/10 — ${expertAnalysis.marketer.recommendation}\n`;
        md += `- **Продакт:** ${expertAnalysis.product.score}/10 — ${expertAnalysis.product.recommendation}\n`;
        md += `- **Финансист:** ${expertAnalysis.financier.score}/10 — ${expertAnalysis.financier.recommendation}\n`;
        if (expertAnalysis.skeptic) {
          md += `- **Скептик:** ${expertAnalysis.skeptic.score}/10 — ${expertAnalysis.skeptic.recommendation}\n`;
        }
        if (expertAnalysis.debates) {
          md += `\n**Дебаты экспертов:**\n${expertAnalysis.debates}\n`;
        }
      }

      if (idea.deepDive) {
        md += `\n### Deep Dive\n${idea.deepDive}\n`;
      }

      md += `\n---\n\n`;
    }

    return new NextResponse(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="ideas-export-${new Date().toISOString().split("T")[0]}.md"`,
      },
    });
  } catch (error) {
    console.error("[API /ideas/export] Ошибка:", error);
    return NextResponse.json({ error: "Ошибка экспорта" }, { status: 500 });
  }
}
```

### 5.2. Добавить кнопку экспорта на страницу «Все идеи»

**Файл:** `src/app/ideas/page.tsx`

В `buildQuery` (или рядом), добавь функцию экспорта:

После определения `buildQuery`, добавь:
```ts
  function handleExport() {
    const params = new URLSearchParams();
    if (market !== "all") params.set("market", market);
    if (difficulty !== "all") params.set("difficulty", difficulty);
    if (verdict !== "all") params.set("verdict", verdict);
    if (period !== "all") params.set("period", period);
    if (onlyFavorites) params.set("favorite", "true");
    if (search.trim()) params.set("search", search.trim());
    window.open(`/api/ideas/export?${params.toString()}`, "_blank");
  }
```

В JSX, после кнопки «📦 + Архив» добавь:
```tsx
        {/* Экспорт */}
        <button
          onClick={handleExport}
          className="cursor-pointer rounded-xl px-3 py-1.5 text-xs font-medium transition-all"
          style={{
            backgroundColor: "var(--muted)",
            color: "var(--muted-foreground)",
          }}
        >
          📥 Выгрузить .md
        </button>
```

---

## ПОСЛЕ ВСЕХ ИЗМЕНЕНИЙ

1. `npm run build` — убедись что нет ошибок
2. Если ошибки TypeScript — исправь, не меняя логику
3. `git add -A && git commit -m "feat: автоэксперты в пайплайне, UI карточек, фильтры по вердикту/периоду/алфавиту, экспорт в Markdown" && git push`

## НЕ ДЕЛАЙ

- Не меняй ai-brain.ts — он уже обновлён
- Не меняй коллекторы — они уже обновлены
- Не трогай expert-chain.ts — он используется как есть
- Не задавай вопросы — просто делай
