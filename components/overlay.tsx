"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";
import { useT } from "./i18n";
import { cx } from "./ui";

/** A centred pop-up (a sheet from the bottom on phones). Esc or a click outside closes it. */
export function Modal({ open, onClose, title, subtitle, children, size = "md" }: {
  open: boolean; onClose: () => void; title?: ReactNode; subtitle?: ReactNode; children: ReactNode; size?: "md" | "lg" | "xl";
}) {
  const t = useT();
  const close = useRef(onClose);
  close.current = onClose;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = box.current?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea");
    first?.focus();
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = overflow; };
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/35 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Dialog"}
        className={cx("rise max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-surface shadow-pop sm:rounded-3xl",
          size === "xl" ? "sm:max-w-4xl" : size === "lg" ? "sm:max-w-2xl" : "sm:max-w-xl")}>
        {title !== undefined && (
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-hairline bg-surface/95 px-5 py-4 backdrop-blur sm:px-6">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-ink">{title}</h2>
              {subtitle && <p className="text-sm text-soft">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-soft hover:bg-paper hover:text-ink" aria-label={t("Close")}><X className="size-5" /></button>
          </div>
        )}
        <div className="px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** A button that opens a pop-up with whatever is inside. */
export function ModalButton({ label, title, subtitle, children, className, size = "md" }: {
  label: ReactNode; title: ReactNode; subtitle?: ReactNode; children: (close: () => void) => ReactNode; className?: string; size?: "md" | "lg" | "xl";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} subtitle={subtitle} size={size}>{children(() => setOpen(false))}</Modal>
    </>
  );
}

/** A button that opens a small menu underneath it. */
export function Menu({ label, children, align = "left", className, chevron = true, ariaLabel, panelClassName }: {
  label: ReactNode; children: ReactNode; align?: "left" | "right"; className?: string; chevron?: boolean; ariaLabel?: string;
  /** Extra classes for the opened list, e.g. a width. */
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // Clicks inside a dialog opened from the menu (rendered in a portal) mustn't close the menu, or the dialog closes with it.
    const down = (e: MouseEvent) => { const t = e.target as Element; if (!ref.current?.contains(t) && !t.closest?.("[role=dialog]")) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label={ariaLabel} className={cx("inline-flex items-center gap-1.5", className)}>
        {label}
        {chevron && <ChevronDown className={cx("size-4 opacity-70 transition-transform", open && "rotate-180")} aria-hidden />}
      </button>
      {open && (
        <div role="menu" onClick={(e) => { if ((e.target as HTMLElement).closest("a,button[data-close]")) setOpen(false); }}
          className={cx("rise absolute z-50 mt-2 max-h-[70vh] min-w-56 overflow-y-auto rounded-2xl border border-hairline bg-surface p-1.5 shadow-lift", align === "right" ? "end-0" : "start-0", panelClassName)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} role="menuitem" className={cx("flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-ink-soft hover:bg-paper hover:text-ink", className)}>
      {children}
    </Link>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-3 pb-1 pt-2 text-xs font-semibold text-soft">{children}</div>;
}
