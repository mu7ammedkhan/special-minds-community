"use client";

import { useEffect, useRef, useState } from "react";
import { SmilePlus } from "lucide-react";
import { REACTIONS } from "@/lib/options";
import type { PostView } from "@/lib/types";
import { useT } from "../i18n";
import { cx } from "../ui";

export function Reactions({ post, onToggle }: { post: PostView; onToggle: (emoji: string) => void }) {
  const t = useT();
  if (!post.reactions.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {post.reactions.map((r) => (
        <button key={r.emoji} type="button" disabled={!post.can.react} onClick={() => onToggle(r.emoji)} aria-pressed={r.mine} title={r.mine ? t("Remove your reaction") : t("React")}
          className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm transition-colors disabled:cursor-default", r.mine ? "border-brand bg-brand-50 text-brand" : "border-hairline bg-surface text-ink-soft hover:border-brand-300")}>
          <span>{r.emoji}</span><span className="num text-xs font-semibold">{r.count}</span>
        </button>
      ))}
    </div>
  );
}

export function ReactionPicker({ onPick, className }: { onPick: (emoji: string) => void; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open]);
  return (
    <div ref={ref} className={cx("relative", className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={t("Add a reaction")} title={t("Add a reaction")} className="rounded-lg p-1.5 text-soft hover:bg-paper hover:text-ink"><SmilePlus className="size-[18px]" /></button>
      {open && (
        <div className="rise absolute bottom-full end-0 z-40 mb-1 flex gap-0.5 rounded-full border border-hairline bg-surface p-1 shadow-lift">
          {REACTIONS.map((e) => <button key={e} type="button" onClick={() => { onPick(e); setOpen(false); }} className="rounded-full px-1.5 py-1 text-xl hover:bg-paper">{e}</button>)}
        </div>
      )}
    </div>
  );
}
