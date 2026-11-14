"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BellRing, Monitor, Smartphone, Volume2, X } from "lucide-react";
import { removePushDevice, saveNotificationPrefs } from "@/app/actions/notifications";
import { timeAgo } from "@/lib/format";
import { SOUNDS, playSound } from "@/lib/sounds";
import { useLocale, useT } from "./i18n";
import { usePush } from "./push/use-push";
import { Button, Card, CardHeader, cx } from "./ui";

export type PushDevice = { id: number; device: string | null; created_at: string; last_sent_at: string | null; tail: string };
export type Prefs = { emailImportant: boolean; digest: "off" | "daily" | "weekly"; whatsapp: boolean; quiet: { on: boolean; from: string; to: string } };

const phone = (name: string | null) => /iPhone|iPad|Android/.test(name ?? "");

/** My account → Notifications: pop-ups on this device, the sound, email, digest, WhatsApp and quiet hours. */
export function NotificationSettings({ pushKey, devices, sound: initialSound, prefs: init, hasEmail, hasPhone, whatsappReady }: {
  pushKey: string | null; devices: PushDevice[]; sound: string; prefs: Prefs; hasEmail: boolean; hasPhone: boolean; whatsappReady: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const push = usePush(pushKey);
  const router = useRouter();
  const [, start] = useTransition();
  const [sound, setSound] = useState(initialSound);
  const [prefs, setPrefs] = useState<Prefs>(init);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const here = push.endpoint ? devices.find((d) => push.endpoint!.endsWith(d.tail)) : undefined;
  const state = push.state === "on" && !here ? "off" : push.state;
  const save = (p: Partial<Prefs>) => { const next = { ...prefs, ...p }; setPrefs(next); start(async () => { await saveNotificationPrefs(p); }); };

  const on = async () => { if (await push.turnOn()) { setMsg({ text: t("Pop-ups are on for this browser.") }); router.refresh(); } };
  const off = async () => { await push.turnOff(); router.refresh(); };
  const test = async () => {
    const r = await push.test();
    if (!r.ok) setMsg({ text: r.error, bad: true });
    else if (!r.sent) setMsg({ text: t("No pop-up could be sent. Turn pop-ups off and on again on that device."), bad: true });
    else setMsg({ text: t("Test pop-up sent.") });
  };
  const remove = async (d: PushDevice) => { if (here?.id === d.id) { await off(); return; } await removePushDevice(d.id); router.refresh(); };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title={t("Pop-up notifications")} subtitle={t("An alert on this computer or phone when something needs you, even when the community is closed.")} />
        <div className="space-y-4 border-t border-hairline px-5 py-4">
          {state === "unavailable" ? <p className="text-sm text-soft">{t("Pop-ups aren't set up on this server yet.")}</p> : (
            <div className="rounded-xl border border-hairline px-4 py-3">
              {state === "loading" && <p className="text-sm text-soft">{t("Checking this browser…")}</p>}
              {state === "on" && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink"><span className="size-2 rounded-full bg-moss" />{t("On for this browser")}</p>
                  <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={push.busy} onClick={test}>{t("Send a test")}</Button><Button variant="ghost" size="sm" disabled={push.busy} onClick={off}>{t("Turn off")}</Button></div>
                </div>
              )}
              {state === "off" && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-ink-soft">{t("Off for this browser.")}</p>
                  <Button size="sm" disabled={push.busy} onClick={on}><BellRing className="size-4" />{push.busy ? t("Turning on…") : t("Turn on pop-ups")}</Button>
                </div>
              )}
              {state === "blocked" && <p className="text-sm text-ink-soft">{t("Your browser is blocking notifications from the community. Allow them in this site's settings, then reload the page.")}</p>}
              {state === "home-screen" && <p className="text-sm text-ink-soft">{t("On iPhone or iPad: tap Share, then Add to Home Screen. Open the community from your Home Screen, come back to this page and turn pop-ups on there.")}</p>}
              {state === "unsupported" && <p className="text-sm text-ink-soft">{t("This browser can't show pop-ups. Chrome, Edge, Firefox and Safari can.")}</p>}
              {push.error && <p className="mt-2 text-sm text-danger" role="alert">{t(push.error)}</p>}
              {msg && <p role="status" className={cx("mt-2 text-sm font-semibold", msg.bad ? "text-danger" : "text-moss")}>{msg.text}</p>}
            </div>
          )}
          {devices.length > 0 && (
            <ul className="divide-y divide-hairline rounded-xl border border-hairline">
              {devices.map((d) => {
                const Icon = phone(d.device) ? Smartphone : Monitor;
                return (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Icon className="size-4 shrink-0 text-soft" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm text-ink"><span className="truncate">{d.device ?? t("A browser")}</span>{here?.id === d.id && <span className="rounded-full bg-paper-deep px-2 py-0.5 text-xs font-semibold text-soft">{t("This browser")}</span>}</p>
                      <p className="text-xs text-soft">{t("Turned on {when}", { when: timeAgo(d.created_at, locale) })}</p>
                    </div>
                    <button type="button" onClick={() => remove(d)} aria-label={t("Stop pop-ups on this device")} className="rounded-lg p-1.5 text-soft hover:bg-paper hover:text-ink"><X className="size-4" /></button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={t("Email, digest and WhatsApp")} />
        <div className="space-y-4 border-t border-hairline px-5 py-4 text-sm">
          <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 size-5" checked={prefs.emailImportant} disabled={!hasEmail} onChange={(e) => save({ emailImportant: e.target.checked })} />
            <span><span className="block font-semibold text-ink">{t("Email me announcements and opportunities I haven't read")}</span><span className="text-soft">{hasEmail ? t("A few hours after they're posted, only if still unread.") : t("Add an email to your account to use this.")}</span></span></label>
          <div>
            <p className="mb-1.5 font-semibold text-ink">{t("A summary by email")}</p>
            <div className="flex flex-wrap gap-1.5">
              {(["off", "daily", "weekly"] as const).map((d) => (
                <button key={d} type="button" disabled={!hasEmail} onClick={() => save({ digest: d })} className={cx("pill", prefs.digest === d && "!border-brand !bg-brand !text-white")}>{d === "off" ? t("No summary") : d === "daily" ? t("Every evening") : t("Every Sunday")}</button>
              ))}
            </div>
          </div>
          <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 size-5" checked={prefs.whatsapp} disabled={!hasPhone} onChange={(e) => save({ whatsapp: e.target.checked })} />
            <span><span className="block font-semibold text-ink">{t("WhatsApp me for urgent broadcasts and opportunities that fit me")}</span><span className="text-soft">{hasPhone ? (whatsappReady ? t("Only now and then. You can turn this off any time.") : t("WhatsApp isn't set up on this server yet: messages are only logged.")) : t("Add a mobile number to your account to use this.")}</span></span></label>
          <div className="rounded-xl border border-hairline px-4 py-3">
            <label className="flex items-center gap-3"><input type="checkbox" className="size-5" checked={prefs.quiet.on} onChange={(e) => save({ quiet: { ...prefs.quiet, on: e.target.checked } })} /><span className="font-semibold text-ink">{t("Quiet hours: no pop-ups")}</span></label>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-soft">
              {t("from")} <input type="time" className="rounded-lg border border-line px-2 py-1" value={prefs.quiet.from} onChange={(e) => save({ quiet: { ...prefs.quiet, from: e.target.value } })} />
              {t("to")} <input type="time" className="rounded-lg border border-line px-2 py-1" value={prefs.quiet.to} onChange={(e) => save({ quiet: { ...prefs.quiet, to: e.target.value } })} />
              <span>{t("Everything still waits in your bell.")}</span>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={t("Notification sound")} subtitle={t("Played when something new arrives while the community is open. Click one to hear it.")} />
        <div className="flex flex-wrap gap-2 border-t border-hairline px-5 py-4">
          {SOUNDS.map((s) => (
            <button key={s.value} type="button" aria-pressed={sound === s.value}
              onClick={() => { setSound(s.value); playSound(s.value); start(async () => { await saveNotificationPrefs({ sound: s.value }); }); }}
              className={cx("inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors", sound === s.value ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-soft hover:border-brand-300 hover:text-ink")}>
              {s.value !== "none" && <Volume2 className="size-4" aria-hidden />}{t(s.label)}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
