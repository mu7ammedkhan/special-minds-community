import "server-only";
import { createHmac } from "node:crypto";
import { one, query } from "./db";
import type { Me } from "./auth";
import { audit } from "./audit";
import { channelById, ensureJoined } from "./access";
import type { T } from "./i18n";
import { notify } from "./notify";
import { roleLabel } from "./options";
import { recordViews } from "./posts";
import type { OppData } from "./types";

/**
 * Opportunities: a job posted once, an alert to the specialists who match it,
 * "I'm interested" with a note, a shortlist, and "This one is filled" for
 * everyone else. Who is interested is visible to admins only unless Settings
 * say otherwise. The shortlist can go on to the Talent portal (TALENT_SHORTLIST_URL).
 */

type OppRow = { id: number; channel_id: number; author_id: number; title: string | null; data: OppData; status: string; space_id: number; visibility: string; ch_slug: string; space_slug: string };

async function oppRow(id: number): Promise<OppRow | null> {
  return one<OppRow>(
    `select p.id, p.channel_id, p.author_id, p.title, p.data, p.status, c.space_id, c.visibility, c.slug as ch_slug, s.slug as space_slug
       from posts p join channels c on c.id = p.channel_id join spaces s on s.id = c.space_id where p.id = $1 and p.kind = 'opportunity'`, [id]);
}

export const oppTitle = (d: Partial<OppData>, t?: T) => {
  const role = roleLabel(d.role ?? "");
  const where = [d.area, d.city].filter(Boolean).join(", ");
  return t ? (where ? t("{role} · {where}", { role: t(role), where }) : t(role)) : where ? `${role} · ${where}` : role;
};

/** Specialists in the space whose role, city, languages and gender fit. */
export async function matchingSpecialists(o: Pick<OppRow, "space_id" | "visibility" | "channel_id">, d: OppData): Promise<number[]> {
  const rows = await query<{ id: number }>(
    `select m.id from members m join space_members sm on sm.member_id = m.id and sm.space_id = $1
      where m.status = 'active' and m.kind = 'specialist'
        and ($2 = '' or $2 = any(m.roles))
        and ($3 = '' or m.city = $3)
        and (cardinality($4::text[]) = 0 or m.languages && $4::text[])
        and ($5 = 'any' or m.gender = $5)
        and ($6 = 'open' or exists (select 1 from channel_members cm where cm.channel_id = $7 and cm.member_id = m.id))`,
    [o.space_id, d.role ?? "", d.city === "any" ? "" : d.city ?? "", d.languages ?? [], d.gender ?? "any", o.visibility, o.channel_id]);
  return rows.map((r) => Number(r.id));
}

/** After an opportunity is published: remember who matched and tell them. */
export async function alertMatches(postId: number): Promise<number> {
  const o = await oppRow(postId);
  if (!o || o.status !== "published") return 0;
  const ids = await matchingSpecialists(o, o.data);
  if (!ids.length) return 0;
  await query(`insert into opportunity_targets (post_id, member_id) select $1, x from unnest($2::bigint[]) x on conflict do nothing`, [postId, ids]);
  await notify(null, ids, {
    kind: "opportunity", important: true, actorId: Number(o.author_id), postId,
    title: (t) => t("New opportunity: {title}", { title: o.title || oppTitle(o.data, t) }),
    body: (t) => [o.data.schedule, o.data.start ? t("Starts {date}", { date: o.data.start }) : null].filter(Boolean).join(" · ") || null,
    link: `/s/${o.space_slug}/${o.ch_slug}/${postId}`,
  });
  return ids.length;
}

export async function respond(me: Me, postId: number, answer: "interested" | "not_for_me", note: string | null, t: T): Promise<{ ok: boolean; error?: string }> {
  const o = await oppRow(postId);
  if (!o || o.status !== "published") return { ok: false, error: t("That opportunity isn't there any more.") };
  const a = await channelById(me, o.channel_id);
  if (!a) return { ok: false, error: t("You can't see this opportunity.") };
  if (me.kind !== "specialist") return { ok: false, error: t("Only specialists can answer opportunities.") };
  if (o.data.status === "filled") return { ok: false, error: t("This one is filled.") };
  if (me.mutedUntil) return { ok: false, error: t("You can read but not post until {when}.", { when: new Date(me.mutedUntil).toLocaleString() }) };
  await ensureJoined(me, a);
  const before = await one<{ answer: string }>(`select answer from responses where post_id = $1 and member_id = $2`, [postId, me.id]);
  await query(
    `insert into responses (post_id, member_id, answer, note) values ($1, $2, $3, $4)
     on conflict (post_id, member_id) do update set answer = excluded.answer, note = excluded.note, updated_at = now()`,
    [postId, me.id, answer, note?.trim().slice(0, 500) || null]);
  await recordViews(me, [postId]);
  if (answer === "interested" && before?.answer !== "interested") {
    await notify(null, [Number(o.author_id)], {
      kind: "interest", actorId: me.id, postId, link: `/s/${o.space_slug}/${o.ch_slug}/${postId}`,
      title: (tt) => tt("{name} is interested in {title}", { name: me.fullName, title: o.title || oppTitle(o.data, tt) }), body: note?.trim() || null,
    });
  }
  return { ok: true };
}

