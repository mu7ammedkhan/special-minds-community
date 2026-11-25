import { isAdmin, requireStaff } from "@/lib/auth";
import { crmReady } from "@/lib/crm";
import { query } from "@/lib/db";
import { fmtPhone, timeAgo } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { HELP_SERVICE_LABEL } from "@/lib/options";
import { HelpButtons, StatusPill } from "@/components/admin";
import { Alert, Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Help requests" };

export default async function HelpRequests() {
  const me = await requireStaff("moderator");
  const { t, locale } = await getT();
  const crm = crmReady();
  // Moderators see the requests from their own spaces; admins see them all.
  const scope = isAdmin(me) ? "" : "where h.space_id = any($1::int[])";
  const rows = await query<{ id: number; service: string; child_age: string | null; city: string | null; area: string | null; details: string | null; name: string; phone: string | null; email: string | null; contact_by: string; status: string; crm_ref: string | null; error: string | null; created_at: string; space: string | null }>(
    `select h.*, s.name as space from help_requests h left join spaces s on s.id = h.space_id ${scope} order by (h.status in ('new', 'failed')) desc, h.created_at desc limit 200`,
    isAdmin(me) ? [] : [me.spaces]);
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
      <PageHeader title={t("Help requests")} subtitle={t("Families who pressed “Ask Special Minds for help”.")} />
      {!crm && <Alert tone="info" title={t("The CRM link is off")}>{t("Set CRM_INTAKE_URL, CRM_INTAKE_KEY and CRM_SOURCE_SITE on the host and each request becomes a lead in the CRM, the same way website enquiries do.")}</Alert>}
      {rows.length ? rows.map((h) => (
        <Card key={h.id} className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="min-w-0 flex-1 space-y-1 text-sm">
              <p className="flex flex-wrap items-center gap-2"><span className="font-semibold text-ink">{h.name}</span><StatusPill status={h.status} /><span className="text-soft">{t(HELP_SERVICE_LABEL[h.service] ?? h.service)} · {timeAgo(h.created_at, locale)}{h.space ? ` · ${h.space}` : ""}</span></p>
              <p className="text-ink-soft" dir="ltr">{fmtPhone(h.phone)}{h.email ? ` · ${h.email}` : ""} · {t("prefers")} {h.contact_by === "call" ? t("a call") : h.contact_by === "email" ? t("email") : "WhatsApp"}</p>
              <p className="text-ink-soft">{[h.child_age ? t("Child: {age}", { age: h.child_age }) : null, h.city, h.area].filter(Boolean).join(" · ")}</p>
              {h.details && <p className="text-ink" dir="auto">“{h.details}”</p>}
              {h.crm_ref && <p className="text-moss">{t("In the CRM")}: {h.crm_ref}</p>}
              {h.error && <p className="text-danger">{h.error}</p>}
            </div>
            <HelpButtons id={h.id} status={h.status} crm={crm} />
          </div>
        </Card>
      )) : <Empty title={t("No help requests yet")} />}
    </div>
  );
}
