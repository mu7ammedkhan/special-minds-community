"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  countMfaTry, demoLoginsEnabled, DEMO_DOMAIN, endSession, getPendingMe, hashToken, LINK_TOKEN, markMfaOk, MFA_TRIES, readAddress, safeNext, sendLoginCode, startSession, verifyLoginCode,
} from "@/lib/auth";
import { audit } from "@/lib/audit";
import { one, query } from "@/lib/db";
import { maskContact } from "@/lib/format";
import { isLocale, makeT } from "@/lib/i18n";
import { getLocale, LOCALE_COOKIE } from "@/lib/i18n/server";
import { getSettings } from "@/lib/settings";
import { totpStep } from "@/lib/totp";

export type CodeState = { step: "address" | "code"; address?: string; channel?: "email" | "whatsapp"; preview?: string; error?: string; shown?: string };

export async function askCode(_prev: CodeState, fd: FormData): Promise<CodeState> {
  const locale = await getLocale();
  const t = makeT(locale);
  const raw = String(fd.get("address") ?? "");
  const addr = readAddress(raw, (await getSettings()).defaultCountry);
  if (!addr) return { step: "address", error: t("Enter your email, or your mobile number with its country code (like +971 50 123 4567).") };
  const r = await sendLoginCode(addr, locale);
  if (!r.ok) return { step: "address", error: t(r.error) };
  return { step: "code", address: addr.address, channel: addr.channel, preview: r.preview, shown: raw };
}

export async function checkCode(prev: CodeState, fd: FormData): Promise<CodeState> {
  const t = makeT(await getLocale());
  const address = String(fd.get("address") ?? "");
  const code = String(fd.get("code") ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { ...prev, step: "code", error: t("Enter the 6 numbers from the message.") };
  const r = await verifyLoginCode(address, code);
  if (!r.ok) return { ...prev, step: "code", error: t(r.error) };
  await startSession(r.memberId, false);
  const m = await one<{ full_name: string; totp_on: boolean; status: string }>(`select full_name, totp_on, status from members where id = $1`, [r.memberId]);
  // New members have no name yet: the log shows their address half hidden (moderators read it on the admin overview).
  await audit({ id: r.memberId, fullName: m?.full_name || maskContact(address) }, "signin", `member:${r.memberId}`, { via: address.includes("@") ? "email" : "phone", new: r.isNew });
  if (m?.totp_on) redirect(`/mfa?next=${encodeURIComponent(safeNext(fd.get("next")))}`);
  redirect(safeNext(fd.get("next")));
}

export async function demoSignIn(fd: FormData) {
  if (!demoLoginsEnabled()) redirect("/login");
  const id = Number(fd.get("id"));
  const m = await one<{ id: number; email: string; full_name: string; status: string }>(`select id, email, full_name, status from members where id = $1`, [id]);
  if (!m || !m.email?.endsWith(DEMO_DOMAIN) || !["active", "pending"].includes(m.status)) redirect("/login");
  await startSession(m.id, true);
  await audit({ id: m.id, fullName: m.full_name }, "signin", `member:${m.id}`, { via: "demo" });
  redirect(safeNext(fd.get("next")));
}

export async function signOut() {
  await endSession();
  redirect("/login");
}

export async function setLanguage(fd: FormData) {
  const l = String(fd.get("locale"));
  if (!isLocale(l)) return;
  (await cookies()).set(LOCALE_COOKIE, l, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  const me = await getPendingMe();
  if (me) await query(`update members set locale = $2 where id = $1`, [me.id, l]);
  redirect(safeNext(fd.get("back")));
}

export async function verifyMfa(_prev: { error?: string }, fd: FormData): Promise<{ error?: string }> {
  const t = makeT(await getLocale());
  const me = await getPendingMe();
  if (!me) redirect("/login");
  if (!me.totpOn || me.mfaOk) redirect(safeNext(fd.get("next")));
  // Five tries per session, then sign in again from the start (which needs a new email or WhatsApp code).
  if ((await countMfaTry()) > MFA_TRIES) {
    await audit({ id: me.id, fullName: me.fullName }, "signin.mfa_locked", `member:${me.id}`);
    await endSession();
    redirect("/login?mfa=locked");
  }
  const row = await one<{ totp_secret: string | null }>(`select totp_secret from members where id = $1`, [me.id]);
  const step = row?.totp_secret ? totpStep(row.totp_secret, String(fd.get("code") ?? "")) : null;
  // Each code works once: the step is claimed only if it's newer than the last one used.
  const fresh = step !== null && (await one(`update members set totp_last_step = $2 where id = $1 and (totp_last_step is null or totp_last_step < $2) returning id`, [me.id, step]));
  if (!fresh) return { error: t("That code isn't right. Use the newest code in your authenticator app.") };
  await markMfaOk();
  redirect(safeNext(fd.get("next")));
}

/** Continue on a one-time sign-in link page: the link is used here, once, and never again. */
export async function signInWithLink(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  if (!LINK_TOKEN.test(token)) redirect("/login?link=bad");
  const row = await one<{ member_id: number }>(
    `update login_links set used_at = now() where id = $1 and used_at is null and expires_at > now() returning member_id`, [hashToken(token)]);
  if (!row) redirect("/login?link=used");
  const m = await one<{ id: number; full_name: string; status: string; totp_on: boolean }>(`select id, full_name, status, totp_on from members where id = $1`, [row.member_id]);
  if (!m || !["active", "pending"].includes(m.status)) redirect("/login?link=bad");
  await startSession(Number(m.id), false);
  await audit({ id: Number(m.id), fullName: m.full_name }, "signin", `member:${m.id}`, { via: "one-time link" });
  redirect(m.totp_on ? "/mfa" : "/");
}
