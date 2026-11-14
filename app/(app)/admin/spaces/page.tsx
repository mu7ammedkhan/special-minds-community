import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { query } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { countryName } from "@/lib/options";
import { SpaceForm } from "@/components/space-form";
import { Badge, Card, CardHeader, Fold, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Spaces and channels" };

export default async function SpacesPage() {
  await requireStaff("admin");
  const { t } = await getT();
  const spaces = await query<{ id: number; name: string; audience: string; country: string; join_policy: string; enabled: boolean; members: number; channels: number }>(
    `select s.id, s.name, s.audience, s.country, s.join_policy, s.enabled, (select count(*) from space_members where space_id = s.id)::int as members, (select count(*) from channels where space_id = s.id and archived_at is null)::int as channels from spaces s order by s.position, s.id`);
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader title={t("Spaces and channels")} subtitle={t("A space is a separate community (Specialists · UAE, Families · UAE…). Each has its own channels, members and rules.")} />
      <Card>
        <ul className="divide-y divide-hairline">
          {spaces.map((s) => (
            <li key={s.id}>
              <Link href={`/admin/spaces/${s.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-paper">
                <span className="min-w-0 flex-1"><span className="block font-semibold text-ink">{s.name}</span><span className="text-sm text-soft">{t(countryName(s.country))} · {t("{n} members", { n: s.members })} · {t("{n} channels", { n: s.channels })}</span></span>
                <Badge tone={s.audience === "families" ? "info" : "brand"}>{s.audience === "families" ? t("Families") : s.audience === "specialists" ? t("Specialists") : t("Everyone")}</Badge>
                <Badge>{s.join_policy === "invite" ? t("Invite link only") : s.join_policy === "request" ? t("Ask to join") : t("Open")}</Badge>
                {!s.enabled && <Badge tone="warn">{t("Off")}</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Fold title={t("Make a new space")} summary={t("For another country, or a separate group.")}>
        <div className="py-2"><SpaceForm v={{ name: "", name_ar: "", slug: "", audience: "families", country: "AE", description: "", description_ar: "", join_policy: "request", questions: "", rules: "", rules_ar: "", filter_contacts: true, enabled: true }} /></div>
      </Fold>
    </div>
  );
}
