import type { ReactNode } from "react";
import { Shell, type ShellData } from "@/components/shell";
import { isAdmin, requireMe } from "@/lib/auth";
import { query } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { pushPublicKey } from "@/lib/push";
import { getSettings } from "@/lib/settings";
import type { ChannelType } from "@/lib/options";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await requireMe();
  const { locale } = await getT();
  const admin = isAdmin(me);
  const spaces = await query<{ id: number; slug: string; name: string; name_ar: string | null; audience: "specialists" | "families" | "mixed"; country: string; member: boolean }>(
    `select s.id, s.slug, s.name, s.name_ar, s.audience, s.country, exists (select 1 from space_members sm where sm.space_id = s.id and sm.member_id = $1) as member
       from spaces s where s.enabled and ($2::boolean or exists (select 1 from space_members sm where sm.space_id = s.id and sm.member_id = $1)) order by s.position, s.id`, [me.id, admin]);
  const channels = await query<{ id: number; space_id: number; slug: string; name: string; name_ar: string | null; type: ChannelType; visibility: string; notify: string }>(
    `select c.id, c.space_id, c.slug, c.name, c.name_ar, c.type, c.visibility, cm.notify from channel_members cm join channels c on c.id = cm.channel_id
      where cm.member_id = $1 and c.archived_at is null order by c.position, c.id`, [me.id]);
  const dms = await query<{ id: number; title: string | null; names: string; status: string; last_post_at: string | null; other_kind: string | null }>(
    `select d.id, d.title, d.status, d.last_post_at,
            coalesce((select string_agg(coalesce(nullif(m.display_name, ''), m.full_name), ', ' order by m.id) from dm_members x join members m on m.id = x.member_id where x.dm_id = d.id and x.member_id <> $1), '') as names,
            (select m.kind from dm_members x join members m on m.id = x.member_id where x.dm_id = d.id and x.member_id <> $1 limit 1) as other_kind
       from dms d join dm_members dm on dm.dm_id = d.id and dm.member_id = $1
      where d.status <> 'declined' order by coalesce(d.last_post_at, d.created_at) desc limit 12`, [me.id]);
  const s = await getSettings();
  const data: ShellData = {
    me: { id: me.id, name: me.name, fullName: me.fullName, kind: me.kind, staff: me.staff, avatar: me.avatar, sound: me.sound, muted: me.mutedUntil },
    spaces: spaces.map((x) => ({ id: x.id, slug: x.slug, name: pick(locale, x.name, x.name_ar), audience: x.audience, country: x.country, member: x.member })),
    channels: channels.map((c) => ({ id: c.id, spaceId: c.space_id, slug: c.slug, name: pick(locale, c.name, c.name_ar), type: c.type, visibility: c.visibility, notify: c.notify })),
    dms: dms.map((d) => ({ id: d.id, title: d.title || d.names, status: d.status })),
    pushKey: pushPublicKey(), community: s.name,
  };
  return <Shell data={data}>{children}</Shell>;
}
