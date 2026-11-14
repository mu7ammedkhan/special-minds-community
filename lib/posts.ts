import "server-only";
import { after } from "next/server";
import { one, outsideTransaction, query, transaction } from "./db";
import type { Me } from "./auth";
import { blockText, channelById, dmById, ensureJoined, postingBlock, type Access, type DmAccess } from "./access";
import { audit } from "./audit";
import { pick, type Locale, type T } from "./i18n";
import { fetchPreview } from "./linkpreview";
import { notify, spaceStaff } from "./notify";
import { getSettings } from "./settings";
import { findContacts, firstUrl, matchWords, mentionIds, snippet } from "./text";
import type { Author, PostView } from "./types";

/**
 * Posts: every message, topic, reply, opportunity, event and library item.
 * One way in (createPost) so the checks are always the same:
 *   1. may this person post here now (permissions, mute, lock, hours, slow mode)
 *   2. blocked words stop it; listed words hold it for review
 *   3. contact details are held where the space (or a parent–specialist chat) filters them
 *   4. "new members" or "every post" approval holds it until a moderator approves
 *   5. caution words in case discussions ask "post anyway?" and flag it
 * Notifications go out once it's published (fanOut).
 */

export type Ctx = { me: Me; moderate: boolean; perms: { react: boolean; reply: boolean }; interestedVisible: boolean };

export async function ctxForChannel(me: Me, a: Access): Promise<Ctx> {
  const s = await getSettings();
  return { me, moderate: a.moderate, perms: { react: a.perms.react && !me.mutedUntil, reply: a.perms.reply && !me.mutedUntil }, interestedVisible: a.moderate || s.interested === "everyone" };
}
export const ctxForDm = (me: Me, d: DmAccess): Ctx => ({ me, moderate: false, perms: { react: d.status === "active", reply: d.status === "active" && !me.mutedUntil }, interestedVisible: false });

const POST_SQL = `
  select p.id, p.channel_id, p.dm_id, p.parent_id, p.author_id, p.kind, p.title, p.body, p.data, p.anonymous, p.status, p.hold_reason, p.flagged,
         p.publish_at, p.pinned_at, p.locked, p.edited_at, p.reply_count, p.last_reply_at, p.mentions, p.best_answer_id, p.created_at, p.updated_at,
         coalesce(nullif(a.display_name, ''), a.full_name) as a_name, a.full_name as a_full, a.kind as a_kind, a.staff_role as a_staff,
         a.avatar_file_id as a_avatar, a.verified_title as a_verified, a.status as a_status,
         (select coalesce(json_agg(json_build_object('emoji', r.emoji, 'count', r.n, 'mine', r.mine) order by r.first), '[]'::json)
            from (select emoji, count(*)::int as n, bool_or(member_id = $1::bigint) as mine, min(created_at) as first from reactions where post_id = p.id group by emoji) r) as reactions,
         (select coalesce(json_agg(json_build_object('id', f.id, 'kind', f.kind, 'name', f.name, 'mime', f.mime, 'size', f.size, 'w', f.width, 'h', f.height, 'ms', f.duration_ms) order by pf.position), '[]'::json)
            from post_files pf join files f on f.id = pf.file_id where pf.post_id = p.id) as files,
         case when p.kind = 'poll' then (select coalesce(json_agg(json_build_object('o', v.option, 'n', v.n, 'mine', v.mine)), '[]'::json)
            from (select option, count(*)::int as n, bool_or(member_id = $1::bigint) as mine from poll_votes where post_id = p.id group by option) v) end as poll_votes,
         case when p.kind = 'poll' then (select count(distinct member_id)::int from poll_votes where post_id = p.id) end as poll_voters,
         case when p.kind = 'opportunity' then (select json_build_object('answer', answer, 'stage', stage) from responses where post_id = p.id and member_id = $1::bigint) end as my_response,
         case when p.kind = 'opportunity' then (select count(*)::int from responses where post_id = p.id and answer = 'interested') end as interested,
         case when p.kind = 'opportunity' then exists (select 1 from opportunity_targets where post_id = p.id and member_id = $1::bigint) end as matched,
         case when p.kind = 'event' then (select answer from rsvps where post_id = p.id and member_id = $1::bigint) end as my_rsvp,
         case when p.kind = 'event' then (select count(*)::int from rsvps where post_id = p.id and answer = 'going') end as going,
         case when p.kind = 'event' then (select count(*)::int from rsvps where post_id = p.id and answer = 'maybe') end as maybe,
         case when $2::boolean then (select count(*)::int from post_views where post_id = p.id) end as views
    from posts p join members a on a.id = p.author_id`;

/** Published posts for everyone; held and waiting ones for their author and moderators. */
const VISIBLE = `(p.status = 'published' or (p.status in ('pending', 'held') and (p.author_id = $1::bigint or $2::boolean)))`;

type Row = {
  id: number; channel_id: number | null; dm_id: number | null; parent_id: number | null; author_id: number; kind: PostView["kind"]; title: string | null; body: string;
  data: Record<string, unknown>; anonymous: boolean; status: PostView["status"]; hold_reason: string | null; flagged: string | null; publish_at: string | null;
  pinned_at: string | null; locked: boolean; edited_at: string | null; reply_count: number; last_reply_at: string | null; mentions: number[] | null; best_answer_id: number | null;
  created_at: string; updated_at: string; a_name: string; a_full: string; a_kind: Author["kind"]; a_staff: Author["staff"]; a_avatar: number | null; a_verified: string | null; a_status: string;
  reactions: PostView["reactions"]; files: PostView["files"]; poll_votes: { o: number; n: number; mine: boolean }[] | null; poll_voters: number | null;
  my_response: { answer: "interested" | "not_for_me"; stage: string } | null; interested: number | null; matched: boolean | null;
  my_rsvp: "going" | "maybe" | "no" | null; going: number | null; maybe: number | null; views: number | null;
};

