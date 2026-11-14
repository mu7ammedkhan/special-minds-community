import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { channelBySlug } from "@/lib/access";
import { requireMe } from "@/lib/auth";
import { query } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { opportunityPanel, talentProfileUrl } from "@/lib/opportunities";
import { ctxForChannel, getPost, listReplies, recordViews } from "@/lib/posts";
import { EventCard } from "@/components/event";
import { OpportunityCard, OpportunityPanel } from "@/components/opportunity";
import { PostDetail } from "@/components/post-detail";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Post" };

/** One post with its replies: a forum topic, an opportunity (with the responses for staff), an event, a library item, a feed post. */
export default async function PostPage({ params }: { params: Promise<{ space: string; channel: string; post: string }> }) {
  const { space, channel, post } = await params;
  const me = await requireMe();
  const a = await channelBySlug(me, space, channel);
  if (!a) notFound();
  const id = Number(post);
  const ctx = await ctxForChannel(me, a);
  const root = Number.isFinite(id) ? await getPost(ctx, id) : null;
  if (!root || root.channelId !== a.ch.id) notFound();
  const base = `/s/${space}/${channel}`;
  if (root.parentId) redirect(`${base}/${root.parentId}`);
  if (a.ch.type === "chat" || a.ch.type === "announcement") redirect(`${base}?post=${root.id}`);
  const { t, locale } = await getT();
  const replies = await listReplies(ctx, root.id);
  await recordViews(me, [root.id]);
  const now = new Date().toISOString();
  const back = <Link href={base} className="text-sm font-semibold text-brand"><span className="inline-block rtl:-scale-x-100">←</span> {pick(locale, a.ch.name, a.ch.name_ar)}</Link>;

  if (root.kind === "opportunity") {
    const panel = a.moderate ? await opportunityPanel(me, root.id) : null;
    return (
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">
        {back}
        <OpportunityCard post={root} href={`${base}/${root.id}`} full />
        {panel && <OpportunityPanel postId={root.id} filled={panel.filled} stats={panel.stats} unseen={panel.unseen} talentReady={panel.talentReady}
          rows={panel.rows.map((r) => ({ ...r, talent_url: talentProfileUrl(r.talent_ref) }))} />}
        {(replies.length > 0 || root.can.reply) && <PostDetail root={root} replies={replies} now={now} meId={me.id} base={base} channelId={a.ch.id} hideRoot title={t("Questions")} allowUpload={a.perms.upload} />}
      </div>
    );
  }
  if (root.kind === "event") {
    const people = a.moderate ? await query<{ id: number; name: string; avatar: number | null; answer: string }>(
      `select m.id, m.full_name as name, m.avatar_file_id as avatar, r.answer from rsvps r join members m on m.id = r.member_id where r.post_id = $1 and r.answer in ('going', 'maybe') order by r.answer, m.full_name`, [root.id]) : [];
    return (
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">
        {back}
        <EventCard post={root} href={`${base}/${root.id}`} tz={a.ch.space_tz} meId={me.id} full />
        {a.moderate && (
          <section className="rounded-2xl border border-hairline bg-surface p-5 shadow-card">
            <h2 className="font-display text-lg text-ink">{t("Who's coming")} <span className="text-sm font-normal text-soft">({t("staff only")})</span></h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {people.map((p) => <li key={p.id} className="inline-flex items-center gap-2 rounded-full border border-hairline px-3 py-1 text-sm"><Avatar name={p.name} photoId={p.avatar} size={22} />{p.name}{p.answer === "maybe" && <span className="text-soft">({t("maybe")})</span>}</li>)}
              {!people.length && <li className="text-sm text-soft">{t("No one yet.")}</li>}
            </ul>
          </section>
        )}
        <PostDetail root={root} replies={replies} now={now} meId={me.id} base={base} channelId={a.ch.id} hideRoot title={t("Comments")} allowUpload={a.perms.upload} />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6">
      {back}
      <PostDetail root={root} replies={replies} now={now} meId={me.id} base={base} channelId={a.ch.id} topic={root.kind === "topic"}
        families={a.ch.space_audience === "families"} allowUpload={a.perms.upload} />
    </div>
  );
}
