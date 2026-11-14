import { NextResponse } from "next/server";
import { getMe, isAdmin } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { tickSoon } from "@/lib/jobs";

/**
 * GET /api/pulse: the numbers the frame shows (unread per channel and
 * conversation, mentions, the bell, staff queues). Every open tab asks every
 * few seconds; each ask also lets background work run (lib/jobs.ts).
 */
export async function GET() {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  tickSoon();
  const channels = await query<{ id: number; unread: number; mentions: number }>(
    `select cm.channel_id as id,
            (select count(*) from posts p where p.channel_id = cm.channel_id and p.parent_id is null and p.status = 'published' and p.created_at > cm.last_read_at and p.author_id <> $1)::int as unread,
            (select count(*) from posts p where p.channel_id = cm.channel_id and p.status = 'published' and p.created_at > cm.last_read_at and p.author_id <> $1 and ($1 = any(p.mentions) or p.mention_all))::int as mentions
       from channel_members cm join channels c on c.id = cm.channel_id where cm.member_id = $1 and c.archived_at is null`, [me.id]);
  const dms = await query<{ id: number; unread: number }>(
    `select dm.dm_id as id, (select count(*) from posts p where p.dm_id = dm.dm_id and p.status = 'published' and p.created_at > dm.last_read_at and p.author_id <> $1)::int as unread
       from dm_members dm where dm.member_id = $1`, [me.id]);
  const notes = (await one<{ n: number }>(`select count(*)::int as n from notifications where member_id = $1 and read_at is null`, [me.id]))?.n ?? 0;
  let staff = null;
  if (me.staff) {
    const spaces = isAdmin(me) ? null : me.spaces;
    staff = await one<{ requests: number; queue: number; help: number }>(
      `select (select count(*) from join_requests where status = 'pending' and ($1::int[] is null or space_id = any($1::int[])))::int as requests,
              ((select count(*) from posts p left join channels c on c.id = p.channel_id where p.status in ('pending', 'held') and ($1::int[] is null or c.space_id = any($1::int[]) or p.dm_id is not null))
               + (select count(*) from reports r join posts p on p.id = r.post_id left join channels c on c.id = p.channel_id where r.status = 'open' and ($1::int[] is null or c.space_id = any($1::int[])))
               + (select count(*) from dms where status = 'pending'))::int as queue,
              (select count(*) from help_requests where status in ('new', 'failed'))::int as help`, [spaces]);
  }
  return NextResponse.json({ channels, dms, notes, staff, at: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
}
