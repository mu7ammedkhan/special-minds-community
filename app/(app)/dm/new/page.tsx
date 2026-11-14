import { requireMe } from "@/lib/auth";
import { one } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { NewDm } from "@/components/new-dm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "New message" };

export default async function NewDmPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  await requireMe();
  const { t } = await getT();
  const to = Number((await searchParams).to);
  const pre = to ? await one<{ id: number; name: string }>(`select id, coalesce(nullif(display_name, ''), full_name) as name from members where id = $1 and status = 'active'`, [to]) : null;
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <PageHeader title={t("New message")} back={{ href: "/dm", label: t("Messages") }} />
      <NewDm preset={pre ? [{ id: Number(pre.id), name: pre.name }] : []} />
    </div>
  );
}
