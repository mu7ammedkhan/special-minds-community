import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { query } from "@/lib/db";
import { fmtDateTime, maskContact } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { deliveryReady } from "@/lib/outbox";
import { StatusPill } from "@/components/admin";
import { Alert, cx, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Delivery log" };

export default async function OutboxPage({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  await requireStaff("admin");
  const { t, locale } = await getT();
  const ch = (await searchParams).channel ?? "";
  const rows = await query<{ id: number; channel: string; to_address: string; subject: string | null; body: string; purpose: string; status: string; error: string | null; created_at: string }>(
    `select id, channel, to_address, subject, body, purpose, status, error, created_at from outbox where ($1 = '' or channel = $1) order by created_at desc limit 200`, [ch]);
  const ready = deliveryReady();
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
      <PageHeader title={t("Delivery log")} subtitle={t("Every email and WhatsApp message the community sends: sign-in codes (the code itself is never kept), invites, digests, nudges, broadcasts.")} />
      {(!ready.email || !ready.whatsapp) && <Alert tone="info" title={t(!ready.email && !ready.whatsapp ? "Email and WhatsApp aren't connected yet" : !ready.email ? "Email isn't connected yet" : "WhatsApp isn't connected yet")}>{t("Without the email and WhatsApp keys, messages are only written here as “Simulated”, so you can see exactly what would be sent.")}</Alert>}
      <nav className="flex gap-1">{[["", t("All")], ["email", t("Email")], ["whatsapp", "WhatsApp"]].map(([k, l]) => <Link key={k} href={`/admin/outbox${k ? `?channel=${k}` : ""}`} className={cx("rounded-full px-4 py-1.5 text-sm font-semibold", ch === k ? "bg-brand text-white" : "text-ink-soft hover:bg-brand-50")}>{l}</Link>)}</nav>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-2xl border border-hairline bg-surface px-4 py-3 text-sm shadow-card">
            <p className="flex flex-wrap items-center gap-2"><StatusPill status={r.status} /><span className="font-semibold text-ink">{r.channel === "email" ? t("Email") : "WhatsApp"}</span><span className="text-soft" dir="ltr">{maskContact(r.to_address)}</span><span className="text-soft">· {r.purpose} · {fmtDateTime(r.created_at, locale)}</span></p>
            {r.subject && <p className="mt-1 font-semibold text-ink" dir="auto">{r.subject}</p>}
            <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-ink-soft" dir="auto">{r.body}</p>
            {r.error && <p className="mt-1 text-danger">{r.error}</p>}
          </li>
        ))}
        {!rows.length && <li className="text-sm text-soft">{t("Nothing sent yet.")}</li>}
      </ul>
    </div>
  );
}
