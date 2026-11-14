import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { CHANNEL_TYPE_LABEL, type ChannelType } from "@/lib/options";
import { ChannelIcon } from "@/components/icons";
import { SpaceForm } from "@/components/space-form";
import { Badge, buttonClass, Card, CardHeader, Fold, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Space" };

export default async function SpacePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("admin");
  const id = Number((await params).id);
  const { t } = await getT();
  const s = Number.isFinite(id) ? await one<{ id: number; name: string; name_ar: string | null; slug: string; audience: string; country: string; description: string | null; description_ar: string | null; join_policy: string; questions: { label: string; required?: boolean }[]; rules: string | null; rules_ar: string | null; filter_contacts: boolean; enabled: boolean }>(`select * from spaces where id = $1`, [id]) : null;
  if (!s) notFound();
  const channels = await query<{ id: number; name: string; type: ChannelType; visibility: string; locked: boolean; approval: string; archived_at: string | null; members: number }>(
    `select c.id, c.name, c.type, c.visibility, c.locked, c.approval, c.archived_at, (select count(*) from channel_members where channel_id = c.id)::int as members from channels c where c.space_id = $1 order by c.archived_at nulls first, c.position, c.id`, [id]);
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader back={{ href: "/admin/spaces", label: t("Spaces and channels") }} title={s.name} actions={<Link href={`/s/${s.slug}`} className={buttonClass("secondary", "sm")}>{t("Open the space")}</Link>} />
      <Card>
        <CardHeader title={t("Channels")} action={<Link href={`/admin/channels/new?space=${s.id}`} className={buttonClass("primary", "sm")}><Plus className="size-4" />{t("New channel")}</Link>} />
        <ul className="divide-y divide-hairline border-t border-hairline">
          {channels.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/channels/${c.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-paper">
                <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand"><ChannelIcon type={c.type} visibility={c.visibility} className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block font-semibold text-ink">{c.name}</span><span className="text-sm text-soft">{t(CHANNEL_TYPE_LABEL[c.type])} · {t("{n} members", { n: c.members })}</span></span>
                {c.visibility !== "open" && <Badge>{c.visibility === "private" ? t("Private") : t("Hidden")}</Badge>}
                {c.locked && <Badge tone="warn">{t("Locked")}</Badge>}
                {c.approval !== "none" && <Badge tone="info">{c.approval === "all" ? t("Every post approved") : t("New members approved")}</Badge>}
                {c.archived_at && <Badge>{t("Archived")}</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Fold title={t("Space settings")} summary={t("Name, who it's for, how people join, rules")} open>
        <div className="py-2">
          <SpaceForm v={{ id: s.id, name: s.name, name_ar: s.name_ar ?? "", slug: s.slug, audience: s.audience, country: s.country, description: s.description ?? "", description_ar: s.description_ar ?? "",
            join_policy: s.join_policy, questions: (s.questions ?? []).map((q) => `${q.label}${q.required ? " *" : ""}`).join("\n"), rules: s.rules ?? "", rules_ar: s.rules_ar ?? "", filter_contacts: s.filter_contacts, enabled: s.enabled }} />
        </div>
      </Fold>
    </div>
  );
}
