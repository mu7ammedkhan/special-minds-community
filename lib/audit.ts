import "server-only";
import { headers } from "next/headers";
import { query } from "./db";

/**
 * The audit log: who removed what, who changed which setting, when. Admins
 * read it in Admin → Audit log. Logging never breaks the action itself.
 */
export async function audit(actor: { id: number; fullName: string } | null, action: string, target?: string | null, detail: Record<string, unknown> = {}) {
  try {
    let ip: string | null = null;
    try { const h = await headers(); ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null; } catch { /* outside a request */ }
    await query(`insert into audit_log (actor_id, actor_name, action, target, detail, ip) values ($1, $2, $3, $4, $5::text::jsonb, $6)`,
      [actor?.id ?? null, actor?.fullName ?? null, action, target ?? null, JSON.stringify(detail), ip]);
  } catch (e) {
    console.error("audit failed", e);
  }
}
