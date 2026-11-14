"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { PostView } from "@/lib/types";
import { useT } from "./i18n";
import { merge, useLive } from "./live";
import { Composer } from "./post/composer";
import { MessageRow } from "./post/message";

/**
 * A post's replies, live: the panel beside a chat (Slack's threads), and the
 * replies under a topic, opportunity, event or library item.
 */
export function ThreadView({ rootId, meId, link, onClose, initial, hideRoot = false, mentionChannel, allowUpload = true, placeholder, onCount, renderRoot, replyExtra }: {
  rootId: number; meId: number; link: (p: PostView) => string; onClose?: () => void;
  initial?: { root: PostView; replies: PostView[]; now: string }; hideRoot?: boolean; mentionChannel?: number; allowUpload?: boolean; placeholder?: string;
  onCount?: (n: number) => void; renderRoot?: (root: PostView, refresh: () => void) => React.ReactNode;
  replyExtra?: (reply: PostView, root: PostView, refresh: () => void) => React.ReactNode;
}) {
  const t = useT();
  const [root, setRoot] = useState<PostView | null>(initial?.root ?? null);
  const [replies, setReplies] = useState<PostView[]>(initial?.replies ?? []);
  const [since, setSince] = useState(initial?.now ?? new Date().toISOString());
  const [gone, setGone] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch(`/api/thread/${rootId}`, { cache: "no-store" });
    if (!r.ok) { setGone(true); return; }
    const d = await r.json();
    setRoot(d.root); setReplies(d.replies); setSince(d.now);
  }, [rootId]);
  useEffect(() => { if (!initial) void load(); }, [initial, load]);
  useLive(`/api/sync?thread=${rootId}`, since, ({ posts, removed }) => {
    const r = posts.find((p) => p.id === rootId);
    if (r) setRoot((old) => (!old || old.updatedAt <= r.updatedAt ? r : old));
    if (removed.includes(rootId)) setGone(true);
    setReplies((l) => merge(l, posts.filter((p) => p.id !== rootId), removed));
  });
  useEffect(() => { onCount?.(replies.length); }, [replies.length, onCount]);
  const change = (p: PostView) => { if (p.id === rootId) setRoot(p); else setReplies((l) => l.map((x) => (x.id === p.id ? p : x))); };
  const remove = (id: number) => { if (id === rootId) setGone(true); else setReplies((l) => l.filter((x) => x.id !== id)); };

  if (gone) return <div className="p-6 text-soft">{t("That post isn't there any more.")}{onClose && <button onClick={onClose} className="ms-2 font-semibold text-brand">{t("Close")}</button>}</div>;
  if (!root) return <div className="flex justify-center p-10"><Loader2 className="size-6 animate-spin text-soft" /></div>;
  const panel = Boolean(onClose);
  return (
    <div className={panel ? "flex h-full min-h-0 flex-col" : ""}>
      {panel && (
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <span className="font-display text-lg text-ink">{t("Thread")}</span>
          <button onClick={onClose} aria-label={t("Close")} className="rounded-lg p-1.5 text-soft hover:bg-paper hover:text-ink"><X className="size-5" /></button>
        </div>
      )}
      <div className={panel ? "min-h-0 flex-1 overflow-y-auto py-2" : "py-1"}>
        {!hideRoot && (renderRoot ? renderRoot(root, load) : <MessageRow post={root} meId={meId} link={link(root)} onChange={change} onRemove={remove} onRefresh={load} />)}
        {!hideRoot && <div className="mx-4 my-2 flex items-center gap-3 text-xs font-semibold text-soft"><span>{t("{n} replies", { n: replies.length })}</span><span className="h-px flex-1 bg-hairline" /></div>}
        {replies.map((p) => (
          <MessageRow key={p.id} post={p} meId={meId} link={link(p)} onChange={change} onRemove={remove} onRefresh={load}
            highlight={root.bestAnswerId === p.id} extra={replyExtra?.(p, root, load)} />
        ))}
        {!replies.length && hideRoot && <p className="px-4 py-3 text-sm text-soft">{t("No replies yet.")}</p>}
      </div>
      <div className={panel ? "border-t border-hairline p-3" : "mt-3"}>
        {root.can.reply ? (
          <Composer parentId={rootId} placeholder={placeholder ?? t("Reply…")} allowUpload={allowUpload} allowVoice mentionChannel={mentionChannel} compact={panel}
            onSent={(p) => setReplies((l) => merge(l, [p], []))} />
        ) : (
          <p className="rounded-xl bg-paper px-4 py-3 text-sm text-soft">{root.locked ? t("Replies are closed on this one.") : t("You can read the replies but not reply here.")}</p>
        )}
      </div>
    </div>
  );
}
