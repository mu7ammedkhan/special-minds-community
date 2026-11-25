import "server-only";
import { one, query } from "./db";
import { isAdmin, type Me } from "./auth";
import { clockNow, fmtClock, hhmm, inWindow } from "./format";
import { pick, type Locale, type T } from "./i18n";
import { defaultPerms, type ChannelType, type Kind, type PermAudience, type Perms, type StaffRole } from "./options";
import type { Settings } from "./settings";
import type { ChannelView } from "./types";

/**
 * Who may see and do what. Every page, action and API route goes through
 * these: the browser is never trusted.
 *
 *   Owner and admins     everything, in every space
 *   Moderators           everything in the spaces they belong to
 *   Members              what each channel allows their kind (Admin → channel → Permissions)
 *
 * Private and hidden channels are for their members only. Muted members
 * read but can't post; posting hours, slow mode, a lock or "announcements
 * only" stop members but never staff.
 */

export type Hours = { from: string; to: string; days?: number[] };
export type ChannelRow = {
  id: number; space_id: number; slug: string; name: string; name_ar: string | null; topic: string | null; topic_ar: string | null; type: ChannelType;
  visibility: "open" | "private" | "hidden"; auto_join: boolean; tags: Record<string, string[]>; perms: Partial<Record<PermAudience, Partial<Perms>>>;
  posting_hours: Hours | null; slow_mode: number; locked: boolean; announce_only: boolean; approval: "none" | "new" | "all";
  allow_anonymous: boolean; child_photos: boolean; case_talk: boolean; position: number; archived_at: string | null;
  space_slug: string; space_name: string; space_name_ar: string | null; space_tz: string; space_audience: "specialists" | "families" | "mixed";
  space_filter_contacts: boolean; space_country: string;
};

export const CHANNEL_SELECT = `
  select c.*, s.slug as space_slug, s.name as space_name, s.name_ar as space_name_ar, s.tz as space_tz, s.audience as space_audience,
         s.filter_contacts as space_filter_contacts, s.country as space_country
    from channels c join spaces s on s.id = c.space_id`;

export const canEnterSpace = (me: Me, spaceId: number) => isAdmin(me) || me.spaces.includes(spaceId);
export const canModerate = (me: Me, spaceId: number) => isAdmin(me) || (me.staff === "moderator" && me.spaces.includes(spaceId));

/**
 * permsFor's "may see this channel" rule in SQL, for queries over many posts or
 * people. m is a members row, c a channels row and s its space. Every kind may
 * see by default; an admin can switch "See" off for parents or guests.
 */
export const canViewSql = (m: string, c: string, s: string) => `(
  ${m}.status = 'active' and ${c}.archived_at is null and ${s}.enabled and (
    ${m}.staff_role in ('owner', 'admin')
    or (exists (select 1 from space_members vsm where vsm.space_id = ${c}.space_id and vsm.member_id = ${m}.id) and (
      ${m}.staff_role = 'moderator'
      or ((${c}.visibility = 'open' or exists (select 1 from channel_members vcm where vcm.channel_id = ${c}.id and vcm.member_id = ${m}.id))
          and (case ${m}.kind
                 when 'team' then coalesce((${c}.perms -> 'specialist' ->> 'view')::boolean, true) or coalesce((${c}.perms -> 'parent' ->> 'view')::boolean, true)
                 when 'parent' then coalesce((${c}.perms -> 'parent' ->> 'view')::boolean, true)
                 when 'guest' then coalesce((${c}.perms -> 'guest' ->> 'view')::boolean, true)
                 else coalesce((${c}.perms -> 'specialist' ->> 'view')::boolean, true) end))))))`;

/** Of these people, the ones who may see this channel (and so may be told about its posts). */
export async function viewersOf(channelId: number, ids: number[]): Promise<number[]> {
  const list = [...new Set(ids.map(Number).filter((n) => n > 0))];
  if (!list.length) return [];
  const rows = await query<{ id: number }>(
    `select m.id from members m, channels c join spaces s on s.id = c.space_id
      where c.id = $1 and m.id = any($2::bigint[]) and ${canViewSql("m", "c", "s")}`, [channelId, list]);
  return rows.map((r) => Number(r.id));
}

const NONE: Perms = { view: false, post: false, reply: false, react: false, upload: false };
const ALL: Perms = { view: true, post: true, reply: true, react: true, upload: true };

