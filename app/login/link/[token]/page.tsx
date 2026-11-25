import { redirect } from "next/navigation";
import { signInWithLink } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { Avatar, Button } from "@/components/ui";
import { hashToken, LINK_TOKEN } from "@/lib/auth";
import { one } from "@/lib/db";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

/**
 * A one-time sign-in link (`node scripts/db.mjs owner-link`). Opening it only
 * shows this page: the link is used when the person presses Continue. WhatsApp,
 * Slack, iMessage and mail scanners open links to draw a preview, and would
 * otherwise use the link up before the person ever taps it.
 */
export default async function SignInLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!LINK_TOKEN.test(token)) redirect("/login?link=bad");
  const m = await one<{ full_name: string }>(
    `select m.full_name from login_links l join members m on m.id = l.member_id
      where l.id = $1 and l.used_at is null and l.expires_at > now() and m.status in ('active', 'pending')`, [hashToken(token)]);
  if (!m) redirect("/login?link=used");
  const { t, locale } = await getT();
  return (
    <AuthShell locale={locale} back={`/login/link/${token}`}>
      <div className="flex flex-col items-center text-center">
        <Avatar name={m.full_name} size={56} />
        <h1 className="mt-4 font-display text-2xl text-ink">{t("Sign in as {name}", { name: m.full_name })}</h1>
        <p className="mt-1.5 text-base text-soft">{t("This link works once. Press Continue to sign in to the Special Minds Community.")}</p>
      </div>
      <form action={signInWithLink} className="mt-6">
        <input type="hidden" name="token" value={token} />
        <Button type="submit" className="w-full">{t("Continue")}</Button>
      </form>
      <p className="mt-5 text-center text-sm text-soft">{t("Not you?")} <a href="/login" className="font-semibold text-brand hover:text-brand-deep">{t("Sign in another way")}</a></p>
    </AuthShell>
  );
}
