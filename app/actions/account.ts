"use server";

import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { countMfaTry, endAllSessions, endSession, getMe, markMfaOk, MFA_TRIES, requireMe, startSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { one, query } from "@/lib/db";
import { makeT } from "@/lib/i18n";
import { deleteAccount, saveProfile } from "@/lib/members";
import { COUNTRY, ROLES } from "@/lib/options";
import { newTotpSecret, otpauthUrl, totpStep, verifyTotp } from "@/lib/totp";
import type { ActionState } from "@/components/form";

export async function saveMyProfile(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMe();
  const t = makeT(me.locale);
  const str = (k: string, max = 120) => String(fd.get(k) ?? "").trim().slice(0, max);
  const fields: Record<string, string> = {};
  if (str("full_name").length < 2) fields.full_name = t("Write your full name.");
  if (!str("city")) fields.city = t("Choose your city.");
  const roles = fd.getAll("roles").map(String).filter((r) => ROLES.some((x) => x.value === r));
  if (me.kind === "specialist" && !roles.length) fields.roles = t("Choose at least one role.");
  if (Object.keys(fields).length) return { fields };
  await saveProfile(null, me.id, {
    fullName: str("full_name"), displayName: str("display_name") || null, kind: me.kind, city: str("city", 80), country: COUNTRY[str("country")] ? str("country") : me.country,
    languages: fd.getAll("languages").map(String).filter(Boolean).slice(0, 10), roles, skills: fd.getAll("skills").map(String).filter(Boolean).slice(0, 20),
    gender: ["female", "male"].includes(str("gender")) ? (str("gender") as "female" | "male") : null, bio: str("bio", 600) || null,
  }, { setKind: false });
  if (me.kind === "specialist") {
    await query(`update members set open_to_work = $2, available_from = $3, availability_note = $4 where id = $1`,
      [me.id, fd.get("open_to_work") === "1", /^\d{4}-\d{2}-\d{2}$/.test(str("available_from")) ? str("available_from") : null, str("availability_note", 200) || null]);
  }
  return { ok: t("Saved.") };
}

export async function setAvatar(fileId: number | null) {
  const me = await requireMe();
  if (fileId) {
    const f = await one(`select 1 from files where id = $1 and owner_id = $2 and kind = 'image'`, [fileId, me.id]);
    if (!f) return false;
  }
  await query(`update members set avatar_file_id = $2 where id = $1`, [me.id, fileId]);
  return true;
}

/** Two-step sign-in, step 1: a new secret and its QR code (not switched on until a code from the app is typed). */
export async function totpStart(): Promise<{ secret: string; qr: string } | null> {
  const me = await requireMe();
  // Only while two-step sign-in is off: a working authenticator's secret is never shown again.
  const row = await one<{ totp_secret: string }>(`update members set totp_secret = $2 where id = $1 and not totp_on returning totp_secret`, [me.id, newTotpSecret()]);
  if (!row) return null;
  const url = otpauthUrl(me.email ?? me.phone ?? me.fullName, row.totp_secret);
  return { secret: row.totp_secret, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) };
}

export async function totpConfirm(code: string): Promise<{ ok: boolean; error?: string }> {
  const me = await requireMe();
  const t = makeT(me.locale);
  const row = await one<{ totp_secret: string | null }>(`select totp_secret from members where id = $1`, [me.id]);
  if (!row?.totp_secret || !verifyTotp(row.totp_secret, code)) return { ok: false, error: t("That code isn't right. Use the newest code in your authenticator app.") };
  await query(`update members set totp_on = true where id = $1`, [me.id]);
  await markMfaOk();
  await audit(me, "2fa.on", `member:${me.id}`);
  return { ok: true };
}

export async function totpDisable(code: string): Promise<{ ok: boolean; error?: string }> {
  const me = await requireMe();
  const t = makeT(me.locale);
  // The same five tries as signing in, so a borrowed session can't guess its way to switching two-step off.
  if ((await countMfaTry()) > MFA_TRIES) {
    await audit(me, "2fa.locked", `member:${me.id}`);
    await endSession();
    redirect("/login?mfa=locked");
  }
  const row = await one<{ totp_secret: string | null }>(`select totp_secret from members where id = $1`, [me.id]);
  if (!row?.totp_secret || totpStep(row.totp_secret, code) === null) return { ok: false, error: t("That code isn't right. Use the newest code in your authenticator app.") };
  await query(`update members set totp_on = false, totp_secret = null, totp_last_step = null where id = $1`, [me.id]);
  await markMfaOk();
  await audit(me, "2fa.off", `member:${me.id}`);
  return { ok: true };
}

export async function signOutEverywhere() {
  const me = await requireMe();
  await endAllSessions(me.id);
  await startSession(me.id, true);
  await audit(me, "signout.everywhere", `member:${me.id}`);
  return true;
}

export async function deleteMyAccount(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getMe();
  if (!me) redirect("/login");
  const t = makeT(me.locale);
  if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== "DELETE" && String(fd.get("confirm") ?? "").trim() !== "حذف") return { fields: { confirm: t("Type DELETE to confirm.") } };
  if (me.staff === "owner") return { error: t("The owner's account can't be deleted. Hand ownership to someone else first.") };
  await deleteAccount(me, fd.get("remove_posts") === "1");
  redirect("/login?deleted=1");
}
