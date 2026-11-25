import { NextResponse, type NextRequest } from "next/server";
import { getMe, staffOk } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { csvCell } from "@/lib/csv";
import { query } from "@/lib/db";

/** GET /api/export/members|responses|rsvps|help: a spreadsheet (CSV) for admins; every download is logged. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ what: string }> }) {
  // The admin pages' rules: admin or owner, past two-step sign-in, and two-step set up when Settings require it.
  const me = await getMe();
  if (!me || !(await staffOk(me, "admin"))) return new NextResponse("Admins only.", { status: 403 });
  const what = (await ctx.params).what;
  const sets: Record<string, { head: string[]; sql: string }> = {
    members: { head: ["ID", "Name", "Shown as", "Kind", "Staff", "Status", "Email", "Phone", "City", "Country", "Languages", "Roles", "Verified", "Talent #", "Open to work", "Spaces", "Joined", "Last seen"],
      sql: `select m.id, m.full_name, m.display_name, m.kind, m.staff_role, m.status, m.email, m.phone, m.city, m.country, m.languages, m.roles, m.verified_title, m.talent_ref, m.open_to_work,
                   (select string_agg(s.name, '; ') from space_members sm join spaces s on s.id = sm.space_id where sm.member_id = m.id), m.joined_at, m.last_seen_at
              from members m where m.status <> 'deleted' and m.profile_done order by m.full_name` },
    responses: { head: ["Opportunity", "Posted", "Status", "Specialist", "Email", "Phone", "Answer", "Note", "Stage", "Talent #", "Answered"],
      sql: `select coalesce(p.title, ''), p.created_at, coalesce(p.data->>'status', 'open'), m.full_name, m.email, m.phone, r.answer, r.note, r.stage, m.talent_ref, r.created_at
              from responses r join posts p on p.id = r.post_id join members m on m.id = r.member_id order by p.created_at desc, r.created_at` },
    rsvps: { head: ["Event", "Starts", "Member", "Email", "Answer"],
      sql: `select p.title, p.data->>'startsAt', m.full_name, m.email, r.answer from rsvps r join posts p on p.id = r.post_id join members m on m.id = r.member_id order by p.data->>'startsAt' desc` },
    help: { head: ["When", "Name", "Phone", "Email", "Service", "Child's age", "City", "Area", "Details", "Status", "CRM"],
      sql: `select created_at, name, phone, email, service, child_age, city, area, details, status, crm_ref from help_requests order by created_at desc` },
  };
  const set = sets[what];
  if (!set) return new NextResponse("Not found.", { status: 404 });
  const rows = await query<Record<string, unknown>>(set.sql);
  const lines = [set.head.map(csvCell).join(","), ...rows.map((r) => Object.values(r).map(csvCell).join(","))];
  await audit(me, "export", what, { rows: rows.length });
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="community-${what}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" },
  });
}
