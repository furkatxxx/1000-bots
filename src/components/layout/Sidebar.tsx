"use client";

import { memo, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Дашборд", emoji: "🏠" },
  { href: "/reports", label: "Отчёты", emoji: "📊" },
  { href: "/trends", label: "Тренды", emoji: "📈" },
  { href: "/settings", label: "Настройки", emoji: "⚙️" },
];

const Sidebar = memo(function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleMobile = useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  // Закрываем по Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobile();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [closeMobile]);

  return (
    <>
      {/* Мобильный хедер */}
      <header
        className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 lg:hidden"
        style={{
          backgroundColor: "var(--card)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span className="text-lg font-semibold">🤖 1000 ботов</span>
        <button
          onClick={toggleMobile}
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: "var(--muted)" }}
          aria-label="Меню"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <rect y="3" width="20" height="2" rx="1" />
            <rect y="9" width="20" height="2" rx="1" />
            <rect y="15" width="20" height="2" rx="1" />
          </svg>
        </button>
      </header>

      {/* Оверлей для мобильного */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Сайдбар */}
      <aside
        className={`fixed top-0 left-0 z-50 flex h-full w-60 flex-col p-5 transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          backgroundColor: "var(--sidebar)",
          borderRight: "1px solid var(--border)",
        }}
      >
        {/* Логотип */}
        <div className="mb-8 flex items-center gap-3">
          <span className="text-2xl">🤖</span>
          <span className="text-xl font-bold">1000 ботов</span>
        </div>

        {/* Навигация */}
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobile}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200"
                style={{
                  backgroundColor: isActive
                    ? "var(--primary)"
                    : "transparent",
                  color: isActive
                    ? "var(--primary-foreground)"
                    : "var(--foreground)",
                }}
              >
                <span className="text-lg">{item.emoji}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Футер */}
        <div
          className="text-xs"
          style={{ color: "var(--muted-foreground)" }}
        >
          v0.1.0
        </div>
      </aside>
    </>
  );
});

export default Sidebar;
