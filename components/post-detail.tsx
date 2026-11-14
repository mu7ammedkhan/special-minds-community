"use client";

import { CheckCircle2, ExternalLink, Download, Stethoscope } from "lucide-react";
import { bestAnswerAction } from "@/app/actions/posts";
import { fileSize, fmtDateTime } from "@/lib/format";
import type { PostView, ResourceData } from "@/lib/types";
import { useLocale, useT } from "./i18n";
import { Body, LinkPreview } from "./post/body";
import { Attachments } from "./post/files";
import { AuthorAvatar, AuthorName, PostMenu, StatusLine } from "./post/message";
import { Poll } from "./post/poll";
import { ThreadView } from "./thread";

/** A topic, library item or feed post on its own page, with live replies; topics get "best answer" and specialist answers marked. */
export function PostDetail({ root, replies, now, meId, base, channelId, hideRoot = false, topic = false, families = false, title, allowUpload }: {
  root: PostView; replies: PostView[]; now: string; meId: number; base: string; channelId: number; hideRoot?: boolean; topic?: boolean; families?: boolean; title?: string; allowUpload: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const link = (p: PostView) => `${base}/${p.parentId ?? p.id}`;
  return (
    <section className={hideRoot ? "rounded-2xl border border-hairline bg-surface p-4 shadow-card sm:p-5" : ""}>
      {title && <h2 className="mb-2 font-display text-lg text-ink">{title}</h2>}
      <ThreadView rootId={root.id} meId={meId} link={link} initial={{ root, replies, now }} hideRoot={hideRoot} mentionChannel={channelId} allowUpload={allowUpload}
        placeholder={topic ? t("Write a reply…") : t("Write a comment…")}
        renderRoot={(r, refresh) => (
          <article className="mb-2 rounded-2xl border border-hairline bg-surface p-5 shadow-card">
            <div className="flex items-start gap-3">
              <AuthorAvatar author={r.author} size={44} />
              <div className="min-w-0 flex-1">
                <AuthorName author={r.author} />
                <p className="text-xs text-faint">{fmtDateTime(r.createdAt, locale)}{r.editedAt ? ` · ${t("edited")}` : ""}</p>
              </div>
              <PostMenu post={r} link={link(r)} top onRemoved={() => { location.href = base; }} onChanged={refresh} />
            </div>
            {r.title && <h1 className="mt-3 font-display text-2xl text-ink" dir="auto">{r.title}</h1>}
            {r.kind === "resource" && (r.data as ResourceData).category && <p className="text-sm font-semibold text-caution">{t((r.data as ResourceData).category!)}</p>}
            <Body text={r.body} mentions={r.mentions} meId={meId} className="mt-2 text-base text-ink" />
            <LinkPreview data={r.data} />
            <Attachments files={r.files} large />
            {r.kind === "resource" && (
              <div className="mt-3 flex flex-wrap gap-3">
                {(r.data as ResourceData).url && <a href={(r.data as ResourceData).url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"><ExternalLink className="size-4" />{t("Open the link")}</a>}
                {r.files.filter((f) => f.kind === "file").map((f) => <a key={f.id} href={`/api/files/${f.id}?download=1`} className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-semibold text-brand"><Download className="size-4" />{f.name} ({fileSize(f.size)})</a>)}
              </div>
            )}
            {r.poll && <Poll post={r} onChanged={refresh} />}
            <StatusLine post={r} />
            {topic && families && <p className="mt-4 rounded-xl bg-paper px-3 py-2 text-xs text-soft">{t("Answers here come from parents and specialists. They aren't medical advice: for your child's care, speak to their own doctor or therapist.")}</p>}
          </article>
        )}
        replyExtra={topic ? (reply, r, refresh) => {
          const best = r.bestAnswerId === reply.id;
          const canChoose = r.mine || r.can.moderate;
          const specialist = !reply.author.anonymous && (reply.author.kind === "specialist" || reply.author.kind === "team") && families;
          return (
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {specialist && <span className="inline-flex items-center gap-1 rounded-full bg-info-50 px-2 py-0.5 text-xs font-semibold text-info"><Stethoscope className="size-3.5" />{t("Specialist answer")}</span>}
              {best && <span className="inline-flex items-center gap-1 rounded-full bg-moss-50 px-2 py-0.5 text-xs font-semibold text-moss"><CheckCircle2 className="size-3.5" />{t("Best answer")}</span>}
              {canChoose && reply.status === "published" && (
                <button type="button" onClick={async () => { await bestAnswerAction(r.id, best ? null : reply.id); refresh(); }} className="text-xs font-semibold text-soft hover:text-moss">
                  {best ? t("Undo best answer") : t("Mark as best answer")}
                </button>
              )}
            </div>
          );
        } : undefined}
      />
    </section>
  );
}