async function serialize(rows: Row[], ctx: Ctx): Promise<PostView[]> {
  const ids = [...new Set(rows.flatMap((r) => r.mentions ?? []).map(Number))];
  const names: Record<string, string> = {};
  if (ids.length) {
    for (const m of await query<{ id: number; name: string }>(`select id, coalesce(nullif(display_name, ''), full_name) as name from members where id = any($1::bigint[])`, [ids])) names[String(m.id)] = m.name;
  }
  return rows.map((r) => toView(r, ctx, names));
}

function toView(r: Row, ctx: Ctx, names: Record<string, string>): PostView {
  const mine = Number(r.author_id) === ctx.me.id;
  const author: Author = r.anonymous
    ? { id: 0, name: "", kind: r.a_kind, staff: null, avatar: null, verified: null, anonymous: true, ...(ctx.moderate || mine ? { realName: r.a_full, realId: Number(r.author_id) } : {}) }
    : { id: Number(r.author_id), name: r.a_status === "deleted" ? "" : r.a_name, kind: r.a_kind, staff: r.a_staff, avatar: r.a_status === "deleted" ? null : r.a_avatar, verified: r.a_verified };
  const data = { ...(r.data ?? {}) } as Record<string, unknown>;
  if (r.kind === "opportunity" && !ctx.moderate) delete data.pay;
  const published = r.status === "published";
  const view: PostView = {
    id: Number(r.id), channelId: r.channel_id, dmId: r.dm_id, parentId: r.parent_id ? Number(r.parent_id) : null, kind: r.kind, title: r.title, body: r.body, data,
    status: r.status, holdReason: r.hold_reason, flagged: ctx.moderate ? r.flagged : null, publishAt: r.publish_at, pinned: Boolean(r.pinned_at), locked: r.locked,
    editedAt: r.edited_at, replyCount: r.reply_count, lastReplyAt: r.last_reply_at, createdAt: r.created_at, updatedAt: r.updated_at,
    author, mine, anonymous: r.anonymous, reactions: r.reactions ?? [], files: r.files ?? [],
    mentions: Object.fromEntries((r.mentions ?? []).map((id) => [String(id), names[String(id)] ?? ""])),
    bestAnswerId: r.best_answer_id ? Number(r.best_answer_id) : null,
    can: {
      edit: mine && r.status !== "removed" && r.kind !== "system" && (r.kind !== "opportunity" || ctx.moderate),
      remove: mine || ctx.moderate,
      moderate: ctx.moderate,
      react: ctx.perms.react && published,
      reply: ctx.perms.reply && published && (!r.locked || ctx.moderate),
    },
  };
  if (r.kind === "poll") {
    const options = Array.isArray(data.options) ? (data.options as string[]) : [];
    const closesAt = typeof data.closesAt === "string" ? data.closesAt : null;
    view.poll = {
      options, counts: options.map((_, i) => r.poll_votes?.find((v) => v.o === i)?.n ?? 0), mine: (r.poll_votes ?? []).filter((v) => v.mine).map((v) => v.o),
      voters: r.poll_voters ?? 0, multi: Boolean(data.multi), closesAt, closed: Boolean(closesAt && new Date(closesAt).getTime() < Date.now()),
    };
  }
  if (r.kind === "opportunity") view.opp = { answer: r.my_response?.answer ?? null, stage: r.my_response?.stage ?? null, interested: ctx.interestedVisible ? r.interested ?? 0 : null, matched: Boolean(r.matched) };
  if (r.kind === "event") view.event = { rsvp: r.my_rsvp, going: r.going ?? 0, maybe: r.maybe ?? 0 };
  if (ctx.moderate) view.views = r.views;
  return view;
}

async function select(ctx: Ctx, where: string, params: unknown[], tail: string): Promise<PostView[]> {
  const rows = await query<Row>(`${POST_SQL} where ${where} ${tail}`, [ctx.me.id, ctx.moderate, ...params]);
  return serialize(rows, ctx);
}

// ------------------------------------------------------------------ reading ----

/** A chat, announcement or private conversation: the latest top-level messages, oldest first. */
export async function listMessages(ctx: Ctx, scope: { channelId?: number; dmId?: number }, before?: number, limit = 60): Promise<PostView[]> {
  const col = scope.channelId ? "p.channel_id" : "p.dm_id";
  const list = await select(ctx, `${col} = $3 and p.parent_id is null and ${VISIBLE} ${before ? "and p.id < $4" : ""}`,
    before ? [scope.channelId ?? scope.dmId, before] : [scope.channelId ?? scope.dmId], `order by p.created_at desc, p.id desc limit ${limit}`);
  return list.reverse();
}

export async function listReplies(ctx: Ctx, rootId: number): Promise<PostView[]> {
  return select(ctx, `p.parent_id = $3 and ${VISIBLE}`, [rootId], `order by p.created_at asc, p.id asc limit 500`);
}

export async function getPost(ctx: Ctx, id: number): Promise<PostView | null> {
  return (await select(ctx, `p.id = $3 and (${VISIBLE} or (p.status = 'scheduled' and (p.author_id = $1::bigint or $2::boolean)))`, [id], ""))[0] ?? null;
}

