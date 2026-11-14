"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BadgeCheck, BellRing, Briefcase, Calendar, CheckCircle2, Clock, ExternalLink, Eye, Hand, Languages, MapPin, MessageCircle, Send, Sparkles, ThumbsDown, User, Users, XCircle } from "lucide-react";
import { fillAction, respondAction, stageAction, talentAction } from "@/app/actions/posts";
import { fmtDate, timeAgo } from "@/lib/format";
import { roleLabel } from "@/lib/options";
import type { OppData, PostView } from "@/lib/types";
import { useLocale, useT } from "./i18n";
import { Modal } from "./overlay";
import { AuthorName, PostMenu } from "./post/message";
import { Avatar, Badge, Button, cx } from "./ui";

export function oppFacts(d: OppData, t: (s: string, v?: Record<string, string | number>) => string) {
  return [
    { icon: MapPin, label: t("Area"), value: [d.area, d.city ? t(d.city) : ""].filter(Boolean).join(", ") },
    { icon: Clock, label: t("Hours"), value: d.schedule },
    { icon: User, label: t("Child"), value: [d.childAge, d.needs].filter(Boolean).join(", ") },
    { icon: Languages, label: t("Language"), value: (d.languages ?? []).map((l) => t(l)).join(", ") },
    { icon: Calendar, label: t("Starts"), value: d.start },
    { icon: Users, label: t("Specialist"), value: d.gender === "female" ? t("Female specialist asked for") : d.gender === "male" ? t("Male specialist asked for") : "" },
  ].filter((f) => f.value);
}

/**
 * An opportunity: the facts, and "I'm interested" (with a note) or "Not for
 * me". Who else is interested shows only to staff unless Settings allow it.
 */
export function OpportunityCard({ post, href, full = false, onChange }: { post: PostView; href: string; full?: boolean; onChange?: (p: PostView) => void }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const d = post.data as unknown as OppData;
  const filled = d.status === "filled";
  const [ask, setAsk] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const answer = post.opp?.answer ?? null;
  const send = async (a: "interested" | "not_for_me", n: string | null) => {
    setBusy(true); setErr(null);
    const r = await respondAction(post.id, a, n);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? t("Couldn't save. Try again.")); return; }
    setAsk(false);
    onChange?.({ ...post, opp: { ...post.opp!, answer: a, interested: post.opp?.interested ?? null } });
    router.refresh();
  };
  return (
    <article className={cx("rounded-2xl border bg-surface shadow-card", filled ? "border-hairline opacity-90" : "border-hairline", full ? "p-5 sm:p-6" : "p-4 sm:p-5")}>
      <div className="flex flex-wrap items-center gap-2">
        {filled ? <Badge tone="neutral"><CheckCircle2 className="size-3.5" />{t("Filled")}</Badge> : <Badge tone="good"><span className="size-1.5 rounded-full bg-current" />{t("Open")}</Badge>}
        {post.opp?.matched && !filled && <Badge tone="brand"><Sparkles className="size-3.5" />{t("Matches your profile")}</Badge>}
        {post.status !== "published" && <Badge tone="warn">{post.status === "scheduled" ? t("Scheduled") : t("Waiting")}</Badge>}
        <span className="ms-auto text-xs text-faint">{timeAgo(post.createdAt, locale)}</span>
        {post.can.moderate && <PostMenu post={post} link={href} top onRemoved={() => router.refresh()} onChanged={() => router.refresh()} />}
      </div>
      <h2 className={cx("mt-2 font-display text-ink", full ? "text-2xl" : "text-xl")}>
        {full ? (post.title || t(roleLabel(d.role))) : <Link href={href} className="hover:underline">{post.title || t(roleLabel(d.role))}</Link>}
      </h2>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-soft"><Briefcase className="size-4" />{t(roleLabel(d.role))}</p>
      <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {oppFacts(d, t).map((f) => (
          <div key={f.label} className="flex items-start gap-2 text-sm">
            <f.icon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            <dt className="sr-only">{f.label}</dt><dd className="text-ink" dir="auto">{f.value}</dd>
          </div>
        ))}
      </dl>
      {full && d.details && <p className="msg-body mt-4 text-base text-ink-soft" dir="auto">{d.details}</p>}
      {full && post.can.moderate && d.pay && <p className="mt-3 rounded-xl bg-paper px-3 py-2 text-sm text-ink-soft"><span className="font-semibold">{t("Pay (staff only)")}:</span> {d.pay}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {filled ? (
          <p className="text-sm text-soft">{answer === "interested" ? t("Thank you for your interest. This one is filled.") : t("This one is filled.")}</p>
        ) : !post.can.moderate && (post.can.react || answer) ? (
          answer === "interested" ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-moss-50 px-3.5 py-2 text-sm font-semibold text-moss"><Hand className="size-4" />{post.opp?.stage === "shortlisted" ? t("You're shortlisted") : t("You said you're interested")}</span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => send("not_for_me", null)}>{t("Change to not for me")}</Button>
            </>
          ) : (
            <>
              <Button disabled={busy} onClick={() => setAsk(true)}><Hand className="size-5" />{t("I'm interested")}</Button>
              <Button variant={answer === "not_for_me" ? "soft" : "secondary"} disabled={busy || answer === "not_for_me"} onClick={() => send("not_for_me", null)}><ThumbsDown className="size-4" />{answer === "not_for_me" ? t("You said not for you") : t("Not for me")}</Button>
            </>
          )
        ) : null}
        {typeof post.opp?.interested === "number" && <span className="ms-auto text-sm font-semibold text-soft">{t("{n} interested", { n: post.opp.interested })}</span>}
        {!full && <Link href={href} className="text-sm font-semibold text-brand hover:underline">{post.can.moderate ? t("See responses") : t("Details")}</Link>}
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}
      <Modal open={ask} onClose={() => setAsk(false)} title={t("I'm interested")} subtitle={post.title ?? undefined}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void send("interested", note || null); }}>
          <label htmlFor="opp-note" className="block text-sm font-semibold text-ink">{t("A note for Special Minds")} <span className="font-normal text-soft">({t("optional")})</span></label>
          <textarea id="opp-note" className="input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("For example: free from 1 December, mornings only")} dir="auto" />
          <p className="text-sm text-soft">{t("Only Special Minds staff see who is interested.")}</p>
          <div className="flex gap-2"><Button type="submit" disabled={busy}>{t("Send")}</Button><Button variant="ghost" onClick={() => setAsk(false)}>{t("Cancel")}</Button></div>
        </form>
      </Modal>
      {full && <p className="mt-4 border-t border-hairline pt-3 text-xs text-soft">{t("Posted by")} <AuthorName author={post.author} className="text-xs" /> · {fmtDate(post.createdAt, locale)}</p>}
    </article>
  );
}

