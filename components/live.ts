"use client";

import { useEffect, useRef } from "react";
import type { PostView } from "@/lib/types";

/**
 * Asks the server "what changed since…" every few seconds while the page is
 * on screen, and straight away when it comes back into view.
 */
export function useLive(base: string | null, since: string, onData: (d: { now: string; posts: PostView[]; removed: number[] }) => void, every = 3000) {
  const sinceRef = useRef(since);
  const cb = useRef(onData);
  cb.current = onData;
  useEffect(() => { sinceRef.current = since; }, [since]);
  useEffect(() => {
    if (!base) return;
    let stop = false, busy = false;
    const run = async () => {
      if (stop || busy || document.hidden) return;
      busy = true;
      try {
        const r = await fetch(`${base}${base.includes("?") ? "&" : "?"}since=${encodeURIComponent(sinceRef.current)}`, { cache: "no-store" });
        if (r.ok) { const d = await r.json(); sinceRef.current = d.now; cb.current({ now: d.now, posts: d.posts ?? [], removed: d.removed ?? [] }); }
      } catch { /* offline for a moment: the next ask catches up */ }
      busy = false;
    };
    const timer = setInterval(run, every);
    const vis = () => { if (!document.hidden) void run(); };
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearInterval(timer); document.removeEventListener("visibilitychange", vis); };
  }, [base, every]);
}

/** Newer copies replace older ones; removed posts go; new ones are added in time order. */
export function merge(list: PostView[], incoming: PostView[], removed: number[], order: "asc" | "desc" = "asc"): PostView[] {
  const byId = new Map(list.map((p) => [p.id, p]));
  for (const p of incoming) {
    const old = byId.get(p.id);
    if (!old || old.updatedAt <= p.updatedAt) byId.set(p.id, old?.preview && !p.preview ? { ...p, preview: old.preview } : p);
  }
  for (const id of removed) byId.delete(id);
  const out = [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id - b.id));
  return order === "asc" ? out : out.reverse();
}

/** Tells the server which of these posts this person has seen (for "Seen by"). */
export function useSeen(enabled: boolean, report: (ids: number[]) => void) {
  const pending = useRef(new Set<number>());
  const sent = useRef(new Set<number>());
  const obs = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    if (!enabled) return;
    obs.current = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const id = Number((e.target as HTMLElement).dataset.seen);
        if (e.isIntersecting && id && !sent.current.has(id)) pending.current.add(id);
      }
    }, { threshold: 0.6 });
    const flush = setInterval(() => {
      if (!pending.current.size || document.hidden) return;
      const ids = [...pending.current];
      ids.forEach((i) => sent.current.add(i));
      pending.current.clear();
      report(ids);
    }, 2500);
    return () => { obs.current?.disconnect(); clearInterval(flush); };
  }, [enabled, report]);
  return (el: HTMLElement | null) => { if (el && obs.current) obs.current.observe(el); };
}
