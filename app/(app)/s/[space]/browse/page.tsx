import Link from "next/link";
import { notFound } from "next/navigation";
import { canEnterSpace, canModerate } from "@/lib/access";
import { requireMe } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { CHANNEL_TYPE_LABEL, DIAGNOSIS_LABEL, type ChannelType } from "@/lib/options";
import { ChannelIcon } from "@/components/icons";
import { JoinButton } from "@/components/join-button";
import { Badge, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Every channel in the space this member may see, to join or leave (groups by city, diagnosis and language included). */
export default async function BrowsePage({ params }: { params: Promise<{ space: string }> }) {
  const { space } = await params;
  const me = await requireMe();
  const { t, locale } = await getT();
  const s = await one<{ id: number; name: string; name_ar: string | null }>(`select id, name, name_ar from spaces where slug = $1 and enabled`, [space]);
  if (!s || !canEnterSpace(me, s.id)) notFound();
  const staff = canModerate(me, s.id);
  const rows = await query<{ id: number; slug: string; name: string; name_ar: string | null; topic: string | null; topic_ar: string | null; type: ChannelType; visibility: string; tags: Record<string, string[]>; joined: boolean; members: number }>(
    `select c.id, c.slug, c.name, c.name_ar, c.topic, c.topic_ar, c.type, c.visibility, c.tags,
            exists (select 1 from channel_members cm where cm.channel_id = c.id and cm.member_id = $2) as joined,
            (select count(*) from channel_members cm where cm.channel_id = c.id)::int as members
       from channels c where c.space_id = $1 and c.archived_at is null
        and ($3::boolean or c.visibility = 'open' or exists (select 1 from channel_members cm where cm.channel_id = c.id and cm.member_id = $2))
      order by c.position, c.id`, [s.id, me.id, staff]);
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <PageHeader title={t("Browse channels")} subtitle={t("Everything in {space} you can join. Groups by city, diagnosis and language are here too.", { space: pick(locale, s.name, s.name_ar) })} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map((c) => {
          const tags = [...(c.tags.city ?? []).map((x) => t(x)), ...(c.tags.diagnosis ?? []).map((x) => t(DIAGNOSIS_LABEL[x] ?? x)), ...(c.tags.language ?? []).map((x) => t(x))];
          return (
            <li key={c.id} className="flex flex-col rounded-2xl border border-hairline bg-surface p-4 shadow-card">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand"><ChannelIcon type={c.type} visibility={c.visibility} className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <Link href={`/s/${space}/${c.slug}`} className="font-semibold text-ink hover:underline">{pick(locale, c.name, c.name_ar)}</Link>
                  <p className="text-xs text-soft">{t(CHANNEL_TYPE_LABEL[c.type])} · {t("{n} members", { n: c.members })}{c.visibility !== "open" ? ` · ${c.visibility === "private" ? t("Private") : t("Hidden")}` : ""}</p>
                </div>
              </div>
              {(c.topic || c.topic_ar) && <p className="mt-2 text-sm text-ink-soft">{pick(locale, c.topic ?? "", c.topic_ar)}</p>}
              {tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{tags.map((x) => <Badge key={x} tone="neutral" className="font-medium">{x}</Badge>)}</div>}
              <div className="mt-auto pt-3">{c.visibility === "open" || c.joined ? <JoinButton channelId={c.id} joined={c.joined} href={`/s/${space}/${c.slug}`} /> : <span className="text-sm text-soft">{t("Members only: ask a moderator to add you.")}</span>}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
