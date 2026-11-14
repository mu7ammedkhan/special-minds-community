"use server";

import { requireMe } from "@/lib/auth";
import { channelById, ensureJoined } from "@/lib/access";
import { audit } from "@/lib/audit";
import { one, query } from "@/lib/db";
import { makeT } from "@/lib/i18n";
import { defaultNotify } from "@/lib/options";
import { respond, sendShortlistToTalent, setFilled, setStage } from "@/lib/opportunities";
import {
  createPost, editPost, markRead, postAccess, recordViews, removePost, reportPost, setBestAnswer, setLocked, setPinned, toggleReaction, votePoll,
  type CreateResult, type NewPost,
} from "@/lib/posts";
import type { PostView } from "@/lib/types";

/**
 * Everything people do to posts from the browser. Each one checks who is
 * asking and what they may do (lib/access.ts) before touching anything.
 */

const tFor = async () => { const me = await requireMe(); return { me, t: makeT(me.locale) }; };

export async function sendPost(input: NewPost): Promise<CreateResult> {
  const { me, t } = await tFor();
  return createPost(me, input, t);
}

export async function editPostAction(id: number, body: string, title: string | null): Promise<{ ok: true; post: PostView } | { ok: false; error: string }> {
  const { me, t } = await tFor();
  return editPost(me, Number(id), String(body ?? ""), title ? String(title) : null, t);
}

export async function removePostAction(id: number, reason: string | null) {
  const { me, t } = await tFor();
  return removePost(me, Number(id), reason ? String(reason).slice(0, 300) : null, t);
}

export async function reactAction(id: number, emoji: string) {
  const { me } = await tFor();
  return toggleReaction(me, Number(id), String(emoji));
}

export async function voteAction(id: number, options: number[]) {
  const { me } = await tFor();
  return votePoll(me, Number(id), (options ?? []).map(Number));
}

export async function pinAction(id: number, on: boolean) { const { me } = await tFor(); return setPinned(me, Number(id), Boolean(on)); }
export async function lockAction(id: number, on: boolean) { const { me } = await tFor(); return setLocked(me, Number(id), Boolean(on)); }
export async function bestAnswerAction(topicId: number, replyId: number | null) { const { me } = await tFor(); return setBestAnswer(me, Number(topicId), replyId ? Number(replyId) : null); }

export async function reportAction(id: number, reason: string, note: string | null) {
  const { me } = await tFor();
  return reportPost(me, Number(id), String(reason), note ? String(note) : null);
}

export async function seenAction(ids: number[]) {
  const { me } = await tFor();
  await recordViews(me, ids ?? []);
}

export async function readAction(scope: { channelId?: number; dmId?: number }) {
  const { me } = await tFor();
  await markRead(me, { channelId: scope.channelId ? Number(scope.channelId) : undefined, dmId: scope.dmId ? Number(scope.dmId) : undefined });
}

export async function respondAction(postId: number, answer: "interested" | "not_for_me", note: string | null) {
  const { me, t } = await tFor();
  if (answer !== "interested" && answer !== "not_for_me") return { ok: false, error: "?" };
  return respond(me, Number(postId), answer, note ? String(note) : null, t);
}

export async function rsvpAction(postId: number, answer: "going" | "maybe" | "no" | null): Promise<{ ok: boolean; error?: string }> {
  const { me, t } = await tFor();
  const x = await postAccess(me, Number(postId));
  if (!x || x.p.kind !== "event" || x.p.status !== "published" || !x.a) return { ok: false, error: t("That event isn't there any more.") };
  if (!x.a.perms.react) return { ok: false, error: t("You can read this channel but not post in it.") };
  if (answer === null) { await query(`delete from rsvps where post_id = $1 and member_id = $2`, [postId, me.id]); return { ok: true }; }
  if (!["going", "maybe", "no"].includes(answer)) return { ok: false };
  if (answer === "going") {
    const cap = await one<{ capacity: number | null; going: number }>(
      `select (data->>'capacity')::int as capacity, (select count(*) from rsvps where post_id = $1 and answer = 'going' and member_id <> $2)::int as going from posts where id = $1`, [postId, me.id]);
    if (cap?.capacity && cap.going >= cap.capacity) return { ok: false, error: t("This event is full.") };
  }
  await ensureJoined(me, x.a);
  await query(`insert into rsvps (post_id, member_id, answer) values ($1, $2, $3) on conflict (post_id, member_id) do update set answer = excluded.answer`, [postId, me.id, answer]);
  await recordViews(me, [Number(postId)]);
  return { ok: true };
}

export async function stageAction(postId: number, memberId: number, stage: "new" | "shortlisted" | "declined") {
  const { me } = await tFor();
  return setStage(me, Number(postId), Number(memberId), stage);
}

export async function fillAction(postId: number, filled: boolean) {
  const { me } = await tFor();
  return setFilled(me, Number(postId), Boolean(filled));
}

export async function talentAction(postId: number) {
  const { me } = await tFor();
  return sendShortlistToTalent(me, Number(postId));
}

export async function joinChannelAction(channelId: number) {
  const { me } = await tFor();
  const a = await channelById(me, Number(channelId));
  if (!a) return false;
  await ensureJoined(me, a);
  return true;
}

export async function leaveChannelAction(channelId: number) {
  const { me } = await tFor();
  await query(`delete from channel_members where channel_id = $1 and member_id = $2`, [channelId, me.id]);
  return true;
}

export async function notifyLevelAction(channelId: number, level: "all" | "mentions" | "off") {
  const { me } = await tFor();
  if (!["all", "mentions", "off"].includes(level)) return false;
  const a = await channelById(me, Number(channelId));
  if (!a) return false;
  await query(`insert into channel_members (channel_id, member_id, notify) values ($1, $2, $3) on conflict (channel_id, member_id) do update set notify = excluded.notify`,
    [a.ch.id, me.id, level ?? defaultNotify(a.ch.type)]);
  return true;
}

export async function approvePostAction(id: number, approve: boolean, reason: string | null) {
  const { me, t } = await tFor();
  const x = await postAccess(me, Number(id));
  if (!x?.ctx.moderate && !(x?.d && me.staff)) return { ok: false };
  if (!["pending", "held"].includes(x.p.status)) return { ok: true };
  if (!approve) return removePost(me, Number(id), reason, t);
  await query(`update posts set status = 'published', hold_reason = null, created_at = case when created_at < now() - interval '1 hour' then created_at else now() end where id = $1`, [id]);
  if (x.p.parent_id) await query(`update posts set reply_count = reply_count + 1, last_reply_at = now() where id = $1`, [x.p.parent_id]);
  await audit(me, "post.approve", `post:${id}`);
  const { fanOut } = await import("@/lib/posts");
  await fanOut(Number(id));
  return { ok: true };
}
