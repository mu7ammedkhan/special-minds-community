import { requireStaff } from "@/lib/auth";
import { query } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff("admin");
  const { t, locale } = await getT();
  const q = (await searchParams).q ?? "";
  const rows = await query<{ id: number; actor_name: string | null; action: string; target: string | null; detail: Record<string, unknown>; ip: string | null; created_at: string }>(
    `select id, actor_name, action, target, detail, ip, created_at from audit_log where ($1 = '' or action ilike '%' || $1 || '%' or actor_name ilike '%' || $1 || '%' or target ilike '%' || $1 || '%') order by created_at desc limit 300`, [q]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader title={t("Audit log")} subtitle={t("Who did what, and when: sign-ins, removals, bans, settings, exports.")} />
      <form className="mb-4"><input name="q" defaultValue={q} placeholder={t("Filter by action, person or target")} className="input !min-h-10 !w-80 !py-1.5" /></form>
      <div className="table-scroll rounded-2xl border border-hairline bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-paper text-xs text-soft"><tr>{[t("When"), t("Who"), t("What"), t("On"), t("Details")].map((h) => <th key={h} className="px-4 py-2.5 text-start font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((r) => (
              <tr key={r.id}><td className="whitespace-nowrap px-4 py-2 text-soft">{fmtDateTime(r.created_at, locale)}</td><td className="px-4 py-2 font-semibold text-ink">{r.actor_name ?? t("System")}</td><td className="px-4 py-2">{r.action}</td><td className="px-4 py-2 text-soft">{r.target}</td>
                <td className="max-w-md truncate px-4 py-2 text-xs text-soft" dir="ltr">{Object.keys(r.detail ?? {}).length ? JSON.stringify(r.detail) : ""}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
