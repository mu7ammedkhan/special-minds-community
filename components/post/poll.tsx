"use client";

import { useState } from "react";
import { Check, Vote } from "lucide-react";
import { voteAction } from "@/app/actions/posts";
import type { PostView } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { useLocale, useT } from "../i18n";
import { cx } from "../ui";

/** A poll: tap to vote (or several, if allowed); the bars show how others voted once you have. */
export function Poll({ post, onChanged }: { post: PostView; onChanged: () => void }) {
  const t = useT();
  const locale = useLocale();
  const p = post.poll!;
  const [busy, setBusy] = useState(false);
  const voted = p.mine.length > 0;
  const total = p.counts.reduce((a, b) => a + b, 0);
  const vote = async (i: number) => {
    if (!post.can.react || p.closed || busy) return;
    const next = p.multi ? (p.mine.includes(i) ? p.mine.filter((x) => x !== i) : [...p.mine, i]) : p.mine.includes(i) ? [] : [i];
    setBusy(true);
    await voteAction(post.id, next);
    setBusy(false);
    onChanged();
  };
  return (
    <div className="mt-2 max-w-md rounded-2xl border border-hairline bg-surface p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-soft"><Vote className="size-4" />{p.multi ? t("Poll: choose any") : t("Poll: choose one")}</p>
      <ul className="space-y-1.5">
        {p.options.map((o, i) => {
          const pct = total ? Math.round((p.counts[i] / total) * 100) : 0;
          const mine = p.mine.includes(i);
          return (
            <li key={i}>
              <button type="button" onClick={() => vote(i)} disabled={!post.can.react || p.closed || busy}
                className={cx("relative w-full overflow-hidden rounded-xl border px-3 py-2 text-start text-sm transition-colors disabled:cursor-default", mine ? "border-brand" : "border-hairline hover:border-brand-300")}>
                {(voted || p.closed) && <span className="absolute inset-y-0 start-0 bg-brand-50" style={{ width: `${pct}%` }} aria-hidden />}
                <span className="relative flex items-center gap-2">
                  {mine && <Check className="size-4 shrink-0 text-brand" />}
                  <span className="flex-1" dir="auto">{o}</span>
                  {(voted || p.closed) && <span className="num text-xs font-semibold text-soft">{pct}%</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-soft">{t("{n} votes", { n: p.voters })}{p.closesAt ? ` · ${p.closed ? t("Closed") : t("Closes {when}", { when: fmtDateTime(p.closesAt, locale) })}` : ""}</p>
    </div>
  );
}
