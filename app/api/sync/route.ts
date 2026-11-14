import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { channelById, dmById } from "@/lib/access";
import { changesSince, ctxForChannel, ctxForDm, listMessages, postAccess } from "@/lib/posts";

/**
 * GET /api/sync?channel=…|dm=…|thread=…&since=<time>   what changed since then
 * GET /api/sync?channel=…|dm=…&before=<post id>          older messages
 * The page asks every few seconds while it's on screen.
 */
export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const now = new Date().toISOString();
  const headers = { "Cache-Control": "private, no-store" };
  const channel = Number(sp.get("channel")), dm = Number(sp.get("dm")), thread = Number(sp.get("thread"));
  const since = sp.get("since"), before = Number(sp.get("before"));
  let ctx;
  if (thread) {
    const x = await postAccess(me, thread);
    if (!x) return NextResponse.json({ error: "Not found." }, { status: 404 });
    ctx = x.ctx;
    return NextResponse.json({ now, ...(await changesSince(ctx, { rootId: thread }, since ?? now)) }, { headers });
  }
  if (channel) {
    const a = await channelById(me, channel);
    if (!a) return NextResponse.json({ error: "Not found." }, { status: 404 });
    ctx = await ctxForChannel(me, a);
  } else if (dm) {
    const d = await dmById(me, dm);
    if (!d) return NextResponse.json({ error: "Not found." }, { status: 404 });
    ctx = ctxForDm(me, d);
  } else return NextResponse.json({ error: "Say which conversation." }, { status: 400 });
  const scope = channel ? { channelId: channel } : { dmId: dm };
  if (before) return NextResponse.json({ now, posts: await listMessages(ctx, scope, before, 50) }, { headers });
  if (!since || Number.isNaN(Date.parse(since))) return NextResponse.json({ error: "since is missing." }, { status: 400 });
  return NextResponse.json({ now, ...(await changesSince(ctx, scope, since)) }, { headers });
}
