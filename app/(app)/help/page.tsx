import { LifeBuoy } from "lucide-react";
import { requireMe } from "@/lib/auth";
import { one } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { HelpForm } from "@/components/help-form";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ask Special Minds for help" };

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ space?: string }> }) {
  const me = await requireMe();
  const { t } = await getT();
  const m = await one<{ full_name: string; phone: string | null; email: string | null; city: string | null }>(`select full_name, phone, email, city from members where id = $1`, [me.id]);
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <PageHeader title={<span className="flex items-center gap-2"><LifeBuoy className="size-7 text-brand" />{t("Ask Special Minds for help")}</span>}
        subtitle={t("A shadow teacher, therapy or an assessment: tell us what you need and our team will call or message you. This goes to Special Minds only, not to the community.")} />
      <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-card sm:p-6">
        <HelpForm space={(await searchParams).space ?? ""} name={m?.full_name ?? ""} phone={m?.phone ?? ""} email={m?.email ?? ""} city={m?.city ?? ""} />
      </div>
    </div>
  );
}
