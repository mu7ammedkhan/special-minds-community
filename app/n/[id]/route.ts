import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { one, query } from "@/lib/db";

/** /n/<id>: opening a notification (from the bell or a pop-up): mark it read, go to what it's about. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) return NextResponse.redirect(new URL("/login", req.url));
  const id = Number((await ctx.params).id);
  const n = Number.isFinite(id) ? await one<{ link: string | null }>(`select link from notifications where id = $1 and member_id = $2`, [id, me.id]) : null;
  if (!n) return NextResponse.redirect(new URL("/notifications", req.url));
  await query(`update notifications set read_at = coalesce(read_at, now()) where id = $1`, [id]);
  const to = n.link && n.link.startsWith("/") && !n.link.startsWith("//") ? n.link : "/notifications";
  return NextResponse.redirect(new URL(to, req.url));
}
