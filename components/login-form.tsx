"use client";

import { useActionState, useEffect, useRef } from "react";
import { ArrowRight, Loader2, Mail, MessageCircle } from "lucide-react";
import { askCode, checkCode, type CodeState } from "@/app/actions/auth";
import { useT } from "./i18n";
import { buttonClass, cx } from "./ui";

/**
 * Join or sign in with an email or a mobile number: one box, then the
 * six-digit code we send. New people and returning members use the same form.
 */
export function LoginForm({ next = "/" }: { next?: string }) {
  const t = useT();
  const [ask, askAction, asking] = useActionState<CodeState, FormData>(askCode, { step: "address" });
  const [check, checkAction, checking] = useActionState<CodeState, FormData>(checkCode, { step: "code" });
  const codeRef = useRef<HTMLInputElement>(null);
  const onCode = ask.step === "code";
  useEffect(() => { if (onCode) codeRef.current?.focus(); }, [onCode, ask]);

  if (!onCode) {
    return (
      <form key="ask" action={askAction} className="space-y-3" noValidate>
        <label htmlFor="address" className="block text-sm font-semibold text-ink">{t("Email or mobile number")}</label>
        <input id="address" name="address" className="input" autoComplete="username" inputMode="email" placeholder={t("you@example.com or +971 50 123 4567")} defaultValue={ask.shown} required autoFocus
          aria-invalid={ask.error ? true : undefined} aria-describedby={ask.error ? "address-err" : "address-hint"} />
        {ask.error
          ? <p id="address-err" role="alert" className="text-sm font-semibold text-danger">{ask.error}</p>
          : <p id="address-hint" className="text-sm text-soft">{t("We'll send you a 6-digit code: by email, or on WhatsApp for a mobile number.")}</p>}
        <button type="submit" disabled={asking} className={buttonClass("primary", "lg", "w-full")}>
          {asking ? <Loader2 className="size-5 animate-spin" /> : null}{t("Send my code")}<ArrowRight className="size-5 rtl:-scale-x-100" aria-hidden />
        </button>
      </form>
    );
  }
  const error = check.error;
  return (
    <form key="check" action={checkAction} className="space-y-3" noValidate>
      <input type="hidden" name="address" value={ask.address} />
      <input type="hidden" name="next" value={next} />
      <div className="flex items-start gap-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-ink-soft">
        {ask.channel === "email" ? <Mail className="mt-0.5 size-5 shrink-0 text-brand" /> : <MessageCircle className="mt-0.5 size-5 shrink-0 text-brand" />}
        <span>{ask.channel === "email" ? t("We emailed a code to {to}.", { to: ask.address ?? "" }) : t("We sent a code on WhatsApp to {to}.", { to: ask.address ?? "" })}</span>
      </div>
      {ask.preview && (
        <p className="rounded-2xl border border-dashed border-champagne bg-champagne-soft/40 px-4 py-3 text-sm text-brand-deep">
          {t("Preview only: nothing is sent here. Your code is")} <span className="num font-bold tracking-[0.2em]">{ask.preview}</span>
        </p>
      )}
      <label htmlFor="code" className="block text-sm font-semibold text-ink">{t("6-digit code")}</label>
      <input ref={codeRef} id="code" name="code" className={cx("input num text-center text-2xl tracking-[0.5em]")} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="••••••" dir="ltr"
        aria-invalid={error ? true : undefined} />
      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
      <button type="submit" disabled={checking} className={buttonClass("primary", "lg", "w-full")}>
        {checking ? <Loader2 className="size-5 animate-spin" /> : null}{t("Sign in")}
      </button>
      <button type="button" onClick={() => window.location.reload()} className="w-full text-center text-sm font-semibold text-brand hover:text-brand-deep">{t("Use a different email or number")}</button>
    </form>
  );
}
