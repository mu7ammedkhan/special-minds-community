import { NextResponse, type NextRequest } from "next/server";
import { tick } from "@/lib/jobs";

/** GET /api/cron/tick with Authorization: Bearer <CRON_SECRET>: runs the background work now (for a scheduler). */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  return NextResponse.json({ ran: await tick(true) });
}
