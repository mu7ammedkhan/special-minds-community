import "server-only";
import { one, query } from "./db";
import { makeT, type Locale } from "./i18n";
import { notify, flushPushes } from "./notify";
import { sendEmail, sendWhatsApp } from "./outbox";
import { clockNow } from "./format";
import { tzFor } from "./options";
import { fanOut, later } from "./posts";
import { sendBroadcast } from "./broadcasts";
import { getSettings } from "./settings";

/**
 * Work that happens on its own: scheduled posts and broadcasts going out,
 * event reminders (a day and an hour before), WhatsApp nudges for unopened
 * opportunities, emails for important things still unread, digests, and
 * pop-ups. It runs at most every 20 seconds, whenever anyone has the
 * community open (each check-in asks), and from /api/cron/tick when a
 * scheduler calls it (CRON_SECRET).
 */

export function tickSoon() { later(() => tick()); }

export async function tick(force = false): Promise<Record<string, number> | null> {
  const claim = await one(`update job_runs set ran_at = now() where key = 'tick' and (ran_at < now() - interval '20 seconds' or $1::boolean) returning key`, [force]);
  if (!claim) return null;
  const out: Record<string, number> = {};
  const step = async (name: string, fn: () => Promise<number>) => { try { out[name] = await fn(); } catch (e) { console.error(`job ${name} failed`, e); } };
  await step("scheduled", publishScheduled);
  await step("broadcasts", scheduledBroadcasts);
  await step("reminders", eventReminders);
  await step("nudges", opportunityNudges);
  await step("emails", importantEmails);
  await step("digests", digests);
  await step("pushes", flushPushes);
  await step("files", looseFiles);
  return out;
}

/** Files uploaded but never posted (or kept as a profile photo) go after a day, so they can't fill the database. */
async function looseFiles() {
  const gone = await query<{ id: number }>(
    `delete from files f where f.created_at < now() - interval '1 day'
        and not exists (select 1 from post_files pf where pf.file_id = f.id)
        and not exists (select 1 from members m where m.avatar_file_id = f.id)
      returning f.id`);
  return gone.length;
}

async function publishScheduled() {
  const due = await query<{ id: number }>(`update posts set status = 'published', created_at = now(), publish_at = null where status = 'scheduled' and publish_at <= now() returning id`);
  for (const p of due) await fanOut(Number(p.id));
  return due.length;
}

async function scheduledBroadcasts() {
  const due = await query<{ id: number }>(`select id from broadcasts where sent_at is null and scheduled_for <= now() limit 20`);
  for (const b of due) await sendBroadcast(Number(b.id));
  return due.length;
}

async function eventReminders() {
  const link = `'/s/' || s.slug || '/' || c.slug || '/' || p.id`;
  const day = await query<{ post_id: number; member_id: number; title: string; link: string }>(
    `update rsvps r set reminded_day = true from posts p join channels c on c.id = p.channel_id join spaces s on s.id = c.space_id
      where p.id = r.post_id and r.answer in ('going', 'maybe') and not r.reminded_day and p.status = 'published'
        and (p.data->>'startsAt')::timestamptz between now() + interval '1 hour' and now() + interval '24 hours'
      returning r.post_id, r.member_id, p.title, ${link} as link`);
  const hour = await query<{ post_id: number; member_id: number; title: string; link: string }>(
    `update rsvps r set reminded_hour = true, reminded_day = true from posts p join channels c on c.id = p.channel_id join spaces s on s.id = c.space_id
      where p.id = r.post_id and r.answer = 'going' and not r.reminded_hour and p.status = 'published'
        and (p.data->>'startsAt')::timestamptz between now() and now() + interval '1 hour'
      returning r.post_id, r.member_id, p.title, ${link} as link`);
  for (const r of day) await notify(null, [Number(r.member_id)], { kind: "reminder", title: (t) => t("Tomorrow: {title}", { title: r.title }), link: r.link, postId: r.post_id });
  for (const r of hour) await notify(null, [Number(r.member_id)], { kind: "reminder", title: (t) => t("Starting within the hour: {title}", { title: r.title }), link: r.link, postId: r.post_id, urgent: true });
  return day.length + hour.length;
}

