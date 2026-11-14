import Link from "next/link";
import { Plus } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { query } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { Badge, buttonClass, Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Broadcasts" };

export default async function BroadcastsPage() {
  await requireStaff("admin");
  const { t, locale } = await getT();
  const rows = await query<{ id: number; title: string; recipients: number; seen: number; sent_at: string | null; scheduled_for: string | null; urgent: boolean; via: { email?: boolean; whatsapp?: boolean } }>(
    `select b.id, b.title, b.recipients, b.sent_at, b.scheduled_for, b.urgent, b.via, (select count(*) from broadcast_recipients r where r.broadcast_id = b.id and r.seen_at is not null)::int as seen from broadcasts b order by coalesce(b.sent_at, b.scheduled_for, b.created_at) desc limit 100`);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <PageHeader title={t("Broadcasts")} subtitle={t("One message to a chosen group: in the bell, as a pop-up, and by email or WhatsApp if you choose.")} actions={<Link href="/admin/broadcasts/new" className={buttonClass("primary", "sm")}><Plus className="size-4" />{t("New broadcast")}</Link>} />
      {rows.length ? (
        <Card>
          <ul className="divide-y divide-hairline">
            {rows.map((b) => (
              <li key={b.id}>
                <Link href={`/admin/broadcasts/${b.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-paper">
                  <span className="min-w-0 flex-1"><span className="block font-semibold text-ink" dir="auto">{b.title}</span><span className="text-sm text-soft">{b.sent_at ? fmtDateTime(b.sent_at, locale) : t("Scheduled for {when}", { when: fmtDateTime(b.scheduled_for, locale) })}</span></span>
                  {b.urgent && <Badge tone="bad">{t("Urgent")}</Badge>}
                  {b.via?.email && <Badge>{t("Email")}</Badge>}{b.via?.whatsapp && <Badge>WhatsApp</Badge>}
                  {b.sent_at ? <span className="num text-sm font-semibold text-ink">{t("Seen by {a} of {b}", { a: b.seen, b: b.recipients })}</span> : <Badge tone="info">{t("Scheduled")}</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : <Empty title={t("No broadcasts yet")} action={<Link href="/admin/broadcasts/new" className={buttonClass("primary")}>{t("New broadcast")}</Link>} />}
    </div>
  );
}
