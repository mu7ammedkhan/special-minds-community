"use client";

import { useState } from "react";
import { BadgeCheck, CheckCircle2, Clock, Copy, EllipsisVertical, Flag, Lock, LockOpen, MessageSquareReply, Pencil, Pin, PinOff, ShieldAlert, Trash2, UserRound, XCircle } from "lucide-react";
import { approvePostAction, editPostAction, lockAction, pinAction, reactAction, removePostAction, reportAction } from "@/app/actions/posts";
import { fmtDateTime, fmtTime, timeAgo } from "@/lib/format";
import { HOLD_REASON, REPORT_REASONS, STAFF_LABEL } from "@/lib/options";
import type { Author, PostView } from "@/lib/types";
import { useLocale, useT } from "../i18n";
import { Menu, Modal } from "../overlay";
import { Avatar, Badge, Button, cx } from "../ui";
import { Body, LinkPreview } from "./body";
import { Attachments } from "./files";
import { Poll } from "./poll";
import { ReactionPicker, Reactions } from "./reactions";

export function AuthorName({ author, className = "" }: { author: Author; className?: string }) {
  const t = useT();
  if (author.anonymous) {
    return (
      <span className={cx("inline-flex flex-wrap items-center gap-1.5", className)}>
        <span className="font-semibold text-ink">{t("A parent")}</span>
        {author.realName && <span className="text-xs text-soft" title={t("Only staff and the author see this")}>({author.realName})</span>}
      </span>
    );
  }
  return (
    <span className={cx("inline-flex flex-wrap items-center gap-1.5", className)}>
      <a href={author.id ? `/members/${author.id}` : undefined} className="font-semibold text-ink hover:underline" dir="auto">{author.name || t("Deleted member")}</a>
      {author.staff ? <Badge tone="brand" className="!px-2 !py-0">{t(STAFF_LABEL[author.staff])}</Badge> : author.kind === "team" ? <Badge tone="brand" className="!px-2 !py-0">Special Minds</Badge> : null}
      {author.verified && <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-moss" title={author.verified}><BadgeCheck className="size-4" />{t(author.verified)}</span>}
    </span>
  );
}

export function AuthorAvatar({ author, size = 40 }: { author: Author; size?: number }) {
  if (author.anonymous) return <span className="flex shrink-0 items-center justify-center rounded-full bg-paper-deep text-soft" style={{ width: size, height: size }}><UserRound className="size-1/2" /></span>;
  return <Avatar name={author.name || "?"} photoId={author.avatar} size={size} />;
}

export function StatusLine({ post }: { post: PostView }) {
  const t = useT();
  const locale = useLocale();
  if (post.status === "pending") return <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-apricot-50 px-2.5 py-0.5 text-xs font-semibold text-caution"><Clock className="size-3.5" />{t("Waiting for a moderator to approve it")}</p>;
  if (post.status === "held") return <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-apricot-50 px-2.5 py-0.5 text-xs font-semibold text-caution"><ShieldAlert className="size-3.5" />{t("Held for review")}{post.holdReason ? `: ${t(HOLD_REASON[post.holdReason] ?? post.holdReason)}` : ""}</p>;
  if (post.status === "scheduled") return <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-info-50 px-2.5 py-0.5 text-xs font-semibold text-info"><Clock className="size-3.5" />{t("Scheduled for {when}", { when: fmtDateTime(post.publishAt, locale) })}</p>;
  if (post.flagged) return <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-apricot-50 px-2.5 py-0.5 text-xs font-semibold text-caution"><Flag className="size-3.5" />{t("Flagged for a look: {words}", { words: post.flagged })}</p>;
  return null;
}

/** The ⋯ menu on any post: reply, edit, remove, pin, lock, copy link, report, approve. */
export function PostMenu({ post, link, onEdit, onReply, onRemoved, onChanged, top }: {
  post: PostView; link: string; onEdit?: () => void; onReply?: () => void; onRemoved: (id: number) => void; onChanged: () => void; top: boolean;
}) {
  const t = useT();
  const [report, setReport] = useState(false);
  const [remove, setRemove] = useState(false);
  const [copied, setCopied] = useState(false);
  const item = "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-sm text-ink-soft hover:bg-paper hover:text-ink";
  const waiting = post.status === "pending" || post.status === "held";
  return (
    <>
      <Menu chevron={false} align="right" ariaLabel={t("More")} className="rounded-lg p-1.5 text-soft hover:bg-paper hover:text-ink" label={<EllipsisVertical className="size-[18px]" />}>
        {post.can.moderate && waiting && (
          <>
            <button data-close type="button" className={item} onClick={async () => { await approvePostAction(post.id, true, null); onChanged(); }}><CheckCircle2 className="size-4 text-moss" />{t("Approve")}</button>
            <button data-close type="button" className={item} onClick={() => setRemove(true)}><XCircle className="size-4 text-danger" />{t("Reject")}</button>
          </>
        )}
        {onReply && post.status === "published" && <button data-close type="button" className={item} onClick={onReply}><MessageSquareReply className="size-4" />{t("Reply in thread")}</button>}
        {post.can.edit && onEdit && <button data-close type="button" className={item} onClick={onEdit}><Pencil className="size-4" />{t("Edit")}</button>}
        {post.can.moderate && top && post.status === "published" && (
          <button data-close type="button" className={item} onClick={async () => { await pinAction(post.id, !post.pinned); onChanged(); }}>
            {post.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}{post.pinned ? t("Unpin") : t("Pin to the top")}
          </button>
        )}
        {post.can.moderate && top && post.status === "published" && (
          <button data-close type="button" className={item} onClick={async () => { await lockAction(post.id, !post.locked); onChanged(); }}>
            {post.locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}{post.locked ? t("Open replies again") : t("Close replies")}
          </button>
        )}
        <button data-close type="button" className={item} onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}${link}`); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } }}>
          <Copy className="size-4" />{copied ? t("Copied") : t("Copy link")}
        </button>
        {!post.mine && post.status === "published" && <button data-close type="button" className={item} onClick={() => setReport(true)}><Flag className="size-4" />{t("Report to moderators")}</button>}
        {post.can.remove && (
          <button data-close type="button" className={cx(item, "text-danger hover:text-danger")} onClick={async () => {
            if (post.mine) { if (window.confirm(t("Delete this for everyone?"))) { await removePostAction(post.id, null); onRemoved(post.id); } }
            else setRemove(true);
          }}><Trash2 className="size-4" />{post.mine ? t("Delete") : t("Remove")}</button>
        )}
      </Menu>
      <ReportDialog open={report} onClose={() => setReport(false)} postId={post.id} />
      <RemoveDialog open={remove} onClose={() => setRemove(false)} onDone={() => { setRemove(false); onRemoved(post.id); }} postId={post.id} reject={waiting} />
    </>
  );
}

function ReportDialog({ open, onClose, postId }: { open: boolean; onClose: () => void; postId: number }) {
  const t = useT();
  const [reason, setReason] = useState("contact");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  return (
    <Modal open={open} onClose={() => { onClose(); setDone(false); }} title={t("Report to moderators")} subtitle={t("Only Special Minds moderators see reports. The person isn't told who reported them.")}>
      {done ? (
        <div className="space-y-4"><p className="rounded-xl bg-moss-50 px-4 py-3 text-sm text-moss">{t("Thank you. A moderator will look at it today.")}</p><Button onClick={() => { onClose(); setDone(false); }}>{t("Close")}</Button></div>
      ) : (
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); await reportAction(postId, reason, note || null); setDone(true); }}>
          {REPORT_REASONS.map((r) => (
            <label key={r.value} className="option-card"><input type="radio" name="reason" checked={reason === r.value} onChange={() => setReason(r.value)} /><span className="text-sm font-semibold text-ink">{t(r.label)}</span></label>
          ))}
          <textarea className="input" rows={2} placeholder={t("Anything else moderators should know (optional)")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          <Button type="submit">{t("Send report")}</Button>
        </form>
      )}
    </Modal>
  );
}

function RemoveDialog({ open, onClose, onDone, postId, reject }: { open: boolean; onClose: () => void; onDone: () => void; postId: number; reject: boolean }) {
  const t = useT();
  const [reason, setReason] = useState("");
  return (
    <Modal open={open} onClose={onClose} title={reject ? t("Reject this post") : t("Remove this post")} subtitle={t("The author is told it was removed, with your reason.")}>
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (reject) await approvePostAction(postId, false, reason || null); else await removePostAction(postId, reason || null); onDone(); }}>
        <textarea className="input" rows={3} placeholder={t("Reason, in a few words (the author sees this)")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        <div className="flex gap-2"><Button type="submit" variant="danger">{reject ? t("Reject") : t("Remove")}</Button><Button variant="ghost" onClick={onClose}>{t("Cancel")}</Button></div>
      </form>
    </Modal>
  );
}

export function useReactToggle(post: PostView, onLocal: (p: PostView) => void) {
  return async (emoji: string) => {
    const had = post.reactions.find((r) => r.emoji === emoji)?.mine;
    const reactions = had
      ? post.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, mine: false } : r)).filter((r) => r.count > 0)
      : post.reactions.some((r) => r.emoji === emoji) ? post.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r)) : [...post.reactions, { emoji, count: 1, mine: true }];
    onLocal({ ...post, reactions });
    await reactAction(post.id, emoji);
  };
}

/** One message in a chat, announcement, thread or private conversation. */
export function MessageRow({ post, meId, compact, highlight, link, onReply, onChange, onRemove, onRefresh, showSeen, extra }: {
  post: PostView; meId: number; compact?: boolean; highlight?: boolean; link: string;
  onReply?: () => void; onChange: (p: PostView) => void; onRemove: (id: number) => void; onRefresh: () => void; showSeen?: boolean; extra?: React.ReactNode;
}) {
  const t = useT();
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const toEditable = (s: string) => s.replace(/<@(\d+)>/g, (_, id: string) => `@${post.mentions[id] ?? id}`).replace(/<@all>/g, "@everyone");
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const toggle = useReactToggle(post, onChange);
  const save = async () => {
    let body = draft;
    for (const [id, name] of Object.entries(post.mentions)) if (name) body = body.split(`@${name}`).join(`<@${id}>`);
    const r = await editPostAction(post.id, body, null);
    if (!r.ok) { setErr(r.error); return; }
    onChange(r.post); setEditing(false); setErr(null);
  };
  return (
    <div id={`p-${post.id}`} className={cx("group relative flex gap-3 rounded-xl px-3 transition-colors hover:bg-paper-deep/40", compact ? "py-0.5" : "pt-2.5 pb-1", highlight && "highlight", post.pinned && !compact && "bg-champagne-soft/20")}>
      <div className="w-10 shrink-0">
        {compact ? <span className="invisible block pt-1 text-end text-[0.7rem] text-faint group-hover:visible num">{fmtTime(post.createdAt, locale)}</span> : <AuthorAvatar author={post.author} />}
      </div>
      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <AuthorName author={post.author} />
            <span className="text-xs text-faint num" title={fmtDateTime(post.createdAt, locale)}>{fmtTime(post.createdAt, locale)}</span>
            {post.pinned && <span className="inline-flex items-center gap-1 text-xs font-semibold text-caution"><Pin className="size-3" />{t("Pinned")}</span>}
          </div>
        )}
        {editing ? (
          <div className="mt-1 space-y-2">
            <textarea className="input" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus dir="auto"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void save(); } if (e.key === "Escape") setEditing(false); }} />
            {err && <p className="text-sm text-danger">{err}</p>}
            <div className="flex gap-2"><Button size="xs" onClick={save}>{t("Save")}</Button><Button size="xs" variant="ghost" onClick={() => setEditing(false)}>{t("Cancel")}</Button></div>
          </div>
        ) : (
          <>
            {post.title && <p className="font-semibold text-ink" dir="auto">{post.title}</p>}
            <Body text={post.body} mentions={post.mentions} meId={meId} className="text-ink" />
            {post.editedAt && <span className="text-xs text-faint"> ({t("edited")})</span>}
          </>
        )}
        <LinkPreview data={post.data} />
        <Attachments files={post.files} />
        {post.poll && <Poll post={post} onChanged={onRefresh} />}
        <StatusLine post={post} />
        <Reactions post={post} onToggle={toggle} />
        {extra}
        <div className="flex flex-wrap items-center gap-x-3">
          {onReply && post.replyCount > 0 && (
            <button type="button" onClick={onReply} className="mt-1 inline-flex items-center gap-1.5 rounded-lg py-0.5 text-sm font-semibold text-brand hover:underline">
              <MessageSquareReply className="size-4 rtl:-scale-x-100" />{t("{n} replies", { n: post.replyCount })}
              {post.lastReplyAt && <span className="font-normal text-faint">· {timeAgo(post.lastReplyAt, locale)}</span>}
            </button>
          )}
          {post.locked && <span className="mt-1 inline-flex items-center gap-1 text-xs text-soft"><Lock className="size-3" />{t("Replies closed")}</span>}
          {showSeen && typeof post.views === "number" && <span className="mt-1 text-xs text-soft">{t("Seen by {n}", { n: post.views })}</span>}
        </div>
      </div>
      {!editing && (
        <div className="absolute -top-3 end-3 hidden items-center rounded-xl border border-hairline bg-surface shadow-card group-hover:flex group-focus-within:flex">
          {post.can.react && <ReactionPicker onPick={toggle} />}
          {onReply && post.can.reply && <button type="button" onClick={onReply} aria-label={t("Reply in thread")} title={t("Reply in thread")} className="rounded-lg p-1.5 text-soft hover:bg-paper hover:text-ink"><MessageSquareReply className="size-[18px] rtl:-scale-x-100" /></button>}
          <PostMenu post={post} link={link} top={!post.parentId} onReply={onReply} onEdit={() => { setDraft(toEditable(post.body)); setEditing(true); }} onRemoved={onRemove} onChanged={onRefresh} />
        </div>
      )}
    </div>
  );
}
