"use server";

import { redirect } from "next/navigation";
import { isAdmin, requireMe } from "@/lib/auth";
import { dmRule } from "@/lib/access";
import { audit } from "@/lib/audit";
import { one, query, transaction } from "@/lib/db";
import { makeT } from "@/lib/i18n";
import { notify, spaceStaff } from "@/lib/notify";
import { createPost, fanOut } from "@/lib/posts";
import { getSettings } from "@/lib/settings";
import { snippet } from "@/lib/text";

/**
 * Starting a private conversation (one person, or a small group of up to 8).
 * Admin → Settings decides whether parents and specialists may message each
 * other: never, only after an admin approves, or freely. Staff can message anyone.
 */
export async function startDm(ids: number[], body: string): Promise<{ ok: boolean; error?: string; id?: number }> {
  const me = await requireMe();
  const t = makeT(me.locale);
  if (me.mutedUntil) return { ok: false, error: t("You can read but not post until {when}.", { when: new Date(me.mutedUntil).toLocaleString() }) };
  const want = [...new Set((ids ?? []).map(Number).filter((n) => n > 0 && n !== me.id))].slice(0, 7);
  if (!want.length) return { ok: false, error: t("Choose who to message.") };
  const text = String(body ?? "").trim().slice(0, 4000);
  const s = await getSettings();
  const others = await query<{ id: number; kind: "specialist" | "parent" | "team" | "guest"; staff: "owner" | "admin" | "moderator" | null; shared: boolean }>(
    `select m.id, m.kind, m.staff_role as staff,
            exists (select 1 from space_members a join space_members b on a.space_id = b.space_id where a.member_id = $2 and b.member_id = m.id) as shared
       from members m where m.id = any($1::bigint[]) and m.status = 'active'`, [want, me.id]);
  if (others.length !== want.length) return { ok: false, error: t("One of those people isn't in the community any more.") };
  if (!me.staff && !isAdmin(me) && others.some((o) => !o.shared && !o.staff)) return { ok: false, error: t("You can only message people in your spaces.") };
  const rules = others.map((o) => dmRule(s, me, o));
  if (rules.includes("off")) return { ok: false, error: t("Private messages between parents and specialists are switched off. Ask in a channel, or contact Special Minds.") };
  const pending = rules.includes("approval");
  if (pending && !text) return { ok: false, error: t("Write your first message: a Special Minds admin reads it before approving the conversation.") };
  if (want.length === 1) {
    const existing = await one<{ id: number; status: string }>(
      `select d.id, d.status from dms d where not d.is_group and d.status <> 'declined'
          and exists (select 1 from dm_members x where x.dm_id = d.id and x.member_id = $1)
          and exists (select 1 from dm_members x where x.dm_id = d.id and x.member_id = $2)
          and (select count(*) from dm_members x where x.dm_id = d.id) = 2 limit 1`, [me.id, want[0]]);
    if (existing) {
      if (text && existing.status === "active") await createPost(me, { dmId: existing.id, body: text }, t);
      return { ok: true, id: existing.id };
    }
  }
  const id = await transaction(async (tx) => {
    const d = await tx.one<{ id: number }>(`insert into dms (is_group, status, created_by, last_post_at) values ($1, $2, $3, now()) returning id`, [want.length > 1, pending ? "pending" : "active", me.id]);
    for (const m of [me.id, ...want]) await tx.query(`insert into dm_members (dm_id, member_id) values ($1, $2)`, [d!.id, m]);
    if (pending) await tx.query(`insert into posts (dm_id, author_id, body, status, hold_reason) values ($1, $2, $3, 'pending', 'dm_request')`, [d!.id, me.id, text]);
    return Number(d!.id);
  });
  if (pending) {
    await notify(null, await spaceStaff(null), { kind: "queue", title: (tt) => tt("{name} asked to message a parent or specialist", { name: me.fullName }), body: snippet(text), link: "/admin/moderation?tab=dms", actorId: me.id });
  } else if (text) await createPost(me, { dmId: id, body: text }, t);
  return { ok: true, id };
}

/** Admin: approve or decline a message request between a parent and a specialist. */
export async function decideDm(id: number, approve: boolean) {
  const me = await requireMe();
  if (!me.staff) redirect("/");
  const d = await one<{ created_by: number; status: string }>(`select created_by, status from dms where id = $1`, [id]);
  if (!d || d.status !== "pending") return;
  await query(`update dms set status = $2, decided_by = $3 where id = $1`, [id, approve ? "active" : "declined", me.id]);
  const posts = await query<{ id: number }>(`update posts set status = $2, hold_reason = null where dm_id = $1 and status = 'pending' and hold_reason = 'dm_request' returning id`, [id, approve ? "published" : "removed"]);
  if (approve) for (const p of posts) await fanOut(Number(p.id));
  await notify(null, [d.created_by], { kind: approve ? "joined" : "declined", title: (t) => (approve ? t("Your message request was approved") : t("Your message request wasn't approved")), link: approve ? `/dm/${id}` : "/dm", actorId: me.id });
  await audit(me, approve ? "dm.approve" : "dm.decline", `dm:${id}`);
}

export async function muteDm(id: number, muted: boolean) {
  const me = await requireMe();
  await query(`update dm_members set muted = $3 where dm_id = $1 and member_id = $2`, [id, me.id, muted]);
}
