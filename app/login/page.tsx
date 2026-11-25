import { redirect } from "next/navigation";
import { LogIn } from "lucide-react";
import { demoSignIn } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
import { Avatar } from "@/components/ui";
import { demoLoginsEnabled, DEMO_DOMAIN, getPendingMe, safeNext } from "@/lib/auth";
import { query } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { KIND_LABEL, STAFF_LABEL, type Kind, type StaffRole } from "@/lib/options";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; link?: string; deleted?: string; mfa?: string }> }) {
  const sp = await searchParams;
  const me = await getPendingMe();
  if (me && me.totpOn && !me.mfaOk) redirect(`/mfa?next=${encodeURIComponent(safeNext(sp.next))}`);
  if (me) redirect(safeNext(sp.next));
  const { t, locale } = await getT();
  const demo = demoLoginsEnabled()
    ? await query<{ id: number; full_name: string; email: string; kind: Kind; staff_role: StaffRole | null; status: string; city: string | null }>(
        `select id, full_name, email, kind, staff_role, status, city from members where email like '%' || $1 and status in ('active', 'pending') and profile_done
          order by case staff_role when 'owner' then 0 when 'admin' then 1 when 'moderator' then 2 else 3 end, case kind when 'specialist' then 0 when 'parent' then 1 else 2 end, id limit 40`, [DEMO_DOMAIN])
    : [];
  return (
    <AuthShell locale={locale} back="/login">
      <h1 className="font-display text-2xl text-ink">{t("Welcome to the Special Minds Community")}</h1>
      <p className="mt-1.5 text-base text-soft">{t("Specialists and families, together. Sign in or join with your email or mobile number.")}</p>
      {sp.link && <p role="alert" className="mt-4 rounded-xl bg-apricot-50 px-4 py-3 text-sm text-caution">{t("That sign-in link has expired or was already used. Sign in with your email or mobile number instead.")}</p>}
      {sp.deleted && <p role="status" className="mt-4 rounded-xl bg-moss-50 px-4 py-3 text-sm text-moss">{t("Your account has been deleted.")}</p>}
      {sp.mfa && <p role="alert" className="mt-4 rounded-xl bg-apricot-50 px-4 py-3 text-sm text-caution">{t("Too many wrong authenticator codes, so you were signed out. Sign in again with a new code.")}</p>}
      <div className="mt-6"><LoginForm next={sp.next ?? "/"} /></div>
      <p className="mt-5 text-center text-sm text-soft">{t("New here?")} <a href="/join" className="font-semibold text-brand hover:text-brand-deep">{t("Ask to join")}</a></p>
      {demo.length > 0 && (
        <details className="mt-6 rounded-2xl border border-hairline bg-paper px-4 py-3" open>
          <summary className="cursor-pointer text-sm font-semibold text-ink">{t("Preview: sign in as a made-up member")}</summary>
          <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto pe-1 scroll-thin">
            {demo.map((d) => (
              <li key={d.id}>
                <form action={demoSignIn}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="next" value={sp.next ?? "/"} />
                  <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start hover:bg-surface">
                    <Avatar name={d.full_name} size={34} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-sm font-semibold text-ink">{d.full_name}</span>
                      <span className="block truncate text-xs text-soft">{d.staff_role ? t(STAFF_LABEL[d.staff_role]) : t(KIND_LABEL[d.kind])}{d.city ? ` · ${t(d.city)}` : ""}{d.status === "pending" ? ` · ${t("waiting to join")}` : ""}</span>
                    </span>
                    <LogIn className="size-4 shrink-0 text-soft rtl:-scale-x-100" aria-hidden />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </AuthShell>
  );
}
