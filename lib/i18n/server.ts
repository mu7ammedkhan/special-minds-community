import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getMe } from "../auth";
import { isLocale, makeT, type Locale } from "./index";

export const LOCALE_COOKIE = "smm_locale";

/** The signed-in member's language, else the one chosen on this device, else English. */
export const getLocale = cache(async (): Promise<Locale> => {
  const me = await getMe();
  if (me) return me.locale;
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(c) ? c : "en";
});

export async function getT() {
  const locale = await getLocale();
  return { t: makeT(locale), locale };
}
