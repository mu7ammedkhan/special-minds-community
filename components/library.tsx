"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookOpen, Download, ExternalLink, FileText, Search } from "lucide-react";
import { fileSize, fmtDate } from "@/lib/format";
import type { PostView, ResourceData } from "@/lib/types";
import { useLocale, useT } from "./i18n";
import { cx } from "./ui";

/** The library: guides, templates, files and links, by category, with a search box. */
export function Library({ items, base }: { items: PostView[]; base: string }) {
  const t = useT();
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const cats = useMemo(() => [...new Set(items.map((i) => (i.data as ResourceData).category).filter(Boolean))] as string[], [items]);
  const shown = items.filter((i) => (!cat || (i.data as ResourceData).category === cat) && (!q || `${i.title} ${i.body}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="mx-auto max-w-4xl px-4 py-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-soft" />
          <input className="input !min-h-11 ps-9" placeholder={t("Search the library")} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {cats.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setCat("")} className={cx("pill", !cat && "!bg-brand !text-white")}>{t("All")}</button>
            {cats.map((c) => <button key={c} type="button" onClick={() => setCat(c === cat ? "" : c)} className={cx("pill", cat === c && "!bg-brand !text-white")}>{t(c)}</button>)}
          </div>
        )}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {shown.map((i) => {
          const d = i.data as ResourceData;
          const file = i.files[0];
          return (
            <li key={i.id} className="flex flex-col rounded-2xl border border-hairline bg-surface p-4 shadow-card">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand">{file ? <FileText className="size-5" /> : d.url ? <ExternalLink className="size-5" /> : <BookOpen className="size-5" />}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`${base}/${i.id}`} className="font-semibold text-ink hover:underline" dir="auto">{i.title}</Link>
                  {d.category && <p className="text-xs font-semibold text-caution">{t(d.category)}</p>}
                </div>
              </div>
              {i.body && <p className="mt-2 line-clamp-3 text-sm text-ink-soft" dir="auto">{i.body}</p>}
              <div className="mt-auto flex flex-wrap items-center gap-3 pt-3 text-sm">
                {file && <a href={`/api/files/${file.id}?download=1`} className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline"><Download className="size-4" />{t("Download")} <span className="font-normal text-soft">{fileSize(file.size)}</span></a>}
                {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline"><ExternalLink className="size-4" />{t("Open")}</a>}
                <span className="ms-auto text-xs text-faint">{fmtDate(i.createdAt, locale)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {!shown.length && <p className="rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center text-soft">{q || cat ? t("Nothing matches that.") : t("The library is empty for now.")}</p>}
    </div>
  );
}
