import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { one, query } from "./db";
import type { Locale } from "./i18n";
import type { Kind, StaffRole } from "./options";
import { sendEmail, sendWhatsApp } from "./outbox";
import { getSettings } from "./settings";

/**
 * Signing in. Members join with their email or phone number: we send a
 * six-digit code (email, or WhatsApp for phones), they type it, and the
 * browser keeps a random session token in an http-only cookie. The database
 * keeps only the token's hash. Staff can add two-step sign-in (an
 * authenticator app) on top; admins can make it required for all staff.
 */

export type Prefs = {
  quiet?: { on: boolean; from: string; to: string };
  digest?: "off" | "daily" | "weekly";
  emailImportant?: boolean;
  whatsapp?: boolean;
};

export type Me = {
  id: number;
  email: string | null;
  phone: string | null;
  /** The name others see. */
  name: string;
  fullName: string;
  kind: Kind;
  staff: StaffRole | null;
  status: "pending" | "active" | "suspended" | "banned" | "deleted";
  locale: Locale;
  country: string | null;
  city: string | null;
  sound: string;
  mutedUntil: string | null;
  muteReason: string | null;
  spaces: number[];
  avatar: number | null;
  verified: string | null;
  totpOn: boolean;
  mfaOk: boolean;
  profileDone: boolean;
  prefs: Prefs;
};

export const SESSION_COOKIE = "smm_session";
const SESSION_DAYS = 30;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const hashToken = sha;
/** The shape of a one-time sign-in link token (32 random bytes, base64url). */
export const LINK_TOKEN = /^[A-Za-z0-9_-]{20,100}$/;

/**
 * Where to go after signing in or switching language: our own pages only.
 * Refuses "//host" and "/\host" (browsers read both as another site), spaces
 * and control characters, and the API, both as written and percent-decoded
 * (a decoded "%09" tab is dropped by URL parsers, turning "/%09/host" into "//host").
 */
