import Link from "next/link";
import { isAdmin, requireStaff } from "@/lib/auth";
import { query } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { KIND_LABEL, STAFF_LABEL, type Kind, type StaffRole } from "@/lib/options";
import { StatusPill } from "@/components/admin";
import { Avatar, Badge, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Members" };

export default async function MembersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireStaff("moderator");
  const { t, locale } = await getT();
  const sp = await searchParams;
  const spaces = await query<{ id: number; name: string }>(`select id, name from spaces order by position, id`);
  const mine = isAdmin(me) ? null : me.spaces;
  const rows = await query<{ id: number; full_name: string; display_name: string | null; kind: Kind; staff_role: StaffRole | null; status: string; city: string | null; avatar_file_id: number | null; verified_title: string | null; last_seen_at: string | null; muted: boolean; spaces: string }>(
    `select m.id, m.full_name, m.display_name, m.kind, m.staff_role, m.status, m.city, m.avatar_file_id, m.verified_title, m.last_seen_at, coalesce(m.muted_until > now(), false) as muted,
            coalesce((select string_agg(s.name, ', ' order by s.position) from space_members sm join spaces s on s.id = sm.space_id where sm.member_id = m.id), '') as spaces
       from members m
      where m.status <> 'deleted' and m.profile_done
        and ($1 = '' or m.full_name ilike '%' || $1 || '%' or m.display_name ilike '%' || $1 || '%' or m.email ilike '%' || $1 || '%' or m.phone like '%' || $1 || '%')
        and ($2 = '' or m.kind = $2) and ($3 = '' or m.status = $3)
        and ($4::int is null or exists (select 1 from space_members sm where sm.member_id = m.id and sm.space_id = $4::int))
        and ($5::int[] is null or exists (select 1 from space_members sm where sm.member_id = m.id and sm.space_id = any($5::int[])) or m.status = 'pending')
        and ($6 = '' or m.staff_role is not null)
      order by m.full_name limit 300`,
    [sp.q ?? "", sp.kind ?? "", sp.status ?? "", sp.space ? Number(sp.space) : null, mine, sp.staff ?? ""]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader title={t("Members")} subtitle={t("{n} shown", { n: rows.length })} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder={t("Name, email or number")} className="input !min-h-10 !w-64 !py-1.5" />
        <select name="space" defaultValue={sp.space ?? ""} className="input !min-h-10 !w-auto !py-1.5"><option value="">{t("Every space")}</option>{spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select name="kind" defaultValue={sp.kind ?? ""} className="input !min-h-10 !w-auto !py-1.5"><option value="">{t("Everyone")}</option>{(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{t(KIND_LABEL[k])}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""} className="input !min-h-10 !w-auto !py-1.5"><option value="">{t("Any status")}</option>{["active", "pending", "suspended", "banned"].map((s) => <option key={s} value={s}>{t(s === "active" ? "Active" : s === "pending" ? "Waiting" : s === "suspended" ? "Suspended" : "Banned")}</option>)}</select>
        <label className="pill relative"><input type="checkbox" name="staff" value="1" defaultChecked={Boolean(sp.staff)} />{t("Staff only")}</label>
        <button className="rounded-full bg-brand px-4 text-sm font-semibold text-white">{t("Filter")}</button>
      </form>
      <div className="table-scroll rounded-2xl border border-hairline bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-paper text-xs text-soft"><tr>{[t("Name"), t("Kind"), t("Spaces"), t("City"), t("Last seen"), t("Status")].map((h) => <th key={h} className="px-4 py-2.5 text-start font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((m) => (
              <tr key={m.id} className="hover:bg-paper">
                <td className="px-4 py-2.5"><Link href={`/admin/members/${m.id}`} className="flex items-center gap-2.5 font-semibold text-ink hover:underline"><Avatar name={m.full_name} photoId={m.avatar_file_id} size={30} />{m.full_name}{m.display_name && m.display_name !== m.full_name && <span className="font-normal text-soft">({m.display_name})</span>}</Link></td>
                <td className="px-4 py-2.5">{m.staff_role ? <Badge tone="brand">{t(STAFF_LABEL[m.staff_role])}</Badge> : t(KIND_LABEL[m.kind])}{m.verified_title && <span className="ms-1 text-moss">✓</span>}</td>
                <td className="px-4 py-2.5 text-soft">{m.spaces || "—"}</td>
                <td className="px-4 py-2.5">{m.city ? t(m.city) : ""}</td>
                <td className="px-4 py-2.5 text-soft">{m.last_seen_at ? timeAgo(m.last_seen_at, locale) : t("never")}</td>
                <td className="px-4 py-2.5"><StatusPill status={m.status} />{m.muted && <Badge tone="warn" className="ms-1">{t("Paused")}</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
