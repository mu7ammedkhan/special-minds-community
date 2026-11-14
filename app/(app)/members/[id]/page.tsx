import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, MapPin, MessageCircle, Settings } from "lucide-react";
import { dmRule } from "@/lib/access";
import { isAdmin, requireMe } from "@/lib/auth";
import { one } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { KIND_LABEL, STAFF_LABEL, roleLabel, type Kind, type StaffRole } from "@/lib/options";
import { getSettings } from "@/lib/settings";
import { Avatar, Badge, buttonClass, Card, Chips } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Member" };

/** A member's card: what others may see. Staff also see availability and a link to manage them. */
export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const me = await requireMe();
  const { t, locale } = await getT();
  const m = Number.isFinite(id) ? await one<{
    id: number; full_name: string; display_name: string | null; kind: Kind; staff_role: StaffRole | null; status: string; avatar_file_id: number | null; verified_title: string | null;
    roles: string[]; languages: string[]; city: string | null; bio: string | null; open_to_work: boolean; available_from: string | null; availability_note: string | null; joined_at: string | null; shared: boolean;
  }>(`select m.*, exists (select 1 from space_members a join space_members b on a.space_id = b.space_id where a.member_id = $2 and b.member_id = m.id) as shared from members m where m.id = $1`, [id, me.id]) : null;
  if (!m || m.status === "deleted" || (!m.shared && !me.staff && !m.staff_role && m.id !== me.id)) notFound();
  const staffView = Boolean(me.staff);
  const name = m.display_name?.trim() || m.full_name;
  const rule = m.id !== me.id ? dmRule(await getSettings(), me, { kind: m.kind, staff: m.staff_role }) : "off";
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <Card className="p-6">
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:text-start">
          <Avatar name={name} photoId={m.avatar_file_id} size={88} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl text-ink">{name}</h1>
            {staffView && m.display_name && <p className="text-sm text-soft">{m.full_name}</p>}
            <div className="mt-1.5 flex flex-wrap justify-center gap-1.5 sm:justify-start">
              <Badge tone={m.staff_role ? "brand" : "neutral"}>{m.staff_role ? t(STAFF_LABEL[m.staff_role]) : t(KIND_LABEL[m.kind])}</Badge>
              {m.verified_title && <Badge tone="good"><BadgeCheck className="size-3.5" />{t(m.verified_title)}</Badge>}
            </div>
            {m.city && <p className="mt-2 flex items-center justify-center gap-1 text-sm text-soft sm:justify-start"><MapPin className="size-4" />{t(m.city)}</p>}
          </div>
        </div>
        {m.bio && <p className="msg-body mt-5 text-base text-ink-soft" dir="auto">{m.bio}</p>}
        <dl className="mt-5 grid gap-3 text-sm">
          {m.roles.length > 0 && <div><dt className="text-soft">{t("Roles")}</dt><dd className="mt-1"><Chips items={m.roles.map((r) => t(roleLabel(r)))} tone="brand" /></dd></div>}
          {m.languages.length > 0 && <div><dt className="text-soft">{t("Languages")}</dt><dd className="mt-1"><Chips items={m.languages.map((l) => t(l))} /></dd></div>}
          {staffView && m.kind === "specialist" && (
            <div className="rounded-xl bg-paper px-3 py-2"><dt className="text-soft">{t("Availability")} ({t("staff only")})</dt>
              <dd className="text-ink">{m.open_to_work ? t("Open to new cases") : t("Not looking right now")}{m.available_from ? ` · ${t("free from {date}", { date: fmtDate(m.available_from, locale) })}` : ""}{m.availability_note ? ` · ${m.availability_note}` : ""}</dd></div>
          )}
          {m.joined_at && <div><dt className="text-soft">{t("Joined")}</dt><dd className="text-ink">{fmtDate(m.joined_at, locale)}</dd></div>}
        </dl>
        <div className="mt-6 flex flex-wrap gap-2">
          {rule !== "off" && <Link href={`/dm/new?to=${m.id}`} className={buttonClass("primary", "sm")}><MessageCircle className="size-4" />{rule === "approval" ? t("Ask to message") : t("Message")}</Link>}
          {(isAdmin(me) || me.staff === "moderator") && <Link href={`/admin/members/${m.id}`} className={buttonClass("secondary", "sm")}><Settings className="size-4" />{t("Manage")}</Link>}
        </div>
      </Card>
    </div>
  );
}
