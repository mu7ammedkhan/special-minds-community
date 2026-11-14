import "server-only";
import type { Me } from "./auth";
import { one } from "./db";
import type { JoinDefaults } from "@/components/join-form";

/** What the join form starts with: the member's saved profile, then anything the invite brought from the Talent portal. */
export async function joinDefaults(me: Me, prefill: Record<string, unknown> = {}, forName?: string | null): Promise<JoinDefaults> {
  const m = await one<{ full_name: string; display_name: string | null; city: string | null; country: string | null; languages: string[]; roles: string[]; skills: string[]; gender: string | null; bio: string | null }>(
    `select full_name, display_name, city, country, languages, roles, skills, gender, bio from members where id = $1`, [me.id]);
  const p = prefill as { roles?: string[]; city?: string; country?: string; languages?: string[]; skills?: string[]; gender?: string };
  return {
    fullName: m?.full_name || forName || "", displayName: m?.display_name ?? "", city: m?.city || p.city || "", country: m?.country || p.country || "AE",
    languages: m?.languages?.length ? m.languages : p.languages ?? [], roles: m?.roles?.length ? m.roles : p.roles ?? [], skills: m?.skills?.length ? m.skills : p.skills ?? [],
    gender: m?.gender ?? p.gender ?? "", bio: m?.bio ?? "",
  };
}
