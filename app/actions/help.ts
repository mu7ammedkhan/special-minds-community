"use server";

import { requireMe } from "@/lib/auth";
import { crmReady, sendHelpToCrm } from "@/lib/crm";
import { one } from "@/lib/db";
import { makeT } from "@/lib/i18n";
import { notify, spaceStaff } from "@/lib/notify";
import { HELP_SERVICES } from "@/lib/options";
import { readAddress } from "@/lib/auth";
import type { ActionState } from "@/components/form";

/** "Ask Special Minds for help": a family's request, kept here and sent on to the CRM as a lead when it's linked. */
export async function submitHelp(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMe();
  const t = makeT(me.locale);
  const str = (k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
  const fields: Record<string, string> = {};
  const service = str("service");
  if (!HELP_SERVICES.some((s) => s.value === service)) fields.service = t("Choose what you need.");
  const name = str("name", 120);
  if (name.length < 2) fields.name = t("Write your name.");
  const phoneRaw = str("phone", 30);
  const phone = phoneRaw ? readAddress(phoneRaw)?.address ?? null : null;
  if (!phone || phone.includes("@")) fields.phone = t("Write a mobile number with its country code, like +971 50 123 4567.");
  if (fd.get("consent") !== "1") fields.consent = t("Please agree so Special Minds can contact you.");
  if (Object.keys(fields).length) return { fields };
  const space = await one<{ id: number }>(`select id from spaces where slug = $1`, [str("space", 60)]);
  const row = await one<{ id: number }>(
    `insert into help_requests (member_id, space_id, service, child_age, city, area, details, name, phone, email, contact_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
    [me.id, space?.id ?? null, service, str("child_age", 30) || null, str("city", 80) || null, str("area", 120) || null, str("details", 2000) || null, name, phone, str("email", 160) || me.email, ["whatsapp", "call", "email"].includes(str("contact_by")) ? str("contact_by") : "whatsapp"]);
  await notify(null, await spaceStaff(space?.id ?? null), { kind: "help", title: (tt) => tt("{name} asked Special Minds for help", { name }), body: (tt) => tt(HELP_SERVICES.find((s) => s.value === service)!.label), link: "/admin/help", actorId: me.id, important: true });
  if (crmReady()) await sendHelpToCrm(Number(row!.id));
  return { ok: t("Thank you. Special Minds will contact you soon, usually within one working day.") };
}
