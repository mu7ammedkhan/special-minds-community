import { NextResponse, type NextRequest } from "next/server";
import { getMe, isAdmin } from "@/lib/auth";
import { channelById, dmRule } from "@/lib/access";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/settings";

/**
 * GET /api/members?q=…&channel=<id>   people to @mention there
 * GET /api/members?q=…&dm=1           people to message privately (with whether it's allowed)
 */
export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  const like = `%${q.replace(/[%_\\]/g, "")}%`;
  const channel = Number(req.nextUrl.searchParams.get("channel"));
  if (channel) {
    const a = await channelById(me, channel);
    if (!a) return NextResponse.json({ items: [] });
    const items = await query(
      `select m.id, coalesce(nullif(m.display_name, ''), m.full_name) as name, m.kind, m.staff_role as staff, m.avatar_file_id as avatar, m.verified_title as verified
         from members m where m.status = 'active' and m.id <> $1 and coalesce(nullif(m.display_name, ''), m.full_name) ilike $2
          and (exists (select 1 from space_members sm where sm.member_id = m.id and sm.space_id = $3) or m.staff_role in ('owner', 'admin'))
          and ($4 = 'open' or exists (select 1 from channel_members cm where cm.member_id = m.id and cm.channel_id = $5))
        order by (coalesce(nullif(m.display_name, ''), m.full_name) ilike $6) desc, name limit 8`,
      [me.id, like, a.ch.space_id, a.ch.visibility, a.ch.id, `${q.replace(/[%_\\]/g, "")}%`]);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const s = await getSettings();
  const rows = await query<{ id: number; name: string; kind: "specialist" | "parent" | "team" | "guest"; staff: "owner" | "admin" | "moderator" | null; avatar: number | null; verified: string | null; city: string | null }>(
    `select m.id, coalesce(nullif(m.display_name, ''), m.full_name) as name, m.kind, m.staff_role as staff, m.avatar_file_id as avatar, m.verified_title as verified, m.city
       from members m where m.status = 'active' and m.id <> $1 and coalesce(nullif(m.display_name, ''), m.full_name) ilike $2
        and ($3::boolean or m.staff_role is not null or exists (select 1 from space_members a join space_members b on a.space_id = b.space_id where a.member_id = $1 and b.member_id = m.id))
      order by name limit 20`, [me.id, like, isAdmin(me)]);
  return NextResponse.json({ items: rows.map((r) => ({ ...r, rule: dmRule(s, me, r) })) }, { headers: { "Cache-Control": "private, no-store" } });
}
