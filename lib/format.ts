import { intlLocale, type Locale } from "./i18n";

/** Dates, sizes and names, the same way on every page. Browser-safe. */

export const TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Dubai";

const asDate = (value: string | Date) =>
  value instanceof Date ? value : /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
const ok = (d: Date) => !Number.isNaN(d.getTime());

export function fmtDate(value: string | Date | null | undefined, locale: Locale = "en", tz = TIMEZONE): string {
  if (!value) return "";
  const d = asDate(value);
  if (!ok(d)) return "";
  return d.toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short", year: "numeric", timeZone: /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? "UTC" : tz });
}

export function fmtDateTime(value: string | Date | null | undefined, locale: Locale = "en", tz = TIMEZONE): string {
  if (!value) return "";
  const d = asDate(value);
  if (!ok(d)) return "";
  return d.toLocaleString(intlLocale(locale), { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz });
}

export function fmtTime(value: string | Date | null | undefined, locale: Locale = "en", tz = TIMEZONE): string {
  if (!value) return "";
  const d = asDate(value);
  if (!ok(d)) return "";
  const s = d.toLocaleTimeString(intlLocale(locale), { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz });
  return locale === "en" ? s.replace(" ", "").toLowerCase() : s;
}

/** The day a message was sent, for the line between days: "today", "yesterday" or a date. */
export function dayKey(value: string, tz = TIMEZONE): string {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: tz });
}
export function fmtDay(value: string, locale: Locale = "en", tz = TIMEZONE): { rel: "today" | "yesterday" | null; text: string } {
  const key = dayKey(value, tz);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const yest = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: tz });
  const text = new Date(value).toLocaleDateString(intlLocale(locale), { weekday: "long", day: "numeric", month: "long", timeZone: tz });
  return { rel: key === today ? "today" : key === yest ? "yesterday" : null, text };
}

/** "3 days ago", "in 2 hours". */
export function timeAgo(value: string | Date | null | undefined, locale: Locale = "en"): string {
  if (!value) return "";
  const d = asDate(value);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  const abs = Math.abs(s);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  if (abs < 45) return rtf.format(0, "second");
  if (abs < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(-Math.round(s / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(-Math.round(s / (86400 * 30)), "month");
  return rtf.format(-Math.round(s / (86400 * 365)), "year");
}

function offsetMinutes(at: Date, tz: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** "2026-11-04T15:30" on a space's clock → the moment, as an ISO string. Null when it isn't a time. */
export function zonedToUtc(local: string, tz = TIMEZONE): string | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 9), Number(m[5] ?? 0));
  if (Number.isNaN(guess)) return null;
  return new Date(guess - offsetMinutes(new Date(guess), tz) * 60000).toISOString();
}

/** A moment → "2026-11-04T15:30" on a space's clock, for a datetime-local box. */
export function toZonedInput(value: string | null | undefined, tz = TIMEZONE): string {
  if (!value) return "";
  const d = new Date(value);
  if (!ok(d)) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** The time of day and weekday on a clock: for posting hours and quiet hours. */
export function clockNow(tz = TIMEZONE, at = new Date()): { minutes: number; weekday: number; hour: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", weekday: "short", hour: "2-digit", minute: "2-digit" })
    .formatToParts(at).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  return { minutes: hour * 60 + Number(p.minute), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), hour };
}
export const hhmm = (s: string | null | undefined) => {
  const m = (s ?? "").match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
/** Inside a from–to window (one that crosses midnight too). */
export function inWindow(minutes: number, from: number, to: number) {
  return from <= to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}
export function fmtClock(s: string, locale: Locale = "en") {
  const m = hhmm(s);
  if (m === null) return s;
  const d = new Date(Date.UTC(2026, 0, 1, Math.floor(m / 60), m % 60));
  const out = d.toLocaleTimeString(intlLocale(locale), { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" });
  return locale === "en" ? out.replace(":00", "").replace(" ", " ").toLowerCase() : out;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function fmtPhone(p: string | null | undefined): string {
  if (!p) return "";
  const d = p.replace(/[^\d+]/g, "");
  let m = d.match(/^\+91(\d{5})(\d{5})$/);
  if (m) return `+91 ${m[1]} ${m[2]}`;
  m = d.match(/^\+971(\d{2})(\d{3})(\d{4})$/);
  if (m) return `+971 ${m[1]} ${m[2]} ${m[3]}`;
  m = d.match(/^\+(966|974|968|965|973)(\d{2,3})(\d{3})(\d{3,4})$/);
  if (m) return `+${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  return p;
}

/** Hides most of an email or phone number for lists: "a•••@demo.local", "+971 •• ••• 4567". */
export function maskContact(v: string | null | undefined): string {
  if (!v) return "";
  if (v.includes("@")) { const [u, d] = v.split("@"); return `${u.slice(0, 1)}•••@${d}`; }
  return `${v.slice(0, 4)} ••• ${v.slice(-4)}`;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
