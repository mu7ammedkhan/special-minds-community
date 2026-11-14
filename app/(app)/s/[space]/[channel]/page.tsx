import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, MessageSquare, Plus, UserRound } from "lucide-react";
import { channelBySlug, channelView } from "@/lib/access";
import { requireMe } from "@/lib/auth";
import { one } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { ctxForChannel, listEvents, listFeed, listLibrary, listMessages, listOpportunities, listPinned, listTopics, markRead } from "@/lib/posts";
import { ChannelHeader } from "@/components/channel-header";
import { ChatRoom } from "@/components/chat-room";
import { EventCard } from "@/components/event";
import { Feed } from "@/components/feed";
import { Library } from "@/components/library";
import { OpportunityCard } from "@/components/opportunity";
import { Avatar, buttonClass, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ space: string; channel: string }> }) {
  const { channel } = await params;
  return { title: `#${channel}` };
}

/** One channel, drawn the way its kind needs: chat, announcements, forum, feed, opportunities, events or library. */
export default async function ChannelPage({ params, searchParams }: { params: Promise<{ space: string; channel: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { space, channel } = await params;
  const sp = await searchParams;
  const me = await requireMe();
  const a = await channelBySlug(me, space, channel);
  if (!a) notFound();
  const { t, locale } = await getT();
  const view = await channelView(me, a, t, locale);
  const ctx = await ctxForChannel(me, a);
  const members = (await one<{ n: number }>(`select count(*)::int as n from channel_members where channel_id = $1`, [a.ch.id]))?.n ?? 0;
  const now = new Date().toISOString();
  const base = `/s/${space}/${channel}`;
  const pinned = await listPinned(ctx, a.ch.id);
  const header = (actions?: React.ReactNode) => <ChannelHeader channel={view} pinned={pinned} members={members} meId={me.id} actions={actions} />;

  if (a.ch.type === "chat" || a.ch.type === "announcement") {
    const posts = await listMessages(ctx, { channelId: a.ch.id }, undefined, 60);
    return (
      <ChatRoom room={{ kind: "channel", channel: view }} initial={posts} since={now} meId={me.id} header={header()} highlight={Number(sp.post) || undefined}
        thread={Number(sp.thread) || undefined} hasMore={posts.length >= 60} canMentionAll={a.moderate} tz={a.ch.space_tz} />
    );
  }
  if (a.joined) await markRead(me, { channelId: a.ch.id });
  const newButton = (label: string) => (!view.block && (a.moderate || (a.perms.post && a.ch.type !== "opportunities"))
    ? <Link href={`${base}/new`} className={buttonClass("primary", "sm")}><Plus className="size-4" /><span className="hidden sm:inline">{label}</span></Link> : null);
  const tabs = (items: { key: string; label: string }[], current: string) => (
    <nav className="mx-auto flex max-w-4xl gap-1 px-4 pt-4 sm:px-6" aria-label={t("Show")}>
      {items.map((i) => (
        <Link key={i.key} href={`${base}?tab=${i.key}`} aria-current={current === i.key ? "page" : undefined}
          className={cx("rounded-full px-4 py-1.5 text-sm font-semibold", current === i.key ? "bg-brand text-white" : "text-ink-soft hover:bg-brand-50")}>{i.label}</Link>
      ))}
    </nav>
  );

  if (a.ch.type === "feed") {
    const posts = await listFeed(ctx, a.ch.id);
    return <div>{header()}<Feed channel={view} initial={posts} since={now} meId={me.id} /></div>;
  }

  if (a.ch.type === "forum") {
    const filter = sp.tab === "unanswered" ? "unanswered" : sp.tab === "mine" ? "mine" : "all";
    const topics = await listTopics(ctx, a.ch.id, filter);
    return (
      <div>
        {header(newButton(t("New topic")))}
        {tabs([{ key: "all", label: t("All") }, { key: "unanswered", label: t("No replies yet") }, { key: "mine", label: t("Mine") }], filter)}
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
          {view.audience === "families" && <p className="mb-3 rounded-xl bg-paper-deep/60 px-4 py-2.5 text-sm text-ink-soft">{t("Answers here come from parents and specialists. They aren't medical advice: for your child's care, speak to their own doctor or therapist.")}</p>}
          <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface shadow-card">
            {topics.map((p) => (
              <li key={p.id}>
                <Link href={`${base}/${p.id}`} className="flex items-start gap-3 px-4 py-3.5 hover:bg-paper">
                  {p.author.anonymous ? <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-paper-deep text-soft"><UserRound className="size-5" /></span> : <Avatar name={p.author.name || "?"} photoId={p.author.avatar} size={40} />}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink" dir="auto">{p.title}</span>
                      {p.pinned && <span className="text-xs font-semibold text-caution">{t("Pinned")}</span>}
                      {p.bestAnswerId && <span className="inline-flex items-center gap-1 text-xs font-semibold text-moss"><CheckCircle2 className="size-3.5" />{t("Answered")}</span>}
                      {p.status !== "published" && <span className="text-xs font-semibold text-caution">{t("Waiting for review")}</span>}
                    </span>
                    <span className="mt-0.5 line-clamp-1 block text-sm text-soft" dir="auto">{p.body}</span>
                    <span className="mt-1 block text-xs text-faint">{p.author.anonymous ? t("A parent") : p.author.name} · {timeAgo(p.lastReplyAt ?? p.createdAt, locale)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-soft"><MessageSquare className="size-4" />{p.replyCount}</span>
                </Link>
              </li>
            ))}
            {!topics.length && <li className="px-6 py-12 text-center text-soft">{filter === "all" ? t("No topics yet. Ask the first question.") : t("Nothing here.")}</li>}
          </ul>
        </div>
      </div>
    );
  }

  if (a.ch.type === "opportunities") {
    const tab = sp.tab === "filled" ? "filled" : sp.tab === "mine" ? "mine" : "open";
    const list = await listOpportunities(ctx, a.ch.id, tab);
    return (
      <div>
        {header(newButton(t("New opportunity")))}
        {tabs([{ key: "open", label: t("Open") }, { key: "mine", label: t("I'm interested") }, { key: "filled", label: t("Filled") }], tab)}
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-4 sm:px-6">
          {list.map((p) => <OpportunityCard key={p.id} post={p} href={`${base}/${p.id}`} />)}
          {!list.length && <p className="rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center text-soft">{tab === "open" ? t("No open opportunities right now. You'll get an alert when one fits you.") : t("Nothing here.")}</p>}
        </div>
      </div>
    );
  }

  if (a.ch.type === "events") {
    const when = sp.tab === "past" ? "past" : "upcoming";
    const list = await listEvents(ctx, a.ch.id, when);
    return (
      <div>
        {header(newButton(t("New event")))}
        {tabs([{ key: "upcoming", label: t("Coming up") }, { key: "past", label: t("Past") }], when)}
        <div className="mx-auto max-w-4xl space-y-3 px-4 py-4 sm:px-6">
          {list.map((p) => <EventCard key={p.id} post={p} href={`${base}/${p.id}`} tz={a.ch.space_tz} meId={me.id} />)}
          {!list.length && <p className="rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center text-soft">{when === "upcoming" ? t("No events coming up yet.") : t("No past events.")}</p>}
        </div>
      </div>
    );
  }

  const items = await listLibrary(ctx, a.ch.id);
  return <div>{header(newButton(t("Add to library")))}<Library items={items} base={base} /></div>;
}
