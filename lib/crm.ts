import "server-only";
import { one, query } from "./db";
import { COUNTRY } from "./options";

/**
 * "Ask Special Minds for help" requests go on to the CRM as leads, through
 * the same contract the Special Minds websites use (the CRM's
 * POST /api/intake/website). Set on the host:
 *   CRM_INTAKE_URL      https://crm.specialminds.app/api/intake/website
 *   CRM_INTAKE_KEY      an smc_ key the CRM made (CRM: Settings → Websites)
 *   CRM_SOURCE_SITE     the website that key belongs to, e.g. specialminds-ae
 * Until then requests wait in Admin → Help requests. A laptop never calls the live CRM.
 */

export const crmReady = () => Boolean(process.env.CRM_INTAKE_URL && process.env.CRM_INTAKE_KEY && process.env.CRM_SOURCE_SITE);

export async function sendHelpToCrm(id: number): Promise<{ ok: boolean; error?: string }> {
  if (!crmReady()) return { ok: false, error: "The CRM link isn't switched on yet." };
  const url = process.env.CRM_INTAKE_URL!;
  if (process.env.NODE_ENV !== "production" && /crm\.specialminds\.app/.test(url)) return { ok: false, error: "This laptop won't call the live CRM." };
  const h = await one<{ id: number; service: string; child_age: string | null; city: string | null; area: string | null; details: string | null; name: string; phone: string | null; email: string | null; contact_by: string; created_at: string; country: string | null; locale: string }>(
    `select h.*, coalesce(s.country, m.country) as country, coalesce(m.locale, 'en') as locale from help_requests h left join spaces s on s.id = h.space_id left join members m on m.id = h.member_id where h.id = $1`, [id]);
  if (!h) return { ok: false, error: "Not found." };
  if (!h.phone) return { ok: false, error: "The CRM needs a phone number." };
  const country = h.country && COUNTRY[h.country] ? h.country : "AE";
  const payload = {
    source_site: process.env.CRM_SOURCE_SITE, country, enquiry_id: `community-${h.id}`, submitted_at: new Date(h.created_at).toISOString(), language: h.locale,
    enquirer_type: "family", service: h.service, name: h.name, phone: h.phone, email: h.email, city: h.city, area: h.area, child_age: h.child_age,
    message: `${h.details ?? ""}\n\nFrom the Special Minds Community. Prefers: ${h.contact_by}.`.trim(), page_url: `${process.env.APP_URL ?? ""}/help`,
  };
  try {
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRM_INTAKE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) });
    const json = await res.json().catch(() => ({})) as { lead_id?: string; request_id?: string; url?: string; error?: string };
    if (!res.ok) {
      await query(`update help_requests set status = 'failed', error = $2 where id = $1`, [id, `${res.status} ${json.error ?? ""}`.slice(0, 300)]);
      return { ok: false, error: json.error ?? `The CRM answered ${res.status}.` };
    }
    await query(`update help_requests set status = 'sent', crm_ref = $2, error = null where id = $1`, [id, json.url ?? json.lead_id ?? null]);
    return { ok: true };
  } catch (e) {
    await query(`update help_requests set status = 'failed', error = $2 where id = $1`, [id, String((e as Error).message).slice(0, 300)]);
    return { ok: false, error: "The CRM couldn't be reached." };
  }
}
