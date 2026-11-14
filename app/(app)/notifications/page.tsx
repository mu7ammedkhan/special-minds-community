import { Bell } from "lucide-react";
import { requireMe } from "@/lib/auth";
import { query } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { NOTE_ICON } from "@/components/icons";
import { MarkAllRead } from "@/components/mark-all-read";
import { cx, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const me = await requireMe();
  const { t, locale } = await getT();
  const rows = await query<{ id: number; kind: string; title: string; body: string | null; read_at: string | null; created_at: string }>(
    `select id, kind, title, body, read_at, created_at from notifications where member_id = $1 order by created_at desc limit 150`, [me.id]);
  const unread = rows.filter((r) => !r.read_at).length;
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <PageHeader title={t("Notifications")} subtitle={unread ? t("{n} new", { n: unread }) : t("You're all caught up.")} actions={unread ? <MarkAllRead /> : null} />
      {rows.length ? (
        <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface shadow-card">
          {rows.map((n) => {
            const Icon = NOTE_ICON[n.kind] ?? Bell;
            return (
              <li key={n.id}>
                <a href={`/n/${n.id}`} className={cx("flex gap-3 px-4 py-3 hover:bg-paper", !n.read_at && "bg-brand-50/50")}>
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-paper-deep"><Icon className="size-4 text-brand" /></span>
                  <span className="min-w-0 flex-1">
                    <span className={cx("block text-sm", n.read_at ? "text-ink-soft" : "font-semibold text-ink")} dir="auto">{n.title}</span>
                    {n.body && <span className="block truncate text-sm text-soft" dir="auto">{n.body}</span>}
                    <span className="block text-xs text-faint">{timeAgo(n.created_at, locale)}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : <Empty title={t("No notifications yet")} body={t("Mentions, replies, opportunities and announcements will show here.")} />}
    </div>
  );
}
