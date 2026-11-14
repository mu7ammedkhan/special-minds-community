import type { ReactNode } from "react";
import { setLanguage } from "@/app/actions/auth";
import type { Locale } from "@/lib/i18n";

/** The page around signing in and joining: the Special Minds purple, a card in the middle, the language switch. */
export function AuthShell({ children, locale, back = "/login", wide = false }: { children: ReactNode; locale: Locale; back?: string; wide?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-rail">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 text-white">
        <span className="flex items-center gap-3">
          <img src="/logo-mark.svg" alt="" className="size-10" />
          <span className="font-display text-lg leading-none">Special Minds<span className="mt-1 block font-sans text-sm font-semibold text-champagne">{locale === "ar" ? "المجتمع" : "Community"}</span></span>
        </span>
        <form action={setLanguage}>
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="locale" value={locale === "ar" ? "en" : "ar"} />
          <button type="submit" className="rounded-full border border-white/25 px-4 py-1.5 text-sm font-semibold text-white hover:bg-white/10" lang={locale === "ar" ? "en" : "ar"}>
            {locale === "ar" ? "English" : "العربية"}
          </button>
        </form>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:items-center">
        <div className={`rise w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-3xl bg-surface p-6 shadow-pop sm:p-8`}>{children}</div>
      </main>
    </div>
  );
}
