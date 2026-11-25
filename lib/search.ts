import "server-only";
import { query } from "./db";
import type { Me } from "./auth";
import { canViewSql } from "./access";
import { snippet } from "./text";

/**
 * Search across every message, topic and post this member can see, in any
 * language (words are matched from their start, so "toil" finds "toilet").
 */

export type Hit = {
  id: number; kind: string; title: string | null; text: string; created_at: string; author: string; anonymous: boolean;
  where: string; link: string; dm: boolean;
};

export async function search(me: Me, q: string): Promise<Hit[]> {
  const words = q.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 2).slice(0, 6);
  if (!words.length) return [];
  const tsq = words.map((w) => `${w}:*`).join(" & ");
  const rows = await query<{
    id: number; kind: string; title: string | null; body: string; created_at: string; author: string; anonymous: boolean; parent_id: number | null;
    channel_id: number | null; dm_id: number | null; ch_slug: string | null; ch_name: string | null; ch_type: string | null; space_slug: string | null;
  }>(
    `select p.id, p.kind, p.title, p.body, p.created_at, coalesce(nullif(a.display_name, ''), a.full_name) as author, p.anonymous, p.parent_id, p.channel_id, p.dm_id,
            c.slug as ch_slug, c.name as ch_name, c.type as ch_type, s.slug as space_slug
       from posts p join members a on a.id = p.author_id
       left join channels c on c.id = p.channel_id left join spaces s on s.id = c.space_id
      where p.search @@ to_tsquery('simple', $2) and p.status = 'published'
        and (
          (p.dm_id is not null and exists (select 1 from dm_members dm where dm.dm_id = p.dm_id and dm.member_id = $1))
          -- The same "may see this channel" rule as the channel pages, including "See" switched off for parents or guests.
          or (p.channel_id is not null and exists (select 1 from members vm where vm.id = $1 and ${canViewSql("vm", "c", "s")})))
      order by ts_rank(p.search, to_tsquery('simple', $2)) desc, p.created_at desc limit 50`,
    [me.id, tsq]);
  return rows.map((r) => {
    const root = r.parent_id ?? r.id;
    const link = r.dm_id ? `/dm/${r.dm_id}`
      : r.ch_type === "chat" || r.ch_type === "announcement" ? (r.parent_id ? `/s/${r.space_slug}/${r.ch_slug}?thread=${root}` : `/s/${r.space_slug}/${r.ch_slug}?post=${r.id}`)
      : `/s/${r.space_slug}/${r.ch_slug}/${root}`;
    return { id: Number(r.id), kind: r.kind, title: r.title, text: snippet(r.body, {}, 220), created_at: r.created_at, author: r.anonymous ? "" : r.author, anonymous: r.anonymous, where: r.ch_name ?? "", link, dm: Boolean(r.dm_id) };
  });
}
