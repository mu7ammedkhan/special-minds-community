"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { makeT, type Locale } from "@/lib/i18n";

const Ctx = createContext<Locale>("en");

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}
export const useLocale = () => useContext(Ctx);
export function useT() {
  const l = useContext(Ctx);
  return useMemo(() => makeT(l), [l]);
}
