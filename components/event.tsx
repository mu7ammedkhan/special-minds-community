"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarPlus, Check, Clock, HelpCircle, MapPin, Users, Video, X } from "lucide-react";
import { rsvpAction } from "@/app/actions/posts";
import { intlLocale } from "@/lib/i18n";
import type { EventData, PostView } from "@/lib/types";
import { useLocale, useT } from "./i18n";
import { Body } from "./post/body";
import { PostMenu } from "./post/message";
import { cx } from "./ui";

/** An event: the date block, when and where, Going / Maybe / Can't go, add to calendar. */
export function EventCard({ post, href, tz, meId, full = false }: { post: PostView; href: string; tz: string; meId: number; full?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const d = post.data as unknown as EventData;
  const start = new Date(d.startsAt);
  const end = d.endsAt ? new Date(d.endsAt) : null;
  const [rsvp, setRsvp] = useState(post.event?.rsvp ?? null);
  const [going, setGoing] = useState(post.event?.going ?? 0);
  const [err, setErr] = useState<string | null>(null);
  const past = (end ?? new Date(start.getTime() + 2 * 3600_000)).getTime() < Date.now();
  const loc = intlLocale(locale);
  const choose = async (a: "going" | "maybe" | "no") => {
    const next = rsvp === a ? null : a;
    setErr(null);
    const r = await rsvpAction(post.id, next);
    if (!r.ok) { setErr(r.error ?? null); return; }
    setGoing((g) => g + (next === "going" ? 1 : 0) - (rsvp === "going" ? 1 : 0));
    setRsvp(next);
  };
  const capacity = d.capacity ?? null;
  return (
    <article className={cx("flex gap-4 rounded-2xl border border-hairline bg-surface shadow-card", full ? "p-5 sm:p-6" : "p-4", past && "opacity-80")}>
      <div className="flex w-16 shrink-0 flex-col items-center overflow-hidden rounded-2xl border border-hairline text-center">
        <span className="w-full bg-brand py-0.5 text-xs font-bold uppercase text-white">{start.toLocaleDateString(loc, { month: "short", timeZone: tz })}</span>
        <span className="num py-1 font-display text-2xl text-ink">{start.toLocaleDateString(loc, { day: "numeric", timeZone: tz })}</span>
        <span className="pb-1 text-xs text-soft">{start.toLocaleDateString(loc, { weekday: "short", timeZone: tz })}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h2 className={cx("min-w-0 flex-1 font-display text-ink", full ? "text-2xl" : "text-lg")}>{full ? post.title : <Link href={href} className="hover:underline">{post.title}</Link>}</h2>
          {post.can.moderate && <PostMenu post={post} link={href} top onRemoved={() => router.refresh()} onChanged={() => router.refresh()} />}
        </div>
        <ul className="mt-1.5 space-y-1 text-sm text-ink-soft">
          <li className="flex items-center gap-2"><Clock className="size-4 text-brand" />{start.toLocaleTimeString(loc, { hour: "numeric", minute: "2-digit", timeZone: tz })}{end ? ` – ${end.toLocaleTimeString(loc, { hour: "numeric", minute: "2-digit", timeZone: tz })}` : ""}</li>
          {d.place && <li className="flex items-center gap-2"><MapPin className="size-4 text-brand" /><span dir="auto">{d.place}</span></li>}
          {d.online && <li className="flex items-center gap-2"><Video className="size-4 text-brand" />{rsvp === "going" || post.can.moderate || full ? <a href={d.online} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">{t("Join online")}</a> : t("Online (the link shows once you're going)")}</li>}
          <li className="flex items-center gap-2"><Users className="size-4 text-brand" />{t("{n} going", { n: going })}{capacity ? ` · ${t("{n} places", { n: capacity })}` : ""}{post.event?.maybe ? ` · ${t("{n} maybe", { n: post.event.maybe })}` : ""}</li>
        </ul>
        {full && post.body && <Body text={post.body} mentions={post.mentions} meId={meId} className="mt-4 text-base text-ink" />}
        {!past && post.can.react && (
          <div className="mt-3 flex flex-wrap gap-2">
            {([["going", t("Going"), Check], ["maybe", t("Maybe"), HelpCircle], ["no", t("Can't go"), X]] as const).map(([k, label, Icon]) => (
              <button key={k} type="button" onClick={() => choose(k)} aria-pressed={rsvp === k}
                className={cx("inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors", rsvp === k ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-soft hover:border-brand-300")}>
                <Icon className="size-4" />{label}
              </button>
            ))}
            <a href={`/api/events/${post.id}`} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand-50"><CalendarPlus className="size-4" />{t("Add to calendar")}</a>
          </div>
        )}
        {past && <p className="mt-3 text-sm text-soft">{t("This event has passed.")}</p>}
        {err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}
        {!full && post.replyCount > 0 && <Link href={href} className="mt-2 inline-block text-sm font-semibold text-brand">{t("{n} comments", { n: post.replyCount })}</Link>}
      </div>
    </article>
  );
}
