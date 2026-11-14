import { requireStaff } from "@/lib/auth";
import { query } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { TalentImport } from "@/components/admin";
import { Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import from Talent" };

export default async function ImportPage() {
  await requireStaff("admin");
  const { t } = await getT();
  const spaces = await query<{ id: number; name: string }>(`select id, name from spaces where enabled and audience <> 'families' order by position`);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <PageHeader title={t("Import specialists from the Talent portal")} subtitle={t("Each person gets a personal invite link with their profile filled in: role, city, languages and their Talent portal number. They confirm their email or phone and they're in.")} />
      <Card className="p-5"><TalentImport spaces={spaces} /></Card>
    </div>
  );
}
