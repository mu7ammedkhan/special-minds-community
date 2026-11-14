"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import { readAction, seenAction } from "@/app/actions/posts";
import { dayKey, fmtDay } from "@/lib/format";
import type { ChannelView, PostView } from "@/lib/types";
import { useLocale, useT } from "./i18n";
import { merge, useLive, useSeen } from "./live";
import { Composer } from "./post/composer";
import { MessageRow } from "./post/message";
import { useShell } from "./shell";
import { ThreadView } from "./thread";

type Room = { kind: "channel"; channel: ChannelView } | { kind: "dm"; dmId: number; people: { id: number; name: string }[]; canPost: boolean; blockText: string | null };

/**
 * A chat, announcement channel or private conversation: messages oldest to
 * newest, day lines, replies in a thread panel, the message box at the
 * bottom. New messages arrive every few seconds; if you've scrolled up to
 * read, a button offers to jump down instead of moving the page.
 */
export function ChatRoom({ room, initial, since, meId, header, highlight, thread: threadInit, hasMore: moreInit, canMentionAll, tz }: {
  room: Room; initial: PostView[]; since: string; meId: number; header: React.ReactNode; highlight?: number; thread?: number; hasMore: boolean; canMentionAll: boolean; tz: string;
}) {
  const t = useT();
  const locale = useLocale();
  const shell = useShell();
  const [posts, setPosts] = useState(initial);
  const [thread, setThread] = useState<number | null>(threadInit ?? null);
  const [hasMore, setHasMore] = useState(moreInit);
  const [older, setOlder] = useState(false);
  const [unseenBelow, setUnseenBelow] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const keepFromBottom = useRef<number | null>(null);
  const channelId = room.kind === "channel" ? room.channel.id : undefined;
  const dmId = room.kind === "dm" ? room.dmId : undefined;
  const base = channelId ? `/api/sync?channel=${channelId}` : `/api/sync?dm=${dmId}`;
  const announcement = room.kind === "channel" && room.channel.type === "announcement";
  const staff = room.kind === "channel" && room.channel.moderate;

  const link = useCallback((p: PostView) => {
    if (room.kind === "dm") return `/dm/${room.dmId}`;
    const b = `/s/${room.channel.spaceSlug}/${room.channel.slug}`;
    return p.parentId ? `${b}?thread=${p.parentId}` : `${b}?post=${p.id}`;
  }, [room]);

  // Only the frame's (stable) markRead: the whole frame object changes with every count.
  const shellMarkRead = shell?.markRead;
  const markRead = useCallback(() => {
    void readAction({ channelId, dmId });
    shellMarkRead?.({ channelId, dmId });
  }, [channelId, dmId, shellMarkRead]);
  useEffect(() => { markRead(); }, [markRead]);

  const toBottom = (smooth = false) => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" }); setUnseenBelow(0); };
  useLayoutEffect(() => {
    if (highlight) document.getElementById(`p-${highlight}`)?.scrollIntoView({ block: "center" });
    else toBottom();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && keepFromBottom.current !== null) { el.scrollTop = el.scrollHeight - keepFromBottom.current; keepFromBottom.current = null; }
  }, [posts]);

  useLive(base, since, ({ posts: inc, removed }) => {
    if (!inc.length && !removed.length) return;
    const fresh = inc.filter((p) => !posts.some((x) => x.id === p.id));
    setPosts((l) => merge(l, inc, removed));
    if (fresh.length) {
      if (atBottom.current) { requestAnimationFrame(() => toBottom(true)); markRead(); }
      else setUnseenBelow((n) => n + fresh.filter((p) => p.author.id !== meId).length);
    }
  });

  const loadOlder = async () => {
    if (!posts.length || older) return;
    setOlder(true);
    const r = await fetch(`${base}&before=${posts[0].id}`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ posts: [] }));
    const el = scroller.current;
    if (el) keepFromBottom.current = el.scrollHeight - el.scrollTop;
    setPosts((l) => merge(l, r.posts ?? [], []));
    setHasMore((r.posts ?? []).length >= 50);
    setOlder(false);
  };

  const report = useCallback((ids: number[]) => { void seenAction(ids); }, []);
  const observe = useSeen(announcement, report);

  const openThread = (id: number) => {
    setThread(id);
    const u = new URL(location.href); u.searchParams.set("thread", String(id)); u.searchParams.delete("post");
    history.replaceState(history.state, "", u);
  };
  const closeThread = () => {
    setThread(null);
    const u = new URL(location.href); u.searchParams.delete("thread");
    history.replaceState(history.state, "", u);
  };
  const refresh = useCallback(async () => {
    const r = await fetch(`${base}&since=${encodeURIComponent(new Date(Date.now() - 60_000).toISOString())}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (r) setPosts((l) => merge(l, r.posts ?? [], r.removed ?? []));
  }, [base]);

  const rows = useMemo(() => {
    const out: { key: string; day?: string; post?: PostView; compact?: boolean }[] = [];
    let lastDay = "", prev: PostView | null = null;
    for (const p of posts) {
      const d = dayKey(p.createdAt, tz);
      if (d !== lastDay) {
        const f = fmtDay(p.createdAt, locale, tz);
        out.push({ key: `d-${d}`, day: f.rel === "today" ? t("Today") : f.rel === "yesterday" ? t("Yesterday") : f.text });
        lastDay = d; prev = null;
      }
      const compact = Boolean(prev && prev.author.id === p.author.id && !p.anonymous && !prev.anonymous && !p.title && p.kind === "message" && prev.kind === "message"
        && new Date(p.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000 && !p.pinned);
      out.push({ key: `p-${p.id}`, post: p, compact });
      prev = p;
    }
    return out;
  }, [posts, locale, tz, t]);

  const canPost = room.kind === "channel" ? !room.channel.block : room.canPost;
  const blockText = room.kind === "channel" ? room.channel.block?.text : room.blockText;
  const allowUpload = room.kind === "channel" ? room.channel.perms.upload : true;

  return (
    <div className="flex h-[calc(100dvh-var(--top)-var(--bottom))] min-h-0">
      <section className="flex min-w-0 flex-1 flex-col">
        {header}
        <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto pb-3"
          onScroll={(e) => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150; if (atBottom.current && unseenBelow) { setUnseenBelow(0); markRead(); } }}>
          {hasMore ? (
            <div className="flex justify-center py-3"><button type="button" onClick={loadOlder} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-semibold text-ink-soft hover:border-brand hover:text-brand">{older && <Loader2 className="size-4 animate-spin" />}{t("Show earlier messages")}</button></div>
          ) : (
            <div className="px-5 pb-2 pt-8">
              <p className="font-display text-xl text-ink">{room.kind === "channel" ? t("This is the start of #{channel}", { channel: room.channel.name }) : t("This is the start of your conversation")}</p>
              {room.kind === "channel" && room.channel.topic && <p className="mt-1 text-sm text-soft">{room.channel.topic}</p>}
            </div>
          )}
          {rows.map((r) => r.day ? (
            <div key={r.key} className="my-2 flex items-center gap-3 px-5" role="separator">
              <span className="h-px flex-1 bg-hairline" /><span className="rounded-full border border-hairline bg-surface px-3 py-0.5 text-xs font-semibold text-soft">{r.day}</span><span className="h-px flex-1 bg-hairline" />
            </div>
          ) : (
            <div key={r.key} data-seen={announcement ? r.post!.id : undefined} ref={announcement ? observe : undefined} className="px-2">
              <MessageRow post={r.post!} meId={meId} compact={r.compact} highlight={highlight === r.post!.id} link={link(r.post!)}
                onReply={room.kind === "channel" && (r.post!.can.reply || r.post!.replyCount > 0) ? () => openThread(r.post!.id) : undefined}
                onChange={(p) => setPosts((l) => l.map((x) => (x.id === p.id ? p : x)))} onRemove={(id) => setPosts((l) => l.filter((x) => x.id !== id))}
                onRefresh={refresh} showSeen={announcement && staff} />
            </div>
          ))}
          {unseenBelow > 0 && (
            <button type="button" onClick={() => { toBottom(true); markRead(); }} className="sticky bottom-3 start-1/2 z-20 mx-auto mt-2 flex w-fit items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-lift">
              <ArrowDown className="size-4" />{t("{n} new", { n: unseenBelow })}
            </button>
          )}
        </div>
        <div className="border-t border-hairline bg-paper px-3 pb-3 pt-2 sm:px-4">
          {canPost ? (
            <Composer channelId={channelId} dmId={dmId} placeholder={room.kind === "channel" ? t("Message #{channel}", { channel: room.channel.name }) : t("Write a message")}
              allowUpload={allowUpload} allowVoice allowPoll={room.kind === "channel"} allowSchedule={staff} mentionChannel={channelId}
              people={room.kind === "dm" ? room.people : undefined} canMentionAll={canMentionAll} caseTalk={room.kind === "channel" && room.channel.caseTalk}
              onSent={(p) => { setPosts((l) => merge(l, [p], [])); requestAnimationFrame(() => toBottom(true)); }} autoFocus />
          ) : (
            <p className="rounded-2xl bg-surface px-4 py-3 text-center text-sm text-soft">{blockText ?? t("You can read this channel but not post in it.")}</p>
          )}
        </div>
      </section>
      {thread !== null && room.kind === "channel" && (
        <aside className="fixed inset-0 z-50 flex flex-col bg-surface lg:static lg:z-auto lg:w-[420px] lg:border-s lg:border-hairline">
          <ThreadView key={thread} rootId={thread} meId={meId} link={link} onClose={closeThread} mentionChannel={channelId} allowUpload={allowUpload} />
        </aside>
      )}
    </div>
  );
}
