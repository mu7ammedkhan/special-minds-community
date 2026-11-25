import "server-only";
import { query } from "./db";

/**
 * Email and WhatsApp. Every message is written to the outbox (Admin →
 * Delivery log). Without a provider's keys, or to a made-up @demo.local
 * address, nothing leaves: the message is kept as "simulated".
 *
 *   Email:     RESEND_API_KEY, EMAIL_FROM ("Special Minds Community <community@specialminds.ae>")
 *   WhatsApp:  WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and one approved template name per use:
 *              WHATSAPP_TEMPLATE_LOGIN_CODE, WHATSAPP_TEMPLATE_OPPORTUNITY, WHATSAPP_TEMPLATE_BROADCAST, WHATSAPP_TEMPLATE_UPDATE
 * The WhatsApp sending code follows Meta's Cloud API but has not been tried
 * against a real number yet.
 */

export type Sent = { status: "simulated" | "sent" | "failed"; error?: string };

const emailReady = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
const whatsappReady = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
const madeUp = (to: string) => /@demo\.local$/i.test(to) || /^\+97150000\d{4}$/.test(to);
export const deliveryReady = () => ({ email: emailReady(), whatsapp: whatsappReady() });

async function log(channel: "email" | "whatsapp", to: string, subject: string | null, body: string, purpose: string, memberId: number | null | undefined, r: Sent) {
  await query(`insert into outbox (channel, member_id, to_address, subject, body, purpose, status, error) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [channel, memberId ?? null, to, subject, body.slice(0, 4000), purpose, r.status, r.error ?? null]);
}

export async function sendEmail(m: { to: string; subject: string; text: string; purpose: string; memberId?: number | null; redact?: string }): Promise<Sent> {
  let r: Sent = { status: "simulated" };
  if (emailReady() && !madeUp(m.to)) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [m.to], subject: m.subject, text: m.text }),
        signal: AbortSignal.timeout(10_000),
      });
      r = res.ok ? { status: "sent" } : { status: "failed", error: `${res.status} ${(await res.text()).slice(0, 200)}` };
    } catch (e) {
      r = { status: "failed", error: String((e as Error).message ?? e).slice(0, 200) };
    }
  }
  // A sign-in code never reaches the log, in the subject or the text, so nobody can read it there.
  const hide = (s: string) => (m.redact ? s.split(m.redact).join("••••••") : s);
  await log("email", m.to, hide(m.subject), hide(m.text), m.purpose, m.memberId, r);
  return r;
}

export async function sendWhatsApp(m: { to: string; text: string; template: "login_code" | "opportunity" | "broadcast" | "update"; params: string[]; purpose: string; memberId?: number | null; redact?: string; lang?: "en" | "ar" }): Promise<Sent> {
  let r: Sent = { status: "simulated" };
  if (whatsappReady() && !madeUp(m.to)) {
    const name = process.env[`WHATSAPP_TEMPLATE_${m.template.toUpperCase()}`];
    if (!name) r = { status: "failed", error: `No approved WhatsApp template set for ${m.template}.` };
    else {
      try {
        const components: unknown[] = [{ type: "body", parameters: m.params.map((p) => ({ type: "text", text: p.slice(0, 1000) })) }];
        // Login codes use Meta's authentication template, which repeats the code on its copy button.
        if (m.template === "login_code") components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: m.params[0] }] });
        const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", to: m.to.replace(/^\+/, ""), type: "template", template: { name, language: { code: m.lang === "ar" ? "ar" : "en" }, components } }),
          signal: AbortSignal.timeout(10_000),
        });
        r = res.ok ? { status: "sent" } : { status: "failed", error: `${res.status} ${(await res.text()).slice(0, 200)}` };
      } catch (e) {
        r = { status: "failed", error: String((e as Error).message ?? e).slice(0, 200) };
      }
    }
  }
  await log("whatsapp", m.to, null, m.redact ? m.text.split(m.redact).join("••••••") : m.text, m.purpose, m.memberId, r);
  return r;
}
