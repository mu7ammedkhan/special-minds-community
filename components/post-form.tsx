"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileText, Loader2, Paperclip, Sparkles, X } from "lucide-react";
import { matchCount } from "@/app/actions/create";
import { sendPost } from "@/app/actions/posts";
import { COUNTRY, LANGUAGES, ROLES } from "@/lib/options";
import type { FileView } from "@/lib/types";
import { useT } from "./i18n";
import { prepareImage, upload } from "./post/composer";
import { Button, cx } from "./ui";

type Mode = "topic" | "opportunity" | "event" | "resource";

/** New forum topic, opportunity, event or library item: one form, the fields each needs. */
export function PostForm({ mode, channelId, back, country, staff, allowAnonymous, categories, nudgeHours }: {
  mode: Mode; channelId: number; back: string; country: string; staff: boolean; allowAnonymous: boolean; categories: string[]; nudgeHours: number;
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [files, setFiles] = useState<FileView[]>([]);
  const [uploading, setUploading] = useState(false);
  const [langs, setLangs] = useState<string[]>([]);
  const [matched, setMatched] = useState<number | null>(null);
  const cities = COUNTRY[country]?.cities ?? [];

  const addFiles = async (list: FileList) => {
    setUploading(true); setErr(null);
    try {
      for (const f of Array.from(list).slice(0, 6)) {
        const p = f.type.startsWith("image/") ? await prepareImage(f) : { blob: f as Blob, name: f.name };
        const done = await upload(p.blob, p.name, { width: (p as { w?: number }).w, height: (p as { h?: number }).h });
        setFiles((x) => [...x, done]);
      }
    } catch (e) { setErr((e as Error).message); }
    setUploading(false);
  };

  const read = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const s = (k: string) => String(fd.get(k) ?? "").trim();
    const local = (k: string) => (s(k) ? new Date(s(k)).toISOString() : null);
    const data: Record<string, unknown> =
      mode === "opportunity" ? { role: s("role"), city: s("city"), area: s("area"), schedule: s("schedule"), childAge: s("childAge"), needs: s("needs"), languages: langs, gender: s("gender") || "any", start: s("start"), pay: s("pay"), details: s("details"), nudge: fd.get("nudge") === "1" }
      : mode === "event" ? { startsAt: local("startsAt"), endsAt: local("endsAt"), place: s("place"), online: s("online"), capacity: s("capacity") }
      : mode === "resource" ? { category: s("category"), url: s("url") } : {};
    return { title: s("title"), body: s("body"), data, anonymous: fd.get("anonymous") === "1", publishAt: local("publishAt") };
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>, confirmed = false, noChildPhoto = false) => {
    e.preventDefault();
    const form = e.currentTarget;
    const v = read(form);
    setBusy(true); setErr(null);
    const kind = mode === "topic" ? "topic" : mode === "opportunity" ? "opportunity" : mode === "event" ? "event" : "resource";
    const r = await sendPost({ channelId, kind, title: v.title || null, body: v.body, data: v.data, fileIds: files.map((f) => f.id), anonymous: v.anonymous, publishAt: v.publishAt, confirmed, noChildPhoto });
    setBusy(false);
    if (!r.ok) {
      if (r.confirm === "caution" && window.confirm(r.error)) return submit({ ...e, currentTarget: form, preventDefault: () => {} } as React.FormEvent<HTMLFormElement>, true, noChildPhoto);
      if (r.confirm === "child_photo" && window.confirm(r.error)) return submit({ ...e, currentTarget: form, preventDefault: () => {} } as React.FormEvent<HTMLFormElement>, confirmed, true);
      setErr(r.error); return;
    }
    router.push(r.post.status === "published" || r.post.status === "scheduled" ? `${back}/${r.post.id}` : back);
    router.refresh();
  };

  const label = "mb-1.5 block text-sm font-semibold text-ink";
  return (
    <form onSubmit={(e) => submit(e)} className="space-y-4">
      {mode === "opportunity" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={label} htmlFor="role">{t("Role")} *</label>
              <select id="role" name="role" className="input" required defaultValue=""><option value="" disabled>{t("Choose…")}</option>{ROLES.map((r) => <option key={r.value} value={r.value}>{t(r.label)}</option>)}</select></div>
            <div><label className={label} htmlFor="city">{t("City")} *</label>
              <select id="city" name="city" className="input" required defaultValue=""><option value="" disabled>{t("Choose…")}</option>{cities.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={label} htmlFor="area">{t("Area")}</label><input id="area" name="area" className="input" placeholder={t("For example: Al Barsha")} /></div>
            <div><label className={label} htmlFor="start">{t("Starts")}</label><input id="start" name="start" className="input" placeholder={t("For example: 1 December")} /></div>
          </div>
          <div><label className={label} htmlFor="schedule">{t("Days and hours")}</label><input id="schedule" name="schedule" className="input" placeholder={t("For example: Sun to Thu, 7:30 am to 2:30 pm")} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={label} htmlFor="childAge">{t("Child's age")}</label><input id="childAge" name="childAge" className="input" placeholder={t("For example: Boy, 6")} /></div>
            <div><label className={label} htmlFor="needs">{t("Needs")}</label><input id="needs" name="needs" className="input" placeholder={t("For example: autism, mainstream school")} /></div>
          </div>
          <fieldset><legend className={label}>{t("Languages")}</legend>
            <div className="flex flex-wrap gap-1.5">{LANGUAGES.slice(0, 10).map((l) => (
              <button key={l} type="button" onClick={() => setLangs((x) => (x.includes(l) ? x.filter((y) => y !== l) : [...x, l]))} className={cx("pill", langs.includes(l) && "!border-brand !bg-brand !text-white")}>{t(l)}</button>
            ))}</div></fieldset>
          <fieldset><legend className={label}>{t("Specialist")}</legend>
            <div className="flex flex-wrap gap-1.5">{[["any", t("Anyone")], ["female", t("Female")], ["male", t("Male")]].map(([v, l]) => (
              <label key={v} className="pill relative"><input type="radio" name="gender" value={v} defaultChecked={v === "any"} />{l}</label>
            ))}</div></fieldset>
          <div><label className={label} htmlFor="title">{t("Headline")} <span className="font-normal text-soft">({t("optional")})</span></label><input id="title" name="title" className="input" placeholder={t("Left empty, it's made from the role and area")} maxLength={200} /></div>
          <div><label className={label} htmlFor="details">{t("More details")}</label><textarea id="details" name="details" className="input" rows={4} maxLength={2000} placeholder={t("Never write the child's name or school.")} /></div>
          <div><label className={label} htmlFor="pay">{t("Pay (staff only)")}</label><input id="pay" name="pay" className="input" placeholder={t("Only Special Minds staff see this")} /></div>
          <label className="flex items-start gap-3 text-sm text-ink"><input type="checkbox" name="nudge" value="1" className="mt-1 size-5" />{t("Nudge matching specialists on WhatsApp if they haven't opened it after {n} hours (only people who turned WhatsApp alerts on).", { n: nudgeHours })}</label>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-brand-50 px-4 py-3">
            <Sparkles className="size-5 text-brand" />
            <span className="flex-1 text-sm text-ink-soft">{matched === null ? t("Only specialists whose role, city, languages and gender fit get the alert.") : t("{n} specialists matched", { n: matched })}</span>
            <Button size="sm" variant="secondary" onClick={async (e) => { const form = (e.currentTarget as HTMLElement).closest("form")!; const v = read(form); setMatched(await matchCount(channelId, v.data)); }}>{t("Check who matches")}</Button>
          </div>
        </>
      ) : (
        <div><label className={label} htmlFor="title">{mode === "topic" ? t("Your question or topic") : t("Title")} *</label><input id="title" name="title" className="input" required maxLength={200} dir="auto" /></div>
      )}
      {mode === "event" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={label} htmlFor="startsAt">{t("Starts")} *</label><input id="startsAt" name="startsAt" type="datetime-local" className="input" required /></div>
            <div><label className={label} htmlFor="endsAt">{t("Ends")}</label><input id="endsAt" name="endsAt" type="datetime-local" className="input" /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={label} htmlFor="place">{t("Place")}</label><input id="place" name="place" className="input" placeholder={t("For example: Special Minds centre, Al Barsha")} /></div>
            <div><label className={label} htmlFor="online">{t("Online link")}</label><input id="online" name="online" className="input" placeholder="https://" dir="ltr" /></div>
          </div>
          <div className="sm:w-1/2"><label className={label} htmlFor="capacity">{t("Places")} <span className="font-normal text-soft">({t("optional")})</span></label><input id="capacity" name="capacity" type="number" min={1} className="input" /></div>
        </>
      )}
      {mode === "resource" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className={label} htmlFor="category">{t("Category")}</label><input id="category" name="category" className="input" list="cats" /><datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></div>
          <div><label className={label} htmlFor="url">{t("Link")}</label><input id="url" name="url" className="input" placeholder="https://" dir="ltr" /></div>
        </div>
      )}
      {mode !== "opportunity" && (
        <div><label className={label} htmlFor="body">{mode === "topic" ? t("Details") : t("Description")}{mode === "topic" ? " *" : ""}</label>
          <textarea id="body" name="body" className="input" rows={6} required={mode === "topic"} maxLength={8000} dir="auto" /></div>
      )}
      {mode !== "opportunity" && (
        <div>
          <div className="flex flex-wrap gap-2">
            {files.map((f) => (
              <span key={f.id} className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-paper px-2.5 py-1.5 text-sm">
                <FileText className="size-4" />{f.name}<button type="button" onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))} aria-label={t("Remove")}><X className="size-3.5" /></button>
              </span>
            ))}
          </div>
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-sm font-semibold text-ink-soft hover:border-brand hover:text-brand">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}{t("Add photos or files")}
            <input type="file" hidden multiple={mode !== "resource"} accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
      )}
      {mode === "topic" && allowAnonymous && <label className="flex items-start gap-3 text-sm text-ink"><input type="checkbox" name="anonymous" value="1" className="mt-1 size-5" />{t("Post without my name. Other members see “A parent”; Special Minds staff still see who asked.")}</label>}
      {staff && mode !== "topic" && (
        <div className="sm:w-1/2"><label className={label} htmlFor="publishAt">{t("Post it later")} <span className="font-normal text-soft">({t("optional")})</span></label><input id="publishAt" name="publishAt" type="datetime-local" className="input" /></div>
      )}
      {err && <p role="alert" className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger">{err}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || uploading} size="lg">{busy && <Loader2 className="size-5 animate-spin" />}{mode === "topic" ? t("Post topic") : mode === "opportunity" ? t("Post opportunity") : mode === "event" ? t("Post event") : t("Add to library")}</Button>
        <Button variant="ghost" size="lg" onClick={() => router.push(back)}>{t("Cancel")}</Button>
      </div>
    </form>
  );
}