/** What this member may do in this channel, before mutes, hours and slow mode. */
export function permsFor(me: Me, ch: ChannelRow, joined: boolean): Perms {
  if (canModerate(me, ch.space_id)) return { ...ALL };
  if (!canEnterSpace(me, ch.space_id) || ch.archived_at) return { ...NONE };
  if (ch.visibility !== "open" && !joined) return { ...NONE };
  const d = defaultPerms(ch.type);
  const get = (k: PermAudience): Perms => ({ ...d[k], ...(ch.perms?.[k] ?? {}) });
  if (me.kind === "team") {
    const a = get("specialist"), b = get("parent");
    return { view: a.view || b.view, post: a.post || b.post, reply: a.reply || b.reply, react: a.react || b.react, upload: a.upload || b.upload };
  }
  return get(me.kind === "parent" ? "parent" : me.kind === "guest" ? "guest" : "specialist");
}

export type Access = { ch: ChannelRow; joined: boolean; notify: "all" | "mentions" | "off"; lastReadAt: string | null; perms: Perms; moderate: boolean };

async function accessFor(me: Me, ch: ChannelRow | null): Promise<Access | null> {
  if (!ch) return null;
  const cm = await one<{ notify: "all" | "mentions" | "off"; last_read_at: string }>(
    `select notify, last_read_at from channel_members where channel_id = $1 and member_id = $2`, [ch.id, me.id]);
  const perms = permsFor(me, ch, Boolean(cm));
  if (!perms.view) return null;
  return { ch, joined: Boolean(cm), notify: cm?.notify ?? "mentions", lastReadAt: cm?.last_read_at ?? null, perms, moderate: canModerate(me, ch.space_id) };
}

export async function channelBySlug(me: Me, spaceSlug: string, channelSlug: string): Promise<Access | null> {
  const ch = await one<ChannelRow>(`${CHANNEL_SELECT} where s.slug = $1 and c.slug = $2 and s.enabled`, [spaceSlug, channelSlug]);
  return accessFor(me, ch);
}

export async function channelById(me: Me, id: number): Promise<Access | null> {
  if (!Number.isFinite(id)) return null;
  // A switched-off space is hidden from members, as on its own pages (channelBySlug); admins still reach it.
  const ch = await one<ChannelRow>(`${CHANNEL_SELECT} where c.id = $1 and (s.enabled or $2::boolean)`, [id, isAdmin(me)]);
  return accessFor(me, ch);
}

export type Block = { reason: "muted" | "locked" | "announce_only" | "hours" | "slow" | "no_perm"; until?: string; from?: string; to?: string; wait?: number };

/** Why this member can't post (or reply) here right now, or null when they can. */
export async function postingBlock(me: Me, a: Access, isReply: boolean): Promise<Block | null> {
  if (me.mutedUntil) return { reason: "muted", until: me.mutedUntil };
  if (a.moderate) return null;
  if (!(isReply ? a.perms.reply : a.perms.post)) return { reason: "no_perm" };
  if (a.ch.locked) return { reason: "locked" };
  if (a.ch.announce_only && !isReply) return { reason: "announce_only" };
  const h = a.ch.posting_hours;
  if (h && hhmm(h.from) !== null && hhmm(h.to) !== null) {
    const now = clockNow(a.ch.space_tz);
    const dayOk = !h.days?.length || h.days.includes(now.weekday);
    if (!dayOk || !inWindow(now.minutes, hhmm(h.from)!, hhmm(h.to)!)) return { reason: "hours", from: h.from, to: h.to };
  }
  if (a.ch.slow_mode > 0 && !isReply) {
    const last = await one<{ wait: number }>(
      `select greatest(0, $3 - extract(epoch from now() - max(created_at)))::int as wait from posts
        where channel_id = $1 and author_id = $2 and parent_id is null and status <> 'removed' and created_at > now() - make_interval(secs => $3)`,
      [a.ch.id, me.id, a.ch.slow_mode]);
    if (last?.wait) return { reason: "slow", wait: last.wait };
  }
  return null;
}

