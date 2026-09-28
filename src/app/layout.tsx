import type { Metadata, Viewport } from "next";
import { Anton, Caveat, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

// Курсивный акцент заголовков («Air»): одно слово от руки против строгого
// гротеска. Сжатый Антон — плакатные моменты входа и регистрации.
const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
  display: "swap",
});

const anton = Anton({
  variable: "--font-anton",
  // Кириллицы у Антона нет — латиница; русские плакатные слова наберёт
  // основной гротеск, Антон отвечает только за латиницу и цифры.
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ClientFlow — управление клиентами и проектами",
    template: "%s · ClientFlow",
  },
  description:
    "CRM для digital-агентств: клиенты, проекты, Kanban-доски, счета и учёт времени в одном рабочем пространстве.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

/**
 * Браузерные расширения (Яндекс и др.) дописывают свои data-* атрибуты
 * в <html> до гидрации — React видит расхождение с SSR и ругается.
 * suppressHydrationWarning гасит его строго на этом элементе:
 * на детях и на тексте предупреждения продолжают работать.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${inter.variable} ${mono.variable} ${caveat.variable} ${anton.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="h-full antialiased" suppressHydrationWarning>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
