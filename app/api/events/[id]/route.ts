import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { one } from "@/lib/db";
import { postAccess } from "@/lib/posts";

/** GET /api/events/<id>: the event as a calendar file (.ics) for phones and Outlook. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) return new NextResponse("Sign in first.", { status: 401 });
  const id = Number((await ctx.params).id);
  const x = await postAccess(me, id);
  if (!x || x.p.kind !== "event") return new NextResponse("Not found.", { status: 404 });
  const e = await one<{ title: string; body: string; data: { startsAt: string; endsAt?: string; place?: string; online?: string } }>(`select title, body, data from posts where id = $1`, [id]);
  if (!e) return new NextResponse("Not found.", { status: 404 });
  const stamp = (s: string) => new Date(s).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);
  const end = e.data.endsAt ?? new Date(new Date(e.data.startsAt).getTime() + 2 * 3600_000).toISOString();
  const url = `${process.env.APP_URL ?? req.nextUrl.origin}${req.nextUrl.pathname.replace(/^\/api\/events\/\d+$/, "")}`;
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Special Minds//Community//EN", "BEGIN:VEVENT",
    `UID:event-${id}@community.specialminds`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(e.data.startsAt)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(`${e.body}\n\n${e.data.online ?? ""}`.trim())}`, `LOCATION:${esc(e.data.place || e.data.online || "")}`, `URL:${url}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return new NextResponse(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="event-${id}.ics"` } });
}
