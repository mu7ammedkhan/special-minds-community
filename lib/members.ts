import "server-only";
import { randomBytes } from "node:crypto";
import { one, query, transaction, type Tx } from "./db";
import { endAllSessions, type Me } from "./auth";
import { audit } from "./audit";
import { notify, spaceStaff } from "./notify";
import { defaultNotify, type ChannelType, type Kind, type StaffRole } from "./options";
import { sendEmail, sendWhatsApp } from "./outbox";

/**
 * Members joining and being looked after: invites, join requests, approval,
 * removing from a space, mutes, suspensions, bans, staff roles, verified
 * badges, and deleting an account.
 */

type Run = Pick<Tx, "query" | "one">;

/** Puts someone in a space and in its channels that everyone joins (plus any the invite named). */
export async function addToSpace(tx: Run | null, memberId: number, spaceId: number, extraChannels: number[] = []) {
  const run = tx ? tx.query.bind(tx) : query;
  await run(`insert into space_members (space_id, member_id) values ($1, $2) on conflict do nothing`, [spaceId, memberId]);
  // Not channels where an admin switched "See" off for this member's kind (parents or guests).
  const chans = await run(
    `select c.id, c.type from channels c join members m on m.id = $3
      where c.space_id = $1 and c.archived_at is null and ((c.auto_join and c.visibility = 'open') or c.id = any($2::int[]))
        and (m.staff_role is not null or case m.kind
              when 'parent' then coalesce((c.perms -> 'parent' ->> 'view')::boolean, true)
              when 'guest' then coalesce((c.perms -> 'guest' ->> 'view')::boolean, true)
              when 'team' then true
              else coalesce((c.perms -> 'specialist' ->> 'view')::boolean, true) end)`,
    [spaceId, extraChannels, memberId]) as { id: number; type: ChannelType }[];
  for (const c of chans) {
    await run(`insert into channel_members (channel_id, member_id, notify, last_read_at) values ($1, $2, $3, now() - interval '3 days') on conflict do nothing`, [c.id, memberId, defaultNotify(c.type)]);
  }
  await run(`update members set status = case when status = 'pending' then 'active' else status end, joined_at = coalesce(joined_at, now()) where id = $1`, [memberId]);
}

export const inviteCode = () => randomBytes(9).toString("base64url").replace(/[-_]/g, "x");

export type InviteRow = {
  id: number; code: string; space_id: number; channel_ids: number[]; kind: Kind; for_address: string | null; for_name: string | null; prefill: Record<string, unknown>;
  auto_approve: boolean; max_uses: number | null; uses: number; expires_at: string | null; revoked_at: string | null; space_name: string; space_name_ar: string | null;
  space_slug: string; audience: string; questions: { id: string; label: string; label_ar?: string; required?: boolean }[]; rules: string | null; rules_ar: string | null; enabled: boolean;
};

export async function inviteByCode(code: string): Promise<{ invite: InviteRow | null; problem: string | null }> {
  if (!/^[A-Za-z0-9]{6,40}$/.test(code)) return { invite: null, problem: "This invite link isn't right. Check you copied all of it." };
  const i = await one<InviteRow>(
    `select i.*, s.name as space_name, s.name_ar as space_name_ar, s.slug as space_slug, s.audience, s.questions, s.rules, s.rules_ar, s.enabled
       from invites i join spaces s on s.id = i.space_id where i.code = $1`, [code]);
  if (!i || !i.enabled) return { invite: null, problem: "This invite link isn't right. Check you copied all of it." };
  if (i.revoked_at) return { invite: i, problem: "This invite link has been switched off. Ask Special Minds for a new one." };
  if (i.expires_at && new Date(i.expires_at).getTime() < Date.now()) return { invite: i, problem: "This invite link has expired. Ask Special Minds for a new one." };
  if (i.max_uses !== null && i.uses >= i.max_uses) return { invite: i, problem: "This invite link has been used up. Ask Special Minds for a new one." };
  return { invite: i, problem: null };
}

