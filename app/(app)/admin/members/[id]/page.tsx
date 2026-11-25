import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin, requireStaff } from "@/lib/auth";
import { memberDetailsAction } from "@/app/actions/admin";
import { one, query } from "@/lib/db";
import { fmtDateTime, fmtPhone, timeAgo } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { memberInScope } from "@/lib/members";
import { talentProfileUrl } from "@/lib/opportunities";
import { KIND_LABEL, STAFF_LABEL, roleLabel, type Kind, type StaffRole } from "@/lib/options";
import { snippet } from "@/lib/text";
import { MemberControls, StatusPill } from "@/components/admin";
import { ActionForm, Field, Select, Submit } from "@/components/form";
import { Avatar, Badge, Card, CardHeader, KeyValue, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Member" };

export default async function AdminMember({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const me = await requireStaff("moderator");
  const { t, locale } = await getT();
  const m = Number.isFinite(id) ? await one<{
    id: number; email: string | null; phone: string | null; full_name: string; display_name: string | null; kind: Kind; staff_role: StaffRole | null; status: string; status_reason: string | null;
    muted_until: string | null; mute_reason: string | null; avatar_file_id: number | null; city: string | null; country: string | null; languages: string[]; roles: string[]; skills: string[];
    verified_title: string | null; talent_ref: string | null; open_to_work: boolean; available_from: string | null; availability_note: string | null; joined_at: string | null; last_seen_at: string | null;
    created_at: string; totp_on: boolean; locale: string; prefs: Record<string, unknown>;
  }>(`select *, case when muted_until > now() then muted_until end as muted_until from members where id = $1`, [id]) : null;
  if (!m) notFound();
  // Moderators see the people in their own spaces (and people asking to join one), as on the members list.
  if (!(await memberInScope(me, Number(m.id)))) notFound();
  const spaces = await query<{ id: number; name: string }>(`select id, name from spaces ${isAdmin(me) ? "" : "where id = any($1::int[])"} order by position, id`, isAdmin(me) ? [] : [me.spaces]);
  const memberSpaces = (await query<{ space_id: number }>(`select space_id from space_members where member_id = $1`, [id])).map((r) => Number(r.space_id));
  const posts = await query<{ id: number; body: string; title: string | null; status: string; created_at: string; channel: string | null }>(
    `select p.id, p.body, p.title, p.status, p.created_at, c.name as channel from posts p left join channels c on c.id = p.channel_id
      where p.author_id = $1 and p.dm_id is null ${isAdmin(me) ? "" : "and c.space_id = any($2::int[])"} order by p.created_at desc limit 12`,
    isAdmin(me) ? [id] : [id, me.spaces]);
  const log = await query<{ actor_name: string | null; action: string; detail: Record<string, unknown>; created_at: string }>(`select actor_name, action, detail, created_at from audit_log where target = $1 order by created_at desc limit 15`, [`member:${id}`]);
  const talent = talentProfileUrl(m.talent_ref);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader back={{ href: "/admin/members", label: t("Members") }}
        title={<span className="flex items-center gap-3"><Avatar name={m.full_name} photoId={m.avatar_file_id} size={52} />{m.full_name}</span>}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusPill status={m.status} />{m.staff_role ? <Badge tone="brand">{t(STAFF_LABEL[m.staff_role])}</Badge> : <Badge>{t(KIND_LABEL[m.kind])}</Badge>}{m.verified_title && <Badge tone="good">✓ {t(m.verified_title)}</Badge>}{m.muted_until && <Badge tone="warn">{t("Posting paused until {when}", { when: fmtDateTime(m.muted_until, locale) })}</Badge>}</span>} />
      {m.status_reason && <p className="mb-4 rounded-xl bg-apricot-50 px-4 py-2 text-sm text-caution">{t("Reason")}: {m.status_reason}</p>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title={t("Profile")} action={<Link href={`/members/${m.id}`} className="text-sm font-semibold text-brand">{t("See their card")}</Link>} />
            <div className="border-t border-hairline px-5 py-2">
              <KeyValue items={[
                [t("Name others see"), m.display_name ?? m.full_name], [t("Email"), <span key="e" dir="ltr">{m.email}</span>], [t("Mobile"), <span key="p" dir="ltr">{fmtPhone(m.phone)}</span>],
                [t("City"), [m.city, m.country].filter(Boolean).join(", ")], [t("Languages"), m.languages.join(", ")], [t("Roles"), m.roles.map((r) => t(roleLabel(r))).join(", ")], [t("Skills"), m.skills.join(", ")],
                [t("Availability"), m.kind === "specialist" ? `${m.open_to_work ? t("Open to new cases") : t("Not looking right now")}${m.available_from ? ` · ${m.available_from}` : ""}${m.availability_note ? ` · ${m.availability_note}` : ""}` : null],
                [t("Talent portal"), talent ? <a key="t" href={talent} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand">#{m.talent_ref}</a> : null],
                [t("Joined"), m.joined_at ? fmtDateTime(m.joined_at, locale) : t("Not yet")], [t("Last seen"), m.last_seen_at ? timeAgo(m.last_seen_at, locale) : t("never")],
                [t("Two-step sign-in"), m.totp_on ? t("On") : t("Off")], [t("WhatsApp alerts"), m.prefs?.whatsapp === true ? t("On") : t("Off")],
              ]} />
            </div>
          </Card>
          {isAdmin(me) && (
            <Card>
              <CardHeader title={t("Contact details and kind")} subtitle={t("They sign in with these.")} />
              <div className="border-t border-hairline px-5 py-4">
                <ActionForm action={memberDetailsAction} hidden={{ id: m.id }} className="grid gap-4 sm:grid-cols-2">
                  <Field name="email" label={t("Email")} defaultValue={m.email} type="email" />
                  <Field name="phone" label={t("Mobile")} defaultValue={m.phone} />
                  <Select name="kind" label={t("Kind")} defaultValue={m.kind} placeholder={null} options={(Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ value: k, label: t(KIND_LABEL[k]) }))} />
                  <Field name="talent_ref" label={t("Talent portal #")} defaultValue={m.talent_ref} />
                  <div className="sm:col-span-2"><Submit size="sm">{t("Save")}</Submit></div>
                </ActionForm>
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title={t("Latest posts")} />
            <ul className="divide-y divide-hairline border-t border-hairline">
              {posts.map((p) => <li key={p.id} className="px-5 py-2.5 text-sm"><span className="text-xs text-soft">#{p.channel} · {timeAgo(p.created_at, locale)} {p.status !== "published" && <StatusPill status={p.status} />}</span><p className="truncate text-ink" dir="auto">{p.title ? `${p.title}: ` : ""}{snippet(p.body)}</p></li>)}
              {!posts.length && <li className="px-5 py-4 text-sm text-soft">{t("No posts yet.")}</li>}
            </ul>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title={t("Control")} />
            <div className="border-t border-hairline px-5 py-4">
              {m.staff_role === "owner" || m.id === me.id ? <p className="text-sm text-soft">{t("You can't change this account here.")}</p> : (
                <MemberControls id={m.id} status={m.status} muted={m.muted_until} staffRole={m.staff_role} myRole={me.staff!} verified={m.verified_title} spaces={spaces} memberSpaces={memberSpaces} />
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title={t("History")} />
            <ul className="divide-y divide-hairline border-t border-hairline">
              {log.map((l, i) => <li key={i} className="px-5 py-2 text-sm"><span className="font-semibold text-ink">{l.action}</span> <span className="text-soft">· {l.actor_name} · {timeAgo(l.created_at, locale)}</span>{typeof l.detail?.reason === "string" && <p className="text-xs text-soft">{String(l.detail.reason)}</p>}</li>)}
              {!log.length && <li className="px-5 py-3 text-sm text-soft">{t("Nothing yet.")}</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
