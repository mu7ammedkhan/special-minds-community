"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BadgeCheck, Loader2, Search, X } from "lucide-react";
import { startDm } from "@/app/actions/dms";
import { useT } from "./i18n";
import { Avatar, Button, cx } from "./ui";

type Person = { id: number; name: string; kind?: string; staff?: string | null; avatar?: number | null; verified?: string | null; city?: string | null; rule?: "open" | "approval" | "off" };

/** Pick who to message (one person or a small group) and write the first message. */
export function NewDm({ preset }: { preset: Person[] }) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Person[]>([]);
  const [picked, setPicked] = useState<Person[]>(preset);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const x = setTimeout(async () => {
      const r = await fetch(`/api/members?dm=1&q=${encodeURIComponent(q)}`).then((y) => y.json()).catch(() => ({ items: [] }));
      setFound(r.items ?? []);
    }, 200);
    return () => clearTimeout(x);
  }, [q]);
  const kindLabel = (p: Person) => (p.staff ? t("Special Minds staff") : p.kind === "parent" ? t("Parent") : p.kind === "specialist" ? t("Specialist") : p.kind === "team" ? "Special Minds" : t("Guest"));
  const send = async () => {
    setBusy(true); setErr(null);
    const r = await startDm(picked.map((p) => p.id), body);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? null); return; }
    router.push(`/dm/${r.id}`);
  };
  const needsApproval = picked.some((p) => p.rule === "approval");
  return (
    <div className="space-y-4 rounded-2xl border border-hairline bg-surface p-5 shadow-card">
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {picked.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-2 rounded-full bg-brand-50 py-1 pe-2 ps-1 text-sm font-semibold text-brand">
              <Avatar name={p.name} photoId={p.avatar} size={24} />{p.name}
              <button type="button" onClick={() => setPicked((x) => x.filter((y) => y.id !== p.id))} aria-label={t("Remove")}><X className="size-4" /></button>
            </span>
          ))}
        </div>
      )}
      <label className="relative block">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-soft" />
        <input className="input ps-9" placeholder={t("Search people by name")} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </label>
      <ul className="max-h-72 divide-y divide-hairline overflow-y-auto rounded-xl border border-hairline">
        {found.filter((p) => !picked.some((x) => x.id === p.id)).map((p) => (
          <li key={p.id}>
            <button type="button" disabled={p.rule === "off" || picked.length >= 7} onClick={() => setPicked((x) => [...x, p])}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-start hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60">
              <Avatar name={p.name} photoId={p.avatar} size={36} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-semibold text-ink">{p.name}{p.verified && <BadgeCheck className="size-4 text-moss" />}</span>
                <span className="block text-sm text-soft">{kindLabel(p)}{p.city ? ` · ${t(p.city)}` : ""}</span>
              </span>
              {p.rule === "approval" && <span className="rounded-full bg-apricot-50 px-2.5 py-0.5 text-xs font-semibold text-caution">{t("Needs approval")}</span>}
              {p.rule === "off" && <span className="rounded-full bg-paper-deep px-2.5 py-0.5 text-xs font-semibold text-soft">{t("Not allowed")}</span>}
            </button>
          </li>
        ))}
        {!found.length && <li className="px-3 py-4 text-sm text-soft">{t("No one found.")}</li>}
      </ul>
      {needsApproval && <p className="rounded-xl bg-apricot-50 px-4 py-3 text-sm text-caution">{t("A Special Minds admin reads your first message before this conversation opens. Please don't share phone numbers or emails.")}</p>}
      <textarea className="input" rows={4} placeholder={t("Your first message")} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} dir="auto" />
      {err && <p role="alert" className="text-sm font-semibold text-danger">{err}</p>}
      <Button onClick={send} disabled={busy || !picked.length}>{busy && <Loader2 className="size-4 animate-spin" />}{needsApproval ? t("Send for approval") : t("Start the conversation")}</Button>
      <p className={cx("text-xs text-soft")}>{t("Up to 8 people in one conversation.")}</p>
    </div>
  );
}
