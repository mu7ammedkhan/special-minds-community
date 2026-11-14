import { notFound } from "next/navigation";
import { Megaphone } from "lucide-react";
import { requireMe } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { Body } from "@/components/post/body";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Broadcast" };

/** A broadcast someone received: opening it counts as "seen". */
export default async function BroadcastPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const me = await requireMe();
  const { t, locale } = await getT();
  const b = Number.isFinite(id) ? await one<{ title: string; body: string; sent_at: string | null; author: string | null; mine: boolean }>(
    `select b.title, b.body, b.sent_at, (select full_name from members where id = b.author_id) as author,
            exists (select 1 from broadcast_recipients r where r.broadcast_id = b.id and r.member_id = $2) as mine
       from broadcasts b where b.id = $1`, [id, me.id]) : null;
  if (!b || (!b.mine && !me.staff)) notFound();
  if (b.mine) await query(`update broadcast_recipients set seen_at = coalesce(seen_at, now()) where broadcast_id = $1 and member_id = $2`, [id, me.id]);
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <Card className="p-6">
        <p className="flex items-center gap-2 text-sm font-semibold text-caution"><Megaphone className="size-4" />{t("From Special Minds")}</p>
        <h1 className="mt-2 font-display text-2xl text-ink" dir="auto">{b.title}</h1>
        <p className="mt-1 text-sm text-soft">{b.author ? `${b.author} · ` : ""}{fmtDateTime(b.sent_at, locale)}</p>
        <Body text={b.body} mentions={{}} meId={me.id} className="mt-4 text-base text-ink" />
      </Card>
    </div>
  );
}
