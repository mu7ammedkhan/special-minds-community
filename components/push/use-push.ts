"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/app/actions/notifications";

/**
 * Where pop-ups stand on this browser:
 *   unavailable  the server has no key yet, so nothing is offered
 *   unsupported  this browser can't take them
 *   home-screen  iPhone or iPad: only once the app is on the Home Screen
 *   blocked      the person said no, or the browser blocks this site
 *   off / on
 */
export type PushState = "loading" | "unavailable" | "unsupported" | "home-screen" | "blocked" | "off" | "on";

const appleTouch = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const installed = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function keyBytes(key: string) {
  const raw = atob((key + "=".repeat((4 - (key.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** "Chrome on Mac": how this browser shows in the list of devices with pop-ups. */
export function deviceName() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\/|FxiOS/.test(ua) ? "Firefox" : /Chrome\/|CriOS/.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "iPad"
    : /Android/.test(ua) ? "Android" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux|CrOS/.test(ua) ? "Linux" : "a device";
  return installed() && (os === "iPhone" || os === "iPad") ? `Home Screen app on ${os}` : `${browser} on ${os}`;
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export function usePush(pushKey: string | null) {
  const [state, setState] = useState<PushState>("loading");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The pop-up script, started ahead of time: Safari only lets a page sign up
  // straight from a click, so nothing may need waiting for once it's clicked.
  const starting = useRef<Promise<ServiceWorkerRegistration> | null>(null);
  const started = useRef<ServiceWorkerRegistration | null>(null);
  const start = useCallback(() => {
    starting.current ??= navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then((r) => (started.current = r));
    return starting.current;
  }, []);

  const check = useCallback(async () => {
    if (!pushKey) { setState("unavailable"); return; }
    if (!supported()) { setState(appleTouch() && !installed() ? "home-screen" : "unsupported"); return; }
    if (Notification.permission === "denied") { setState("blocked"); return; }
    start().catch(() => { starting.current = null; });
    const sub = await currentSubscription().catch(() => null);
    setEndpoint(sub?.endpoint ?? null);
    setState(sub && Notification.permission === "granted" ? "on" : "off");
  }, [pushKey, start]);
  useEffect(() => { void check(); }, [check]);

  /** Signs this browser up (the browser asks "Allow?" itself), then remembers it. True when pop-ups are on. */
  const turnOn = async () => {
    if (!pushKey) return false;
    setBusy(true); setError(null);
    try {
      const reg = started.current ?? (await start());
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(pushKey) }));
      const r = await savePushSubscription(sub.toJSON(), deviceName());
      if (!r.ok) { setError(r.error); return false; }
      setEndpoint(sub.endpoint); setState("on");
      return true;
    } catch (e) {
      const err = e as { name?: string; message?: string };
      console.error("Pop-ups couldn't be turned on:", e);
      if (Notification.permission === "denied") { setState("blocked"); return false; }
      if (err.name === "NotAllowedError") setError("Pop-ups weren't allowed. Click Turn on pop-ups again and choose Allow.");
      else if (err.name === "AbortError") {
        setError("brave" in navigator
          ? "Brave blocks pop-ups like these by default. Turn on “Use Google services for push messaging” in Brave's Settings → Privacy and security, then try again."
          : "This browser couldn't reach its pop-up service. Try again in a minute, or use Chrome, Safari, Edge or Firefox.");
      } else setError(`This browser couldn't turn pop-ups on (${err.name ?? "error"}${err.message ? `: ${err.message.slice(0, 80)}` : ""}). Check that notifications are allowed for this site, then try again.`);
      return false;
    } finally { setBusy(false); }
  };

  const turnOff = async () => {
    setBusy(true); setError(null);
    try {
      const sub = await currentSubscription();
      if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe(); }
      setEndpoint(null); setState("off");
    } catch {
      setError("Couldn't turn pop-ups off. Try again.");
    } finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true); setError(null);
    try { return await sendTestPush(); } finally { setBusy(false); }
  };

  return { state, endpoint, busy, error, turnOn, turnOff, test };
}
