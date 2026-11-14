import { AuthShell } from "@/components/auth-shell";
import { JoinForm } from "@/components/join-form";
import { LoginForm } from "@/components/login-form";
import { getMe } from "@/lib/auth";
import { pick } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { joinDefaults } from "@/lib/join-page";
import { inviteByCode } from "@/lib/members";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join" };

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { t, locale } = await getT();
  const { invite, problem } = await inviteByCode(code);
  const me = await getMe();
  const here = `/join/${code}`;
  if (!invite || problem) {
    return (
      <AuthShell locale={locale} back={here}>
        <h1 className="font-display text-2xl text-ink">{t("This invite can't be used")}</h1>
        <p className="mt-2 text-base text-soft">{t(problem ?? "This invite link isn't right. Check you copied all of it.")}</p>
        <a href="/login" className="mt-6 inline-block font-semibold text-brand">{t("Go to sign in")}</a>
      </AuthShell>
    );
  }
  const spaceName = pick(locale, invite.space_name, invite.space_name_ar);
  if (!me) {
    return (
      <AuthShell locale={locale} back={here}>
        <p className="text-sm font-semibold text-champagne-soft"><span className="rounded-full bg-brand-50 px-3 py-1 text-brand">{t("You're invited")}</span></p>
        <h1 className="mt-3 font-display text-2xl text-ink">{t("Join {space}", { space: spaceName })}</h1>
        <p className="mt-1.5 text-base text-soft">{invite.for_name ? t("Hello {name}. First, confirm your email or mobile number.", { name: invite.for_name }) : t("First, confirm your email or mobile number.")}</p>
        <div className="mt-6"><LoginForm next={here} /></div>
      </AuthShell>
    );
  }
  if (me.spaces.includes(invite.space_id)) {
    return (
      <AuthShell locale={locale} back={here}>
        <h1 className="font-display text-2xl text-ink">{t("You're already in {space}", { space: spaceName })}</h1>
        <a href={`/s/${invite.space_slug}`} className="mt-6 inline-block font-semibold text-brand">{t("Open it")}</a>
      </AuthShell>
    );
  }
  return (
    <AuthShell locale={locale} back={here} wide>
      <h1 className="font-display text-2xl text-ink">{t("Join {space}", { space: spaceName })}</h1>
      <p className="mb-6 mt-1.5 text-base text-soft">{t("Tell us a little about yourself. This takes a minute.")}</p>
      <JoinForm code={code} kind={invite.kind} chooseKind={false} defaults={await joinDefaults(me, invite.prefill, invite.for_name)} questions={invite.questions ?? []}
        rules={invite.rules} rulesAr={invite.rules_ar} cta={invite.auto_approve ? t("Join now") : t("Send my request")} />
    </AuthShell>
  );
}
