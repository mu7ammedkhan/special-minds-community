import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Sans_Arabic, Space_Grotesk } from "next/font/google";
import { I18nProvider } from "@/components/i18n";
import { dirOf } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], display: "swap", variable: "--font-fraunces", weight: ["400", "500", "600"], style: ["normal", "italic"] });
const grotesk = Space_Grotesk({ subsets: ["latin"], display: "swap", variable: "--font-grotesk", weight: ["400", "500", "600", "700"] });
const arabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], display: "swap", variable: "--font-arabic", weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Special Minds Community", template: "%s · Special Minds Community" },
  description: "One place for Special Minds specialists and families: channels, opportunities, a parents' feed, events and guides.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Special Minds", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#2a1a52", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={dirOf(locale)} className={`${fraunces.variable} ${grotesk.variable} ${arabic.variable}`}>
      <body className="min-h-dvh"><I18nProvider locale={locale}>{children}</I18nProvider></body>
    </html>
  );
}
