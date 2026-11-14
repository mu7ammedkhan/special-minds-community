import Link from "next/link";
import { Download } from "lucide-react";
import { setLanguage } from "@/app/actions/auth";
import { DeleteAccount, ProfileForm, Sessions, TwoStep } from "@/components/account";
import { NotificationSettings } from "@/components/notification-settings";
import { Card, CardHeader, PageHeader, Tabs, buttonClass } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { maskContact } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { KIND_LABEL, STAFF_LABEL } from "@/lib/options";
import { deliveryReady } from "@/lib/outbox";
import { pushPublicKey } from "@/lib/push";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "My account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ tab?: string; setup?: string }> }) {
  const sp = await searchParams;
  const me = await requireMe();
  const { t, locale } = await getT();
  const tab = ["profile", "notifications", "security", "language", "privacy"].includes(sp.tab ?? "") ? sp.tab! : sp.setup ? "security" : "profile";
  const m = await one<{ full_name: string; display_name: string | null; city: string | null; country: string | null; languages: string[]; roles: string[]; skills: string[]; gender: string | null; bio: string | null; open_to_work: boolean; available_from: string | null; availability_note: string | null; avatar_file_id: number | null }>(
    `select full_name, display_name, city, country, languages, roles, skills, gender, bio, open_to_work, available_from, availability_note, avatar_file_id from members where id = $1`, [me.id]);
  const items = [
    { key: "profile", label: t("Profile") }, { key: "notifications", label: t("Notifications") }, { key: "security", label: t("Sign-in and security") },
    { key: "language", label: t("Language") }, { key: "privacy", label: t("Your data") },
  ].map((i) => ({ href: `/account?tab=${i.key}`, label: i.label, active: tab === i.key }));
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <PageHeader title={t("My account")} subtitle={`${me.fullName} · ${me.staff ? t(STAFF_LABEL[me.staff]) : t(KIND_LABEL[me.kind])}`} />
      <Tabs items={items} />
      {tab === "profile" && (
        <ProfileForm v={{
          fullName: m?.full_name ?? "", displayName: m?.display_name ?? "", city: m?.city ?? "", country: m?.country ?? "AE", languages: m?.languages ?? [], roles: m?.roles ?? [],
          skills: m?.skills ?? [], gender: m?.gender ?? "", bio: m?.bio ?? "", openToWork: m?.open_to_work ?? false, availableFrom: m?.available_from ?? "", availabilityNote: m?.availability_note ?? "",
          avatar: m?.avatar_file_id ?? null, kind: me.kind,
        }} />
      )}
      {tab === "notifications" && (
        <NotificationSettings pushKey={pushPublicKey()} sound={me.sound} hasEmail={Boolean(me.email)} hasPhone={Boolean(me.phone)} whatsappReady={deliveryReady().whatsapp}
          devices={(await query<{ id: number; device: string | null; created_at: string; last_sent_at: string | null; endpoint: string }>(`select id, device, created_at, last_sent_at, endpoint from push_subscriptions where member_id = $1 order by created_at desc`, [me.id]))
            .map((d) => ({ id: Number(d.id), device: d.device, created_at: d.created_at, last_sent_at: d.last_sent_at, tail: d.endpoint.slice(-24) }))}
          prefs={{ emailImportant: me.prefs.emailImportant !== false, digest: me.prefs.digest ?? "off", whatsapp: me.prefs.whatsapp === true, quiet: { on: me.prefs.quiet?.on ?? false, from: me.prefs.quiet?.from ?? "22:00", to: me.prefs.quiet?.to ?? "07:00" } }} />
      )}
      {tab === "security" && (
        <div className="space-y-5">
          <Card>
            <CardHeader title={t("How you sign in")} subtitle={t("With a one-time code sent to your email or phone. There's no password to remember.")} />
            <div className="grid gap-2 border-t border-hairline px-5 py-4 text-sm">
              <p><span className="text-soft">{t("Email")}:</span> <span dir="ltr">{me.email ? maskContact(me.email) : t("Not added")}</span></p>
              <p><span className="text-soft">{t("Mobile")}:</span> <span dir="ltr">{me.phone ? maskContact(me.phone) : t("Not added")}</span></p>
              <p className="text-xs text-soft">{t("To change these, ask a Special Minds admin.")}</p>
            </div>
          </Card>
          <TwoStep on={me.totpOn} staff={Boolean(me.staff)} required={(await getSettings()).requireStaff2fa && Boolean(me.staff)} />
          <Sessions />
        </div>
      )}
      {tab === "language" && (
        <Card>
          <CardHeader title={t("Language")} subtitle={t("The community's buttons and pages. Messages stay in the language they were written in.")} />
          <div className="flex gap-3 border-t border-hairline px-5 py-4">
            {(["en", "ar"] as const).map((l) => (
              <form key={l} action={setLanguage}>
                <input type="hidden" name="locale" value={l} /><input type="hidden" name="back" value="/account?tab=language" />
                <button className={buttonClass(locale === l ? "primary" : "secondary", "md")} lang={l}>{l === "en" ? "English" : "العربية"}</button>
              </form>
            ))}
          </div>
        </Card>
      )}
      {tab === "privacy" && (
        <div className="space-y-5">
          <Card>
            <CardHeader title={t("Download my data")} subtitle={t("Everything the community keeps about you: your profile, posts, reactions, answers and notifications, as one file.")} />
            <div className="border-t border-hairline px-5 py-4"><a href="/api/me/export" className={buttonClass("secondary", "sm")}><Download className="size-4" />{t("Download")}</a></div>
          </Card>
          <DeleteAccount />
          <p className="text-sm text-soft">{t("Questions about your data?")} <Link href="/help" className="font-semibold text-brand">{t("Contact Special Minds")}</Link></p>
        </div>
      )}
    </div>
  );
}
