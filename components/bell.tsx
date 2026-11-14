"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell as BellIcon, BellRing, CheckCheck, X } from "lucide-react";
import { markNotificationsRead } from "@/app/actions/notifications";
import { timeAgo } from "@/lib/format";
import { playSound } from "@/lib/sounds";
import { useLocale, useT } from "./i18n";
import { NOTE_ICON } from "./icons";
import { usePush } from "./push/use-push";
import { Button, cx } from "./ui";

export type NotificationItem = { id: number; kind: string; title: string; body: string | null; read_at: string | null; created_at: string };

/**
 * The bell: the signed-in member's notifications. The frame's check-in
 * (every ten seconds) brings the count; something new plays the member's
 * sound once between all open tabs, and a pop-up arriving tells it at once.
 */
export function Bell({ unread: shellUnread, sound, pushKey, variant, onSeen }: {
  unread: number; sound: string; pushKey: string | null; variant: "rail" | "phone"; onSeen?: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [unread, setUnread] = useState(shellUnread);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const push = usePush(pushKey);
  const [promptHidden, setPromptHidden] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { try { setPromptHidden(localStorage.getItem("smm:push-prompt") === "hidden"); } catch { setPromptHidden(false); } }, []);
  const hidePrompt = () => { setPromptHidden(true); try { localStorage.setItem("smm:push-prompt", "hidden"); } catch { /* storage unavailable */ } };

  const seen = useRef(shellUnread);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const announce = useCallback(() => {
    if (document.visibilityState !== "visible" || soundRef.current === "none") return;
    try {
      if (Date.now() - Number(localStorage.getItem("smm:sound-at") ?? 0) < 4000) return;
      localStorage.setItem("smm:sound-at", String(Date.now()));
    } catch { /* storage unavailable: just play it */ }
    playSound(soundRef.current || "chime");
  }, []);
  useEffect(() => {
    if (shellUnread > seen.current) announce();
    seen.current = shellUnread;
    setUnread(shellUnread);
  }, [shellUnread, announce]);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "smm-notification") { announce(); onSeen?.(); }
      if (e.data?.type === "smm-open" && typeof e.data.url === "string") window.location.assign(e.data.url);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [announce, onSeen]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);

  const load = async () => {
    const r = await fetch("/api/notifications").then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (r) { setItems(r.items); setUnread(r.unread); seen.current = r.unread; }
  };
  const toggle = () => { setOpen((o) => !o); if (!open) void load(); };
  const allRead = async () => {
    setUnread(0); seen.current = 0;
    setItems((l) => l?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? null);
    await markNotificationsRead("all");
    onSeen?.();
  };

  return (
    <>
      <button type="button" onClick={toggle} aria-expanded={open} aria-label={unread ? t("Notifications, {n} unread", { n: unread }) : t("Notifications")} title={t("Notifications")}
        className={cx("relative inline-flex items-center justify-center rounded-xl transition-colors",
          variant === "rail" ? "size-11 text-rail-text hover:bg-white/10 hover:text-white" : "size-10 text-white hover:bg-white/10")}>
        <BellIcon className="size-[22px]" aria-hidden />
        {unread > 0 && <span className="absolute -end-0.5 -top-0.5 min-w-5 rounded-full bg-champagne px-1 text-center text-xs font-bold leading-5 text-brand-deep">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[55]" onMouseDown={() => setOpen(false)} aria-hidden />
          <div role="dialog" aria-label={t("Notifications")}
            className={cx("rise fixed z-[56] flex max-h-[min(36rem,calc(100dvh-5rem))] flex-col overflow-hidden rounded-2xl border border-hairline bg-surface text-ink shadow-pop",
              variant === "phone" ? "inset-x-2 top-16" : "start-[88px] top-4 w-[26rem]")}>
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <span className="font-display text-lg text-ink">{t("Notifications")}</span>
              <span className="flex items-center gap-1">
                {unread > 0 && <button type="button" onClick={allRead} className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-soft hover:bg-paper hover:text-ink"><CheckCheck className="size-4" />{t("Mark all read")}</button>}
                <button type="button" onClick={() => setOpen(false)} aria-label={t("Close")} className="rounded-lg p-1.5 text-soft hover:bg-paper hover:text-ink"><X className="size-4" /></button>
              </span>
            </div>
            {(push.state === "off" || push.state === "home-screen") && !promptHidden && (
              <div className="flex items-start gap-2.5 border-b border-hairline bg-brand-50/60 px-4 py-3">
                <BellRing className="mt-0.5 size-5 shrink-0 text-brand" />
                <div className="min-w-0 flex-1 text-sm">
                  {push.state === "off" ? (
                    <>
                      <p className="leading-snug text-ink-soft">{t("Get these as pop-ups on this device, even when the community is closed.")}</p>
                      <div className="mt-2 flex gap-1.5">
                        <Button size="xs" disabled={push.busy} onClick={async () => { if (await push.turnOn()) setNote(t("Pop-ups are on for this browser.")); }}>{push.busy ? t("Turning on…") : t("Turn on pop-ups")}</Button>
                        <Button size="xs" variant="ghost" onClick={hidePrompt}>{t("Not now")}</Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="leading-snug text-ink-soft">{t("For pop-ups on iPhone or iPad, add the community to your Home Screen first.")}</p>
                      <div className="mt-2 flex gap-1.5">
                        <Link href="/account?tab=notifications" onClick={() => setOpen(false)} className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-sm font-semibold text-on-primary hover:bg-primary-deep">{t("Show me how")}</Link>
                        <Button size="xs" variant="ghost" onClick={hidePrompt}>{t("Not now")}</Button>
                      </div>
                    </>
                  )}
                  {push.error && <p className="mt-1.5 text-sm text-danger" role="alert">{t(push.error)}</p>}
                </div>
              </div>
            )}
            {note && <p className="border-b border-hairline bg-moss-50 px-4 py-2 text-sm font-semibold text-moss">{note}</p>}
            <ul className="flex-1 overflow-y-auto">
              {items === null && <li className="px-4 py-8 text-center text-sm text-soft">{t("Loading…")}</li>}
              {items?.length === 0 && <li className="px-4 py-10 text-center text-sm text-soft">{t("You're all caught up.")}</li>}
              {items?.map((n) => {
                const Icon = NOTE_ICON[n.kind] ?? BellIcon;
                return (
                  <li key={n.id}>
                    <a href={`/n/${n.id}`} className={cx("flex gap-3 px-4 py-3 transition-colors hover:bg-paper", !n.read_at && "bg-brand-50/50")}>
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-paper-deep"><Icon className="size-4 text-brand" aria-hidden /></span>
                      <span className="min-w-0 flex-1">
                        <span className={cx("block text-sm leading-snug", n.read_at ? "text-ink-soft" : "font-semibold text-ink")} dir="auto">{n.title}</span>
                        {n.body && <span className="mt-0.5 block truncate text-sm text-soft" dir="auto">{n.body}</span>}
                        <span className="mt-0.5 block text-xs text-faint">{timeAgo(n.created_at, locale)}</span>
                      </span>
                      {!n.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-brand" aria-label={t("Unread")} />}
                    </a>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-hairline px-4 py-2.5 text-center">
              <Link href="/notifications" onClick={() => setOpen(false)} className="text-sm font-semibold text-brand hover:text-brand-deep">{t("See all notifications")}</Link>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
