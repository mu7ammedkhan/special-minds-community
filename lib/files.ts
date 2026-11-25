import "server-only";
import { one, query } from "./db";
import { isAdmin, type Me } from "./auth";
import { channelById, dmById } from "./access";
import type { FileView } from "./types";

/**
 * Photos, files and voice notes. Kept in the database (the preview has no
 * separate file store); 4 MB each, the most a single upload can carry.
 * Photos are re-drawn in the browser before upload, which drops the hidden
 * location and camera details; JPEGs that arrive with them anyway have those
 * details cut out here.
 */

export const MAX_BYTES = 4 * 1024 * 1024;
/** Each member's uploads in 24 hours (staff more, for the library), and files waiting to be posted: one account can't fill the database. */
const DAILY_BYTES = 40 * 1024 * 1024;
const DAILY_BYTES_STAFF = 200 * 1024 * 1024;
const MAX_WAITING = 20;
const IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const AUDIO = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/x-m4a", "audio/wav"];
const DOCS = [
  "application/pdf", "text/plain", "text/csv",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

/** Removes APP1 (Exif/XMP) segments from a JPEG: location, camera, time. */
export function stripJpegMetadata(buf: Buffer): Buffer {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf;
  const parts: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return buf;
    const marker = buf[i + 1];
    if (marker === 0xda) { parts.push(buf.subarray(i)); return Buffer.concat(parts); } // start of image data: copy the rest
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return buf;
    if (marker !== 0xe1) parts.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return buf;
}

export async function saveFile(me: Me, file: File, meta: { width?: number; height?: number; durationMs?: number }): Promise<{ ok: true; file: FileView } | { ok: false; error: string }> {
  if (file.size > MAX_BYTES) return { ok: false, error: "That file is over 4 MB. Please choose a smaller one." };
  if (!file.size) return { ok: false, error: "That file is empty." };
  const mime = (file.type || "").split(";")[0].toLowerCase();
  const kind = IMAGE.includes(mime) ? "image" : AUDIO.includes(mime) ? "audio" : DOCS.includes(mime) ? "file" : null;
  if (!kind) return { ok: false, error: "That kind of file can't be shared here. Photos, PDFs, Word, Excel and voice notes can." };
  const use = await one<{ bytes: string; waiting: number }>(
    `select coalesce(sum(size) filter (where created_at > now() - interval '1 day'), 0)::text as bytes,
            (count(*) filter (where not exists (select 1 from post_files pf where pf.file_id = files.id)
                               and not exists (select 1 from members m where m.avatar_file_id = files.id)))::int as waiting
       from files where owner_id = $1`, [me.id]);
  if (Number(use?.bytes ?? 0) + file.size > (me.staff ? DAILY_BYTES_STAFF : DAILY_BYTES)) return { ok: false, error: "You've shared a lot today. Please try again tomorrow." };
  if ((use?.waiting ?? 0) >= MAX_WAITING) return { ok: false, error: "You have many files waiting to be posted. Post them, or try again tomorrow." };
  let data: Buffer = Buffer.from(await file.arrayBuffer());
  if (mime === "image/jpeg") data = stripJpegMetadata(data);
  const name = (file.name || (kind === "audio" ? "Voice note" : "File")).replace(/[\\/\0]/g, "_").slice(0, 160);
  const row = await one<{ id: number }>(
    `insert into files (owner_id, kind, name, mime, size, width, height, duration_ms, data) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [me.id, kind, name, mime, data.length, meta.width ?? null, meta.height ?? null, meta.durationMs ?? null, data]);
  return { ok: true, file: { id: Number(row!.id), kind, name, mime, size: data.length, w: meta.width ?? null, h: meta.height ?? null, ms: meta.durationMs ?? null } };
}

/**
 * Whether this member may open a file: their own; a member's profile photo
 * (people still waiting to join: staff only); or one in a post they can see.
 * Private messages' files are for the people in them, and for admins only when
 * that message was reported or waits for approval.
 */
export async function canOpenFile(me: Me, id: number): Promise<boolean> {
  const f = await one<{ owner_id: number | null; avatar_active: boolean; avatar_any: boolean }>(
    `select owner_id,
            exists (select 1 from members where avatar_file_id = files.id and status = 'active') as avatar_active,
            exists (select 1 from members where avatar_file_id = files.id) as avatar_any
       from files where id = $1`, [id]);
  if (!f) return false;
  if (Number(f.owner_id) === me.id || f.avatar_active || (f.avatar_any && me.staff)) return true;
  const posts = await query<{ id: number; channel_id: number | null; dm_id: number | null; status: string; hold_reason: string | null; reported: boolean }>(
    `select p.id, p.channel_id, p.dm_id, p.status, p.hold_reason, exists (select 1 from reports r where r.post_id = p.id) as reported
       from post_files pf join posts p on p.id = pf.post_id where pf.file_id = $1`, [id]);
  for (const p of posts) {
    if (p.status === "removed") continue;
    if (p.channel_id) {
      const a = await channelById(me, p.channel_id);
      if (a && (p.status === "published" || a.moderate)) return true;
    } else if (p.dm_id) {
      if (await dmById(me, p.dm_id)) return true;
      if (isAdmin(me) && (p.reported || p.hold_reason === "dm_request")) return true;
    }
  }
  return false;
}
