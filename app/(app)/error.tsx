"use client";

import { useT } from "@/components/i18n";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-display text-2xl text-ink">{t("Something went wrong")}</h1>
      <p className="max-w-md text-base text-soft">{t("Please try again. If it keeps happening, tell Special Minds what you were doing.")}</p>
      <button onClick={reset} className="mt-2 rounded-full bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-deep">{t("Try again")}</button>
    </div>
  );
}
