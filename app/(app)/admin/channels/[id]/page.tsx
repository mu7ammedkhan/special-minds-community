import Link from "next/link";
import { notFound } from "next/navigation";
import { canModerate } from "@/lib/access";
import { isAdmin, requireStaff } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { CHANNEL_TYPE_LABEL, type ChannelType, type PermAudience, type Perms } from "@/lib/options";
import { ChannelMemberButton, ChannelQuick } from "@/components/admin";
import { ChannelForm } from "@/components/channel-form";
import { Alert, Avatar, buttonClass, Card, CardHeader, Fold, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Channel settings" };

export default async function ChannelAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; q?: string }> }) {
  const me = await requireStaff("moderator");
  const id = Number((await params).id);
  const sp = await searchParams;
  const { t } = await getT();
  const c = Number.isFinite(id) ? await one<{
    id: number; space_id: number; slug: string; name: string; name_ar: string | null; topic: string | null; topic_ar: string | null; type: ChannelType; visibility: string; auto_join: boolean;
    tags: Record<string, string[]>; perms: Partial<Record<PermAudience, Partial<Perms>>>; posting_hours: { from: string; to: string; days?: number[] } | null; slow_mode: number; locked: boolean;
    announce_only: boolean; approval: string; allow_anonymous: boolean; child_photos: boolean; case_talk: boolean; archived_at: string | null; space_slug: string; space_name: string; audience: string;
  }>(`select c.*, s.slug as space_slug, s.name as space_name, s.audience from channels c join spaces s on s.id = c.space_id where c.id = $1`, [id]) : null;
  if (!c || !canModerate(me, c.space_id)) notFound();
  const members = await query<{ id: number; full_name: string; avatar_file_id: number | null; notify: string }>(
    `select m.id, m.full_name, m.avatar_file_id, cm.notify from channel_members cm join members m on m.id = cm.member_id where cm.channel_id = $1 order by m.full_name limit 300`, [id]);
  const candidates = sp.q ? await query<{ id: number; full_name: string; avatar_file_id: number | null }>(
    `select m.id, m.full_name, m.avatar_file_id from space_members sm join members m on m.id = sm.member_id where sm.space_id = $1 and m.full_name ilike '%' || $2 || '%'
        and not exists (select 1 from channel_members cm where cm.channel_id = $3 and cm.member_id = m.id) order by m.full_name limit 20`, [c.space_id, sp.q, id]) : [];
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader back={{ href: isAdmin(me) ? `/admin/spaces/${c.space_id}` : "/admin", label: c.space_name }} title={c.name} subtitle={t(CHANNEL_TYPE_LABEL[c.type])}
        actions={<Link href={`/s/${c.space_slug}/${c.slug}`} className={buttonClass("secondary", "sm")}>{t("Open the channel")}</Link>} />
      {sp.created && <Alert tone="good">{t("Channel made.")}</Alert>}
      <Card>
        <CardHeader title={t("Right now")} subtitle={t("Quick switches for a busy moment.")} />
        <div className="border-t border-hairline px-5 py-4"><ChannelQuick id={c.id} locked={c.locked} announceOnly={c.announce_only} archived={Boolean(c.archived_at)} /></div>
      </Card>
      {isAdmin(me) && (
        <Fold title={t("Settings and permissions")} summary={t("Who sees it, what members may do, posting hours, slow mode, approval")} open>
          <div className="py-3"><ChannelForm audience={c.audience} v={{ ...c, name_ar: c.name_ar ?? "", topic: c.topic ?? "", topic_ar: c.topic_ar ?? "", tags: c.tags ?? {}, perms: c.perms ?? {} }} /></div>
        </Fold>
      )}
      <Card>
        <CardHeader title={t("{n} members", { n: members.length })} subtitle={c.visibility === "open" ? t("Anyone in the space can also join an open channel themselves.") : t("Only the people listed here can read it.")} />
        <div className="border-t border-hairline px-5 py-4">
          <form className="flex gap-2"><input name="q" defaultValue={sp.q} placeholder={t("Add someone from the space: type a name")} className="input !min-h-10 !py-1.5" /><button className="rounded-full bg-brand px-4 text-sm font-semibold text-white">{t("Find")}</button></form>
          {candidates.length > 0 && <ul className="mt-3 space-y-1">{candidates.map((m) => <li key={m.id} className="flex items-center gap-3 text-sm"><Avatar name={m.full_name} photoId={m.avatar_file_id} size={28} /><span className="flex-1">{m.full_name}</span><ChannelMemberButton channelId={c.id} memberId={m.id} add /></li>)}</ul>}
        </div>
        <ul className="max-h-[28rem] divide-y divide-hairline overflow-y-auto border-t border-hairline">
          {members.map((m) => <li key={m.id} className="flex items-center gap-3 px-5 py-2 text-sm"><Avatar name={m.full_name} photoId={m.avatar_file_id} size={28} /><Link href={`/admin/members/${m.id}`} className="flex-1 hover:underline">{m.full_name}</Link><span className="text-xs text-soft">{m.notify === "all" ? t("Everything") : m.notify === "mentions" ? t("Mentions") : t("Muted")}</span><ChannelMemberButton channelId={c.id} memberId={m.id} add={false} /></li>)}
        </ul>
      </Card>
    </div>
  );
}
