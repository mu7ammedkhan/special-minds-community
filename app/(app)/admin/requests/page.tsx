import Link from "next/link";
import { isAdmin, requireStaff } from "@/lib/auth";
import { query } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { pick } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { KIND_LABEL, roleLabel, type Kind } from "@/lib/options";
import { RequestButtons, StatusPill } from "@/components/admin";
import { Avatar, Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join requests" };

export default async function RequestsPage() {
  const me = await requireStaff("moderator");
  const { t, locale } = await getT();
  const mine = isAdmin(me) ? null : me.spaces;
  const rows = await query<{ id: number; status: string; created_at: string; answers: Record<string, string>; note: string | null; member_id: number; full_name: string; display_name: string | null; kind: Kind; city: string | null; email: string | null; phone: string | null; roles: string[]; bio: string | null; space: string; space_ar: string | null; questions: { id: string; label: string; label_ar?: string }[] }>(
    `select j.id, j.status, j.created_at, j.answers, j.note, m.id as member_id, m.full_name, m.display_name, m.kind, m.city, m.email, m.phone, m.roles, m.bio, s.name as space, s.name_ar as space_ar, s.questions
       from join_requests j join members m on m.id = j.member_id join spaces s on s.id = j.space_id
      where ($1::int[] is null or j.space_id = any($1::int[])) and (j.status = 'pending' or j.decided_at > now() - interval '14 days')
      order by (j.status = 'pending') desc, j.created_at desc limit 100`, [mine]);
  const pending = rows.filter((r) => r.status === "pending");
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <PageHeader title={t("Join requests")} subtitle={pending.length ? t("{n} waiting", { n: pending.length }) : t("Nobody is waiting.")} />
      {!rows.length && <Empty title={t("No requests")} body={t("People who ask to join a space appear here.")} />}
      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.id} className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row">
              <Avatar name={r.full_name} size={48} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="flex flex-wrap items-center gap-2"><Link href={`/admin/members/${r.member_id}`} className="font-semibold text-ink hover:underline">{r.full_name}</Link>{r.display_name && <span className="text-soft">({r.display_name})</span>}<StatusPill status={r.status === "pending" ? "pending" : r.status === "approved" ? "active" : "banned"} /></p>
                <p className="text-sm text-soft">{t(KIND_LABEL[r.kind])} · {pick(locale, r.space, r.space_ar)} · {r.city ? t(r.city) : ""} · {timeAgo(r.created_at, locale)}</p>
                <p className="text-sm text-ink-soft" dir="ltr">{[r.email, r.phone].filter(Boolean).join(" · ")}</p>
                {r.roles.length > 0 && <p className="text-sm text-ink-soft">{r.roles.map((x) => t(roleLabel(x))).join(", ")}</p>}
                {r.bio && <p className="text-sm text-ink" dir="auto">“{r.bio}”</p>}
                {(r.questions ?? []).filter((q) => r.answers?.[q.id]).map((q) => <p key={q.id} className="text-sm"><span className="text-soft">{pick(locale, q.label, q.label_ar)}:</span> <span className="text-ink" dir="auto">{r.answers[q.id]}</span></p>)}
                {r.note && <p className="text-sm text-danger">{r.note}</p>}
              </div>
              {r.status === "pending" && <div className="shrink-0"><RequestButtons id={r.id} /></div>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
