import { ArrowRight, Stethoscope, Users } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { query } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { countryName } from "@/lib/options";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join" };

export default async function JoinPage() {
  const { t, locale } = await getT();
  const spaces = await query<{ slug: string; name: string; name_ar: string | null; description: string | null; description_ar: string | null; audience: string; country: string; join_policy: string }>(
    `select slug, name, name_ar, description, description_ar, audience, country, join_policy from spaces where enabled and join_policy <> 'invite' order by position, id`);
  return (
    <AuthShell locale={locale} back="/join" wide>
      <h1 className="font-display text-2xl text-ink">{t("Join the Special Minds Community")}</h1>
      <p className="mt-1.5 text-base text-soft">{t("Choose the space that fits you. Specialists join by invitation from Special Minds.")}</p>
      <ul className="mt-6 grid gap-3">
        {spaces.map((s) => (
          <li key={s.slug}>
            <a href={`/join/space/${s.slug}`} className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-4 transition hover:border-brand hover:bg-brand-50/40">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand">{s.audience === "families" ? <Users className="size-6" /> : <Stethoscope className="size-6" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{pick(locale, s.name, s.name_ar)}</span>
                <span className="block text-sm text-soft">{pick(locale, s.description ?? "", s.description_ar) || t(countryName(s.country))}</span>
              </span>
              <ArrowRight className="size-5 shrink-0 text-soft rtl:-scale-x-100" />
            </a>
          </li>
        ))}
        {!spaces.length && <li className="text-soft">{t("No spaces are open for requests right now.")}</li>}
      </ul>
      <p className="mt-6 text-center text-sm text-soft">{t("Already a member?")} <a href="/login" className="font-semibold text-brand">{t("Sign in")}</a></p>
    </AuthShell>
  );
}
