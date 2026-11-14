"use server";

import { requireMe } from "@/lib/auth";
import { channelById } from "@/lib/access";
import { matchingSpecialists } from "@/lib/opportunities";
import type { OppData } from "@/lib/types";

/** "Check who matches" on the new opportunity form: how many specialists would get the alert. */
export async function matchCount(channelId: number, data: Record<string, unknown>): Promise<number> {
  const me = await requireMe();
  const a = await channelById(me, Number(channelId));
  if (!a?.moderate) return 0;
  const d = data as unknown as OppData;
  return (await matchingSpecialists({ space_id: a.ch.space_id, visibility: a.ch.visibility, channel_id: a.ch.id }, {
    role: String(d.role ?? ""), city: String(d.city ?? ""), languages: Array.isArray(d.languages) ? d.languages.map(String) : [], gender: (d.gender as OppData["gender"]) ?? "any",
  } as OppData)).length;
}
