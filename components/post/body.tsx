"use client";

import { Fragment, type ReactNode } from "react";
import { useT } from "../i18n";

/**
 * A message's words, safely: plain text with its own line breaks, links that
 * open in a new tab, @mentions highlighted (your own in gold), and **bold**.
 * Nothing anyone types is ever treated as HTML.
 */
const TOKEN = /(<@(?:\d+|all)>|\bhttps?:\/\/[^\s<>()]+[^\s<>().,!?;:'"]|\*\*[^*\n]{1,200}\*\*)/g;

export function Body({ text, mentions, meId, className = "" }: { text: string; mentions: Record<string, string>; meId: number; className?: string }) {
  const t = useT();
  if (!text) return null;
  const parts = text.split(TOKEN);
  const out: ReactNode[] = parts.map((p, i) => {
    if (!p) return null;
    const m = p.match(/^<@(\d+|all)>$/);
    if (m) {
      if (m[1] === "all") return <span key={i} className="mention mention-me">@{t("everyone")}</span>;
      const name = mentions[m[1]];
      return <span key={i} className={`mention ${Number(m[1]) === meId ? "mention-me" : ""}`}>@{name || t("someone")}</span>;
    }
    if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow">{p.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}{p.length > 70 ? "…" : ""}</a>;
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    return <Fragment key={i}>{p}</Fragment>;
  });
  return <div className={`msg-body ${className}`} dir="auto">{out}</div>;
}

export function LinkPreview({ data }: { data: Record<string, unknown> }) {
  const p = data.preview as { url: string; title: string; description: string | null; site: string } | undefined;
  if (!p?.title) return null;
  return (
    <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 block max-w-lg rounded-xl border-s-4 border-brand-300 bg-paper px-3 py-2 hover:bg-paper-deep">
      <span className="block text-xs font-semibold text-soft">{p.site}</span>
      <span className="block text-sm font-semibold text-brand" dir="auto">{p.title}</span>
      {p.description && <span className="mt-0.5 line-clamp-2 block text-sm text-ink-soft" dir="auto">{p.description}</span>}
    </a>
  );
}
