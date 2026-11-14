import "server-only";
import { one, query } from "./db";
import type { Me } from "./auth";
import { audit } from "./audit";
import { notify } from "./notify";
import { sendEmail, sendWhatsApp } from "./outbox";
import { snippet } from "./text";

/**
 * Broadcasts: one message to a chosen group ("all Arabic-speaking shadow
 * teachers in Dubai"), in the bell and as a pop-up, and by email and
 * WhatsApp when chosen. "Seen by" counts who opened it.
 */

export type Segment = { spaces?: number[]; kinds?: string[]; cities?: string[]; roles?: string[]; languages?: string[]; openToWork?: boolean };
export type Via = { email?: boolean; whatsapp?: boolean };

export async function segmentMembers(seg: Segment): Promise<{ id: number; email: string | null; phone: string | null; locale: string; prefs: Record<string, unknown> }[]> {
  return query(
    `select m.id, m.email, m.phone, m.locale, m.prefs from members m
      where m.status = 'active'
        and (cardinality($1::int[]) = 0 or exists (select 1 from space_members sm where sm.member_id = m.id and sm.space_id = any($1::int[])))
        and (cardinality($2::text[]) = 0 or m.kind = any($2::text[]))
        and (cardinality($3::text[]) = 0 or m.city = any($3::text[]))
        and (cardinality($4::text[]) = 0 or m.roles && $4::text[])
        and (cardinality($5::text[]) = 0 or m.languages && $5::text[])
        and (not $6::boolean or m.open_to_work)`,
    [seg.spaces ?? [], seg.kinds ?? [], seg.cities ?? [], seg.roles ?? [], seg.languages ?? [], Boolean(seg.openToWork)]);
}

export async function countSegment(seg: Segment) {
  return (await segmentMembers(seg)).length;
}

export async function sendBroadcast(id: number): Promise<number> {
  const b = await one<{ id: number; author_id: number | null; title: string; body: string; segment: Segment; via: Via; urgent: boolean; sent_at: string | null }>(
    `update broadcasts set sent_at = now() where id = $1 and sent_at is null returning id, author_id, title, body, segment, via, urgent, sent_at`, [id]);
  if (!b) return 0;
  const people = await segmentMembers(b.segment);
  if (!people.length) return 0;
  await query(`insert into broadcast_recipients (broadcast_id, member_id) select $1, x from unnest($2::bigint[]) x on conflict do nothing`, [id, people.map((p) => p.id)]);
  await query(`update broadcasts set recipients = $2 where id = $1`, [id, people.length]);
  await notify(null, people.map((p) => p.id), { kind: "broadcast", title: b.title, body: snippet(b.body, {}, 200), link: `/b/${id}`, important: true, urgent: b.urgent, actorId: null });
  const app = process.env.APP_URL ?? "";
  if (b.via.email) {
    for (const p of people) {
      if (!p.email || p.prefs?.emailImportant === false) continue;
      await sendEmail({ to: p.email, subject: b.title, text: `${b.body}\n\n${app}/b/${id}`, purpose: "broadcast", memberId: p.id });
    }
  }
  if (b.via.whatsapp) {
    for (const p of people) {
      if (!p.phone || p.prefs?.whatsapp !== true) continue;
      await sendWhatsApp({ to: p.phone, text: `${b.title}\n${snippet(b.body, {}, 300)}\n${app}/b/${id}`, template: "broadcast", params: [b.title, snippet(b.body, {}, 300), `${app}/b/${id}`], purpose: "broadcast", memberId: p.id, lang: p.locale === "ar" ? "ar" : "en" });
    }
  }
  return people.length;
}

export async function createBroadcast(me: Me, b: { title: string; body: string; segment: Segment; via: Via; urgent: boolean; scheduledFor: string | null; postId: number | null }) {
  const row = await one<{ id: number }>(
    `insert into broadcasts (author_id, title, body, segment, via, urgent, scheduled_for, post_id) values ($1, $2, $3, $4::text::jsonb, $5::text::jsonb, $6, $7, $8) returning id`,
    [me.id, b.title, b.body, JSON.stringify(b.segment), JSON.stringify(b.via), b.urgent, b.scheduledFor, b.postId]);
  await audit(me, "broadcast.create", `broadcast:${row!.id}`, { title: b.title, scheduled: b.scheduledFor });
  if (!b.scheduledFor) await sendBroadcast(row!.id);
  return row!.id;
}