export type Profile = {
  fullName: string; displayName: string | null; kind: Kind; city: string | null; country: string | null; languages: string[]; roles: string[]; skills: string[];
  gender: "female" | "male" | null; bio: string | null;
};

export async function saveProfile(tx: Run | null, memberId: number, p: Profile, opts: { setKind: boolean }) {
  const run = tx ? tx.query.bind(tx) : query;
  await run(
    `update members set full_name = $2, display_name = $3, city = $4, country = $5, languages = $6::text[], roles = $7::text[], skills = $8::text[], gender = $9, bio = $10,
            kind = case when $11 then $12 else kind end, profile_done = true where id = $1`,
    [memberId, p.fullName, p.displayName, p.city, p.country, p.languages, p.roles, p.skills, p.gender, p.bio, opts.setKind, p.kind]);
}

/**
 * The end of joining: with a valid invite that lets people straight in, they're
 * in; otherwise a join request waits for an admin.
 */
export async function finishJoin(me: Me, spaceId: number, answers: Record<string, string>, invite: InviteRow | null): Promise<"joined" | "requested" | "already"> {
  if (me.spaces.includes(spaceId)) return "already";
  const direct = Boolean(invite && invite.auto_approve) || (await one<{ join_policy: string }>(`select join_policy from spaces where id = $1`, [spaceId]))?.join_policy === "open";
  let newRequest = false;
  const out = await transaction(async (tx) => {
    await tx.query(`update members set rules_accepted_at = now(), consent_at = now() where id = $1`, [me.id]);
    if (invite) await tx.query(`update invites set uses = uses + 1 where id = $1`, [invite.id]);
    if (invite?.prefill && Object.keys(invite.prefill).length) {
      const pf = invite.prefill as { talent_ref?: string; verified_title?: string };
      await tx.query(`update members set talent_ref = coalesce(talent_ref, $2), verified_title = coalesce(verified_title, $3) where id = $1`, [me.id, pf.talent_ref ?? null, pf.verified_title ?? null]);
    }
    if (direct) {
      await addToSpace(tx, me.id, spaceId, invite?.channel_ids ?? []);
      return "joined" as const;
    }
    const waiting = await tx.one(`select 1 from join_requests where space_id = $1 and member_id = $2 and status = 'pending'`, [spaceId, me.id]);
    await tx.query(
      `insert into join_requests (space_id, member_id, invite_id, answers) values ($1, $2, $3, $4::text::jsonb)
       on conflict (space_id, member_id) where status = 'pending' do update set answers = excluded.answers`,
      [spaceId, me.id, invite?.id ?? null, JSON.stringify(answers)]);
    newRequest = !waiting;
    return "requested" as const;
  });
  // Staff hear about a request once: sending the form again only updates the answers.
  if (out === "requested" && newRequest) {
    const staff = await spaceStaff(spaceId);
    await notify(null, staff, { kind: "request", title: (t) => t("{name} asked to join", { name: me.fullName }), link: "/admin/requests", actorId: me.id });
  }
  return out;
}

