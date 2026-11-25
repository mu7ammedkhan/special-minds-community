import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { one } from "@/lib/db";
import { canOpenFile } from "@/lib/files";

/** GET /api/files/<id>: a photo, file or voice note, for members who can see the post it's in. ?download=1 saves it. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) return new NextResponse("Sign in first.", { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id) || !(await canOpenFile(me, id))) return new NextResponse("Not found.", { status: 404 });
  const f = await one<{ name: string; mime: string; data: Uint8Array }>(`select name, mime, data from files where id = $1`, [id]);
  if (!f) return new NextResponse("Not found.", { status: 404 });
  const inline = !req.nextUrl.searchParams.get("download") && /^(image|audio)\/|^application\/pdf$/.test(f.mime);
  return new NextResponse(Buffer.from(f.data), {
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      // Short, so a removed photo doesn't linger on people's devices for a day.
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
