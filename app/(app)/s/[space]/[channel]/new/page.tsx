import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { channelBySlug, postingBlock, blockText } from "@/lib/access";
import { requireMe } from "@/lib/auth";
import { query } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { getSettings } from "@/lib/settings";
import { PostForm } from "@/components/post-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New" };

export default async function NewPostPage({ params }: { params: Promise<{ space: string; channel: string }> }) {
  const { space, channel } = await params;
  const me = await requireMe();
  const a = await channelBySlug(me, space, channel);
  if (!a) notFound();
  const { t, locale } = await getT();
  const base = `/s/${space}/${channel}`;
  const mode = a.ch.type === "forum" ? "topic" : a.ch.type === "opportunities" ? "opportunity" : a.ch.type === "events" ? "event" : a.ch.type === "library" ? "resource" : null;
  if (!mode) redirect(base);
  const block = await postingBlock(me, a, false);
  const allowed = a.moderate || (mode !== "opportunity" && !block);
  const cats = mode === "resource" ? (await query<{ c: string }>(`select distinct data->>'category' as c from posts where channel_id = $1 and kind = 'resource' and status = 'published' and data->>'category' <> ''`, [a.ch.id])).map((r) => r.c) : [];
  const title = mode === "topic" ? t("New topic") : mode === "opportunity" ? t("New opportunity") : mode === "event" ? t("New event") : t("Add to library");
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link href={base} className="text-sm font-semibold text-brand"><span className="inline-block rtl:-scale-x-100">←</span> {pick(locale, a.ch.name, a.ch.name_ar)}</Link>
      <h1 className="mt-2 font-display text-[2rem] text-ink">{title}</h1>
      {mode === "opportunity" && <p className="mt-1 text-base text-soft">{t("Posted once, alerted only to the specialists who fit. Their answers come back to you here.")}</p>}
      <div className="mt-6 rounded-2xl border border-hairline bg-surface p-5 shadow-card sm:p-6">
        {allowed ? (
          <PostForm mode={mode} channelId={a.ch.id} back={base} country={a.ch.space_country} staff={a.moderate} allowAnonymous={a.ch.allow_anonymous && !me.staff} categories={cats} nudgeHours={(await getSettings()).nudgeHours} />
        ) : (
          <p className="text-soft">{block ? blockText(block, t, locale) : t("Only staff can post here.")}</p>
        )}
      </div>
    </div>
  );
}
