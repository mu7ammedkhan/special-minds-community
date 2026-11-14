import { NextResponse } from "next/server";
import { getMe } from "@/lib/auth";
import { query } from "@/lib/db";
import { pushSoon } from "@/lib/notify";

/** GET /api/notifications: the latest 30 and the unread count, for the bell. */
export async function GET() {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  pushSoon();
  const unread = (await query<{ n: number }>(`select count(*)::int as n from notifications where member_id = $1 and read_at is null`, [me.id]))[0]?.n ?? 0;
  const items = await query(`select id, kind, title, body, read_at, created_at from notifications where member_id = $1 order by created_at desc limit 30`, [me.id]);
  return NextResponse.json({ unread, items }, { headers: { "Cache-Control": "private, no-store" } });
}