type Row = {
  member_id: number; answer: "interested" | "not_for_me"; note: string | null; stage: "new" | "shortlisted" | "declined"; created_at: string;
  talent_sent_at: string | null; talent_error: string | null; full_name: string; avatar_file_id: number | null; verified_title: string | null; roles: string[];
  city: string | null; languages: string[]; open_to_work: boolean; available_from: string | null; availability_note: string | null; talent_ref: string | null;
  matched: boolean; seen_at: string | null; talent_url: string | null;
};

/** Staff only: everyone who answered, their profiles, shortlist, filled, and the Talent portal. */
export function OpportunityPanel({ postId, filled: filledInit, rows: init, stats, unseen, talentReady }: {
  postId: number; filled: boolean; rows: Row[]; unseen: { id: number; name: string }[]; talentReady: boolean;
  stats: { matched: number; seen: number; nudged: number; interested: number; notForMe: number; shortlisted: number };
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [rows, setRows] = useState(init);
  const [filled, setFilled] = useState(filledInit);
  const [tab, setTab] = useState<"interested" | "not_for_me" | "unseen">("interested");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const stage = async (id: number, s: Row["stage"]) => {
    setRows((l) => l.map((r) => (r.member_id === id ? { ...r, stage: s } : r)));
    await stageAction(postId, id, s);
  };
  const shown = rows.filter((r) => r.answer === tab);
  const shortlisted = rows.filter((r) => r.stage === "shortlisted").length;
  return (
    <section className="rounded-2xl border border-hairline bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-5 py-4">
        <h2 className="font-display text-lg text-ink">{t("Responses")}</h2>
        <span className="text-sm text-soft">{t("Staff only")}</span>
        <div className="ms-auto flex flex-wrap gap-2">
          {talentReady
            ? <Button size="sm" variant="secondary" disabled={!shortlisted} onClick={async () => { const r = await talentAction(postId); setMsg(r.ok ? { text: t("Sent {n} shortlisted to the Talent portal.", { n: r.sent ?? 0 }) } : { text: r.error ?? "", bad: true }); router.refresh(); }}><Send className="size-4 rtl:-scale-x-100" />{t("Send shortlist to Talent")}</Button>
            : <span className="self-center text-xs text-soft" title={t("Set TALENT_SHORTLIST_URL and TALENT_SHORTLIST_SECRET on the host, and build the receiving side in the Talent portal.")}>{t("Talent portal link: off in this preview")}</span>}
          <Button size="sm" variant={filled ? "secondary" : "good"} onClick={async () => { if (!filled && !window.confirm(t("Mark as filled? Everyone interested who isn't shortlisted is told it's filled."))) return; await fillAction(postId, !filled); setFilled(!filled); router.refresh(); }}>
            {filled ? t("Reopen") : <><CheckCircle2 className="size-4" />{t("Mark as filled")}</>}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px bg-hairline sm:grid-cols-5">
        {[
          { label: t("Matched and alerted"), value: stats.matched },
          { label: t("Seen it"), value: `${stats.seen} / ${stats.matched}` },
          { label: t("Interested"), value: stats.interested },
          { label: t("Shortlisted"), value: shortlisted },
          { label: t("WhatsApp nudges"), value: stats.nudged },
        ].map((s) => (
          <div key={s.label} className="bg-surface px-4 py-3"><p className="text-xs text-soft">{s.label}</p><p className="num font-display text-2xl text-ink">{s.value}</p></div>
        ))}
      </div>
      {msg && <p className={cx("border-t border-hairline px-5 py-2 text-sm font-semibold", msg.bad ? "text-danger" : "text-moss")}>{msg.text}</p>}
      <div className="flex gap-1 border-t border-hairline px-4 pt-3">
        {([["interested", t("Interested"), stats.interested], ["not_for_me", t("Not for me"), stats.notForMe], ["unseen", t("Haven't seen it"), unseen.length]] as const).map(([k, label, n]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cx("rounded-full px-3.5 py-1.5 text-sm font-semibold", tab === k ? "bg-brand text-white" : "text-ink-soft hover:bg-brand-50")}>{label} <span className="num opacity-80">{n}</span></button>
        ))}
      </div>
      {tab === "unseen" ? (
        <ul className="flex flex-wrap gap-2 p-4">
          {unseen.map((u) => <li key={u.id}><Link href={`/members/${u.id}`} className="inline-flex items-center gap-2 rounded-full border border-hairline px-3 py-1 text-sm hover:border-brand-300"><Avatar name={u.name} size={22} />{u.name}</Link></li>)}
          {!unseen.length && <li className="text-sm text-soft">{t("Everyone matched has seen it.")}</li>}
        </ul>
      ) : (
        <ul className="divide-y divide-hairline">
          {shown.map((r) => (
            <li key={r.member_id} className={cx("flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start", r.stage === "shortlisted" && "bg-moss-50/50", r.stage === "declined" && "opacity-60")}>
              <Avatar name={r.full_name} photoId={r.avatar_file_id} size={44} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <Link href={`/members/${r.member_id}`} className="font-semibold text-ink hover:underline">{r.full_name}</Link>
                  {r.verified_title && <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-moss"><BadgeCheck className="size-4" />{t(r.verified_title)}</span>}
                  {r.matched && <Badge tone="brand">{t("Matched")}</Badge>}
                  {r.stage === "shortlisted" && <Badge tone="good">{t("Shortlisted")}</Badge>}
                  {r.talent_sent_at && <Badge tone="info">{t("Sent to Talent")}</Badge>}
                </p>
                <p className="mt-0.5 text-sm text-soft">{[r.roles.map((x) => t(roleLabel(x))).join(", "), r.city ? t(r.city) : "", r.languages.map((l) => t(l)).join(", ")].filter(Boolean).join(" · ")}</p>
                {(r.open_to_work || r.available_from || r.availability_note) && (
                  <p className="mt-0.5 text-sm text-ink-soft">{r.open_to_work ? t("Open to new cases") : t("Not looking right now")}{r.available_from ? ` · ${t("free from {date}", { date: fmtDate(r.available_from, locale) })}` : ""}{r.availability_note ? ` · ${r.availability_note}` : ""}</p>
                )}
                {r.note && <p className="mt-2 rounded-xl bg-paper px-3 py-2 text-sm text-ink" dir="auto">“{r.note}”</p>}
                <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-faint">
                  <span>{t("answered {when}", { when: timeAgo(r.created_at, locale) })}</span>
                  {r.seen_at && <span className="inline-flex items-center gap-1"><Eye className="size-3" />{t("seen {when}", { when: timeAgo(r.seen_at, locale) })}</span>}
                  {r.talent_url && <a href={r.talent_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"><ExternalLink className="size-3" />{t("Talent profile #{ref}", { ref: r.talent_ref ?? "" })}</a>}
                  {r.talent_error && <span className="text-danger">{r.talent_error}</span>}
                </p>
              </div>
              {r.answer === "interested" && (
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {r.stage !== "shortlisted" ? <Button size="xs" variant="good" onClick={() => stage(r.member_id, "shortlisted")}><BellRing className="size-3.5" />{t("Shortlist")}</Button>
                    : <Button size="xs" variant="secondary" onClick={() => stage(r.member_id, "new")}>{t("Undo shortlist")}</Button>}
                  {r.stage !== "declined" && <Button size="xs" variant="ghost" onClick={() => stage(r.member_id, "declined")}><XCircle className="size-3.5" />{t("Not this time")}</Button>}
                  <Link href={`/dm/new?to=${r.member_id}`} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold text-ink-soft hover:bg-brand-50"><MessageCircle className="size-3.5" />{t("Message")}</Link>
                </div>
              )}
            </li>
          ))}
          {!shown.length && <li className="px-5 py-6 text-sm text-soft">{t("No one yet.")}</li>}
        </ul>
      )}
    </section>
  );
}
