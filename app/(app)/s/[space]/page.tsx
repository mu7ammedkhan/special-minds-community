import { notFound, redirect } from "next/navigation";
import { canEnterSpace } from "@/lib/access";
import { requireMe } from "@/lib/auth";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

/** A space on its own: open its first channel (the member's own list first, then the first open one). */
export default async function SpacePage({ params }: { params: Promise<{ space: string }> }) {
  const { space } = await params;
  const me = await requireMe();
  const s = await one<{ id: number }>(`select id from spaces where slug = $1 and enabled`, [space]);
  if (!s || !canEnterSpace(me, s.id)) notFound();
  const c = await one<{ slug: string }>(
    `select c.slug from channels c where c.space_id = $1 and c.archived_at is null
        and (exists (select 1 from channel_members cm where cm.channel_id = c.id and cm.member_id = $2) or c.visibility = 'open')
      order by exists (select 1 from channel_members cm where cm.channel_id = c.id and cm.member_id = $2) desc, c.position, c.id limit 1`, [s.id, me.id]);
  if (!c) redirect(`/s/${space}/browse`);
  redirect(`/s/${space}/${c.slug}`);
}
