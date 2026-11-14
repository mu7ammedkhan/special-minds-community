import Link from "next/link";
import { isAdmin, requireStaff } from "@/lib/auth";
import { query } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { HOLD_REASON, REPORT_LABEL } from "@/lib/options";
import { snippet } from "@/lib/text";
import { DmDecision, FlagButton, QueueButtons, ReportButtons } from "@/components/admin";
import { Badge, Card, Empty, PageHeader, Tabs } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Moderation" };

/** Everything waiting for a moderator: held and waiting posts, reports, flagged case talk, and message requests. */
export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireStaff("moderator");
  const { t, locale } = await getT();
  const tab = ["reports", "flagged", "dms"].includes((await searchParams).tab ?? "") ? (await searchParams).tab! : "waiting";
  const mine = isAdmin(me) ? null : me.spaces;
  const waiting = await query<{ id: number; title: string | null; body: string; status: string; hold_reason: string | null; created_at: string; author: string; author_id: number; channel: string | null; ch_slug: string | null; space_slug: string | null; dm_id: number | null }>(
    `select p.id, p.title, p.body, p.status, p.hold_reason, p.created_at, a.full_name as author, a.id as author_id, c.name as channel, c.slug as ch_slug, s.slug as space_slug, p.dm_id
       from posts p join members a on a.id = p.author_id left join channels c on c.id = p.channel_id left join spaces s on s.id = c.space_id
      where p.status in ('pending', 'held') and coalesce(p.hold_reason, '') <> 'dm_request' and ($1::int[] is null or c.space_id = any($1::int[]) or p.dm_id is not null)
      order by p.created_at limit 100`, [mine]);
  const reports = await query<{ id: number; post_id: number; reason: string; note: string | null; created_at: string; reporter: string | null; body: string; title: string | null; author: string; channel: string | null; count: number }>(
    `select distinct on (r.post_id) r.id, r.post_id, r.reason, r.note, r.created_at, rp.full_name as reporter, p.body, p.title, a.full_name as author, c.name as channel,
            (select count(*) from reports x where x.post_id = r.post_id and x.status = 'open')::int as count
       from reports r join posts p on p.id = r.post_id join members a on a.id = p.author_id left join members rp on rp.id = r.reporter_id left join channels c on c.id = p.channel_id
      where r.status = 'open' and ($1::int[] is null or c.space_id = any($1::int[])) order by r.post_id, r.created_at limit 100`, [mine]);
  const flagged = await query<{ id: number; body: string; title: string | null; flagged: string; created_at: string; author: string; channel: string; ch_slug: string; space_slug: string }>(
    `select p.id, p.body, p.title, p.flagged, p.created_at, a.full_name as author, c.name as channel, c.slug as ch_slug, s.slug as space_slug
       from posts p join members a on a.id = p.author_id join channels c on c.id = p.channel_id join spaces s on s.id = c.space_id
      where p.flagged is not null and p.status = 'published' and ($1::int[] is null or c.space_id = any($1::int[])) order by p.created_at desc limit 100`, [mine]);
  const dms = await query<{ id: number; created_at: string; from_name: string; to_names: string; body: string | null }>(
    `select d.id, d.created_at, a.full_name as from_name,
            (select string_agg(m.full_name, ', ') from dm_members x join members m on m.id = x.member_id where x.dm_id = d.id and x.member_id <> d.created_by) as to_names,
            (select body from posts p where p.dm_id = d.id order by p.created_at limit 1) as body
       from dms d join members a on a.id = d.created_by where d.status = 'pending' order by d.created_at limit 100`);
  const items = [
    { href: "/admin/moderation", label: t("Waiting"), active: tab === "waiting", count: waiting.length, warn: true },
    { href: "/admin/moderation?tab=reports", label: t("Reports"), active: tab === "reports", count: reports.length, warn: true },
    { href: "/admin/moderation?tab=flagged", label: t("Flagged"), active: tab === "flagged", count: flagged.length },
    { href: "/admin/moderation?tab=dms", label: t("Message requests"), active: tab === "dms", count: dms.length, warn: true },
  ];
  const where = (p: { channel: string | null; dm_id?: number | null }) => (p.dm_id ? t("Private message") : `#${p.channel}`);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <PageHeader title={t("Moderation")} subtitle={t("Approve, reject or remove. Authors are told when a post is removed, with your reason.")} />
      <Tabs items={items} />
      {tab === "waiting" && (waiting.length ? <div className="space-y-3">{waiting.map((p) => (
        <Card key={p.id} className="p-4">
          <p className="flex flex-wrap items-center gap-2 text-sm"><Link href={`/admin/members/${p.author_id}`} className="font-semibold text-ink hover:underline">{p.author}</Link><span className="text-soft">{where(p)} · {timeAgo(p.created_at, locale)}</span><Badge tone="warn">{t(HOLD_REASON[p.hold_reason ?? ""] ?? (p.status === "pending" ? "Waiting for approval" : "Held for review"))}</Badge></p>
          {p.title && <p className="mt-1 font-semibold text-ink" dir="auto">{p.title}</p>}
          <p className="msg-body mt-1 text-sm text-ink" dir="auto">{snippet(p.body, {}, 600)}</p>
          <div className="mt-3"><QueueButtons postId={p.id} dm={Boolean(p.dm_id)} /></div>
        </Card>
      ))}</div> : <Empty title={t("Nothing waiting")} body={t("Held and waiting posts appear here.")} />)}
      {tab === "reports" && (reports.length ? <div className="space-y-3">{reports.map((r) => (
        <Card key={r.id} className="p-4">
          <p className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold text-ink">{r.author}</span><span className="text-soft">#{r.channel} · {timeAgo(r.created_at, locale)}</span><Badge tone="bad">{t(REPORT_LABEL[r.reason] ?? r.reason)}</Badge>{r.count > 1 && <Badge tone="bad">{t("{n} reports", { n: r.count })}</Badge>}</p>
          <p className="msg-body mt-1 text-sm text-ink" dir="auto">{r.title ? `${r.title}: ` : ""}{snippet(r.body, {}, 600)}</p>
          {r.note && <p className="mt-1 text-sm text-soft">“{r.note}”{r.reporter ? ` · ${r.reporter}` : ""}</p>}
          <div className="mt-3"><ReportButtons reportId={r.id} /></div>
        </Card>
      ))}</div> : <Empty title={t("No reports")} body={t("When members report a post, it appears here.")} />)}
      {tab === "flagged" && (flagged.length ? <div className="space-y-3">{flagged.map((p) => (
        <Card key={p.id} className="p-4">
          <p className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold text-ink">{p.author}</span><span className="text-soft">#{p.channel} · {timeAgo(p.created_at, locale)}</span><Badge tone="warn">{t("Mentions: {words}", { words: p.flagged })}</Badge></p>
          <p className="msg-body mt-1 text-sm text-ink" dir="auto">{snippet(p.body, {}, 600)}</p>
          <div className="mt-3 flex flex-wrap gap-2"><FlagButton postId={p.id} /><Link href={`/s/${p.space_slug}/${p.ch_slug}?post=${p.id}`} className="text-sm font-semibold text-brand">{t("Open it")}</Link></div>
        </Card>
      ))}</div> : <Empty title={t("Nothing flagged")} body={t("Posts in case discussions that mention a word on the caution list appear here, already published.")} />)}
      {tab === "dms" && (dms.length ? <div className="space-y-3">{dms.map((d) => (
        <Card key={d.id} className="p-4">
          <p className="text-sm"><span className="font-semibold text-ink">{d.from_name}</span> <span className="text-soft">→ {d.to_names} · {timeAgo(d.created_at, locale)}</span></p>
          <p className="msg-body mt-1 text-sm text-ink" dir="auto">{d.body}</p>
          <div className="mt-3"><DmDecision id={d.id} /></div>
        </Card>
      ))}</div> : <Empty title={t("No message requests")} body={t("When parents and specialists may only message after approval (Settings), their requests wait here.")} />)}
    </div>
  );
}
