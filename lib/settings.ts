import "server-only";
import { cache } from "react";
import { query } from "./db";

/**
 * Community-wide choices, set by admins in Admin → Settings. Each is one row
 * in `settings`; anything never saved uses the default here. These defaults
 * are the recommendations from the scope brief (14 Nov 2026).
 */
export type Settings = {
  name: string;
  /** Private messages between a parent and a specialist: off, only once an admin approves, or open. */
  dmCross: "off" | "approval" | "open";
  dmParents: boolean;
  dmSpecialists: boolean;
  /** Hold phone numbers and emails in parent–specialist private messages. */
  filterCrossDm: boolean;
  /** Who sees who's interested in an opportunity. */
  interested: "admins" | "everyone";
  requireStaff2fa: boolean;
  /** "New members' posts wait for approval": how many days someone counts as new. */
  newMemberDays: number;
  /** Email an announcement or opportunity still unread after this many hours. */
  importantEmailHours: number;
  /** WhatsApp nudge for an opportunity still unopened after this many hours. */
  nudgeHours: number;
  /** When digests go out, on each person's clock. */
  digestHour: number;
  defaultCountry: string;
};

export const DEFAULT_SETTINGS: Settings = {
  name: "Special Minds Community",
  dmCross: "off",
  dmParents: true,
  dmSpecialists: true,
  filterCrossDm: true,
  interested: "admins",
  requireStaff2fa: false,
  newMemberDays: 7,
  importantEmailHours: 4,
  nudgeHours: 2,
  digestHour: 18,
  defaultCountry: "AE",
};

export const getSettings = cache(async (): Promise<Settings> => {
  const rows = await query<{ key: string; value: unknown }>(`select key, value from settings`);
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const r of rows) if (r.key in out) out[r.key] = r.value;
  return out as Settings;
});

export async function saveSettings(patch: Partial<Settings>, by: number) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS) || value === undefined) continue;
    await query(
      `insert into settings (key, value, updated_by) values ($1, $2::text::jsonb, $3)
       on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
      [key, JSON.stringify(value), by]);
  }
}