export async function listPinned(ctx: Ctx, channelId: number): Promise<PostView[]> {
  return select(ctx, `p.channel_id = $3 and p.pinned_at is not null and p.status = 'published'`, [channelId], `order by p.pinned_at desc limit 20`);
}

export async function listTopics(ctx: Ctx, channelId: number, filter: "all" | "unanswered" | "mine" = "all"): Promise<PostView[]> {
  const extra = filter === "unanswered" ? "and p.reply_count = 0" : filter === "mine" ? "and p.author_id = $1::bigint" : "";
  return select(ctx, `p.channel_id = $3 and p.parent_id is null and p.kind = 'topic' and ${VISIBLE} ${extra}`, [channelId],
    `order by p.pinned_at desc nulls last, coalesce(p.last_reply_at, p.created_at) desc limit 100`);
}

/** The families feed: newest first, pinned on top, each with its latest two comments. */
export async function listFeed(ctx: Ctx, channelId: number, before?: number): Promise<PostView[]> {
  const posts = await select(ctx, `p.channel_id = $3 and p.parent_id is null and ${VISIBLE} ${before ? "and p.id < $4" : ""}`,
    before ? [channelId, before] : [channelId], before ? `order by p.created_at desc limit 15` : `order by (p.pinned_at is not null) desc, p.created_at desc limit 15`);
  return attachPreviews(ctx, posts);
}

export async function attachPreviews(ctx: Ctx, posts: PostView[]): Promise<PostView[]> {
  const withReplies = posts.filter((p) => p.replyCount > 0).map((p) => p.id);
  if (!withReplies.length) return posts;
  const replies = await select(ctx,
    `p.id in (select id from (select id, row_number() over (partition by parent_id order by created_at desc) as rn from posts where parent_id = any($3::bigint[]) and status = 'published') x where rn <= 2)`,
    [withReplies], `order by p.created_at asc`);
  return posts.map((p) => ({ ...p, preview: replies.filter((r) => r.parentId === p.id) }));
}

export async function listOpportunities(ctx: Ctx, channelId: number, tab: "open" | "filled" | "mine"): Promise<PostView[]> {
  const extra = tab === "open" ? "and coalesce(p.data->>'status', 'open') = 'open'"
    : tab === "filled" ? "and p.data->>'status' = 'filled'"
    : "and exists (select 1 from responses r where r.post_id = p.id and r.member_id = $1::bigint and r.answer = 'interested')";
  return select(ctx, `p.channel_id = $3 and p.parent_id is null and p.kind = 'opportunity' and ${VISIBLE} ${extra}`, [channelId], `order by p.pinned_at desc nulls last, p.created_at desc limit 100`);
}

export async function listEvents(ctx: Ctx, channelId: number, when: "upcoming" | "past"): Promise<PostView[]> {
  const cond = when === "upcoming"
    ? "coalesce((p.data->>'endsAt')::timestamptz, (p.data->>'startsAt')::timestamptz + interval '2 hours') >= now()"
    : "coalesce((p.data->>'endsAt')::timestamptz, (p.data->>'startsAt')::timestamptz + interval '2 hours') < now()";
  return select(ctx, `p.channel_id = $3 and p.parent_id is null and p.kind = 'event' and ${VISIBLE} and ${cond}`, [channelId],
    `order by (p.data->>'startsAt')::timestamptz ${when === "upcoming" ? "asc" : "desc"} limit 100`);
}

export async function listLibrary(ctx: Ctx, channelId: number): Promise<PostView[]> {
  return select(ctx, `p.channel_id = $3 and p.parent_id is null and p.kind = 'resource' and ${VISIBLE}`, [channelId], `order by p.pinned_at desc nulls last, p.created_at desc limit 300`);
}

/**
 * What changed since the browser last asked: new posts, edits, reactions,
 * votes, answers, removals. A 10-second overlap covers saves that were still
 * finishing at the last ask; the browser keeps whichever copy is newer.
 */
export async function changesSince(ctx: Ctx, scope: { channelId?: number; dmId?: number; rootId?: number }, since: string): Promise<{ posts: PostView[]; removed: number[] }> {
  const where = scope.rootId ? "(p.parent_id = $3 or p.id = $3)" : scope.channelId ? "p.channel_id = $3 and p.parent_id is null" : "p.dm_id = $3 and p.parent_id is null";
  const key = scope.rootId ?? scope.channelId ?? scope.dmId;
  const rows = await select(ctx, `${where} and p.updated_at > $4::timestamptz - interval '10 seconds' and (${VISIBLE} or p.status = 'removed')`, [key, since], `order by p.created_at asc limit 200`);
  return { posts: rows.filter((p) => p.status !== "removed"), removed: rows.filter((p) => p.status === "removed").map((p) => p.id) };
}

// ------------------------------------------------------------------ writing ----

export type NewPost = {
  channelId?: number | null; dmId?: number | null; parentId?: number | null;
  kind?: PostView["kind"]; title?: string | null; body?: string | null; data?: Record<string, unknown>;
  fileIds?: number[]; anonymous?: boolean; publishAt?: string | null; confirmed?: boolean; noChildPhoto?: boolean;
};
export type CreateResult = { ok: true; post: PostView; note?: string } | { ok: false; error: string; confirm?: "caution" | "child_photo"; field?: string };

