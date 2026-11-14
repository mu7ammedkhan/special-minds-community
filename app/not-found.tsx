import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-6 text-center">
      <img src="/logo-mark.svg" alt="" className="size-14" />
      <h1 className="font-display text-2xl text-ink">{t("That page isn't here")}</h1>
      <p className="max-w-md text-base text-soft">{t("It may have been removed, or you may not have access to it.")}</p>
      <Link href="/" className="mt-2 rounded-full bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-deep">{t("Back to the community")}</Link>
    </div>
  );
}