export type PanelRow = {
  member_id: number; answer: "interested" | "not_for_me"; note: string | null; stage: "new" | "shortlisted" | "declined"; created_at: string; updated_at: string;
  talent_sent_at: string | null; talent_error: string | null; full_name: string; avatar_file_id: number | null; verified_title: string | null; roles: string[];
  city: string | null; languages: string[]; gender: string | null; open_to_work: boolean; available_from: string | null; availability_note: string | null;
  talent_ref: string | null; phone: string | null; email: string | null; matched: boolean; seen_at: string | null;
};

/** Everything an admin needs to pick people: answers, profiles, who has seen it. */
export async function opportunityPanel(me: Me, postId: number) {
  const o = await oppRow(postId);
  if (!o) return null;
  const a = await channelById(me, o.channel_id);
  if (!a?.moderate) return null;
  const rows = await query<PanelRow>(
    `select r.member_id, r.answer, r.note, r.stage, r.created_at, r.updated_at, r.talent_sent_at, r.talent_error,
            m.full_name, m.avatar_file_id, m.verified_title, m.roles, m.city, m.languages, m.gender, m.open_to_work, m.available_from, m.availability_note,
            m.talent_ref, m.phone, m.email,
            exists (select 1 from opportunity_targets t where t.post_id = r.post_id and t.member_id = r.member_id) as matched,
            (select seen_at from post_views v where v.post_id = r.post_id and v.member_id = r.member_id) as seen_at
       from responses r join members m on m.id = r.member_id
      where r.post_id = $1
      order by (r.answer = 'interested') desc, (r.stage = 'shortlisted') desc, r.created_at asc`, [postId]);
  const stats = await one<{ matched: number; seen: number; nudged: number }>(
    `select count(*)::int as matched,
            count(*) filter (where exists (select 1 from post_views v where v.post_id = t.post_id and v.member_id = t.member_id))::int as seen,
            count(*) filter (where t.nudged_at is not null)::int as nudged
       from opportunity_targets t where t.post_id = $1`, [postId]);
  const unseen = await query<{ id: number; name: string }>(
    `select m.id, m.full_name as name from opportunity_targets t join members m on m.id = t.member_id
      where t.post_id = $1 and not exists (select 1 from post_views v where v.post_id = t.post_id and v.member_id = t.member_id)
        and not exists (select 1 from responses r where r.post_id = t.post_id and r.member_id = t.member_id)
      order by m.full_name limit 200`, [postId]);
  return {
    rows, unseen, filled: o.data.status === "filled",
    stats: {
      matched: stats?.matched ?? 0, seen: stats?.seen ?? 0, nudged: stats?.nudged ?? 0,
      interested: rows.filter((r) => r.answer === "interested").length, notForMe: rows.filter((r) => r.answer === "not_for_me").length,
      shortlisted: rows.filter((r) => r.stage === "shortlisted").length,
    },
    talentReady: talentReady(),
  };
}

export async function setStage(me: Me, postId: number, memberId: number, stage: "new" | "shortlisted" | "declined"): Promise<boolean> {
  const o = await oppRow(postId);
  if (!o) return false;
  const a = await channelById(me, o.channel_id);
  if (!a?.moderate) return false;
  const r = await one<{ stage: string }>(`update responses set stage = $3, staged_by = $4, staged_at = now(), updated_at = now() where post_id = $1 and member_id = $2 returning stage`, [postId, memberId, stage, me.id]);
  if (!r) return false;
  if (stage === "shortlisted") {
    await notify(null, [memberId], {
      kind: "shortlisted", important: true, actorId: me.id, postId, link: `/s/${o.space_slug}/${o.ch_slug}/${postId}`,
      title: (t) => t("You're shortlisted: {title}", { title: o.title || oppTitle(o.data, t) }), body: (t) => t("Special Minds will be in touch with the next steps."),
    });
  }
  await audit(me, `opportunity.${stage}`, `post:${postId}`, { member: memberId });
  return true;
}