export async function decideRequest(me: Me, requestId: number, approve: boolean, note: string | null): Promise<boolean> {
  const r = await one<{ id: number; space_id: number; member_id: number; status: string; email: string | null; phone: string | null; locale: string; space_name: string }>(
    `select j.id, j.space_id, j.member_id, j.status, m.email, m.phone, m.locale, s.name as space_name from join_requests j join members m on m.id = j.member_id join spaces s on s.id = j.space_id where j.id = $1`, [requestId]);
  if (!r || r.status !== "pending") return false;
  if (!(me.staff === "owner" || me.staff === "admin" || me.spaces.includes(r.space_id))) return false;
  await transaction(async (tx) => {
    await tx.query(`update join_requests set status = $2, decided_by = $3, decided_at = now(), note = $4 where id = $1`, [requestId, approve ? "approved" : "declined", me.id, note]);
    if (approve) await addToSpace(tx, r.member_id, r.space_id);
  });
  await audit(me, approve ? "request.approve" : "request.decline", `member:${r.member_id}`, { space: r.space_id, note });
  const app = process.env.APP_URL ?? "";
  if (approve) {
    await notify(null, [r.member_id], { kind: "joined", title: (t) => t("Welcome! You're now in {space}", { space: r.space_name }), link: "/", actorId: me.id, important: true });
    const text = r.locale === "ar" ? `أهلاً بك في مجتمع سبيشال مايندز. تمت الموافقة على انضمامك إلى ${r.space_name}: ${app}/` : `Welcome to the Special Minds Community. You're now in ${r.space_name}: ${app}/`;
    if (r.email) await sendEmail({ to: r.email, subject: r.locale === "ar" ? "تمت الموافقة على انضمامك" : "You're in: Special Minds Community", text, purpose: "joined", memberId: r.member_id });
    else if (r.phone) await sendWhatsApp({ to: r.phone, text, template: "update", params: [text], purpose: "joined", memberId: r.member_id, lang: r.locale === "ar" ? "ar" : "en" });
  } else {
    await notify(null, [r.member_id], { kind: "declined", title: (t) => t("Your request to join {space} wasn't approved", { space: r.space_name }), body: note, link: "/welcome", actorId: me.id });
  }
  return true;
}

// -------------------------------------------------------------- moderation ----

export async function removeFromSpace(me: Me, memberId: number, spaceId: number) {
  await transaction(async (tx) => {
    await tx.query(`delete from space_members where space_id = $1 and member_id = $2`, [spaceId, memberId]);
    await tx.query(`delete from channel_members where member_id = $1 and channel_id in (select id from channels where space_id = $2)`, [memberId, spaceId]);
  });
  await audit(me, "member.remove_from_space", `member:${memberId}`, { space: spaceId });
}

export async function muteMember(me: Me, memberId: number, hours: number | null, reason: string | null) {
  await query(`update members set muted_until = case when $2::int is null then null else now() + make_interval(hours => $2::int) end, mute_reason = $3 where id = $1`, [memberId, hours, reason]);
  await audit(me, hours ? "member.mute" : "member.unmute", `member:${memberId}`, { hours, reason });
  if (hours) await notify(null, [memberId], { kind: "muted", title: (t) => t("A moderator paused your posting for {n} hours", { n: hours }), body: reason, link: "/", actorId: me.id });
}

export async function setStatus(me: Me, memberId: number, status: "active" | "suspended" | "banned", reason: string | null) {
  const m = await one<{ email: string | null; phone: string | null; status: string }>(`select email, phone, status from members where id = $1`, [memberId]);
  if (!m) return;
  await query(`update members set status = $2, status_reason = $3 where id = $1`, [memberId, status, reason]);
  if (status !== "active") await endAllSessions(memberId);
  if (status === "banned") {
    for (const c of [m.email?.toLowerCase(), m.phone].filter(Boolean)) {
      await query(`insert into banned_contacts (contact, member_id, reason, created_by) values ($1, $2, $3, $4) on conflict (contact) do nothing`, [c, memberId, reason, me.id]);
    }
  }
  if (status === "active") await query(`delete from banned_contacts where member_id = $1`, [memberId]);
  await audit(me, `member.${status === "active" ? "reinstate" : status === "suspended" ? "suspend" : "ban"}`, `member:${memberId}`, { reason });
}

/**
 * Who a staff member may act on: admins and the owner look after everyone;
 * moderators only the people in their own spaces, and people asking to join one.
 */
export async function memberInScope(me: Me, memberId: number): Promise<boolean> {
  if (me.staff === "owner" || me.staff === "admin") return true;
  if (me.staff !== "moderator" || !me.spaces.length) return false;
  return Boolean(await one(
    `select 1 where exists (select 1 from space_members where member_id = $1 and space_id = any($2::int[]))
                 or exists (select 1 from join_requests where member_id = $1 and space_id = any($2::int[]) and status = 'pending')`,
    [memberId, me.spaces]));
}

