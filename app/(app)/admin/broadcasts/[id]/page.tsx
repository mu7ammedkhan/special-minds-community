import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { fmtDateTime, pct } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { Body } from "@/components/post/body";
import { Avatar, Card, CardHeader, PageHeader, Stat, StatStrip } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Broadcast" };

export default async function BroadcastDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireStaff("admin");
  const id = Number((await params).id);
  const { t, locale } = await getT();
  const b = Number.isFinite(id) ? await one<{ title: string; body: string; recipients: number; sent_at: string | null; scheduled_for: string | null }>(`select title, body, recipients, sent_at, scheduled_for from broadcasts where id = $1`, [id]) : null;
  if (!b) notFound();
  const people = await query<{ id: number; name: string; avatar: number | null; seen_at: string | null }>(
    `select m.id, m.full_name as name, m.avatar_file_id as avatar, r.seen_at from broadcast_recipients r join members m on m.id = r.member_id where r.broadcast_id = $1 order by r.seen_at nulls first, m.full_name limit 500`, [id]);
  const seen = people.filter((p) => p.seen_at).length;
  const sent = (await query<{ channel: string; status: string; n: number }>(`select channel, status, count(*)::int as n from outbox where purpose = 'broadcast' and created_at between coalesce($1::timestamptz, now()) - interval '1 minute' and coalesce($1::timestamptz, now()) + interval '30 minutes' group by channel, status`, [b.sent_at]));
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader back={{ href: "/admin/broadcasts", label: t("Broadcasts") }} title={b.title} subtitle={b.sent_at ? fmtDateTime(b.sent_at, locale) : t("Scheduled for {when}", { when: fmtDateTime(b.scheduled_for, locale) })} />
      <StatStrip>
        <Stat label={t("Recipients")} value={b.recipients} />
        <Stat label={t("Seen")} value={`${pct(seen, b.recipients)}%`} sub={t("Seen by {a} of {b}", { a: seen, b: b.recipients })} />
        <Stat label={t("Emails")} value={sent.filter((s) => s.channel === "email").reduce((a, s) => a + s.n, 0)} />
        <Stat label="WhatsApp" value={sent.filter((s) => s.channel === "whatsapp").reduce((a, s) => a + s.n, 0)} />
      </StatStrip>
      <Card className="p-5"><Body text={b.body} mentions={{}} meId={me.id} className="text-base text-ink" /></Card>
      <Card>
        <CardHeader title={t("Who hasn't seen it yet")} subtitle={t("{n} people", { n: people.length - seen })} />
        <ul className="flex flex-wrap gap-2 border-t border-hairline p-5">
          {people.filter((p) => !p.seen_at).map((p) => <li key={p.id} className="inline-flex items-center gap-2 rounded-full border border-hairline px-3 py-1 text-sm"><Avatar name={p.name} photoId={p.avatar} size={22} />{p.name}</li>)}
          {seen === people.length && <li className="text-sm text-soft">{t("Everyone has seen it.")}</li>}
        </ul>
      </Card>
    </div>
  );
}