export async function setFilled(me: Me, postId: number, filled: boolean): Promise<boolean> {
  const o = await oppRow(postId);
  if (!o) return false;
  const a = await channelById(me, o.channel_id);
  if (!a?.moderate) return false;
  await query(`update posts set data = data || $2::text::jsonb where id = $1`, [postId, JSON.stringify(filled ? { status: "filled", filledAt: new Date().toISOString() } : { status: "open", filledAt: null })]);
  if (filled) {
    const others = await query<{ member_id: number }>(`select member_id from responses where post_id = $1 and answer = 'interested' and stage <> 'shortlisted'`, [postId]);
    await notify(null, others.map((r) => r.member_id), {
      kind: "filled", actorId: me.id, postId, link: `/s/${o.space_slug}/${o.ch_slug}/${postId}`,
      title: (t) => t("This one is filled: {title}", { title: o.title || oppTitle(o.data, t) }), body: (t) => t("Thank you for your interest. We'll alert you to the next one that fits."),
    });
  }
  await audit(me, filled ? "opportunity.filled" : "opportunity.reopened", `post:${postId}`);
  return true;
}

// ---------------------------------------------------------- Talent portal ----

export const talentReady = () => Boolean(process.env.TALENT_SHORTLIST_URL && process.env.TALENT_SHORTLIST_SECRET);
export const talentProfileUrl = (ref: string | null | undefined) =>
  ref ? `${(process.env.TALENT_URL || "https://talent.specialminds.app").replace(/\/$/, "")}/candidates?q=${encodeURIComponent(`#${ref.replace(/^#/, "")}`)}` : null;

/**
 * Sends the shortlist to the Talent portal as signed JSON:
 *   POST TALENT_SHORTLIST_URL   X-Community-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">
 *   { source: "community", opportunity: {…}, candidates: [{ talent_ref, name, email, phone, note }] }
 * The Talent portal side of this is not built yet. A laptop never calls the live portal.
 */
export async function sendShortlistToTalent(me: Me, postId: number): Promise<{ ok: boolean; sent?: number; error?: string }> {
  const o = await oppRow(postId);
  if (!o) return { ok: false, error: "Not found." };
  const a = await channelById(me, o.channel_id);
  if (!a?.moderate) return { ok: false, error: "Only staff can do this." };
  if (!talentReady()) return { ok: false, error: "The Talent portal link isn't switched on yet." };
  const url = process.env.TALENT_SHORTLIST_URL!;
  if (process.env.NODE_ENV !== "production" && /talent\.specialminds\.app/.test(url)) return { ok: false, error: "This laptop won't call the live Talent portal. Use npm run talent:mock." };
  const people = await query<{ member_id: number; full_name: string; email: string | null; phone: string | null; talent_ref: string | null; note: string | null }>(
    `select r.member_id, m.full_name, m.email, m.phone, m.talent_ref, r.note from responses r join members m on m.id = r.member_id where r.post_id = $1 and r.stage = 'shortlisted'`, [postId]);
  if (!people.length) return { ok: false, error: "Shortlist someone first." };
  const body = JSON.stringify({
    source: "community",
    opportunity: { id: postId, title: o.title || oppTitle(o.data), role: o.data.role, city: o.data.city, area: o.data.area ?? null, schedule: o.data.schedule ?? null, start: o.data.start ?? null, url: `${process.env.APP_URL ?? ""}/s/${o.space_slug}/${o.ch_slug}/${postId}` },
    candidates: people.map((p) => ({ talent_ref: p.talent_ref, name: p.full_name, email: p.email, phone: p.phone, note: p.note })),
  });
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", process.env.TALENT_SHORTLIST_SECRET!).update(`${ts}.${body}`).digest("hex");
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Community-Signature": `t=${ts},v1=${sig}` }, body, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      const error = `${res.status} ${(await res.text()).slice(0, 160)}`;
      await query(`update responses set talent_error = $2 where post_id = $1 and stage = 'shortlisted'`, [postId, error]);
      return { ok: false, error: `The Talent portal answered: ${error}` };
    }
    await query(`update responses set talent_sent_at = now(), talent_error = null where post_id = $1 and stage = 'shortlisted'`, [postId]);
    await audit(me, "opportunity.talent", `post:${postId}`, { sent: people.length });
    return { ok: true, sent: people.length };
  } catch (e) {
    return { ok: false, error: `The Talent portal couldn't be reached (${(e as Error).message}).` };
  }
}