/** The sentence a member sees instead of the message box. */
export function blockText(b: Block, t: T, locale: Locale): string {
  switch (b.reason) {
    case "muted": return t("You can read but not post until {when}.", { when: new Date(b.until!).toLocaleString(locale === "ar" ? "ar-u-nu-latn" : "en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) });
    case "locked": return t("This channel is locked. Only staff can post right now.");
    case "announce_only": return t("Only staff post here. You can react and reply to posts.");
    case "hours": return t("This channel takes posts from {from} to {to}.", { from: fmtClock(b.from!, locale), to: fmtClock(b.to!, locale) });
    case "slow": return t("Slow mode is on. You can post again in {n} seconds.", { n: b.wait ?? 0 });
    default: return t("You can read this channel but not post in it.");
  }
}

/** Everything a channel page needs to know about the channel, ready for the browser. */
const NO_POST_TEXT: Partial<Record<ChannelType, string>> = {
  announcement: "Only staff post here. You can react and reply to posts.",
  opportunities: "Opportunities are posted by Special Minds staff. Tap I'm interested on the ones that fit you.",
  events: "Events are posted by Special Minds staff.",
  library: "The library is kept by Special Minds staff.",
};

export async function channelView(me: Me, a: Access, t: T, locale: Locale): Promise<ChannelView> {
  const block = await postingBlock(me, a, false);
  if (block?.reason === "no_perm" && NO_POST_TEXT[a.ch.type]) return { ...(await channelViewBase(me, a, locale)), block: { reason: "no_perm", text: t(NO_POST_TEXT[a.ch.type]!) } };
  return { ...(await channelViewBase(me, a, locale)), block: block ? { reason: block.reason, text: blockText(block, t, locale) } : null };
}

async function channelViewBase(me: Me, a: Access, locale: Locale): Promise<Omit<ChannelView, "block">> {
  return {
    id: a.ch.id, spaceId: a.ch.space_id, spaceSlug: a.ch.space_slug, slug: a.ch.slug, name: pick(locale, a.ch.name, a.ch.name_ar),
    topic: pick(locale, a.ch.topic ?? "", a.ch.topic_ar) || null, type: a.ch.type, visibility: a.ch.visibility, joined: a.joined, notify: a.notify,
    locked: a.ch.locked, announceOnly: a.ch.announce_only, allowAnonymous: a.ch.allow_anonymous, childPhotos: a.ch.child_photos, caseTalk: a.ch.case_talk,
    tz: a.ch.space_tz, audience: a.ch.space_audience, perms: a.perms, moderate: a.moderate,
  };
}

/** Joins an open channel quietly (first post, reaction or answer there). */
export async function ensureJoined(me: Me, a: Access) {
  if (a.joined) return;
  const notify = a.ch.type === "announcement" || a.ch.type === "opportunities" || a.ch.type === "events" ? "all" : "mentions";
  await query(`insert into channel_members (channel_id, member_id, notify) values ($1, $2, $3) on conflict do nothing`, [a.ch.id, me.id, notify]);
  a.joined = true;
}

// ------------------------------------------------------- private messages ----

type Party = { kind: Kind; staff: StaffRole | null };
/** Whether two people may message each other privately: open, only once an admin approves, or not at all. */
export function dmRule(s: Settings, a: Party, b: Party): "open" | "approval" | "off" {
  if (a.staff || b.staff || a.kind === "team" || b.kind === "team") return "open";
  if (a.kind === "guest" || b.kind === "guest") return "off";
  const cross = (a.kind === "parent") !== (b.kind === "parent");
  if (cross) return s.dmCross;
  if (a.kind === "parent") return s.dmParents ? "open" : "off";
  return s.dmSpecialists ? "open" : "off";
}
export const isCross = (a: Party, b: Party) => !a.staff && !b.staff && a.kind !== "team" && b.kind !== "team" && (a.kind === "parent") !== (b.kind === "parent");

export type DmAccess = {
  id: number; isGroup: boolean; title: string | null; status: "active" | "pending" | "declined"; createdBy: number | null;
  members: { id: number; name: string; kind: Kind; staff: StaffRole | null; avatar: number | null; verified: string | null; status: string }[];
  lastReadAt: string; muted: boolean; cross: boolean;
};

export async function dmById(me: Me, id: number): Promise<DmAccess | null> {
  if (!Number.isFinite(id)) return null;
  const dm = await one<{ id: number; is_group: boolean; title: string | null; status: DmAccess["status"]; created_by: number | null; last_read_at: string; muted: boolean }>(
    `select d.id, d.is_group, d.title, d.status, d.created_by, dm.last_read_at, dm.muted from dms d join dm_members dm on dm.dm_id = d.id and dm.member_id = $2 where d.id = $1`, [id, me.id]);
  if (!dm) return null;
  const members = await query<DmAccess["members"][number]>(
    `select m.id, coalesce(nullif(m.display_name, ''), m.full_name) as name, m.kind, m.staff_role as staff, m.avatar_file_id as avatar, m.verified_title as verified, m.status
       from dm_members x join members m on m.id = x.member_id where x.dm_id = $1 order by m.id`, [id]);
  const others = members.filter((m) => m.id !== me.id);
  return {
    id: dm.id, isGroup: dm.is_group, title: dm.title, status: dm.status, createdBy: dm.created_by, members, lastReadAt: dm.last_read_at, muted: dm.muted,
    cross: others.some((o) => isCross(me, o)),
  };
}
