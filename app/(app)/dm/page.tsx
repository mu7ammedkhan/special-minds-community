import Link from "next/link";
import { Clock, Plus } from "lucide-react";
import { requireMe } from "@/lib/auth";
import { query } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { snippet } from "@/lib/text";
import { Avatar, buttonClass, cx, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Messages" };

export default async function DmList() {
  const me = await requireMe();
  const { t, locale } = await getT();
  const rows = await query<{ id: number; status: string; is_group: boolean; names: string; last_body: string | null; last_at: string | null; unread: number }>(
    `select d.id, d.status, d.is_group,
            coalesce((select string_agg(coalesce(nullif(m.display_name, ''), m.full_name), ', ' order by m.id) from dm_members x join members m on m.id = x.member_id where x.dm_id = d.id and x.member_id <> $1), '') as names,
            (select body from posts p where p.dm_id = d.id and p.status in ('published', 'pending') order by p.created_at desc limit 1) as last_body,
            coalesce(d.last_post_at, d.created_at) as last_at,
            (select count(*) from posts p where p.dm_id = d.id and p.status = 'published' and p.created_at > dm.last_read_at and p.author_id <> $1)::int as unread
       from dms d join dm_members dm on dm.dm_id = d.id and dm.member_id = $1 where d.status <> 'declined'
      order by coalesce(d.last_post_at, d.created_at) desc limit 100`, [me.id]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <PageHeader title={t("Messages")} subtitle={t("Private conversations with other members.")} actions={<Link href="/dm/new" className={buttonClass("primary", "sm")}><Plus className="size-4" />{t("New message")}</Link>} />
      {rows.length ? (
        <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface shadow-card">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/dm/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper">
                <Avatar name={r.names || "?"} size={44} />
                <span className="min-w-0 flex-1">
                  <span className={cx("block truncate", r.unread ? "font-bold text-ink" : "font-semibold text-ink")}>{r.names || t("Conversation")}</span>
                  <span className="block truncate text-sm text-soft" dir="auto">{r.status === "pending" ? <span className="inline-flex items-center gap-1 text-caution"><Clock className="size-3.5" />{t("Waiting for a Special Minds admin to approve")}</span> : snippet(r.last_body ?? "", {}, 90)}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs text-faint">{timeAgo(r.last_at, locale)}</span>
                  {r.unread > 0 && <span className="rounded-full bg-danger px-2 text-xs font-bold leading-5 text-white">{r.unread}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <Empty title={t("No messages yet")} body={t("Start a conversation with someone in your spaces.")} action={<Link href="/dm/new" className={buttonClass("primary")}>{t("New message")}</Link>} />}
    </div>
  );
}
