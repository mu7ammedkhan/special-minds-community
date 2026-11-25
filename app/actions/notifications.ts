"use server";

import { requireMe } from "@/lib/auth";
import { query } from "@/lib/db";
import { makeT } from "@/lib/i18n";
import { pushReady, sendPushes } from "@/lib/push";
import { SOUNDS } from "@/lib/sounds";

/** The bell and pop-ups: reading, devices, test, and each member's own choices. */

export async function markNotificationsRead(which: "all" | number[]) {
  const me = await requireMe();
  if (which === "all") await query(`update notifications set read_at = now() where member_id = $1 and read_at is null`, [me.id]);
  else await query(`update notifications set read_at = now() where member_id = $1 and id = any($2::bigint[]) and read_at is null`, [me.id, which.map(Number)]);
}

/** The browsers' own pop-up services (Chrome, Edge, Firefox, Safari): the server sends pop-ups to these hosts and nowhere else. */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
const knownPushService = (endpoint: string) => {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && !u.port && !u.username && PUSH_HOSTS.some((r) => r.test(u.hostname));
  } catch {
    return false;
  }
};
/** Phones and computers with pop-ups on, per member; the oldest goes when a new one is added. */
const MAX_DEVICES = 10;

export async function savePushSubscription(sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }, device: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireMe();
  const t = makeT(me.locale);
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth || !/^https:\/\//.test(sub.endpoint)) return { ok: false, error: t("This browser sent an incomplete sign-up. Try again.") };
  if (!knownPushService(sub.endpoint)) return { ok: false, error: t("This browser's pop-up service isn't supported. Try Chrome, Edge, Firefox or Safari.") };
  await query(
    `insert into push_subscriptions (member_id, endpoint, p256dh, auth, device) values ($1, $2, $3, $4, $5)
     on conflict (endpoint) do update set member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device`,
    [me.id, sub.endpoint.slice(0, 1000), sub.keys.p256dh.slice(0, 200), sub.keys.auth.slice(0, 100), String(device ?? "").slice(0, 80)]);
  await query(`delete from push_subscriptions where member_id = $1 and id not in (select id from push_subscriptions where member_id = $1 order by id desc limit $2)`, [me.id, MAX_DEVICES]);
  return { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  const me = await requireMe();
  await query(`delete from push_subscriptions where member_id = $1 and endpoint = $2`, [me.id, endpoint]);
}

export async function removePushDevice(id: number) {
  const me = await requireMe();
  await query(`delete from push_subscriptions where member_id = $1 and id = $2`, [me.id, id]);
}

export async function sendTestPush(): Promise<{ ok: true; sent: number } | { ok: false; error: string }> {
  const me = await requireMe();
  const t = makeT(me.locale);
  if (!pushReady()) return { ok: false, error: t("Pop-ups aren't set up on this server yet.") };
  const subs = await query<{ id: number; endpoint: string; p256dh: string; auth: string }>(`select id, endpoint, p256dh, auth from push_subscriptions where member_id = $1`, [me.id]);
  const r = await sendPushes(subs.map((s) => ({ subscription_id: String(s.id), endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, title: t("Test pop-up"), body: t("Pop-ups from the Special Minds Community are working."), link: "/notifications", tag: "smm-test" })));
  if (r.gone.length) await query(`delete from push_subscriptions where id = any($1::bigint[])`, [r.gone.map(Number)]);
  return { ok: true, sent: r.sent.length };
}

export async function saveNotificationPrefs(p: { sound?: string; emailImportant?: boolean; digest?: "off" | "daily" | "weekly"; whatsapp?: boolean; quiet?: { on: boolean; from: string; to: string } }) {
  const me = await requireMe();
  if (p.sound && SOUNDS.some((s) => s.value === p.sound)) await query(`update members set notify_sound = $2 where id = $1`, [me.id, p.sound]);
  const patch: Record<string, unknown> = {};
  if (typeof p.emailImportant === "boolean") patch.emailImportant = p.emailImportant;
  if (p.digest && ["off", "daily", "weekly"].includes(p.digest)) patch.digest = p.digest;
  if (typeof p.whatsapp === "boolean") patch.whatsapp = p.whatsapp;
  if (p.quiet && /^\d{2}:\d{2}$/.test(p.quiet.from) && /^\d{2}:\d{2}$/.test(p.quiet.to)) patch.quiet = { on: Boolean(p.quiet.on), from: p.quiet.from, to: p.quiet.to };
  if (Object.keys(patch).length) await query(`update members set prefs = prefs || $2::text::jsonb where id = $1`, [me.id, JSON.stringify(patch)]);
}
