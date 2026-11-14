"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { signOut, verifyMfa } from "@/app/actions/auth";
import { useT } from "./i18n";
import { buttonClass } from "./ui";

export function MfaForm({ next }: { next: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(verifyMfa, {});
  return (
    <>
      <form action={action} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <input name="code" className="input num text-center text-2xl tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="••••••" autoFocus dir="ltr" aria-label={t("6-digit code")} />
        {state.error && <p role="alert" className="text-sm font-semibold text-danger">{state.error}</p>}
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full")}>{pending && <Loader2 className="size-5 animate-spin" />}{t("Continue")}</button>
      </form>
      <form action={signOut} className="mt-3 text-center"><button className="text-sm font-semibold text-brand">{t("Sign out")}</button></form>
    </>
  );
}