export async function setStaffRole(me: Me, memberId: number, role: StaffRole | null): Promise<string | null> {
  if (memberId === me.id) return "You can't change your own staff role.";
  // There is one owner. Handing the community to someone else is done by Special Minds' developer (scripts/db.mjs staff-role).
  if (role === "owner") return "The owner can only be changed by Special Minds' developer.";
  if (role !== null && role !== "admin" && role !== "moderator") return "Not found.";
  const target = await one<{ staff_role: StaffRole | null }>(`select staff_role from members where id = $1`, [memberId]);
  if (!target) return "Not found.";
  const ownerOnly = role === "admin" || target.staff_role === "owner" || target.staff_role === "admin";
  if (ownerOnly && me.staff !== "owner") return "Only the owner can make or remove admins.";
  if (me.staff !== "owner" && me.staff !== "admin") return "Only admins can change staff roles.";
  await query(`update members set staff_role = $2 where id = $1`, [memberId, role]);
  await audit(me, "member.staff_role", `member:${memberId}`, { role });
  return null;
}

export async function setVerified(me: Me, memberId: number, title: string | null) {
  await query(`update members set verified_title = $2, verified_at = case when $2 is null then null else now() end, verified_by = case when $2 is null then null else $3::bigint end where id = $1`, [memberId, title, me.id]);
  await audit(me, title ? "member.verify" : "member.unverify", `member:${memberId}`, { title });
}

/** Deleting your own account: name, contact details and photo go; your posts stay as "Deleted member" unless you remove them too. */
export async function deleteAccount(me: Me, removePosts: boolean) {
  await transaction(async (tx) => {
    if (removePosts) await tx.query(`update posts set status = 'removed', removed_by = $1 where author_id = $1 and status <> 'removed'`, [me.id]);
    await tx.query(`delete from space_members where member_id = $1`, [me.id]);
    await tx.query(`delete from channel_members where member_id = $1`, [me.id]);
    await tx.query(`delete from push_subscriptions where member_id = $1`, [me.id]);
    await tx.query(`update members set status = 'deleted', email = null, phone = null, full_name = 'Deleted member', display_name = null, bio = null, avatar_file_id = null,
                        city = null, talent_ref = null, totp_secret = null, totp_on = false, prefs = '{}', deleted_at = now() where id = $1`, [me.id]);
  });
  await endAllSessions(me.id);
  await audit({ id: me.id, fullName: me.fullName }, "member.delete_self", `member:${me.id}`, { removePosts });
}

/** "Download my data": everything the community keeps about this person, as JSON. */
export async function exportMyData(me: Me) {
  const [profile] = await query(`select id, email, phone, full_name, display_name, kind, city, country, languages, roles, skills, gender, bio, locale, prefs, open_to_work, available_from, availability_note, joined_at, created_at from members where id = $1`, [me.id]);
  return {
    exported_at: new Date().toISOString(),
    profile,
    spaces: await query(`select s.name, sm.joined_at from space_members sm join spaces s on s.id = sm.space_id where sm.member_id = $1`, [me.id]),
    posts: await query(`select p.id, p.kind, p.title, p.body, p.status, p.created_at, c.name as channel from posts p left join channels c on c.id = p.channel_id where p.author_id = $1 order by p.created_at`, [me.id]),
    reactions: await query(`select post_id, emoji, created_at from reactions where member_id = $1`, [me.id]),
    poll_votes: await query(`select post_id, option, created_at from poll_votes where member_id = $1`, [me.id]),
    opportunity_answers: await query(`select post_id, answer, note, created_at from responses where member_id = $1`, [me.id]),
    event_rsvps: await query(`select post_id, answer, created_at from rsvps where member_id = $1`, [me.id]),
    help_requests: await query(`select service, child_age, city, details, created_at from help_requests where member_id = $1`, [me.id]),
    notifications: await query(`select kind, title, body, created_at, read_at from notifications where member_id = $1 order by created_at desc limit 500`, [me.id]),
  };
}
