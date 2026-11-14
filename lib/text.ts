/** Reading what people write: mentions, links, contact details, listed words. Browser-safe. */

export const MENTION_RE = /<@(\d+|all)>/g;

export function mentionIds(body: string): { ids: number[]; all: boolean } {
  const ids = new Set<number>();
  let all = false;
  for (const m of body.matchAll(MENTION_RE)) {
    if (m[1] === "all") all = true; else ids.add(Number(m[1]));
  }
  return { ids: [...ids], all };
}

export const URL_RE = /\bhttps?:\/\/[^\s<>()]+[^\s<>().,!?;:'"]/gi;
export const firstUrl = (s: string) => s.match(URL_RE)?.[0] ?? null;

/** Arabic and Persian digits → 0–9, so a number can't hide in another script. */
export const latinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

/** Phone numbers, emails and messaging links in a message. */
export function findContacts(text: string): ("phone" | "email" | "link")[] {
  const s = latinDigits(text.replace(MENTION_RE, " "));
  const found = new Set<"phone" | "email" | "link">();
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(s)) found.add("email");
  if (/wa\.me\/|api\.whatsapp\.com|chat\.whatsapp\.com|\bt\.me\/|telegram\.me\//i.test(s)) found.add("link");
  for (const m of s.matchAll(/(?:\+|00)?\d(?:[\s().-]?\d){7,}/g)) {
    const raw = m[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) continue; // a date
    if (raw.replace(/\D/g, "").length >= 8) { found.add("phone"); break; }
  }
  return [...found];
}

export type WordHit = { block: string[]; hold: string[]; caution: string[] };

/** Words from the review list, matched as whole words in any script. */
export function matchWords(text: string, words: { word: string; action: "hold" | "block" | "caution" }[]): WordHit {
  const s = latinDigits(text.toLowerCase());
  const hit: WordHit = { block: [], hold: [], caution: [] };
  for (const w of words) {
    const word = w.word.trim().toLowerCase();
    if (!word) continue;
    const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, "iu").test(s)) hit[w.action].push(w.word);
  }
  return hit;
}

/** A short plain version of a message for notifications and lists. */
export function snippet(body: string, names: Record<string, string> = {}, max = 140): string {
  const s = body.replace(MENTION_RE, (_, id: string) => (id === "all" ? "@everyone" : `@${names[id] ?? "someone"}`)).replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
