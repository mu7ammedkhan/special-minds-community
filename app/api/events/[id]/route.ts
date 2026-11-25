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
  if (!e || Number.isNaN(new Date(e.data?.startsAt).getTime())) return new NextResponse("Not found.", { status: 404 });
  // The online link, as on the page: only for people going, and staff.
  const going = x.ctx.moderate || Boolean(await one(`select 1 from rsvps where post_id = $1 and member_id = $2 and answer = 'going'`, [id, me.id]));
  if (!going) e.data.online = undefined;
  const stamp = (s: string) => new Date(s).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  // Every kind of line break becomes "\n" text, and other control characters go, so nothing typed can add lines to the file.
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").replace(/[,;]/g, (m) => `\\${m}`);
  const endRaw = e.data.endsAt && !Number.isNaN(new Date(e.data.endsAt).getTime()) ? e.data.endsAt : null;
  const end = endRaw ?? new Date(new Date(e.data.startsAt).getTime() + 2 * 3600_000).toISOString();
  const url = `${process.env.APP_URL ?? req.nextUrl.origin}${req.nextUrl.pathname.replace(/^\/api\/events\/\d+$/, "")}`;
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Special Minds//Community//EN", "BEGIN:VEVENT",
    `UID:event-${id}@community.specialminds`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(e.data.startsAt)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(`${e.body}\n\n${e.data.online ?? ""}`.trim())}`, `LOCATION:${esc(e.data.place || e.data.online || "")}`, `URL:${url}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return new NextResponse(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="event-${id}.ics"` } });
}
