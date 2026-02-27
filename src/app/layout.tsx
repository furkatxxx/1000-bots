import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import Providers from "@/components/layout/Providers";

export const metadata: Metadata = {
  title: "1000 ботов — Генератор бизнес-идей",
  description: "AI-система для поиска и анализа бизнес-идей на основе трендов",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        <Providers>
          <Sidebar />
          <main className="min-h-screen overflow-x-hidden pt-16 pb-8 px-5 sm:px-6 lg:pt-8 lg:ml-64 lg:px-10">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
