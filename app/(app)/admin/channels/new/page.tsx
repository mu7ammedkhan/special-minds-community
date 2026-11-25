import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { one } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { ChannelForm } from "@/components/channel-form";
import { Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "New channel" };

export default async function NewChannel({ searchParams }: { searchParams: Promise<{ space?: string }> }) {
  await requireStaff("admin");
  const { t } = await getT();
  // A new channel always belongs to a space: without one (an old or typed link), go and pick it.
  const spaceId = Number((await searchParams).space);
  if (!Number.isInteger(spaceId) || spaceId <= 0) redirect("/admin/spaces");
  const s = await one<{ id: number; name: string; audience: string }>(`select id, name, audience from spaces where id = $1`, [spaceId]);
  if (!s) notFound();
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <PageHeader back={{ href: `/admin/spaces/${s.id}`, label: s.name }} title={t("New channel")} />
      <Card className="p-5 sm:p-6">
        <ChannelForm audience={s.audience} v={{ space_id: s.id, name: "", name_ar: "", topic: "", topic_ar: "", type: "chat", visibility: "open", auto_join: true, tags: {}, perms: {}, posting_hours: null, slow_mode: 0,
          locked: false, announce_only: false, approval: "none", allow_anonymous: false, child_photos: false, case_talk: false }} />
      </Card>
    </div>
  );
}
