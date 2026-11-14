import "server-only";
import { after } from "next/server";
import { outsideTransaction, query, type Tx } from "./db";
import { clockNow, hhmm, inWindow } from "./format";
import { makeT, type Locale, type T } from "./i18n";
import { tzFor } from "./options";
import { pushReady, sendPushes, type Push } from "./push";

/**
 * Notifications: a line in the person's bell, and a pop-up on each device
 * where they turned pop-ups on (the same system as the CRM and Hamd
 * Projects). Nobody is told about what they did themselves. Pop-ups go out
 * once the change is saved; quiet hours hold them back (they stay in the
 * bell), except urgent broadcasts. Important ones still unread after a few
 * hours are emailed (lib/jobs.ts).
 *
 * Kinds: mention, reply, post, dm, opportunity, shortlisted, filled, event,
 * reminder, broadcast, joined, declined, queue, report, help, request.
 */

type Run = Pick<Tx, "query">;
/** Title and body can be written per language: each person gets theirs. */
type Words = string | ((t: T, locale: Locale) => string);
export type NoteIn = {
  kind: string; title: Words; body?: string | null | ((t: T, locale: Locale) => string | null); link?: string | null; actorId?: number | null; postId?: number | null;
  important?: boolean; urgent?: boolean;
};

export async function notify(tx: Run | null, memberIds: (number | null | undefined)[], n: NoteIn): Promise<number> {
  const ids = [...new Set(memberIds.filter((u): u is number => typeof u === "number" && u > 0))].filter((u) => u !== n.actorId);
  if (!ids.length) return 0;
  const run = tx ? tx.query.bind(tx) : query;
  const people = await run(`select id, locale from members where id = any($1::bigint[]) and status = 'active'`, [ids]) as { id: number; locale: Locale }[];
  for (const locale of ["en", "ar"] as Locale[]) {
    const group = people.filter((p) => (p.locale === "ar" ? "ar" : "en") === locale).map((p) => p.id);
    if (!group.length) continue;
    const t = makeT(locale);
    const title = typeof n.title === "function" ? n.title(t, locale) : n.title;
    const body = typeof n.body === "function" ? n.body(t, locale) : n.body ?? null;
    await run(
      `insert into notifications (member_id, kind, title, body, link, actor_id, post_id, important, urgent)
       select u, $2, $3, $4, $5, $6, $7, $8, $9 from unnest($1::bigint[]) as u`,
      [group, n.kind, title.slice(0, 200), body?.slice(0, 400) ?? null, n.link ?? null, n.actorId ?? null, n.postId ?? null, Boolean(n.important), Boolean(n.urgent)]);
  }
  pushSoon();
  return people.length;
}

/** Staff who look after a space (its moderators, and every admin and the owner). */
export async function spaceStaff(spaceId: number | null): Promise<number[]> {
  const rows = await query<{ id: number }>(
    `select id from members where status = 'active' and (staff_role in ('owner', 'admin')
       or (staff_role = 'moderator' and ($1::int is null or exists (select 1 from space_members sm where sm.member_id = members.id and sm.space_id = $1))))`,
    [spaceId]);
  return rows.map((r) => r.id);
}

export function pushSoon() {
  try { after(() => outsideTransaction(flushPushes).catch((e) => console.error("Pop-ups not sent:", e))); } catch { /* not in a request: the next check sends them */ }
}

type Quiet = { on?: boolean; from?: string; to?: string };
function inQuietHours(q: Quiet | undefined, country: string | null) {
  if (!q?.on) return false;
  const from = hhmm(q.from), to = hhmm(q.to);
  if (from === null || to === null) return false;
  return inWindow(clockNow(tzFor(country)).minutes, from, to);
}

/** Sends pop-ups for notifications not yet sent (each claimed once, so two servers never send it twice). */
export async function flushPushes(): Promise<number> {
  if (!pushReady()) {
    await query(`update notifications set pushed_at = now() where pushed_at is null`);
    return 0;
  }
  await query(`update notifications set pushed_at = now() where pushed_at is null and created_at < now() - interval '30 minutes'`);
  const due = await query<{ id: number; member_id: number; title: string; body: string | null; urgent: boolean; quiet: Quiet | null; country: string | null }>(
    `with c as (select id from notifications where pushed_at is null order by created_at limit 200 for update skip locked)
     update notifications n set pushed_at = now() from c, members m where n.id = c.id and m.id = n.member_id
     returning n.id, n.member_id, n.title, n.body, n.urgent, m.prefs->'quiet' as quiet, m.country`);
  const loud = due.filter((d) => d.urgent || !inQuietHours(d.quiet ?? undefined, d.country));
  if (!loud.length) return 0;
  const subs = await query<{ id: number; member_id: number; endpoint: string; p256dh: string; auth: string }>(
    `select id, member_id, endpoint, p256dh, auth from push_subscriptions where member_id = any($1::bigint[])`, [[...new Set(loud.map((d) => d.member_id))]]);
  const list: Push[] = loud.flatMap((d) => subs.filter((s) => s.member_id === d.member_id).map((s) => ({
    subscription_id: String(s.id), endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, title: d.title, body: d.body, link: `/n/${d.id}`, tag: `smm-${d.id}`,
  })));
  const r = await sendPushes(list);
  if (r.sent.length) await query(`update push_subscriptions set last_sent_at = now() where id = any($1::bigint[])`, [r.sent.map(Number)]);
  if (r.gone.length) await query(`delete from push_subscriptions where id = any($1::bigint[])`, [r.gone.map(Number)]);
  return r.sent.length;
}
