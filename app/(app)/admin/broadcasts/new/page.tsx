import { sendBroadcastAction } from "@/app/actions/admin";
import { requireStaff } from "@/lib/auth";
import { query } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { ALL_CITIES, LANGUAGES, ROLES } from "@/lib/options";
import { deliveryReady } from "@/lib/outbox";
import { SegmentCounter } from "@/components/admin";
import { ActionForm, Field, Submit, TextArea } from "@/components/form";
import { Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "New broadcast" };

export default async function NewBroadcast() {
  await requireStaff("admin");
  const { t } = await getT();
  const spaces = await query<{ id: number; name: string }>(`select id, name from spaces where enabled order by position`);
  const ready = deliveryReady();
  const group = "rounded-2xl border border-hairline p-4";
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <PageHeader back={{ href: "/admin/broadcasts", label: t("Broadcasts") }} title={t("New broadcast")} />
      <Card className="p-5 sm:p-6">
        <ActionForm action={sendBroadcastAction} className="space-y-5">
          <Field name="title" label={t("Title")} required maxLength={140} placeholder={t("For example: Centre closed on Tuesday")} />
          <TextArea name="body" label={t("Message")} required rows={6} maxLength={4000} />
          <div className={group}>
            <p className="mb-2 text-sm font-semibold text-ink">{t("Who gets it")} <span className="font-normal text-soft">({t("leave a group empty for everyone")})</span></p>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">{spaces.map((s) => <label key={s.id} className="pill relative"><input type="checkbox" name="spaces" value={s.id} />{s.name}</label>)}</div>
              <div className="flex flex-wrap gap-1.5">{[["specialist", t("Specialists")], ["parent", t("Parents")], ["team", t("Special Minds team")]].map(([v, l]) => <label key={v} className="pill relative"><input type="checkbox" name="kinds" value={v} />{l}</label>)}</div>
              <details><summary className="cursor-pointer text-sm font-semibold text-brand">{t("By city, role or language")}</summary>
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-1.5">{ALL_CITIES.map((c) => <label key={c} className="pill relative !py-1 text-sm"><input type="checkbox" name="cities" value={c} />{t(c)}</label>)}</div>
                  <div className="flex flex-wrap gap-1.5">{ROLES.map((r) => <label key={r.value} className="pill relative !py-1 text-sm"><input type="checkbox" name="roles" value={r.value} />{t(r.label)}</label>)}</div>
                  <div className="flex flex-wrap gap-1.5">{LANGUAGES.slice(0, 10).map((l) => <label key={l} className="pill relative !py-1 text-sm"><input type="checkbox" name="languages" value={l} />{t(l)}</label>)}</div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="open_to_work" value="1" className="size-5" />{t("Only specialists open to new cases")}</label>
                </div>
              </details>
            </div>
          </div>
          <div className={group}>
            <p className="mb-2 text-sm font-semibold text-ink">{t("How")}</p>
            <p className="text-sm text-soft">{t("Always: in their bell, and as a pop-up on devices where they turned pop-ups on.")}</p>
            <label className="mt-2 flex items-start gap-3 text-sm"><input type="checkbox" name="via_email" value="1" className="mt-1 size-5" /><span>{t("Also by email")}{!ready.email && <span className="block text-soft">{t("Email isn't set up yet: messages are only logged in the delivery log.")}</span>}</span></label>
            <label className="mt-2 flex items-start gap-3 text-sm"><input type="checkbox" name="via_whatsapp" value="1" className="mt-1 size-5" /><span>{t("Also on WhatsApp (people who turned WhatsApp alerts on)")}<span className="block text-soft">{ready.whatsapp ? t("Each message costs about AED 0.06 to 0.18.") : t("WhatsApp isn't set up yet: messages are only logged in the delivery log.")}</span></span></label>
            <label className="mt-2 flex items-start gap-3 text-sm"><input type="checkbox" name="urgent" value="1" className="mt-1 size-5" /><span>{t("Urgent: pop up even during people's quiet hours")}</span></label>
          </div>
          <div className="sm:w-1/2"><Field name="scheduled_for" type="datetime-local" label={t("Send later")} optionalLabel /></div>
          <SegmentCounter />
          <Submit size="lg">{t("Send broadcast")}</Submit>
        </ActionForm>
      </Card>
    </div>
  );
}
