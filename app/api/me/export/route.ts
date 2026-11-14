import { NextResponse } from "next/server";
import { getMe } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { exportMyData } from "@/lib/members";

/** GET /api/me/export: everything the community keeps about the signed-in member, as a JSON file. */
export async function GET() {
  const me = await getMe();
  if (!me) return new NextResponse("Sign in first.", { status: 401 });
  const data = await exportMyData(me);
  await audit(me, "data.export_self", `member:${me.id}`);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="special-minds-community-my-data.json"`, "Cache-Control": "private, no-store" },
  });
}
