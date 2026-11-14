"use client";

import { useState } from "react";
import { Download, FileText, Mic } from "lucide-react";
import { fileSize } from "@/lib/format";
import type { FileView } from "@/lib/types";
import { useT } from "../i18n";
import { Modal } from "../overlay";
import { cx } from "../ui";

/** Photos (tap to see big), voice notes (a player) and files (a download chip) under a post. */
export function Attachments({ files, large = false }: { files: FileView[]; large?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState<FileView | null>(null);
  if (!files.length) return null;
  const images = files.filter((f) => f.kind === "image");
  const audio = files.filter((f) => f.kind === "audio");
  const docs = files.filter((f) => f.kind === "file");
  return (
    <div className="mt-2 space-y-2">
      {images.length > 0 && (
        <div className={cx("grid gap-1.5", images.length === 1 ? "max-w-md grid-cols-1" : images.length === 2 ? "max-w-lg grid-cols-2" : "max-w-lg grid-cols-3", large && images.length === 1 && "max-w-2xl")}>
          {images.map((f) => (
            <button key={f.id} type="button" onClick={() => setOpen(f)} className="overflow-hidden rounded-xl bg-paper-deep ring-1 ring-hairline" aria-label={t("Open photo")}>
              <img src={`/api/files/${f.id}`} alt={f.name} loading="lazy" className={cx("w-full object-cover", images.length === 1 ? "max-h-96" : "aspect-square")}
                style={images.length === 1 && f.w && f.h ? { aspectRatio: `${f.w} / ${f.h}` } : undefined} />
            </button>
          ))}
        </div>
      )}
      {audio.map((f) => (
        <div key={f.id} className="flex max-w-sm items-center gap-2 rounded-2xl bg-brand-50 px-3 py-2">
          <Mic className="size-4 shrink-0 text-brand" aria-hidden />
          <audio controls preload="none" src={`/api/files/${f.id}`} className="h-9 w-full min-w-0" aria-label={t("Voice note")} />
        </div>
      ))}
      {docs.map((f) => (
        <a key={f.id} href={`/api/files/${f.id}?download=1`} className="flex max-w-sm items-center gap-3 rounded-xl border border-hairline bg-surface px-3 py-2 hover:border-brand-300">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand"><FileText className="size-5" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{f.name}</span><span className="block text-xs text-soft">{fileSize(f.size)}</span></span>
          <Download className="size-4 shrink-0 text-soft" />
        </a>
      ))}
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open?.name} size="xl">
        {open && <img src={`/api/files/${open.id}`} alt={open.name} className="mx-auto max-h-[75dvh] rounded-xl" />}
      </Modal>
    </div>
  );
}
