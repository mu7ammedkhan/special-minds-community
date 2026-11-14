import { saveSettingsAction } from "@/app/actions/admin";
import { requireStaff } from "@/lib/auth";
import { crmReady } from "@/lib/crm";
import { getT } from "@/lib/i18n/server";
import { talentReady } from "@/lib/opportunities";
import { COUNTRIES } from "@/lib/options";
import { deliveryReady } from "@/lib/outbox";
import { pushReady } from "@/lib/push";
import { getSettings } from "@/lib/settings";
import { ActionForm, Choices, Field, Select, Submit, Toggle } from "@/components/form";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireStaff("admin");
  const { t } = await getT();
  const s = await getSettings();
  const d = deliveryReady();
  const links: [string, boolean, string][] = [
    [t("Pop-up notifications"), pushReady(), "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY"], [t("Email (Resend)"), d.email, "RESEND_API_KEY, EMAIL_FROM"],
    ["WhatsApp (Meta Cloud API)", d.whatsapp, "WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE_*"], [t("CRM: help requests become leads"), crmReady(), "CRM_INTAKE_URL, CRM_INTAKE_KEY, CRM_SOURCE_SITE"],
    [t("Talent portal: shortlists"), talentReady(), "TALENT_SHORTLIST_URL, TALENT_SHORTLIST_SECRET"], [t("Scheduler for background work"), Boolean(process.env.CRON_SECRET), "CRON_SECRET"],
  ];
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader title={t("Settings")} subtitle={t("Rules for the whole community. The defaults follow the scope brief.")} />
      <Card className="p-5 sm:p-6">
        <ActionForm action={saveSettingsAction} className="space-y-6">
          <Field name="name" label={t("Community name")} defaultValue={s.name} />
          <Choices name="dmCross" label={t("Private messages between a parent and a specialist")} defaultValue={s.dmCross} columns={3} options={[
            { value: "off", label: t("Off"), hint: t("Recommended. Stops families and specialists making private arrangements.") },
            { value: "approval", label: t("After an admin approves"), hint: t("The first message waits in Moderation → Message requests.") },
            { value: "open", label: t("Open"), hint: t("Anyone can message anyone in their spaces.") },
          ]} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle name="dmParents" label={t("Parents can message other parents")} defaultChecked={s.dmParents} />
            <Toggle name="dmSpecialists" label={t("Specialists can message other specialists")} defaultChecked={s.dmSpecialists} />
            <Toggle name="filterCrossDm" label={t("Hold phone numbers and emails in parent–specialist messages")} defaultChecked={s.filterCrossDm} />
            <Toggle name="requireStaff2fa" label={t("Staff must use two-step sign-in")} hint={t("Turn it on for your own account first.")} defaultChecked={s.requireStaff2fa} />
          </div>
          <Choices name="interested" label={t("Who sees who's interested in an opportunity")} defaultValue={s.interested} columns={2} options={[
            { value: "admins", label: t("Staff only"), hint: t("Recommended. Nobody is embarrassed or poached.") },
            { value: "everyone", label: t("Every specialist sees the count"), hint: t("Names stay with staff either way.") },
          ]} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="newMemberDays" type="number" min={1} max={90} label={t("Members count as new for (days)")} defaultValue={s.newMemberDays} hint={t("For channels where new members' posts wait for approval.")} />
            <Field name="importantEmailHours" type="number" min={1} max={72} label={t("Email unread announcements after (hours)")} defaultValue={s.importantEmailHours} />
            <Field name="nudgeHours" type="number" min={1} max={48} label={t("WhatsApp nudge for unopened opportunities after (hours)")} defaultValue={s.nudgeHours} />
            <Field name="digestHour" type="number" min={0} max={23} label={t("Digests go out at (hour, each person's clock)")} defaultValue={s.digestHour} />
            <Select name="defaultCountry" label={t("Phone numbers without a country code are read as")} defaultValue={s.defaultCountry} placeholder={null} options={COUNTRIES.map((c) => ({ value: c.code, label: `${t(c.name)} (+${c.dial})` }))} />
          </div>
          <Submit>{t("Save settings")}</Submit>
        </ActionForm>
      </Card>
      <Card>
        <CardHeader title={t("Connections")} subtitle={t("Set on the host (Vercel). Without them that part is simulated or switched off.")} />
        <ul className="divide-y divide-hairline border-t border-hairline">
          {links.map(([name, on, env]) => (
            <li key={name} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <span className="flex-1 font-semibold text-ink">{name}</span><code className="text-xs text-soft" dir="ltr">{env}</code>
              <Badge tone={on ? "good" : "neutral"}>{on ? t("Connected") : t("Not connected")}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
