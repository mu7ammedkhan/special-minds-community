import { redirect } from "next/navigation";
import { ArrowRight, Clock, XCircle } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { requireMe } from "@/lib/auth";
import { query } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { pick } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome" };

/** For people signed in but not in any space yet: their requests, and the spaces they can ask to join. */
export default async function WelcomePage() {
  const me = await requireMe({ allowPending: true });
  if (me.status === "active" && me.profileDone && me.spaces.length) redirect("/");
  const { t, locale } = await getT();
  const requests = await query<{ id: number; status: string; created_at: string; note: string | null; name: string; name_ar: string | null }>(
    `select j.id, j.status, j.created_at, j.note, s.name, s.name_ar from join_requests j join spaces s on s.id = j.space_id where j.member_id = $1 order by j.created_at desc limit 5`, [me.id]);
  const open = await query<{ slug: string; name: string; name_ar: string | null }>(
    `select slug, name, name_ar from spaces s where enabled and join_policy <> 'invite' and not exists (select 1 from space_members sm where sm.space_id = s.id and sm.member_id = $1)
       and not exists (select 1 from join_requests j where j.space_id = s.id and j.member_id = $1 and j.status = 'pending') order by position`, [me.id]);
  const waiting = requests.filter((r) => r.status === "pending");
  return (
    <AuthShell locale={locale} back="/welcome">
      <h1 className="font-display text-2xl text-ink">{me.profileDone ? t("Hello, {name}", { name: me.name }) : t("Welcome")}</h1>
      {waiting.length > 0 ? (
        <div className="mt-4 flex gap-3 rounded-2xl bg-apricot-50 px-4 py-4 text-sm text-caution">
          <Clock className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">{t("Your request is with Special Minds")}</p>
            {waiting.map((r) => <p key={r.id}>{pick(locale, r.name, r.name_ar)} · {t("sent {date}", { date: fmtDate(r.created_at, locale) })}</p>)}
            <p className="mt-1">{t("We'll let you know as soon as it's approved, usually within a day.")}</p>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 text-base text-soft">{t("You're not in a space yet. Choose one to ask to join.")}</p>
      )}
      {requests.filter((r) => r.status === "declined").slice(0, 1).map((r) => (
        <div key={r.id} className="mt-4 flex gap-3 rounded-2xl bg-danger-50 px-4 py-3 text-sm text-danger">
          <XCircle className="mt-0.5 size-5 shrink-0" />
          <div><p className="font-semibold">{t("A request wasn't approved: {space}", { space: pick(locale, r.name, r.name_ar) })}</p>{r.note && <p>{r.note}</p>}</div>
        </div>
      ))}
      {open.length > 0 && (
        <ul className="mt-5 grid gap-2">
          {open.map((s) => (
            <li key={s.slug}>
              <a href={`/join/space/${s.slug}`} className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 font-semibold text-ink hover:border-brand hover:bg-brand-50/40">
                {t("Ask to join {space}", { space: pick(locale, s.name, s.name_ar) })}<ArrowRight className="size-5 text-soft rtl:-scale-x-100" />
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-sm text-soft">{t("Specialists join with the invite link Special Minds sends them.")}</p>
      <form action={signOut} className="mt-4"><button className="text-sm font-semibold text-brand">{t("Sign out")}</button></form>
    </AuthShell>
  );
}
