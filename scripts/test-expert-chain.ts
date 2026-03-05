// Тестовый скрипт: прогоняем идею "AI Юрист для договоров" через обновлённую цепочку экспертов
// Запуск: npx tsx scripts/test-expert-chain.ts

import { PrismaClient } from "@prisma/client";
import { expertChain } from "../src/lib/expert-chain";
import { collectValidationData, formatValidationForPrompt } from "../src/lib/validators/index";

async function main() {
  const prisma = new PrismaClient();

  // Получаем настройки из БД
  const settings = await prisma.settings.findUnique({ where: { id: "main" } });
  if (!settings?.anthropicApiKey) {
    console.error("❌ Нет API-ключа Anthropic в настройках");
    process.exit(1);
  }

  const idea = {
    name: "Юрист AI — AI-помощник для договорной работы",
    description:
      "Веб-сервис для малого и среднего бизнеса: загружаешь договор — AI за 2 минуты анализирует риски, находит невыгодные пункты, предлагает правки. Экономит 5000-15000₽ за каждый договор (столько стоит юрист). Типовые проверки: аренда, поставка, услуги, NDA.",
    targetAudience:
      "Малый и средний бизнес (ООО, ИП) без штатного юриста — ~3 млн компаний в РФ. Директора и бухгалтеры, которые сейчас либо не проверяют договоры вообще, либо платят 5000-15000₽ юристу за каждую проверку.",
    monetization:
      "Подписка: 2990₽/мес (10 договоров), 5990₽/мес (безлимит). Разовая проверка 990₽. Средний чек ~3500₽/мес.",
    startupCost:
      "low — $100/мес (Claude API ~$70, домен $10, Vercel бесплатно)",
    competitionLevel:
      "medium — есть общие AI-чаты (ChatGPT, YandexGPT), но нет специализированного инструмента для проверки договоров с шаблонами и юридической базой РФ",
    actionPlan:
      "1. MVP веб-приложение на Next.js + Claude API — 5 дней. 2. Шаблоны проверки по типам договоров (аренда, поставка, услуги) — 3 дня. 3. Бета-тест с 10 знакомыми предпринимателями — 1 неделя. 4. ЮKassa для оплаты — 2 дня. 5. Реклама в Telegram-каналах для предпринимателей.",
    estimatedRevenue: "100 000–300 000₽/мес при 30-50 B2B-подписчиках через 3 месяца",
    trendBacking:
      "Тренд 'AI legal tech' из HN (score 280) + рост запросов 'проверка договора онлайн' в Google Trends на 60% за год. В США LegalZoom ($700M выручки) и Harvey AI ($80M раунд) подтверждают спрос. В РФ аналогов для МСБ нет.",
  };

  console.log("🧪 Тест обновлённой цепочки экспертов");
  console.log(`📝 Идея: ${idea.name}`);
  console.log(`👥 Аудитория: B2B (МСБ)`);
  console.log("");

  // Шаг 1: Валидация (Вордстат + DaData)
  console.log("📊 Шаг 1: Собираю данные валидации...");
  const validationData = await collectValidationData({
    ideaName: idea.name,
    ideaDescription: idea.description,
    targetAudience: idea.targetAudience,
    wordstatToken: settings.wordstatToken || undefined,
    dadataApiKey: settings.dadataApiKey || undefined,
  });

  if (validationData.wordstat) {
    console.log(`  Вордстат: ${validationData.wordstat.totalMonthlySearches} запросов/мес (${validationData.wordstat.keywords.length} ключевых слов)`);
    validationData.wordstat.allResults.forEach((r) => {
      console.log(`    "${r.keyword}": ${r.monthlySearches} запросов/мес`);
    });
  } else {
    console.log("  Вордстат: нет данных (токен не настроен?)");
  }

  if (validationData.dadata) {
    console.log(`  DaData: ${validationData.dadata.companiesFound} компаний в нише`);
  } else {
    console.log("  DaData: нет данных (ключ не настроен?)");
  }

  const validationContext = formatValidationForPrompt(validationData);
  console.log("");

  // Шаг 2: Цепочка экспертов
  console.log("👨‍⚖️ Шаг 2: Запускаю цепочку из 6 экспертов...");
  const model = settings.expertModel || settings.preferredModel || "claude-haiku-4-5-20251001";
  console.log(`  Модель: ${model}`);
  console.log("");

  const result = await expertChain({
    idea,
    apiKey: settings.anthropicApiKey,
    model,
    validationContext: validationContext || undefined,
  });

  // Выводим результаты
  const a = result.analysis;
  console.log("═══════════════════════════════════════════");
  console.log("📋 РЕЗУЛЬТАТЫ ЭКСПЕРТНОГО СОВЕТА:");
  console.log("═══════════════════════════════════════════");
  console.log("");
  console.log(`🔍 Трекер:    ${a.tracker.score}/10 (${a.tracker.verdict})`);
  console.log(`   ${a.tracker.recommendation}`);
  console.log("");
  console.log(`📢 Маркетолог: ${a.marketer.score}/10`);
  console.log(`   Каналы: ${a.marketer.channels.join(", ")}`);
  console.log(`   CAC: ${a.marketer.cac}`);
  console.log(`   ${a.marketer.recommendation}`);
  console.log("");
  console.log(`📦 Продакт:   ${a.product.score}/10`);
  console.log(`   Уникальность: ${a.product.uniqueness}`);
  console.log(`   ${a.product.recommendation}`);
  console.log("");
  console.log(`💰 Финансист: ${a.financier.score}/10`);
  console.log(`   Безубыточность: ${a.financier.breakeven}`);
  console.log(`   ${a.financier.recommendation}`);
  console.log("");
  if (a.skeptic) {
    console.log(`😈 Скептик:   ${a.skeptic.score}/10`);
    console.log(`   Риски: ${a.skeptic.killerRisks.join("; ")}`);
    console.log(`   ${a.skeptic.recommendation}`);
    console.log("");
  }
  console.log(`🎯 ИТОГ: ${a.finalScore}/10 → ${a.finalVerdict.toUpperCase()}`);
  console.log(`   ${a.summary}`);
  console.log("");
  if (a.debates) {
    console.log(`🗣️ Дебаты: ${a.debates}`);
  }
  console.log("");
  console.log(`💳 Токены: ${result.tokensIn} in + ${result.tokensOut} out = ${result.tokensIn + result.tokensOut} всего`);

  // ─── Сохраняем в базу данных ───
  const saveFlag = process.argv.includes("--save");
  if (saveFlag) {
    console.log("");
    console.log("💾 Сохраняю в базу данных...");

    // Создаём отчёт-контейнер
    const report = await prisma.dailyReport.create({
      data: {
        date: new Date("2026-03-03T12:00:00Z"),
        status: "complete",
        trendsCount: 0,
        ideasCount: 1,
        aiModel: model,
        aiTokensIn: result.tokensIn,
        aiTokensOut: result.tokensOut,
        generatedAt: new Date(),
      },
    });

    // Создаём идею с экспертной оценкой
    const savedIdea = await prisma.businessIdea.create({
      data: {
        reportId: report.id,
        name: idea.name,
        emoji: "⚖️",
        description: idea.description,
        targetAudience: idea.targetAudience,
        monetization: idea.monetization,
        startupCost: idea.startupCost,
        competitionLevel: idea.competitionLevel,
        trendBacking: idea.trendBacking,
        actionPlan: idea.actionPlan,
        estimatedRevenue: idea.estimatedRevenue,
        market: "russia",
        difficulty: "medium",
        successChance: a.finalScore * 10,
        expertAnalysis: JSON.stringify(result.analysis),
      },
    });

    console.log(`✅ Отчёт: ${report.id}`);
    console.log(`✅ Идея: ${savedIdea.id}`);
    console.log(`🌐 Открой: http://localhost:1000/ideas/${savedIdea.id}`);
  } else {
    console.log("");
    console.log("💡 Добавь --save чтобы сохранить результат в базу");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Ошибка:", e);
  process.exit(1);
});