const KINDS_BY_TYPE: Record<string, PostView["kind"][]> = {
  chat: ["message", "poll"], announcement: ["message", "poll"], forum: ["topic"], feed: ["message", "poll"],
  opportunities: ["opportunity"], events: ["event"], library: ["resource"],
};

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Only the fields each kind may carry, trimmed. */
export function cleanData(kind: PostView["kind"], raw: Record<string, unknown>): { data: Record<string, unknown>; error?: string } {
  if (kind === "poll") {
    const options = (Array.isArray(raw.options) ? raw.options : []).map((o) => clip(o, 120)).filter(Boolean).slice(0, 10);
    if (options.length < 2) return { data: {}, error: "Give the poll at least two choices." };
    const closesAt = typeof raw.closesAt === "string" && !Number.isNaN(Date.parse(raw.closesAt)) ? new Date(raw.closesAt).toISOString() : null;
    return { data: { options, multi: Boolean(raw.multi), closesAt } };
  }
  if (kind === "opportunity") {
    const d = {
      role: clip(raw.role, 60), city: clip(raw.city, 80), area: clip(raw.area, 120), schedule: clip(raw.schedule, 200), childAge: clip(raw.childAge, 40),
      needs: clip(raw.needs, 300), languages: (Array.isArray(raw.languages) ? raw.languages : []).map((l) => clip(l, 40)).filter(Boolean).slice(0, 8),
      gender: ["female", "male"].includes(String(raw.gender)) ? raw.gender : "any", start: clip(raw.start, 40), pay: clip(raw.pay, 120), details: clip(raw.details, 2000),
      status: "open", nudge: Boolean(raw.nudge),
    };
    if (!d.role) return { data: d, error: "Choose the role." };
    if (!d.city) return { data: d, error: "Choose the city." };
    return { data: d };
  }
  if (kind === "event") {
    const startsAt = typeof raw.startsAt === "string" && !Number.isNaN(Date.parse(raw.startsAt)) ? new Date(raw.startsAt).toISOString() : null;
    if (!startsAt) return { data: {}, error: "Choose when it starts." };
    const endsAt = typeof raw.endsAt === "string" && !Number.isNaN(Date.parse(raw.endsAt)) ? new Date(raw.endsAt).toISOString() : null;
    if (endsAt && endsAt <= startsAt) return { data: {}, error: "The end has to be after the start." };
    const online = clip(raw.online, 400);
    if (online && !/^https?:\/\//i.test(online)) return { data: {}, error: "The online link should start with https://" };
    const capacity = Number(raw.capacity) > 0 ? Math.min(100000, Math.round(Number(raw.capacity))) : null;
    return { data: { startsAt, endsAt, place: clip(raw.place, 200), online, capacity } };
  }
  if (kind === "resource") {
    const url = clip(raw.url, 600);
    if (url && !/^https?:\/\//i.test(url)) return { data: {}, error: "The link should start with https://" };
    return { data: { category: clip(raw.category, 60), url } };
  }
  return { data: {} };
}

export async function createPost(me: Me, input: NewPost, t: T): Promise<CreateResult> {
  const kind = input.kind ?? "message";
  const body = (input.body ?? "").replace(/\r\n/g, "\n").trim().slice(0, 8000);
  const title = input.title?.trim().slice(0, 200) || null;
  const fileIds = [...new Set((input.fileIds ?? []).map(Number).filter((n) => n > 0))].slice(0, 10);
  if (!body && !fileIds.length && !["poll", "opportunity", "event", "resource"].includes(kind)) return { ok: false, error: t("Write something first.") };

  let parent: { id: number; parent_id: number | null; channel_id: number | null; dm_id: number | null; status: string; locked: boolean } | null = null;
  let channelId = input.channelId ?? null, dmId = input.dmId ?? null;
  if (input.parentId) {
    parent = await one(`select id, parent_id, channel_id, dm_id, status, locked from posts where id = $1`, [input.parentId]);
    if (parent?.parent_id) parent = await one(`select id, parent_id, channel_id, dm_id, status, locked from posts where id = $1`, [parent.parent_id]);
    if (!parent || parent.status !== "published") return { ok: false, error: t("That post isn't there any more.") };
    channelId = parent.channel_id; dmId = parent.dm_id;
  }
  const isReply = Boolean(parent);
  let a: Access | null = null, d: DmAccess | null = null;
  if (channelId) {
    a = await channelById(me, channelId);
    if (!a) return { ok: false, error: t("You can't post here.") };
    if (!isReply && !KINDS_BY_TYPE[a.ch.type].includes(kind)) return { ok: false, error: t("That can't be posted in this channel.") };
    if (isReply && kind !== "message") return { ok: false, error: t("That can't be posted in this channel.") };
    if ((kind === "opportunity" || a.ch.type === "library" || a.ch.type === "events") && !isReply && !a.moderate && !a.perms.post) return { ok: false, error: t("Only staff can post here.") };
    if (kind === "opportunity" && !a.moderate) return { ok: false, error: t("Only staff can post opportunities.") };
    const block = await postingBlock(me, a, isReply);
    if (block) return { ok: false, error: blockText(block, t, me.locale) };
    if (parent?.locked && !a.moderate) return { ok: false, error: t("Replies are closed on this one.") };
    if (fileIds.length && !a.perms.upload) return { ok: false, error: t("You can't add files in this channel.") };
    if (kind === "topic" && !title) return { ok: false, error: t("Give your topic a title."), field: "title" };
    if (kind === "event" && !title) return { ok: false, error: t("Give the event a title."), field: "title" };
    if (kind === "resource" && !title) return { ok: false, error: t("Give it a title."), field: "title" };
  } else if (dmId) {
    d = await dmById(me, dmId);
    if (!d) return { ok: false, error: t("You can't post here.") };
    if (d.status === "declined") return { ok: false, error: t("This conversation was declined by Special Minds.") };
    if (d.status === "pending") return { ok: false, error: t("This message request is waiting for a Special Minds admin to approve it.") };
    if (me.mutedUntil) return { ok: false, error: t("You can read but not post until {when}.", { when: new Date(me.mutedUntil).toLocaleString() }) };
    if (kind !== "message" && kind !== "poll") return { ok: false, error: t("That can't be posted in this channel.") };
  } else return { ok: false, error: t("You can't post here.") };

  const { data, error } = cleanData(kind, input.data ?? {});
  if (error) return { ok: false, error: t(error) };

  // Files: this person's own uploads, not used in another post yet.
  if (fileIds.length) {
    const files = await query<{ id: number; kind: string }>(
      `select f.id, f.kind from files f where f.id = any($1::bigint[]) and f.owner_id = $2 and not exists (select 1 from post_files pf where pf.file_id = f.id)`, [fileIds, me.id]);
    if (files.length !== fileIds.length) return { ok: false, error: t("One of the files couldn't be attached. Please add it again.") };
    const photos = files.some((f) => f.kind === "image");
    const careful = a && !a.moderate && ((a.ch.space_audience !== "specialists" && !a.ch.child_photos) || a.ch.case_talk);
    if (photos && careful && !input.noChildPhoto) return { ok: false, confirm: "child_photo", error: t("Please confirm that no child's face can be seen in these photos.") };
  }

  const staffish = Boolean(a?.moderate || me.staff);
  let status: PostView["status"] = "published";
  let hold: string | null = null, flagged: string | null = null;
  const s = await getSettings();
  if (!staffish) {
    const words = await query<{ word: string; action: "hold" | "block" | "caution" }>(`select word, action from blocked_words`);
    const text = [title, body, ...(Array.isArray(data.options) ? (data.options as string[]) : [])].filter(Boolean).join("\n");
    const hit = matchWords(text, words.filter((w) => w.action !== "caution" || a?.ch.case_talk));
    if (hit.block.length) return { ok: false, error: t("Your message has words that aren't allowed here. Please change it.") };
    if (hit.caution.length && !input.confirmed) {
      return { ok: false, confirm: "caution", error: t("Your message mentions “{words}”. In case discussions, please don't name a child, their school or their family. Post it anyway?", { words: hit.caution.join(", ") }) };
    }
    if (hit.caution.length) flagged = hit.caution.join(", ");
    if (hit.hold.length) { status = "held"; hold = "words"; }
    const filtering = (a && a.ch.space_filter_contacts) || (d && d.cross && s.filterCrossDm);
    if (status === "published" && filtering && findContacts(text).length) { status = "held"; hold = "contact_details"; }
    if (status === "published" && a && a.ch.approval !== "none") {
      if (a.ch.approval === "all") { status = "pending"; hold = "approval"; }
      else {
        const j = await one<{ days: number }>(`select extract(epoch from now() - joined_at) / 86400 as days from space_members where space_id = $1 and member_id = $2`, [a.ch.space_id, me.id]);
        if (!j || Number(j.days) < s.newMemberDays) { status = "pending"; hold = "new_member"; }
      }
    }
  }
  let publishAt: string | null = null;
  if (input.publishAt && a?.moderate && !isReply && !Number.isNaN(Date.parse(input.publishAt)) && Date.parse(input.publishAt) > Date.now() + 60_000) {
    status = "scheduled"; publishAt = new Date(input.publishAt).toISOString();
  }
  const anonymous = Boolean(input.anonymous && a?.ch.allow_anonymous && !me.staff && me.kind !== "team");

  // Mentions: only people who can see the conversation.
  const m = mentionIds(body);
  let mentions: number[] = [];
  if (m.ids.length) {
    mentions = a
      ? (await query<{ id: number }>(
          `select m.id from members m where m.id = any($1::bigint[]) and m.status = 'active'
             and (exists (select 1 from space_members sm where sm.member_id = m.id and sm.space_id = $2) or m.staff_role in ('owner', 'admin'))
             and ($3 = 'open' or exists (select 1 from channel_members cm where cm.member_id = m.id and cm.channel_id = $4))`,
          [m.ids.slice(0, 50), a.ch.space_id, a.ch.visibility, a.ch.id])).map((r) => Number(r.id))
      : m.ids.filter((id) => d!.members.some((x) => x.id === id));
  }
  const mentionAll = m.all && staffish && Boolean(a);

  const id = await transaction(async (tx) => {
    const row = await tx.one<{ id: number }>(
      `insert into posts (channel_id, dm_id, parent_id, author_id, kind, title, body, data, anonymous, status, hold_reason, flagged, publish_at, mentions, mention_all)
       values ($1, $2, $3, $4, $5, $6, $7, $8::text::jsonb, $9, $10, $11, $12, $13, $14::bigint[], $15) returning id`,
      [channelId, dmId, parent?.id ?? null, me.id, kind, title, body, JSON.stringify(data), anonymous, status, hold, flagged, publishAt, mentions, mentionAll]);
    for (const [i, f] of fileIds.entries()) await tx.query(`insert into post_files (post_id, file_id, position) values ($1, $2, $3)`, [row!.id, f, i]);
    if (parent && status === "published") await tx.query(`update posts set reply_count = reply_count + 1, last_reply_at = now() where id = $1`, [parent.id]);
    if (d) {
      await tx.query(`update dms set last_post_at = now() where id = $1`, [d.id]);
      await tx.query(`update dm_members set last_read_at = now() where dm_id = $1 and member_id = $2`, [d.id, me.id]);
    }
    return Number(row!.id);
  });
  if (a) {
    await ensureJoined(me, a);
    await query(`update channel_members set last_read_at = now() where channel_id = $1 and member_id = $2`, [a.ch.id, me.id]);
  }
  if (status === "published") later(() => fanOut(id));
  else if (status === "held" || status === "pending") later(() => tellModerators(id));
  const url = firstUrl(body);
  if (url && !fileIds.length) later(() => addPreview(id, url));

  const ctx = a ? await ctxForChannel(me, a) : ctxForDm(me, d!);
  const post = await getPost(ctx, id);
  const note = status === "held" ? t("Your message is waiting for a moderator to check it.")
    : status === "pending" ? t("Your post will appear once a moderator approves it.")
    : status === "scheduled" ? t("Scheduled. It will be posted at the time you chose.") : undefined;
  return { ok: true, post: post!, note };
}

/** Runs after the response (outside any transaction); in scripts, straight away. */
export function later(fn: () => Promise<unknown>) {
  try { after(() => outsideTransaction(fn).catch((e) => console.error("background work failed", e))); }
  catch { void fn().catch((e) => console.error("background work failed", e)); }
}

async function addPreview(id: number, url: string) {
  const p = await fetchPreview(url);
  if (p) await query(`update posts set data = data || $2::text::jsonb where id = $1`, [id, JSON.stringify({ preview: p })]);
}

type FanRow = {
  id: number; channel_id: number | null; dm_id: number | null; parent_id: number | null; author_id: number; kind: string; title: string | null; body: string; anonymous: boolean;
  status: string; mentions: number[]; mention_all: boolean; author_name: string; ch_type: string | null; ch_slug: string | null; ch_name: string | null; ch_name_ar: string | null;
  space_slug: string | null; space_id: number | null; root_author: number | null; root_title: string | null; root_kind: string | null;
};

export function postLink(p: { id: number; parent_id: number | null; dm_id: number | null; ch_type: string | null; ch_slug: string | null; space_slug: string | null }) {
  if (p.dm_id) return `/dm/${p.dm_id}`;
  const base = `/s/${p.space_slug}/${p.ch_slug}`;
  const root = p.parent_id ?? p.id;
  if (p.ch_type === "chat" || p.ch_type === "announcement") return p.parent_id ? `${base}?thread=${root}` : `${base}?post=${p.id}`;
  return `${base}/${root}`;
}

/** Who hears about a newly published post, and how. */
export async function fanOut(id: number) {
  const p = await one<FanRow>(
    `select p.id, p.channel_id, p.dm_id, p.parent_id, p.author_id, p.kind, p.title, p.body, p.anonymous, p.status, p.mentions, p.mention_all,
            coalesce(nullif(a.display_name, ''), a.full_name) as author_name, c.type as ch_type, c.slug as ch_slug, c.name as ch_name, c.name_ar as ch_name_ar,
            s.slug as space_slug, s.id as space_id, r.author_id as root_author, r.title as root_title, r.kind as root_kind
       from posts p join members a on a.id = p.author_id left join channels c on c.id = p.channel_id left join spaces s on s.id = c.space_id
       left join posts r on r.id = p.parent_id where p.id = $1`, [id]);
  if (!p || p.status !== "published") return;
  const who = (t: T) => (p.anonymous ? t("A parent") : p.author_name);
  const names = Object.fromEntries((await query<{ id: number; name: string }>(`select id, coalesce(nullif(display_name, ''), full_name) as name from members where id = any($1::bigint[])`, [p.mentions ?? []])).map((m) => [String(m.id), m.name]));
  const text = snippet(p.body, names);
  const link = postLink(p);
  const chName = (l: Locale) => pick(l, p.ch_name ?? "", p.ch_name_ar);
  const told = new Set<number>([Number(p.author_id)]);
  const send = async (ids: number[], n: Parameters<typeof notify>[2]) => {
    const fresh = ids.map(Number).filter((x) => !told.has(x));
    fresh.forEach((x) => told.add(x));
    if (fresh.length) await notify(null, fresh, { ...n, actorId: Number(p.author_id), postId: p.id, link });
  };

  if (p.dm_id) {
    const others = await query<{ member_id: number }>(`select member_id from dm_members where dm_id = $1 and not muted`, [p.dm_id]);
    await send(others.map((o) => o.member_id), { kind: "dm", title: p.author_name, body: text || "📎" });
    return;
  }
  // Mentions first: they matter most.
  if (p.mentions?.length) {
    const ok = await query<{ member_id: number }>(`select member_id from channel_members where channel_id = $1 and member_id = any($2::bigint[]) and notify <> 'off'`, [p.channel_id, p.mentions]);
    const notMembers = p.mentions.filter((x) => !ok.some((o) => Number(o.member_id) === Number(x)));
    await send([...ok.map((o) => o.member_id), ...notMembers], { kind: "mention", title: (t, l) => t("{name} mentioned you in #{channel}", { name: who(t), channel: chName(l) }), body: text });
  }
  if (p.mention_all) {
    const all = await query<{ member_id: number }>(`select member_id from channel_members where channel_id = $1 and notify <> 'off'`, [p.channel_id]);
    await send(all.map((o) => o.member_id), { kind: "mention", title: (t, l) => t("{name} posted for everyone in #{channel}", { name: who(t), channel: chName(l) }), body: text, important: true });
  }
  if (p.parent_id) {
    const thread = await query<{ author_id: number }>(
      `select distinct x.author_id from posts x join channel_members cm on cm.member_id = x.author_id and cm.channel_id = $2 and cm.notify <> 'off'
        where (x.id = $1 or x.parent_id = $1) and x.status = 'published'`, [p.parent_id, p.channel_id]);
    const title = p.root_title;
    await send(thread.map((r) => r.author_id), { kind: "reply", title: (t, l) => (title ? t("{name} replied to “{title}”", { name: who(t), title }) : t("{name} replied in #{channel}", { name: who(t), channel: chName(l) })), body: text });
    return;
  }
  if (p.kind === "opportunity") {
    // Only the specialists it matches hear about an opportunity.
    const { alertMatches } = await import("./opportunities");
    await alertMatches(p.id);
    return;
  }
  const followers = await query<{ member_id: number }>(`select member_id from channel_members where channel_id = $1 and notify = 'all'`, [p.channel_id]);
  const important = p.ch_type === "announcement" || p.kind === "event";
  const headline = p.title || text;
  await send(followers.map((f) => f.member_id), {
    kind: p.kind === "event" ? "event" : "post", important,
    title: (t, l) => (p.kind === "event" ? t("New event in #{channel}", { channel: chName(l) }) : p.ch_type === "announcement" ? t("New announcement in #{channel}", { channel: chName(l) }) : t("{name} posted in #{channel}", { name: who(t), channel: chName(l) })),
    body: headline,
  });
}

async function tellModerators(id: number) {
  const p = await one<{ space_id: number | null; hold_reason: string | null; dm_id: number | null; author_name: string }>(
    `select c.space_id, p.hold_reason, p.dm_id, coalesce(nullif(a.display_name, ''), a.full_name) as author_name
       from posts p join members a on a.id = p.author_id left join channels c on c.id = p.channel_id where p.id = $1`, [id]);
  if (!p) return;
  const staff = await spaceStaff(p.space_id);
  await notify(null, staff, { kind: "queue", title: (t) => t("A post from {name} is waiting for review", { name: p.author_name }), body: (t) => t(p.hold_reason === "contact_details" ? "Contact details" : p.hold_reason === "words" ? "A word on the review list" : "Waiting for approval"), link: "/admin/moderation", postId: id });
}

// ---------------------------------------------------------------- changing ----

/** The post with its channel or conversation access, when this member may at least see it. */
export async function postAccess(me: Me, id: number) {
  const p = await one<{ id: number; channel_id: number | null; dm_id: number | null; parent_id: number | null; author_id: number; status: string; kind: string; locked: boolean }>(
    `select id, channel_id, dm_id, parent_id, author_id, status, kind, locked from posts where id = $1`, [id]);
  if (!p) return null;
  if (p.channel_id) {
    const a = await channelById(me, p.channel_id);
    if (!a) return null;
    if (p.status !== "published" && Number(p.author_id) !== me.id && !a.moderate) return null;
    return { p, a, d: null as DmAccess | null, ctx: await ctxForChannel(me, a) };
  }
  const d = await dmById(me, p.dm_id!);
  if (!d) return null;
  return { p, a: null as Access | null, d, ctx: ctxForDm(me, d) };
}

export async function editPost(me: Me, id: number, body: string, title: string | null, t: T): Promise<{ ok: true; post: PostView } | { ok: false; error: string }> {
  const x = await postAccess(me, id);
  if (!x || Number(x.p.author_id) !== me.id || x.p.status === "removed") return { ok: false, error: t("You can only change your own posts.") };
  if (me.mutedUntil) return { ok: false, error: t("You can read but not post until {when}.", { when: new Date(me.mutedUntil).toLocaleString() }) };
  const clean = body.replace(/\r\n/g, "\n").trim().slice(0, 8000);
  if (!clean && x.p.kind === "message") return { ok: false, error: t("Write something first.") };
  let status = x.p.status, hold: string | null = null;
  if (!me.staff && !x.a?.moderate) {
    const words = await query<{ word: string; action: "hold" | "block" | "caution" }>(`select word, action from blocked_words where action <> 'caution'`);
    const hit = matchWords(`${title ?? ""}\n${clean}`, words);
    if (hit.block.length) return { ok: false, error: t("Your message has words that aren't allowed here. Please change it.") };
    const s = await getSettings();
    const filtering = (x.a && x.a.ch.space_filter_contacts) || (x.d && x.d.cross && s.filterCrossDm);
    if (hit.hold.length) { status = "held"; hold = "words"; }
    else if (filtering && findContacts(`${title ?? ""}\n${clean}`).length) { status = "held"; hold = "contact_details"; }
  }
  const m = mentionIds(clean);
  await query(`update posts set body = $2, title = coalesce($3, title), edited_at = now(), status = $4, hold_reason = coalesce($5, hold_reason),
                mentions = array(select x from unnest($6::bigint[]) x where x = any(mentions)) where id = $1`,
    [id, clean, x.p.kind === "message" ? null : title, status, hold, m.ids]);
  if (status === "held" && x.p.status === "published") {
    if (x.p.parent_id) await query(`update posts set reply_count = greatest(0, reply_count - 1) where id = $1`, [x.p.parent_id]);
    later(() => tellModerators(id));
  }
  return { ok: true, post: (await getPost(x.ctx, id))! };
}

export async function removePost(me: Me, id: number, reason: string | null, t: T): Promise<{ ok: boolean; error?: string }> {
  const x = await postAccess(me, id);
  if (!x) return { ok: false, error: t("That post isn't there any more.") };
  const own = Number(x.p.author_id) === me.id;
  if (!own && !x.ctx.moderate) return { ok: false, error: t("Only the author or a moderator can remove this.") };
  if (x.p.status === "removed") return { ok: true };
  await query(`update posts set status = 'removed', removed_by = $2, removed_reason = $3, pinned_at = null where id = $1`, [id, me.id, own ? null : reason]);
  if (x.p.parent_id && x.p.status === "published") await query(`update posts set reply_count = greatest(0, reply_count - 1) where id = $1`, [x.p.parent_id]);
  await query(`update reports set status = 'actioned', handled_by = $2, handled_at = now() where post_id = $1 and status = 'open'`, [id, me.id]);
  if (!own) {
    await audit(me, "post.remove", `post:${id}`, { reason });
    await notify(null, [Number(x.p.author_id)], { kind: "removed", title: (tt) => tt("A moderator removed one of your posts"), body: reason, actorId: me.id, link: "/notifications" });
  }
  return { ok: true };
}

export async function setPinned(me: Me, id: number, on: boolean): Promise<boolean> {
  const x = await postAccess(me, id);
  if (!x?.ctx.moderate || x.p.parent_id) return false;
  await query(`update posts set pinned_at = case when $2 then now() end where id = $1`, [id, on]);
  await audit(me, on ? "post.pin" : "post.unpin", `post:${id}`);
  return true;
}

export async function setLocked(me: Me, id: number, on: boolean): Promise<boolean> {
  const x = await postAccess(me, id);
  if (!x?.ctx.moderate) return false;
  await query(`update posts set locked = $2 where id = $1`, [id, on]);
  await audit(me, on ? "thread.lock" : "thread.unlock", `post:${id}`);
  return true;
}

export async function toggleReaction(me: Me, id: number, emoji: string): Promise<boolean> {
  if (emoji.length > 16 || !emoji.trim()) return false;
  const x = await postAccess(me, id);
  if (!x || !x.ctx.perms.react || x.p.status !== "published") return false;
  if (x.a) await ensureJoined(me, x.a);
  const had = await one(`delete from reactions where post_id = $1 and member_id = $2 and emoji = $3 returning 1`, [id, me.id, emoji]);
  if (!had) await query(`insert into reactions (post_id, member_id, emoji) values ($1, $2, $3) on conflict do nothing`, [id, me.id, emoji]);
  return true;
}

export async function votePoll(me: Me, id: number, options: number[]): Promise<{ ok: boolean; error?: string }> {
  const x = await postAccess(me, id);
  if (!x || x.p.kind !== "poll" || !x.ctx.perms.react) return { ok: false };
  const p = await one<{ data: { options: string[]; multi: boolean; closesAt: string | null } }>(`select data from posts where id = $1`, [id]);
  if (!p) return { ok: false };
  if (p.data.closesAt && new Date(p.data.closesAt).getTime() < Date.now()) return { ok: false, error: "This poll has closed." };
  const valid = [...new Set(options)].filter((o) => o >= 0 && o < p.data.options.length).slice(0, p.data.multi ? 10 : 1);
  await transaction(async (tx) => {
    await tx.query(`delete from poll_votes where post_id = $1 and member_id = $2`, [id, me.id]);
    for (const o of valid) await tx.query(`insert into poll_votes (post_id, member_id, option) values ($1, $2, $3)`, [id, me.id, o]);
  });
  if (!valid.length) await query(`update posts set updated_at = now() where id = $1`, [id]);
  return { ok: true };
}

export async function setBestAnswer(me: Me, topicId: number, replyId: number | null): Promise<boolean> {
  const x = await postAccess(me, topicId);
  if (!x || x.p.kind !== "topic") return false;
  if (Number(x.p.author_id) !== me.id && !x.ctx.moderate) return false;
  if (replyId && !(await one(`select 1 from posts where id = $1 and parent_id = $2 and status = 'published'`, [replyId, topicId]))) return false;
  await query(`update posts set best_answer_id = $2 where id = $1`, [topicId, replyId]);
  return true;
}

export async function reportPost(me: Me, id: number, reason: string, note: string | null): Promise<boolean> {
  const x = await postAccess(me, id);
  if (!x || Number(x.p.author_id) === me.id) return false;
  await query(`insert into reports (post_id, reporter_id, reason, note) values ($1, $2, $3, $4) on conflict do nothing`, [id, me.id, reason.slice(0, 40), note?.slice(0, 500) ?? null]);
  const staff = await spaceStaff(x.a?.ch.space_id ?? null);
  await notify(null, staff, { kind: "report", title: (t) => t("A post was reported"), body: (t) => t(reason === "contact" ? "Sharing contact details or asking to meet privately" : reason === "child" ? "Shows or names a child" : reason === "harsh" ? "Unkind, abusive or bullying" : reason === "advice" ? "Unsafe medical or therapy advice" : reason === "spam" ? "Spam or selling" : "Something else"), link: "/admin/moderation?tab=reports", actorId: me.id, postId: id });
  return true;
}

/** "Seen by": who has looked at announcements, opportunities, events and broadcasts. */
export async function recordViews(me: Me, ids: number[]) {
  const list = [...new Set(ids.map(Number).filter((n) => n > 0))].slice(0, 100);
  if (!list.length) return;
  await query(`insert into post_views (post_id, member_id) select x, $2 from unnest($1::bigint[]) x where exists (select 1 from posts where id = x) on conflict do nothing`, [list, me.id]);
}

export async function markRead(me: Me, scope: { channelId?: number; dmId?: number }) {
  if (scope.channelId) await query(`update channel_members set last_read_at = now() where channel_id = $1 and member_id = $2`, [scope.channelId, me.id]);
  if (scope.dmId) await query(`update dm_members set last_read_at = now() where dm_id = $1 and member_id = $2`, [scope.dmId, me.id]);
}

export const localeOf = (me: Me): Locale => me.locale;
