import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { saveFile } from "@/lib/files";
import { makeT } from "@/lib/i18n";

/** POST /api/upload (multipart: file, width, height, duration): one photo, file or voice note. */
export async function POST(req: NextRequest) {
  const me = await getMe();
  if (!me || me.status !== "active") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const t = makeT(me.locale);
  if (me.mutedUntil) return NextResponse.json({ error: t("You can read but not post until {when}.", { when: new Date(me.mutedUntil).toLocaleString() }) }, { status: 403 });
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: t("Choose a file first.") }, { status: 400 });
  const n = (k: string) => (Number(fd!.get(k)) > 0 ? Math.round(Number(fd!.get(k))) : undefined);
  const r = await saveFile(me, file, { width: n("width"), height: n("height"), durationMs: n("duration") });
  if (!r.ok) return NextResponse.json({ error: t(r.error) }, { status: 400 });
  return NextResponse.json(r.file);
}
