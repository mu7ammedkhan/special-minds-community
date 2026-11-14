import Link from "next/link";
import { MessageCircle, Search } from "lucide-react";
import { requireMe } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { search } from "@/lib/search";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireMe();
  const { t, locale } = await getT();
  const q = ((await searchParams).q ?? "").slice(0, 100);
  const hits = q ? await search(me, q) : [];
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <PageHeader title={t("Search")} subtitle={t("Every message, topic and post you can see, in any language.")} />
      <form className="relative mb-5" role="search">
        <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-soft" />
        <input name="q" defaultValue={q} className="input !min-h-12 ps-12 text-lg" placeholder={t("Search for words like “toilet training” or “Al Barsha”")} autoFocus />
      </form>
      {q && (
        <p className="mb-3 text-sm text-soft">{hits.length ? t("{n} results", { n: hits.length }) : t("Nothing found for “{q}”.", { q })}</p>
      )}
      <ul className="space-y-2">
        {hits.map((h) => (
          <li key={h.id}>
            <Link href={h.link} className="block rounded-2xl border border-hairline bg-surface px-4 py-3 shadow-card hover:border-brand-300">
              <p className="flex flex-wrap items-center gap-2 text-xs text-soft">
                {h.dm ? <span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5" />{t("Private message")}</span> : <span className="font-semibold text-brand">#{h.where}</span>}
                <span>{h.anonymous ? t("A parent") : h.author}</span><span>· {timeAgo(h.created_at, locale)}</span>
              </p>
              {h.title && <p className="mt-0.5 font-semibold text-ink" dir="auto">{h.title}</p>}
              <p className="mt-0.5 text-sm text-ink-soft" dir="auto">{h.text}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
