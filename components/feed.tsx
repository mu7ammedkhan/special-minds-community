"use client";

import Link from "next/link";
import { useState } from "react";
import { Heart, Loader2, MessageCircle } from "lucide-react";
import { reactAction } from "@/app/actions/posts";
import { timeAgo } from "@/lib/format";
import type { ChannelView, PostView } from "@/lib/types";
import { useLocale, useT } from "./i18n";
import { merge, useLive } from "./live";
import { Body, LinkPreview } from "./post/body";
import { Composer } from "./post/composer";
import { Attachments } from "./post/files";
import { AuthorAvatar, AuthorName, PostMenu, StatusLine } from "./post/message";
import { Poll } from "./post/poll";
import { cx } from "./ui";

/** The parents' feed, like a Facebook group: share something at the top, newest first, likes and comments. */
export function Feed({ channel, initial, since, meId }: { channel: ChannelView; initial: PostView[]; since: string; meId: number }) {
  const t = useT();
  const [posts, setPosts] = useState(initial);
  const [more, setMore] = useState(initial.length >= 15);
  const [loading, setLoading] = useState(false);
  useLive(`/api/sync?channel=${channel.id}`, since, ({ posts: inc, removed }) => setPosts((l) => merge(l, inc, removed, "desc")), 5000);
  const base = `/s/${channel.spaceSlug}/${channel.slug}`;
  const loadMore = async () => {
    setLoading(true);
    const last = posts[posts.length - 1];
    const r = await fetch(`/api/sync?channel=${channel.id}&before=${last.id}`).then((x) => x.json()).catch(() => ({ posts: [] }));
    setPosts((l) => merge(l, r.posts ?? [], [], "desc"));
    setMore((r.posts ?? []).length >= 50);
    setLoading(false);
  };
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-3 py-5 sm:px-4">
      {channel.block ? (
        <p className="rounded-2xl bg-surface px-4 py-3 text-center text-sm text-soft shadow-card">{channel.block.text}</p>
      ) : (
        <div className="rounded-2xl bg-surface p-3 shadow-card">
          <Composer channelId={channel.id} placeholder={channel.audience === "families" ? t("Share something with other parents…") : t("Share something…")} rows={2}
            allowUpload={channel.perms.upload} allowVoice={false} allowPoll allowSchedule={channel.moderate} allowAnonymous={channel.allowAnonymous} mentionChannel={channel.id}
            canMentionAll={channel.moderate} submitLabel={t("Post")} onSent={(p) => setPosts((l) => merge(l, [p], [], "desc"))} />
          {!channel.childPhotos && channel.audience === "families" && <p className="mt-2 px-1 text-xs text-soft">{t("Please don't share photos where a child's face can be seen.")}</p>}
        </div>
      )}
      {posts.map((p) => <FeedPost key={p.id} post={p} meId={meId} link={`${base}/${p.id}`} channel={channel}
        onChange={(n) => setPosts((l) => l.map((x) => (x.id === n.id ? n : x)))} onRemove={(id) => setPosts((l) => l.filter((x) => x.id !== id))} />)}
      {!posts.length && <p className="rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center text-soft">{t("Nothing here yet. Be the first to share something.")}</p>}
      {more && <div className="flex justify-center"><button type="button" onClick={loadMore} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-soft hover:border-brand hover:text-brand">{loading && <Loader2 className="size-4 animate-spin" />}{t("Show older posts")}</button></div>}
    </div>
  );
}

function FeedPost({ post, meId, link, channel, onChange, onRemove }: { post: PostView; meId: number; link: string; channel: ChannelView; onChange: (p: PostView) => void; onRemove: (id: number) => void }) {
  const t = useT();
  const locale = useLocale();
  const [comments, setComments] = useState<PostView[] | null>(null);
  const [open, setOpen] = useState(false);
  const like = post.reactions.find((r) => r.emoji === "❤️");
  const toggleLike = async () => {
    const mine = like?.mine;
    const reactions = mine ? post.reactions.map((r) => (r.emoji === "❤️" ? { ...r, count: r.count - 1, mine: false } : r)).filter((r) => r.count > 0)
      : like ? post.reactions.map((r) => (r.emoji === "❤️" ? { ...r, count: r.count + 1, mine: true } : r)) : [...post.reactions, { emoji: "❤️", count: 1, mine: true }];
    onChange({ ...post, reactions });
    await reactAction(post.id, "❤️");
  };
  const loadAll = async () => {
    setOpen(true);
    const r = await fetch(`/api/thread/${post.id}`).then((x) => x.json()).catch(() => null);
    if (r) setComments(r.replies);
  };
  const shown = comments ?? post.preview ?? [];
  return (
    <article className="rounded-2xl bg-surface shadow-card">
      <div className="flex items-start gap-3 px-4 pt-4">
        <AuthorAvatar author={post.author} size={42} />
        <div className="min-w-0 flex-1">
          <AuthorName author={post.author} />
          <p className="text-xs text-faint"><Link href={link} className="hover:underline">{timeAgo(post.createdAt, locale)}</Link>{post.pinned ? ` · ${t("Pinned")}` : ""}</p>
        </div>
        <PostMenu post={post} link={link} top onRemoved={onRemove} onChanged={() => {}} />
      </div>
      <div className="px-4 pb-2 pt-2">
        <Body text={post.body} mentions={post.mentions} meId={meId} className="text-base text-ink" />
        <LinkPreview data={post.data} />
        <Attachments files={post.files} large />
        {post.poll && <Poll post={post} onChanged={() => {}} />}
        <StatusLine post={post} />
      </div>
      <div className="flex items-center gap-1 border-t border-hairline px-2 py-1">
        <button type="button" disabled={!post.can.react} onClick={toggleLike} aria-pressed={like?.mine ?? false}
          className={cx("inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-default", like?.mine ? "text-danger" : "text-soft hover:bg-paper")}>
          <Heart className={cx("size-5", like?.mine && "fill-current")} />{like?.count ? t("{n} likes", { n: like.count }) : t("Like")}
        </button>
        <button type="button" onClick={() => (open ? setOpen(false) : loadAll())} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-soft hover:bg-paper">
          <MessageCircle className="size-5" />{post.replyCount ? t("{n} comments", { n: post.replyCount }) : t("Comment")}
        </button>
      </div>
      {(shown.length > 0 || open) && (
        <div className="space-y-2 border-t border-hairline px-4 py-3">
          {!open && post.replyCount > shown.length && <button type="button" onClick={loadAll} className="text-sm font-semibold text-soft hover:text-ink">{t("View all {n} comments", { n: post.replyCount })}</button>}
          {shown.map((c) => (
            <div key={c.id} className="flex gap-2">
              <AuthorAvatar author={c.author} size={30} />
              <div className="min-w-0 flex-1 rounded-2xl bg-paper px-3 py-2">
                <AuthorName author={c.author} className="text-sm" />
                <Body text={c.body} mentions={c.mentions} meId={meId} className="text-sm text-ink" />
                <Attachments files={c.files} />
                <StatusLine post={c} />
              </div>
            </div>
          ))}
          {open && post.can.reply && (
            <Composer parentId={post.id} placeholder={t("Write a comment…")} compact allowUpload={channel.perms.upload} mentionChannel={channel.id}
              onSent={(c) => { setComments((l) => [...(l ?? shown), c]); onChange({ ...post, replyCount: post.replyCount + (c.status === "published" ? 1 : 0) }); }} />
          )}
        </div>
      )}
    </article>
  );
}
