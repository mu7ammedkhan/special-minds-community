import { notFound } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { JoinForm } from "@/components/join-form";
import { LoginForm } from "@/components/login-form";
import { getMe } from "@/lib/auth";
import { one } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { joinDefaults } from "@/lib/join-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ask to join" };

export default async function RequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t, locale } = await getT();
  const s = await one<{ id: number; slug: string; name: string; name_ar: string | null; description: string | null; description_ar: string | null; audience: string; join_policy: string; questions: []; rules: string | null; rules_ar: string | null }>(
    `select id, slug, name, name_ar, description, description_ar, audience, join_policy, questions, rules, rules_ar from spaces where slug = $1 and enabled and join_policy <> 'invite'`, [slug]);
  if (!s) notFound();
  const me = await getMe();
  const here = `/join/space/${slug}`;
  const name = pick(locale, s.name, s.name_ar);
  const about = pick(locale, s.description ?? "", s.description_ar);
  if (!me) {
    return (
      <AuthShell locale={locale} back={here}>
        <h1 className="font-display text-2xl text-ink">{t("Join {space}", { space: name })}</h1>
        {about && <p className="mt-1.5 text-base text-soft">{about}</p>}
        <p className="mt-4 text-sm font-semibold text-ink">{t("First, confirm your email or mobile number.")}</p>
        <div className="mt-3"><LoginForm next={here} /></div>
      </AuthShell>
    );
  }
  if (me.spaces.includes(s.id)) {
    return (
      <AuthShell locale={locale} back={here}>
        <h1 className="font-display text-2xl text-ink">{t("You're already in {space}", { space: name })}</h1>
        <a href={`/s/${s.slug}`} className="mt-6 inline-block font-semibold text-brand">{t("Open it")}</a>
      </AuthShell>
    );
  }
  return (
    <AuthShell locale={locale} back={here} wide>
      <h1 className="font-display text-2xl text-ink">{t("Join {space}", { space: name })}</h1>
      <p className="mb-6 mt-1.5 text-base text-soft">{s.join_policy === "open" ? t("Tell us a little about yourself. This takes a minute.") : t("Tell us a little about yourself. A Special Minds admin checks every request, usually within a day.")}</p>
      <JoinForm space={s.slug} kind={s.audience === "specialists" ? "specialist" : "parent"} chooseKind={s.audience === "mixed"} defaults={await joinDefaults(me)}
        questions={s.questions ?? []} rules={s.rules} rulesAr={s.rules_ar} cta={s.join_policy === "open" ? t("Join now") : t("Send my request")} />
    </AuthShell>
  );
}