export function safeNext(v: unknown): string {
  if (typeof v !== "string" || v.length > 500) return "/";
  let decoded: string;
  try { decoded = decodeURIComponent(v); } catch { return "/"; }
  const ok = (s: string) => /^\/(?![/\\])[^\\\s\x00-\x1f\x7f]*$/.test(s) && !s.startsWith("/api");
  return ok(v) && ok(decoded) ? v : "/";
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/**
 * What sign-in codes are counted against: the IPv4 address, or for IPv6 its /64
 * network (one home or phone gets a whole /64, so counting single addresses
 * would let one person ask from millions of them).
 */
export function rateKey(ip: string | null): string | null {
  if (!ip) return null;
  const v4 = ip.match(/^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (v4) return v4[1];
  if (!ip.includes(":")) return ip.slice(0, 64);
  const [head, tail] = ip.split("%")[0].toLowerCase().split("::");
  const h = head ? head.split(":") : [];
  const t = tail === undefined ? [] : tail ? tail.split(":") : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "") || "0").join(":")}::/64`;
}

/** New addresses (not yet members) that may be sent a code each hour, across everyone: stops a script using up the email quota. */
const NEW_ADDRESS_CODES_PER_HOUR = 200;

// ----------------------------------------------------------------- sessions ----

export async function startSession(memberId: number, mfaOk = false) {
  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  await query(
    `insert into sessions (id, member_id, expires_at, mfa_ok, user_agent, ip) values ($1, $2, now() + make_interval(days => $3), $4, $5, $6)`,
    [sha(token), memberId, SESSION_DAYS, mfaOk, (h.get("user-agent") ?? "").slice(0, 300), await clientIp()]);
  await query(`update members set last_seen_at = now() where id = $1`, [memberId]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query(`delete from sessions where id = $1`, [sha(token)]);
  jar.delete(SESSION_COOKIE);
}

export async function markMfaOk() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await query(`update sessions set mfa_ok = true, mfa_tries = 0 where id = $1`, [sha(token)]);
}

/** Two-step codes allowed per session before it is signed out (then a new email or WhatsApp code is needed). */
export const MFA_TRIES = 5;

/**
 * Counts a two-step code try on this session before the code is checked, in one
 * statement, so parallel guesses can't get past MFA_TRIES. Returns the count.
 */
export async function countMfaTry(): Promise<number> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return Number.POSITIVE_INFINITY;
  const r = await one<{ n: number }>(`update sessions set mfa_tries = mfa_tries + 1 where id = $1 returning mfa_tries as n`, [sha(token)]);
  return r ? Number(r.n) : Number.POSITIVE_INFINITY;
}

/** Signs someone out everywhere (suspension, ban, deleting the account). */
export async function endAllSessions(memberId: number) {
  await query(`delete from sessions where member_id = $1`, [memberId]);
}

type Row = {
  id: number; email: string | null; phone: string | null; full_name: string; display_name: string | null; kind: Kind; staff_role: StaffRole | null;
  status: Me["status"]; locale: Locale; country: string | null; city: string | null; notify_sound: string; muted_until: string | null; mute_reason: string | null;
  avatar_file_id: number | null; verified_title: string | null; totp_on: boolean; profile_done: boolean; prefs: Prefs;
  mfa_ok: boolean; refresh: boolean; stale: boolean; spaces: number[];
};

/** The session's member, two-step code or not. Read once per request. */
const loadMe = cache(async (): Promise<Me | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await one<Row>(
    `select m.id, m.email, m.phone, m.full_name, m.display_name, m.kind, m.staff_role, m.status, m.locale, m.country, m.city, m.notify_sound,
            case when m.muted_until > now() then m.muted_until end as muted_until, m.mute_reason, m.avatar_file_id, m.verified_title,
            m.totp_on, m.profile_done, m.prefs, s.mfa_ok,
            s.expires_at < now() + interval '15 days' as refresh, s.last_seen_at < now() - interval '2 minutes' as stale,
            coalesce((select array_agg(sm.space_id order by sm.space_id) from space_members sm where sm.member_id = m.id), '{}') as spaces
       from sessions s join members m on m.id = s.member_id
      where s.id = $1 and s.expires_at > now()`, [sha(token)]);
  if (!row || ["suspended", "banned", "deleted"].includes(row.status)) return null;
  if (row.refresh || row.stale) {
    await query(`update sessions set last_seen_at = now(), expires_at = greatest(expires_at, now() + make_interval(days => $2)) where id = $1`, [sha(token), row.refresh ? SESSION_DAYS : 0]);
    await query(`update members set last_seen_at = now() where id = $1`, [row.id]);
  }
  return {
    id: row.id, email: row.email, phone: row.phone, name: row.display_name?.trim() || row.full_name || "New member", fullName: row.full_name || "New member",
    kind: row.kind, staff: row.staff_role, status: row.status, locale: row.locale, country: row.country, city: row.city, sound: row.notify_sound,
    mutedUntil: row.muted_until, muteReason: row.mute_reason, spaces: row.spaces.map(Number), avatar: row.avatar_file_id, verified: row.verified_title,
    totpOn: row.totp_on, mfaOk: row.mfa_ok, profileDone: row.profile_done, prefs: row.prefs ?? {},
  };
});

/**
 * The signed-in member, or null. Also null while their two-step code is still
 * to come, so a session that only passed the email or WhatsApp code can't use
 * pages, actions or API routes.
 */
export const getMe = cache(async (): Promise<Me | null> => {
  const me = await loadMe();
  return me && me.totpOn && !me.mfaOk ? null : me;
});

/** The member before their two-step code too: only for the two-step page, signing out and the language switch. */
export const getPendingMe = loadMe;

/** For pages and actions: signed in, past two-step sign-in, profile done and in the community. */
export async function requireMe(opts: { allowPending?: boolean; skipMfa?: boolean } = {}): Promise<Me> {
  const me = await loadMe();
  if (!me) redirect("/login");
  if (!opts.skipMfa && me.totpOn && !me.mfaOk) redirect("/mfa");
  if (!opts.allowPending && (me.status !== "active" || !me.profileDone)) redirect("/welcome");
  return me;
}

const RANK: Record<StaffRole, number> = { moderator: 1, admin: 2, owner: 3 };
export const isStaff = (me: Pick<Me, "staff">) => Boolean(me.staff);
export const isAdmin = (me: Pick<Me, "staff">) => me.staff === "admin" || me.staff === "owner";
export const atLeast = (me: Pick<Me, "staff">, level: StaffRole) => Boolean(me.staff && RANK[me.staff] >= RANK[level]);

/** Staff pages: the role, and two-step sign-in when admins require it. */
export async function requireStaff(level: StaffRole = "moderator"): Promise<Me> {
  const me = await requireMe();
  if (!atLeast(me, level)) redirect("/?denied=1");
  if ((await getSettings()).requireStaff2fa && !me.totpOn) redirect("/account?tab=security&setup=1");
  return me;
}

/** requireStaff's rules for API routes, which answer with an error instead of a redirect. */
export async function staffOk(me: Me | null, level: StaffRole = "moderator"): Promise<boolean> {
  if (!me || me.status !== "active" || !atLeast(me, level)) return false;
  return !(await getSettings()).requireStaff2fa || me.totpOn;
}

// ------------------------------------------------------------ sign-in codes ----

export type Address = { address: string; channel: "email" | "whatsapp" };

/** An email, or a phone number in any usual form (+971 50…, 050…, 00971…). */
export function readAddress(raw: string, defaultCountry = "AE"): Address | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.includes("@")) {
    const e = s.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 160 ? { address: e, channel: "email" } : null;
  }
  const p = parsePhoneNumberFromString(s.replace(/^00/, "+"), defaultCountry as CountryCode);
  return p?.isValid() ? { address: p.number, channel: "whatsapp" } : null;
}

/** Previews and demos only: show the sign-in code on screen instead of sending it. */
export const showCodesOnScreen = () => process.env.SHOW_CODES === "1" || process.env.DEMO_LOGINS === "1";

export async function sendLoginCode(addr: Address, locale: Locale): Promise<{ ok: true; preview?: string } | { ok: false; error: string }> {
  const ip = rateKey(await clientIp());
  const recent = await one<{ a: number; i: number }>(
    `select (select count(*) from login_codes where address = $1 and created_at > now() - interval '1 hour')::int as a,
            (select count(*) from login_codes where ip = $2 and created_at > now() - interval '1 hour')::int as i`, [addr.address, ip]);
  if ((recent?.a ?? 0) >= 6 || (recent?.i ?? 0) >= 40) return { ok: false, error: "Too many codes asked for. Please wait an hour and try again." };
  if (await one(`select 1 from banned_contacts where contact = $1`, [addr.address])) return { ok: false, error: "This email or phone number can't join the community." };
  const known = await one(addr.channel === "email" ? `select 1 from members where lower(email) = $1` : `select 1 from members where phone = $1`, [addr.address]);
  if (!known) {
    // Members always get their code; new addresses share an hourly allowance.
    const fresh = await one<{ n: number }>(
      `select count(*)::int as n from login_codes c where c.created_at > now() - interval '1 hour'
          and not exists (select 1 from members m where lower(m.email) = c.address or m.phone = c.address)`);
    if ((fresh?.n ?? 0) >= NEW_ADDRESS_CODES_PER_HOUR) {
      console.warn(`sign-in codes: the hourly allowance for new addresses (${NEW_ADDRESS_CODES_PER_HOUR}) is used up`);
      return { ok: false, error: "Sign-ups are very busy right now. Please try again in an hour." };
    }
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await query(`insert into login_codes (address, channel, code_hash, ip, expires_at) values ($1, $2, $3, $4, now() + interval '10 minutes')`,
    [addr.address, addr.channel, sha(`${addr.address}:${code}`), ip]);
  const ar = locale === "ar";
  const text = ar
    ? `رمز الدخول إلى مجتمع سبيشال مايندز: ${code}\nينتهي خلال 10 دقائق. لا تشاركه مع أحد.`
    : `Your Special Minds Community sign-in code is ${code}.\nIt works for 10 minutes. Don't share it with anyone.`;
  const r = addr.channel === "email"
    ? await sendEmail({ to: addr.address, subject: ar ? `رمز الدخول: ${code}` : `Your sign-in code: ${code}`, text, purpose: "login_code", redact: code })
    : await sendWhatsApp({ to: addr.address, text, template: "login_code", params: [code], purpose: "login_code", redact: code, lang: locale });
  if (r.status === "failed") return { ok: false, error: "The code couldn't be sent. Check the address and try again." };
  if (r.status === "simulated") {
    if (showCodesOnScreen()) return { ok: true, preview: code };
    return { ok: false, error: addr.channel === "email"
      ? "Email isn't set up yet, so sign-in codes can't be sent. Please contact Special Minds."
      : "WhatsApp isn't set up yet, so codes can't go to phones. Please use your email instead." };
  }
  return { ok: true };
}

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function verifyLoginCode(address: string, code: string): Promise<{ ok: true; memberId: number; isNew: boolean } | { ok: false; error: string }> {
  const row = await one<{ id: number; code_hash: string; attempts: number }>(
    `select id, code_hash, attempts from login_codes where address = $1 and used_at is null and expires_at > now() order by created_at desc limit 1`, [address]);
  if (!row) return { ok: false, error: "That code has expired. Ask for a new one." };
  // Count the try before comparing, in one statement, so parallel guesses can't get more than five.
  const tried = await one<{ code_hash: string }>(`update login_codes set attempts = attempts + 1 where id = $1 and attempts < 5 returning code_hash`, [row.id]);
  if (!tried) return { ok: false, error: "Too many wrong tries. Ask for a new code." };
  if (!safeEqual(tried.code_hash, sha(`${address}:${code.replace(/\D/g, "")}`))) return { ok: false, error: "That code isn't right. Check it and try again." };
  // A code signs in once, even if it's sent twice at the same moment.
  if (!(await one(`update login_codes set used_at = now() where id = $1 and used_at is null returning id`, [row.id]))) return { ok: false, error: "That code has expired. Ask for a new one." };
  const isEmail = address.includes("@");
  const m = await one<{ id: number; status: string }>(isEmail ? `select id, status from members where lower(email) = $1` : `select id, status from members where phone = $1`, [address]);
  if (m?.status === "banned") return { ok: false, error: "This account has been removed from the community." };
  if (m?.status === "suspended") return { ok: false, error: "This account is paused. Please contact Special Minds." };
  if (m) return { ok: true, memberId: m.id, isNew: false };
  const created = await one<{ id: number }>(`insert into members (email, phone, full_name, status, locale) values ($1, $2, '', 'pending', 'en') returning id`,
    [isEmail ? address : null, isEmail ? null : address]);
  return { ok: true, memberId: created!.id, isNew: true };
}

// --------------------------------------------------------------------- demo ----

/** Demo accounts only exist on demo data (seeded with @demo.local emails). */
export const demoLoginsEnabled = () => process.env.DEMO_LOGINS === "1";
export const DEMO_DOMAIN = "@demo.local";
