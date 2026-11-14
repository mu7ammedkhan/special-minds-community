import { redirect } from "next/navigation";
import { isAdmin, requireMe } from "@/lib/auth";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Home: the first space this member is in (their channels open on its first channel). */
export default async function Home() {
  const me = await requireMe();
  const s = await one<{ slug: string }>(
    `select s.slug from spaces s where s.enabled and ($2::boolean or exists (select 1 from space_members sm where sm.space_id = s.id and sm.member_id = $1))
      order by exists (select 1 from space_members sm where sm.space_id = s.id and sm.member_id = $1) desc, s.position, s.id limit 1`, [me.id, isAdmin(me)]);
  redirect(s ? `/s/${s.slug}` : "/welcome");
}
