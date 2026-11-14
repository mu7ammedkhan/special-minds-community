import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { MfaForm } from "@/components/mfa-form";
import { getMe } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!me.totpOn || me.mfaOk) redirect("/");
  const { t, locale } = await getT();
  const sp = await searchParams;
  return (
    <AuthShell locale={locale} back="/mfa">
      <h1 className="font-display text-2xl text-ink">{t("Two-step sign-in")}</h1>
      <p className="mt-1.5 text-base text-soft">{t("Open your authenticator app and type the 6-digit code for the Special Minds Community.")}</p>
      <div className="mt-6"><MfaForm next={sp.next ?? "/"} /></div>
    </AuthShell>
  );
}
