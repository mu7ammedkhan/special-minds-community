"use server";

import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { one } from "@/lib/db";
import { makeT } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { finishJoin, inviteByCode, saveProfile, type InviteRow, type Profile } from "@/lib/members";
import { COUNTRY, ROLES, type Kind } from "@/lib/options";
import type { ActionState } from "@/components/form";

/** The join form: profile, the space's questions, the rules. With an invite (code) or as a request. */
export async function submitJoin(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const t = makeT(await getLocale());
  const me = await getMe();
  if (!me) redirect("/login");
  const code = String(fd.get("code") ?? "");
  let invite: InviteRow | null = null;
  let spaceId: number;
  if (code) {
    const r = await inviteByCode(code);
    if (r.problem || !r.invite) return { error: t(r.problem ?? "This invite link isn't right. Check you copied all of it.") };
    invite = r.invite;
    if (invite.for_address && invite.for_address !== me.email?.toLowerCase() && invite.for_address !== me.phone) {
      return { error: t("This invite is for someone else. Sign in with the email or number it was sent to.") };
    }
    spaceId = invite.space_id;
  } else {
    const s = await one<{ id: number; join_policy: string; enabled: boolean }>(`select id, join_policy, enabled from spaces where slug = $1`, [String(fd.get("space") ?? "")]);
    if (!s || !s.enabled || s.join_policy === "invite") return { error: t("This space is by invitation only.") };
    spaceId = s.id;
  }
  const space = await one<{ audience: string; questions: { id: string; label: string; required?: boolean }[]; country: string; slug: string }>(`select audience, questions, country, slug from spaces where id = $1`, [spaceId]);
  const fields: Record<string, string> = {};
  const str = (k: string, max = 120) => String(fd.get(k) ?? "").trim().slice(0, max);
  const fullName = str("full_name");
  if (fullName.length < 2) fields.full_name = t("Write your full name.");
  const kind: Kind = invite?.kind ?? (space!.audience === "specialists" ? "specialist" : space!.audience === "families" ? "parent" : (["specialist", "parent"].includes(str("kind")) ? str("kind") as Kind : "parent"));
  const country = COUNTRY[str("country")] ? str("country") : space!.country;
  const city = str("city", 80);
  if (!city) fields.city = t("Choose your city.");
  const roles = fd.getAll("roles").map(String).filter((r) => ROLES.some((x) => x.value === r));
  if (kind === "specialist" && !roles.length) fields.roles = t("Choose at least one role.");
  const answers: Record<string, string> = {};
  for (const q of space!.questions ?? []) {
    const v = String(fd.get(`q_${q.id}`) ?? "").trim().slice(0, 500);
    if (q.required && !v) fields[`q_${q.id}`] = t("Please answer this.");
    answers[q.id] = v;
  }
  if (fd.get("rules") !== "1") fields.rules = t("Please agree to the community rules to join.");
  if (fd.get("consent") !== "1") fields.consent = t("Please agree so we can keep your details for the community.");
  if (Object.keys(fields).length) return { fields };
  const profile: Profile = {
    fullName, displayName: str("display_name") || null, kind, city, country,
    languages: fd.getAll("languages").map(String).map((s) => s.trim()).filter(Boolean).slice(0, 10),
    roles, skills: fd.getAll("skills").map(String).map((s) => s.trim()).filter(Boolean).slice(0, 20),
    gender: ["female", "male"].includes(str("gender")) ? (str("gender") as "female" | "male") : null, bio: str("bio", 600) || null,
  };
  await saveProfile(null, me.id, profile, { setKind: me.status === "pending" || Boolean(invite) });
  const out = await finishJoin({ ...me, fullName }, spaceId, answers, invite);
  if (out === "requested") redirect("/welcome?requested=1");
  redirect(`/s/${space!.slug}`);
}
