"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { atLeast, readAddress, requireStaff } from "@/lib/auth";
import { canModerate } from "@/lib/access";
import { audit } from "@/lib/audit";
import { createBroadcast, countSegment, type Segment } from "@/lib/broadcasts";
import { sendHelpToCrm } from "@/lib/crm";
import { one, query, transaction } from "@/lib/db";
import { makeT } from "@/lib/i18n";
import { addToSpace, decideRequest, inviteCode, muteMember, removeFromSpace, setStaffRole, setStatus, setVerified } from "@/lib/members";
import { COUNTRY, defaultNotify, defaultPerms, rolesFromText, tzFor, type ChannelType, type Kind, type PermAudience, type Perms } from "@/lib/options";
import { sendEmail, sendWhatsApp } from "@/lib/outbox";
import { fanOut, removePost } from "@/lib/posts";
import { DEFAULT_SETTINGS, saveSettings, type Settings } from "@/lib/settings";
import type { ActionState } from "@/components/form";

/**
 * Admin console actions. Each checks the staff role first: moderators look
 * after members, requests and the review queue in their own spaces; admins
 * and the owner do everything else.
 */

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || `c-${Date.now().toString(36)}`;
const str = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);

// --------------------------------------------------------------- requests ----

export async function decideRequestAction(id: number, approve: boolean, note: string | null) {
  const me = await requireStaff("moderator");
  const ok = await decideRequest(me, Number(id), Boolean(approve), note ? String(note).slice(0, 300) : null);
  revalidatePath("/admin/requests");
  return ok;
}

// ---------------------------------------------------------------- invites ----

export async function createInvite(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff("moderator");
  const t = makeT(me.locale);
  const spaceId = Number(fd.get("space"));
  const space = await one<{ id: number; audience: string }>(`select id, audience from spaces where id = $1`, [spaceId]);
  if (!space || !canModerate(me, spaceId)) return { fields: { space: t("Choose a space.") } };
  const kind = (["specialist", "parent", "team", "guest"].includes(str(fd, "kind")) ? str(fd, "kind") : space.audience === "families" ? "parent" : "specialist") as Kind;
  if (kind === "team" && !atLeast(me, "admin")) return { error: t("Only admins can invite Special Minds team members.") };
  const forRaw = str(fd, "for_address", 160);
  const forAddress = forRaw ? readAddress(forRaw)?.address ?? null : null;
  if (forRaw && !forAddress) return { fields: { for_address: t("That doesn't look like an email or mobile number.") } };
  const maxUses = forAddress ? 1 : Number(fd.get("max_uses")) > 0 ? Math.round(Number(fd.get("max_uses"))) : null;
  const days = Number(fd.get("days"));
  const code = inviteCode();
  const channels = fd.getAll("channels").map(Number).filter((n) => n > 0);
  await query(
    `insert into invites (code, space_id, channel_ids, kind, for_address, for_name, auto_approve, max_uses, expires_at, note, created_by)
     values ($1, $2, $3::int[], $4, $5, $6, $7, $8, case when $9::int > 0 then now() + make_interval(days => $9::int) end, $10, $11)`,
    [code, spaceId, channels, kind, forAddress, str(fd, "for_name", 120) || null, fd.get("auto_approve") === "1", maxUses, days > 0 ? days : 0, str(fd, "note", 200) || null, me.id]);
  await audit(me, "invite.create", `space:${spaceId}`, { kind, personal: Boolean(forAddress) });
  const link = `${process.env.APP_URL ?? ""}/join/${code}`;
  if (forAddress && fd.get("send") === "1") await sendInvite(forAddress, str(fd, "for_name", 120), link, me.id);
  revalidatePath("/admin/invites");
  return { ok: forAddress && fd.get("send") === "1" ? t("Invite made and sent.") : t("Invite made. Copy the link below."), data: { code } };
}

async function sendInvite(address: string, name: string, link: string, _by: number) {
  const text = `${name ? `Hello ${name},\n\n` : ""}You're invited to the Special Minds Community: opportunities, announcements and colleagues in one place.\nJoin here: ${link}\n\nمرحباً، أنت مدعو للانضمام إلى مجتمع سبيشال مايندز: ${link}`;
  if (address.includes("@")) await sendEmail({ to: address, subject: "You're invited to the Special Minds Community", text, purpose: "invite" });
  else await sendWhatsApp({ to: address, text, template: "update", params: [text], purpose: "invite" });
}