async function opportunityNudges() {
  const s = await getSettings();
  const due = await query<{ post_id: number; member_id: number; phone: string; locale: Locale; name: string; title: string; link: string }>(
    `select t.post_id, t.member_id, m.phone, m.locale, coalesce(nullif(m.display_name, ''), m.full_name) as name, coalesce(p.title, '') as title,
            '/s/' || sp.slug || '/' || c.slug || '/' || p.id as link
       from opportunity_targets t join posts p on p.id = t.post_id join channels c on c.id = p.channel_id join spaces sp on sp.id = c.space_id join members m on m.id = t.member_id
      where t.nudged_at is null and t.alerted_at < now() - make_interval(hours => $1::int) and coalesce((p.data->>'nudge')::boolean, false)
        and coalesce(p.data->>'status', 'open') = 'open' and p.status = 'published' and m.status = 'active' and m.phone is not null
        and coalesce((m.prefs->>'whatsapp')::boolean, false)
        and not exists (select 1 from post_views v where v.post_id = t.post_id and v.member_id = t.member_id)
        and not exists (select 1 from responses r where r.post_id = t.post_id and r.member_id = t.member_id)
      limit 100`, [s.nudgeHours]);
  const app = process.env.APP_URL ?? "";
  for (const d of due) {
    const t = makeT(d.locale);
    await sendWhatsApp({ to: d.phone, template: "opportunity", params: [d.name, d.title, `${app}${d.link}`], purpose: "opportunity_nudge", memberId: d.member_id, lang: d.locale,
      text: t("Hi {name}, a new opportunity fits you: {title}. Tap to see it and say if you're interested: {link}", { name: d.name, title: d.title, link: `${app}${d.link}` }) });
    await query(`update opportunity_targets set nudged_at = now() where post_id = $1 and member_id = $2`, [d.post_id, d.member_id]);
  }
  return due.length;
}

async function importantEmails() {
  const s = await getSettings();
  const due = await query<{ id: number; member_id: number; title: string; body: string | null; link: string | null; email: string; locale: Locale }>(
    `select n.id, n.member_id, n.title, n.body, n.link, m.email, m.locale from notifications n join members m on m.id = n.member_id
      where n.important and n.read_at is null and n.emailed_at is null and n.kind <> 'broadcast'
        and n.created_at < now() - make_interval(hours => $1::int) and n.created_at > now() - interval '7 days'
        and m.email is not null and m.status = 'active' and coalesce((m.prefs->>'emailImportant')::boolean, true)
      limit 100`, [s.importantEmailHours]);
  const app = process.env.APP_URL ?? "";
  for (const n of due) {
    const t = makeT(n.locale);
    await sendEmail({ to: n.email, subject: n.title, purpose: "unread_important", memberId: n.member_id,
      text: `${n.title}\n${n.body ?? ""}\n\n${t("Open it in the Special Minds Community:")} ${app}${n.link ?? "/notifications"}\n\n${t("You get this email because it's still unread. Change this in My account → Notifications.")}` });
    await query(`update notifications set emailed_at = now() where id = $1`, [n.id]);
  }
  return due.length;
}

async function digests() {
  const s = await getSettings();
  const people = await query<{ id: number; email: string; locale: Locale; country: string | null; digest: "daily" | "weekly"; last: string | null }>(
    `select id, email, locale, country, prefs->>'digest' as digest, last_digest_at as last from members
      where status = 'active' and email is not null and prefs->>'digest' in ('daily', 'weekly')
        and (last_digest_at is null or last_digest_at < now() - case when prefs->>'digest' = 'weekly' then interval '6 days 12 hours' else interval '20 hours' end)
      limit 200`);
  let sent = 0;
  const app = process.env.APP_URL ?? "";
  for (const p of people) {
    if (clockNow(tzFor(p.country)).hour < s.digestHour) continue;
    if (p.digest === "weekly" && clockNow(tzFor(p.country)).weekday !== 0) continue;
    await query(`update members set last_digest_at = now() where id = $1`, [p.id]);
    const notes = await query<{ title: string; body: string | null }>(
      `select title, body from notifications where member_id = $1 and read_at is null and created_at > now() - make_interval(days => $2::int) order by important desc, created_at desc limit 10`,
      [p.id, p.digest === "weekly" ? 7 : 1]);
    if (!notes.length) continue;
    const t = makeT(p.locale);
    await sendEmail({ to: p.email, purpose: "digest", memberId: p.id,
      subject: p.digest === "weekly" ? t("Your week in the Special Minds Community") : t("Today in the Special Minds Community"),
      text: `${notes.map((n) => `• ${n.title}${n.body ? `\n  ${n.body}` : ""}`).join("\n")}\n\n${t("Open the community:")} ${app}/notifications` });
    sent++;
  }
  return sent;
}
