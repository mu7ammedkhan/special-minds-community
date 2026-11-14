import Link from "next/link";
import { Download } from "lucide-react";
import { isAdmin, requireStaff } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { buttonClass, Card, CardHeader, PageHeader, Stat, StatStrip } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

/** The numbers that matter, and the lists to download. */
export default async function AdminHome() {
  const me = await requireStaff("moderator");
  const { t, locale } = await getT();
  const n = await one<Record<string, number>>(`select
      (select count(*) from members where status = 'active')::int as members,
      (select count(*) from members where status = 'active' and kind = 'specialist')::int as specialists,
      (select count(*) from members where status = 'active' and kind = 'parent')::int as parents,
      (select count(*) from members where status = 'active' and last_seen_at > now() - interval '7 days')::int as active_week,
      (select count(*) from members where joined_at > now() - interval '7 days')::int as joined_week,
      (select count(*) from posts where status = 'published' and created_at > now() - interval '7 days')::int as posts_week,
      (select count(*) from posts where kind = 'opportunity' and status = 'published' and coalesce(data->>'status', 'open') = 'open')::int as open_opps,
      (select count(*) from responses where answer = 'interested' and created_at > now() - interval '30 days')::int as interested_month,
      (select count(*) from join_requests where status = 'pending')::int as requests,
      (select count(*) from posts where status in ('pending', 'held'))::int + (select count(*) from reports where status = 'open')::int as queue,
      (select count(*) from help_requests where status in ('new', 'failed'))::int as help,
      (select count(*) from posts where kind = 'event' and status = 'published' and (data->>'startsAt')::timestamptz > now())::int as events`);
  const opps = await query<{ id: number; title: string; matched: number; seen: number; interested: number; space: string; ch: string }>(
    `select p.id, coalesce(p.title, '') as title, s.slug as space, c.slug as ch,
            (select count(*) from opportunity_targets t where t.post_id = p.id)::int as matched,
            (select count(*) from opportunity_targets t where t.post_id = p.id and exists (select 1 from post_views v where v.post_id = p.id and v.member_id = t.member_id))::int as seen,
            (select count(*) from responses r where r.post_id = p.id and r.answer = 'interested')::int as interested
       from posts p join channels c on c.id = p.channel_id join spaces s on s.id = c.space_id
      where p.kind = 'opportunity' and p.status = 'published' order by p.created_at desc limit 6`);
  const activity = await query<{ actor_name: string | null; action: string; created_at: string }>(`select actor_name, action, created_at from audit_log order by created_at desc limit 8`);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader title={t("Admin")} subtitle={t("How the community is doing, and what needs you.")} />
      <StatStrip>
        <Stat label={t("Members")} value={n?.members ?? 0} sub={t("{a} specialists · {b} parents", { a: n?.specialists ?? 0, b: n?.parents ?? 0 })} href="/admin/members" />
        <Stat label={t("Active this week")} value={n?.active_week ?? 0} sub={t("{n} joined this week", { n: n?.joined_week ?? 0 })} />
        <Stat label={t("Posts this week")} value={n?.posts_week ?? 0} />
        <Stat label={t("Open opportunities")} value={n?.open_opps ?? 0} sub={t("{n} interested in 30 days", { n: n?.interested_month ?? 0 })} />
      </StatStrip>
      <StatStrip className="mt-3">
        <Stat label={t("Join requests")} value={n?.requests ?? 0} tone={n?.requests ? "warn" : undefined} href="/admin/requests" />
        <Stat label={t("Waiting for review")} value={n?.queue ?? 0} tone={n?.queue ? "warn" : undefined} href="/admin/moderation" />
        <Stat label={t("Help requests")} value={n?.help ?? 0} tone={n?.help ? "warn" : undefined} href="/admin/help" />
        <Stat label={t("Events coming up")} value={n?.events ?? 0} />
      </StatStrip>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("Latest opportunities")} />
          <ul className="divide-y divide-hairline border-t border-hairline">
            {opps.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Link href={`/s/${o.space}/${o.ch}/${o.id}`} className="min-w-0 flex-1 truncate font-semibold text-ink hover:underline">{o.title}</Link>
                <span className="num text-soft">{t("seen {a} of {b}", { a: o.seen, b: o.matched })}</span>
                <span className="num font-semibold text-moss">{t("{n} interested", { n: o.interested })}</span>
              </li>
            ))}
            {!opps.length && <li className="px-5 py-4 text-sm text-soft">{t("No opportunities yet.")}</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title={t("Recent staff activity")} action={isAdmin(me) ? <Link href="/admin/audit" className="text-sm font-semibold text-brand">{t("Audit log")}</Link> : null} />
          <ul className="divide-y divide-hairline border-t border-hairline">
            {activity.map((a, i) => <li key={i} className="flex gap-3 px-5 py-2.5 text-sm"><span className="flex-1 text-ink"><span className="font-semibold">{a.actor_name ?? t("System")}</span> · <span className="text-soft">{a.action}</span></span><span className="text-xs text-faint">{timeAgo(a.created_at, locale)}</span></li>)}
          </ul>
        </Card>
      </div>
      {isAdmin(me) && (
        <Card className="mt-5">
          <CardHeader title={t("Download as a spreadsheet")} subtitle={t("Every download is written in the audit log.")} />
          <div className="flex flex-wrap gap-2 border-t border-hairline px-5 py-4">
            {[["members", t("Members")], ["responses", t("Opportunity answers")], ["rsvps", t("Event RSVPs")], ["help", t("Help requests")]].map(([k, l]) => (
              <a key={k} href={`/api/export/${k}`} className={buttonClass("secondary", "sm")}><Download className="size-4" />{l}</a>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
