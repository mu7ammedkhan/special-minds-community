import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { getPost, listReplies, postAccess } from "@/lib/posts";

/** GET /api/thread/<id>: a post and its replies, for the thread panel and feed comments. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const id = Number((await ctx.params).id);
  const x = await postAccess(me, id);
  if (!x) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const rootId = x.p.parent_id ?? id;
  const root = await getPost(x.ctx, rootId);
  if (!root) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ now: new Date().toISOString(), root, replies: await listReplies(x.ctx, rootId) }, { headers: { "Cache-Control": "private, no-store" } });
}
