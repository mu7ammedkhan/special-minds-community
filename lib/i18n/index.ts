import { AR } from "./ar";

/**
 * Two languages: English and Arabic (right to left). Pages write their words
 * in English, `t("Save")`, and the Arabic dictionary (lib/i18n/ar.ts) maps
 * each English line to Arabic; anything not translated yet shows in English.
 * `npm run i18n:check` lists the lines the dictionary is missing.
 *
 * {name} in a line is filled from the second argument. A line with a count
 * ({n}) can have plural forms: English one/other here, Arabic zero/one/two/
 * few/many/other in the dictionary.
 */

export type Locale = "en" | "ar";
export type Vars = Record<string, string | number>;
export type Forms = Partial<Record<Intl.LDMLPluralRule, string>>;
export type Dict = Record<string, string | Forms>;

const EN: Dict = {
  "{n} replies": { one: "{n} reply", other: "{n} replies" },
  "{n} comments": { one: "{n} comment", other: "{n} comments" },
  "{n} members": { one: "{n} member", other: "{n} members" },
  "{n} interested": { one: "{n} interested", other: "{n} interested" },
  "{n} going": { one: "{n} going", other: "{n} going" },
  "{n} votes": { one: "{n} vote", other: "{n} votes" },
  "{n} new": { one: "{n} new", other: "{n} new" },
  "{n} people": { one: "{n} person", other: "{n} people" },
  "{n} waiting": { one: "{n} waiting", other: "{n} waiting" },
  "{n} likes": { one: "{n} like", other: "{n} likes" },
  "{n} files": { one: "{n} file", other: "{n} files" },
  "{n} specialists matched": { one: "{n} specialist matched", other: "{n} specialists matched" },
  "{n} invites made": { one: "{n} invite made", other: "{n} invites made" },
  "{n} rows ready": { one: "{n} row ready", other: "{n} rows ready" },
  "{n} days": { one: "{n} day", other: "{n} days" },
  "{n} hours": { one: "{n} hour", other: "{n} hours" },
  "{n} minutes": { one: "{n} minute", other: "{n} minutes" },
  "{n} seconds": { one: "{n} second", other: "{n} seconds" },
  "{n} recipients": { one: "{n} recipient", other: "{n} recipients" },
  "{n} topics": { one: "{n} topic", other: "{n} topics" },
};

export function translate(locale: Locale, text: string, vars?: Vars): string {
  let entry: string | Forms = (locale === "ar" ? AR[text] : undefined) ?? EN[text] ?? text;
  if (typeof entry === "object") {
    const n = Number(vars?.n ?? 0);
    const cat = new Intl.PluralRules(locale).select(n);
    entry = entry[cat] ?? entry.other ?? text;
  }
  return vars ? entry.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : entry;
}

export type T = (text: string, vars?: Vars) => string;
export const makeT = (locale: Locale): T => (text, vars) => translate(locale, text, vars);
export const dirOf = (l: Locale) => (l === "ar" ? "rtl" : "ltr");
/** Arabic with Western digits, as the Gulf mostly writes them. */
export const intlLocale = (l: Locale) => (l === "ar" ? "ar-u-nu-latn" : "en-GB");
export const isLocale = (v: unknown): v is Locale => v === "en" || v === "ar";
/** A name stored in both languages: the Arabic one in Arabic when there is one. */
export const pick = (l: Locale, en: string, ar: string | null | undefined) => (l === "ar" && ar ? ar : en);