export async function revokeInvite(id: number) {
  const me = await requireStaff("moderator");
  await query(`update invites set revoked_at = now() where id = $1`, [id]);
  await audit(me, "invite.revoke", `invite:${id}`);
  revalidatePath("/admin/invites");
}

/** Import from the Talent portal: a personal invite for each person (sent by email or WhatsApp if asked), their profile filled in from the file. */
export type ImportRow = { name: string; email: string; phone: string; roles: string; city: string; country: string; languages: string; gender: string; ref: string };
export async function importSpecialists(rows: ImportRow[], spaceId: number, send: boolean): Promise<{ ok: boolean; made?: number; skipped?: number; error?: string }> {
  const me = await requireStaff("admin");
  const space = await one<{ id: number }>(`select id from spaces where id = $1`, [spaceId]);
  if (!space) return { ok: false, error: "Choose a space." };
  let made = 0, skipped = 0;
  for (const r of (rows ?? []).slice(0, 2000)) {
    const addr = readAddress(r.email || "") ?? readAddress(r.phone || "");
    if (!addr || !r.name?.trim()) { skipped++; continue; }
    const already = await one(`select 1 from members m join space_members sm on sm.member_id = m.id and sm.space_id = $2 where lower(m.email) = $1 or m.phone = $1`, [addr.address, spaceId]);
    if (already) { skipped++; continue; }
    const code = inviteCode();
    const country = COUNTRY[(r.country || "").toUpperCase()] ? r.country.toUpperCase() : Object.values(COUNTRY).find((c) => c.name.toLowerCase() === (r.country || "").toLowerCase())?.code ?? "AE";
    const prefill = {
      roles: rolesFromText(r.roles || ""), city: r.city?.trim() || null, country, languages: (r.languages || "").split(/[;,/]/).map((s) => s.trim()).filter(Boolean),
      gender: /^f/i.test(r.gender || "") ? "female" : /^m/i.test(r.gender || "") ? "male" : null, talent_ref: r.ref?.replace(/^#/, "").trim() || null,
    };
    await query(`insert into invites (code, space_id, kind, for_address, for_name, prefill, auto_approve, max_uses, expires_at, note, created_by)
                 values ($1, $2, 'specialist', $3, $4, $5::text::jsonb, true, 1, now() + interval '60 days', 'Talent import', $6)`,
      [code, spaceId, addr.address, r.name.trim().slice(0, 120), JSON.stringify(prefill), me.id]);
    if (send) await sendInvite(addr.address, r.name.trim(), `${process.env.APP_URL ?? ""}/join/${code}`, me.id);
    made++;
  }
  await audit(me, "import.talent", `space:${spaceId}`, { made, skipped, sent: send });
  revalidatePath("/admin/invites");
  return { ok: true, made, skipped };
}

// ---------------------------------------------------------------- members ----

/** Nobody acts on themselves or the owner; only the owner acts on admins; moderators never act on other staff. */
async function targetCheck(me: { id: number; staff: string | null }, id: number) {
  const target = await one<{ staff_role: string | null }>(`select staff_role from members where id = $1`, [id]);
  if (!target || id === me.id || target.staff_role === "owner") return false;
  if (target.staff_role && me.staff !== "owner" && !(me.staff === "admin" && target.staff_role === "moderator")) return false;
  return true;
}

export async function memberStatusAction(id: number, status: "active" | "suspended" | "banned", reason: string | null) {
  const me = await requireStaff(status === "banned" ? "admin" : "moderator");
  if (!(await targetCheck(me, id))) return false;
  await setStatus(me, Number(id), status, reason);
  revalidatePath(`/admin/members/${id}`);
  return true;
}

export async function muteAction(id: number, hours: number | null, reason: string | null) {
  const me = await requireStaff("moderator");
  if (!(await targetCheck(me, id))) return false;
  await muteMember(me, Number(id), hours ? Math.min(24 * 30, Math.max(1, Math.round(hours))) : null, reason);
  revalidatePath(`/admin/members/${id}`);
  return true;
}

export async function spaceMembershipAction(id: number, spaceId: number, add: boolean) {
  const me = await requireStaff("moderator");
  if (!canModerate(me, spaceId)) return false;
  if (add) { await addToSpace(null, Number(id), Number(spaceId)); await audit(me, "member.add_to_space", `member:${id}`, { space: spaceId }); }
  else await removeFromSpace(me, Number(id), Number(spaceId));
  revalidatePath(`/admin/members/${id}`);
  return true;
}

export async function staffRoleAction(id: number, role: "owner" | "admin" | "moderator" | null): Promise<string | null> {
  const me = await requireStaff("admin");
  const err = await setStaffRole(me, Number(id), role);
  revalidatePath(`/admin/members/${id}`);
  return err;
}

export async function verifyAction(id: number, title: string | null) {
  const me = await requireStaff("admin");
  await setVerified(me, Number(id), title ? String(title).slice(0, 60) : null);
  revalidatePath(`/admin/members/${id}`);
}

export async function memberDetailsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff("admin");
  const t = makeT(me.locale);
  const id = Number(fd.get("id"));
  const emailRaw = str(fd, "email", 160), phoneRaw = str(fd, "phone", 30);
  const email = emailRaw ? readAddress(emailRaw) : null;
  const phone = phoneRaw ? readAddress(phoneRaw) : null;
  if (emailRaw && email?.channel !== "email") return { fields: { email: t("That email doesn't look right.") } };
  if (phoneRaw && phone?.channel !== "whatsapp") return { fields: { phone: t("Write a mobile number with its country code, like +971 50 123 4567.") } };
  const kind = ["specialist", "parent", "team", "guest"].includes(str(fd, "kind")) ? str(fd, "kind") : null;
  try {
    await query(`update members set email = $2, phone = $3, kind = coalesce($4, kind), talent_ref = $5 where id = $1`, [id, email?.address ?? null, phone?.address ?? null, kind, str(fd, "talent_ref", 20).replace(/^#/, "") || null]);
  } catch {
    return { error: t("Another member already uses that email or number.") };
  }
  await audit(me, "member.details", `member:${id}`, { kind });
  revalidatePath(`/admin/members/${id}`);
  return { ok: t("Saved.") };
}

// ------------------------------------------------------- spaces, channels ----

export async function saveSpace(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff("admin");
  const t = makeT(me.locale);
  const id = Number(fd.get("id")) || null;
  const name = str(fd, "name", 80);
  if (name.length < 2) return { fields: { name: t("Give the space a name.") } };
  const country = COUNTRY[str(fd, "country")] ? str(fd, "country") : "AE";
  const audience = ["specialists", "families", "mixed"].includes(str(fd, "audience")) ? str(fd, "audience") : "mixed";
  const policy = ["invite", "request", "open"].includes(str(fd, "join_policy")) ? str(fd, "join_policy") : "request";
  const questions = str(fd, "questions", 2000).split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 8)
    .map((l, i) => ({ id: `q${i + 1}`, label: l.replace(/\*$/, "").trim(), required: l.endsWith("*") }));
  const vals = [name, str(fd, "name_ar", 80) || null, audience, country, tzFor(country), str(fd, "description", 400) || null, str(fd, "description_ar", 400) || null, policy,
    JSON.stringify(questions), str(fd, "rules", 3000) || null, str(fd, "rules_ar", 3000) || null, fd.get("filter_contacts") === "1", fd.get("enabled") === "1"];
  if (id) {
    await query(`update spaces set name = $2, name_ar = $3, audience = $4, country = $5, tz = $6, description = $7, description_ar = $8, join_policy = $9, questions = $10::text::jsonb,
                 rules = $11, rules_ar = $12, filter_contacts = $13, enabled = $14 where id = $1`, [id, ...vals]);
    await audit(me, "space.update", `space:${id}`);
    revalidatePath(`/admin/spaces/${id}`);
    return { ok: t("Saved.") };
  }
  const slug = slugify(str(fd, "slug", 60) || name);
  try {
    const row = await one<{ id: number }>(`insert into spaces (name, name_ar, audience, country, tz, description, description_ar, join_policy, questions, rules, rules_ar, filter_contacts, enabled, slug, position)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::text::jsonb, $10, $11, $12, $13, $14, (select coalesce(max(position), 0) + 1 from spaces)) returning id`, [...vals, slug]);
    await addToSpace(null, me.id, row!.id);
    await audit(me, "space.create", `space:${row!.id}`, { name });
    redirect(`/admin/spaces/${row!.id}`);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    return { fields: { slug: t("That web address is taken. Choose another.") } };
  }
}

export async function saveChannel(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff("admin");
  const t = makeT(me.locale);
  const id = Number(fd.get("id")) || null;
  const spaceId = Number(fd.get("space_id"));
  const name = str(fd, "name", 60);
  if (name.length < 2) return { fields: { name: t("Give the channel a name.") } };
  const type = (id ? (await one<{ type: ChannelType }>(`select type from channels where id = $1`, [id]))?.type : str(fd, "type")) as ChannelType;
  if (!["chat", "announcement", "forum", "opportunities", "feed", "events", "library"].includes(type)) return { fields: { type: t("Choose what kind of channel.") } };
  const perms: Partial<Record<PermAudience, Perms>> = {};
  const d = defaultPerms(type);
  for (const aud of ["specialist", "parent", "guest"] as PermAudience[]) {
    // The form always sends the grid (perms_form): an unticked box is a "no".
    perms[aud] = Object.fromEntries((["view", "post", "reply", "react", "upload"] as const).map((k) => [k, fd.get("perms_form") === "1" ? fd.get(`perm_${aud}_${k}`) === "1" : d[aud][k]])) as Perms;
  }
  const from = str(fd, "hours_from", 5), to = str(fd, "hours_to", 5);
  const days = fd.getAll("hours_days").map(Number).filter((n) => n >= 0 && n <= 6);
  const hours = fd.get("hours_on") === "1" && /^\d{2}:\d{2}$/.test(from) && /^\d{2}:\d{2}$/.test(to) ? { from, to, days } : null;
  const tags = { city: fd.getAll("tag_city").map(String).filter(Boolean), diagnosis: fd.getAll("tag_diagnosis").map(String).filter(Boolean), language: fd.getAll("tag_language").map(String).filter(Boolean) };
  const approval = ["none", "new", "all"].includes(str(fd, "approval")) ? str(fd, "approval") : "none";
  const visibility = ["open", "private", "hidden"].includes(str(fd, "visibility")) ? str(fd, "visibility") : "open";
  const vals = [name, str(fd, "name_ar", 60) || null, str(fd, "topic", 300) || null, str(fd, "topic_ar", 300) || null, visibility, fd.get("auto_join") === "1",
    JSON.stringify(tags), JSON.stringify(perms), hours ? JSON.stringify(hours) : null, Math.max(0, Math.min(3600, Number(fd.get("slow_mode")) || 0)),
    fd.get("locked") === "1", fd.get("announce_only") === "1", approval, fd.get("allow_anonymous") === "1", fd.get("child_photos") === "1", fd.get("case_talk") === "1"];
  if (id) {
    await query(`update channels set name = $2, name_ar = $3, topic = $4, topic_ar = $5, visibility = $6, auto_join = $7, tags = $8::text::jsonb, perms = $9::text::jsonb,
                 posting_hours = $10::text::jsonb, slow_mode = $11, locked = $12, announce_only = $13, approval = $14, allow_anonymous = $15, child_photos = $16, case_talk = $17 where id = $1`, [id, ...vals]);
    await audit(me, "channel.update", `channel:${id}`, { visibility, approval, locked: vals[10], hours });
    revalidatePath(`/admin/channels/${id}`);
    return { ok: t("Saved.") };
  }
  const slug = slugify(str(fd, "slug", 60) || name);
  let newId: number;
  try {
    newId = await transaction(async (tx) => {
      const row = await tx.one<{ id: number }>(`insert into channels (space_id, type, name, name_ar, topic, topic_ar, visibility, auto_join, tags, perms, posting_hours, slow_mode, locked, announce_only, approval, allow_anonymous, child_photos, case_talk, slug, position)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::text::jsonb, $10::text::jsonb, $11::text::jsonb, $12, $13, $14, $15, $16, $17, $18, $19, (select coalesce(max(position), 0) + 1 from channels where space_id = $1)) returning id`,
        [spaceId, type, ...vals, slug]);
      const cid = Number(row!.id);
      if (vals[5] && visibility === "open") await tx.query(`insert into channel_members (channel_id, member_id, notify) select $1, member_id, $3 from space_members where space_id = $2 on conflict do nothing`, [cid, spaceId, defaultNotify(type)]);
      await tx.query(`insert into channel_members (channel_id, member_id, notify) values ($1, $2, 'all') on conflict do nothing`, [cid, me.id]);
      return cid;
    });
  } catch {
    return { fields: { slug: t("That web address is taken in this space. Choose another.") } };
  }
  await audit(me, "channel.create", `channel:${newId}`, { name, type });
  redirect(`/admin/channels/${newId}?created=1`);
}

export async function archiveChannel(id: number, archived: boolean) {
  const me = await requireStaff("admin");
  await query(`update channels set archived_at = case when $2 then now() end where id = $1`, [id, archived]);
  await audit(me, archived ? "channel.archive" : "channel.unarchive", `channel:${id}`);
  revalidatePath(`/admin/channels/${id}`);
}

export async function quickChannelToggle(id: number, field: "locked" | "announce_only", on: boolean) {
  const me = await requireStaff("moderator");
  const ch = await one<{ space_id: number }>(`select space_id from channels where id = $1`, [id]);
  if (!ch || !canModerate(me, ch.space_id)) return false;
  await query(`update channels set ${field === "locked" ? "locked" : "announce_only"} = $2 where id = $1`, [id, on]);
  await audit(me, `channel.${field}`, `channel:${id}`, { on });
  revalidatePath(`/admin/channels/${id}`);
  return true;
}

export async function channelMemberAction(channelId: number, memberId: number, add: boolean) {
  const me = await requireStaff("moderator");
  const ch = await one<{ space_id: number; type: ChannelType }>(`select space_id, type from channels where id = $1`, [channelId]);
  if (!ch || !canModerate(me, ch.space_id)) return false;
  if (add) {
    const inSpace = await one(`select 1 from space_members where space_id = $1 and member_id = $2`, [ch.space_id, memberId]);
    if (!inSpace) return false;
    await query(`insert into channel_members (channel_id, member_id, notify) values ($1, $2, $3) on conflict do nothing`, [channelId, memberId, defaultNotify(ch.type)]);
  } else await query(`delete from channel_members where channel_id = $1 and member_id = $2`, [channelId, memberId]);
  await audit(me, add ? "channel.add_member" : "channel.remove_member", `channel:${channelId}`, { member: memberId });
  revalidatePath(`/admin/channels/${channelId}`);
  return true;
}

// ------------------------------------------------------------- moderation ----

export async function reportDecision(reportId: number, removeIt: boolean, reason: string | null) {
  const me = await requireStaff("moderator");
  const r = await one<{ post_id: number }>(`select post_id from reports where id = $1`, [reportId]);
  if (!r) return;
  if (removeIt) await removePost(me, Number(r.post_id), reason, makeT(me.locale));
  else {
    await query(`update reports set status = 'dismissed', handled_by = $2, handled_at = now() where post_id = $1 and status = 'open'`, [r.post_id, me.id]);
    await audit(me, "report.dismiss", `post:${r.post_id}`);
  }
  revalidatePath("/admin/moderation");
}

export async function clearFlag(postId: number) {
  const me = await requireStaff("moderator");
  await query(`update posts set flagged = null where id = $1`, [postId]);
  await audit(me, "post.clear_flag", `post:${postId}`);
  revalidatePath("/admin/moderation");
}

export async function addWord(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff("admin");
  const t = makeT(me.locale);
  const word = str(fd, "word", 60);
  const action = ["hold", "block", "caution"].includes(str(fd, "action")) ? str(fd, "action") : "hold";
  if (!word) return { fields: { word: t("Write a word or phrase.") } };
  await query(`insert into blocked_words (word, action, created_by) values ($1, $2, $3) on conflict (lower(word)) do update set action = excluded.action`, [word, action, me.id]);
  await audit(me, "words.add", null, { word, action });
  revalidatePath("/admin/words");
  return { ok: t("Added.") };
}

export async function removeWord(id: number) {
  const me = await requireStaff("admin");
  const w = await one<{ word: string }>(`delete from blocked_words where id = $1 returning word`, [id]);
  await audit(me, "words.remove", null, { word: w?.word });
  revalidatePath("/admin/words");
}

// ------------------------------------------------------------- broadcasts ----

function readSegment(fd: FormData): Segment {
  return {
    spaces: fd.getAll("spaces").map(Number).filter((n) => n > 0), kinds: fd.getAll("kinds").map(String), cities: fd.getAll("cities").map(String),
    roles: fd.getAll("roles").map(String), languages: fd.getAll("languages").map(String), openToWork: fd.get("open_to_work") === "1",
  };
}

export async function segmentCount(fd: FormData): Promise<number> {
  await requireStaff("admin");
  return countSegment(readSegment(fd));
}

export async function sendBroadcastAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff("admin");
  const t = makeT(me.locale);
  const title = str(fd, "title", 140), body = str(fd, "body", 4000);
  const fields: Record<string, string> = {};
  if (title.length < 3) fields.title = t("Write a short title.");
  if (body.length < 3) fields.body = t("Write the message.");
  const seg = readSegment(fd);
  if (Object.keys(fields).length) return { fields };
  if (!(await countSegment(seg))) return { error: t("Nobody matches those choices.") };
  const at = str(fd, "scheduled_for", 20);
  const when = at && !Number.isNaN(Date.parse(at)) && Date.parse(at) > Date.now() + 60_000 ? new Date(at).toISOString() : null;
  const id = await createBroadcast(me, { title, body, segment: seg, via: { email: fd.get("via_email") === "1", whatsapp: fd.get("via_whatsapp") === "1" }, urgent: fd.get("urgent") === "1", scheduledFor: when, postId: null });
  redirect(`/admin/broadcasts/${id}`);
}

// ------------------------------------------------------- help, scheduled ----

export async function helpStatus(id: number, status: "done" | "new") {
  const me = await requireStaff("moderator");
  await query(`update help_requests set status = $2, handled_by = $3 where id = $1`, [id, status, me.id]);
  await audit(me, `help.${status}`, `help:${id}`);
  revalidatePath("/admin/help");
}

export async function helpToCrm(id: number) {
  const me = await requireStaff("moderator");
  const r = await sendHelpToCrm(Number(id));
  await audit(me, "help.crm", `help:${id}`, { ok: r.ok });
  revalidatePath("/admin/help");
  return r;
}

export async function scheduledAction(id: number, now: boolean) {
  const me = await requireStaff("moderator");
  if (now) {
    const p = await one<{ id: number }>(`update posts set status = 'published', publish_at = null, created_at = now() where id = $1 and status = 'scheduled' returning id`, [id]);
    if (p) await fanOut(Number(p.id));
  } else await query(`update posts set status = 'removed', removed_by = $2 where id = $1 and status = 'scheduled'`, [id, me.id]);
  await audit(me, now ? "scheduled.publish_now" : "scheduled.cancel", `post:${id}`);
  revalidatePath("/admin/scheduled");
}

export async function cancelBroadcast(id: number) {
  const me = await requireStaff("admin");
  await query(`delete from broadcasts where id = $1 and sent_at is null`, [id]);
  await audit(me, "broadcast.cancel", `broadcast:${id}`);
  revalidatePath("/admin/scheduled");
}

// --------------------------------------------------------------- settings ----

export async function saveSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireStaff("admin");
  const t = makeT(me.locale);
  const n = (k: string, min: number, max: number, dflt: number) => { const v = Number(fd.get(k)); return Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : dflt; };
  const patch: Partial<Settings> = {
    name: str(fd, "name", 80) || DEFAULT_SETTINGS.name,
    dmCross: (["off", "approval", "open"].includes(str(fd, "dmCross")) ? str(fd, "dmCross") : "off") as Settings["dmCross"],
    dmParents: fd.get("dmParents") === "1", dmSpecialists: fd.get("dmSpecialists") === "1", filterCrossDm: fd.get("filterCrossDm") === "1",
    interested: str(fd, "interested") === "everyone" ? "everyone" : "admins",
    requireStaff2fa: fd.get("requireStaff2fa") === "1",
    newMemberDays: n("newMemberDays", 1, 90, 7), importantEmailHours: n("importantEmailHours", 1, 72, 4), nudgeHours: n("nudgeHours", 1, 48, 2), digestHour: n("digestHour", 0, 23, 18),
    defaultCountry: COUNTRY[str(fd, "defaultCountry")] ? str(fd, "defaultCountry") : "AE",
  };
  if (patch.requireStaff2fa && !me.totpOn) return { error: t("Turn on two-step sign-in for your own account first (My account → Sign-in and security), so you aren't locked out.") };
  await saveSettings(patch, me.id);
  await audit(me, "settings.save", null, patch as Record<string, unknown>);
  revalidatePath("/admin/settings");
  return { ok: t("Saved.") };
}
