import { isAdmin, requireStaff } from "@/lib/auth";
import { query } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { snippet } from "@/lib/text";
import { CancelBroadcast, ScheduledButtons } from "@/components/admin";
import { Card, CardHeader, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scheduled posts" };

export default async function ScheduledPage() {
  const me = await requireStaff("moderator");
  const { t, locale } = await getT();
  const posts = await query<{ id: number; title: string | null; body: string; publish_at: string; author: string; channel: string }>(
    `select p.id, p.title, p.body, p.publish_at, a.full_name as author, c.name as channel from posts p join members a on a.id = p.author_id join channels c on c.id = p.channel_id
      where p.status = 'scheduled' and ($1::int[] is null or c.space_id = any($1::int[])) order by p.publish_at`, [isAdmin(me) ? null : me.spaces]);
  const casts = isAdmin(me) ? await query<{ id: number; title: string; scheduled_for: string }>(`select id, title, scheduled_for from broadcasts where sent_at is null order by scheduled_for`) : [];
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader title={t("Scheduled posts")} subtitle={t("Posts and broadcasts waiting for their time. They go out within a minute of it while anyone has the community open.")} />
      <Card>
        <CardHeader title={t("Posts")} />
        <ul className="divide-y divide-hairline border-t border-hairline">
          {posts.map((p) => <li key={p.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1 text-sm"><p className="font-semibold text-ink">{fmtDateTime(p.publish_at, locale)} · #{p.channel}</p><p className="truncate text-ink-soft" dir="auto">{p.title ? `${p.title}: ` : ""}{snippet(p.body)}</p><p className="text-xs text-soft">{p.author}</p></div><ScheduledButtons id={p.id} /></li>)}
          {!posts.length && <li className="px-5 py-4 text-sm text-soft">{t("Nothing scheduled.")}</li>}
        </ul>
      </Card>
      {isAdmin(me) && (
        <Card>
          <CardHeader title={t("Broadcasts")} />
          <ul className="divide-y divide-hairline border-t border-hairline">
            {casts.map((b) => <li key={b.id} className="flex items-center gap-3 px-5 py-3 text-sm"><span className="flex-1"><span className="font-semibold text-ink">{fmtDateTime(b.scheduled_for, locale)}</span> · {b.title}</span><CancelBroadcast id={b.id} /></li>)}
            {!casts.length && <li className="px-5 py-4 text-sm text-soft">{t("Nothing scheduled.")}</li>}
          </ul>
        </Card>
      )}
    </div>
  );
}
