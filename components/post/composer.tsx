"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, CalendarClock, Loader2, Mic, Paperclip, SendHorizontal, Square, Trash2, X, EyeOff, FileText } from "lucide-react";
import { sendPost } from "@/app/actions/posts";
import type { FileView, PostView } from "@/lib/types";
import { useT } from "../i18n";
import { Avatar, Button, cx } from "../ui";

type Pending = { key: string; name: string; error?: string; file?: FileView; preview?: string };
type Suggest = { id: number | "all"; name: string; avatar?: number | null };

export type ComposerProps = {
  channelId?: number; dmId?: number; parentId?: number;
  placeholder: string;
  allowUpload?: boolean; allowVoice?: boolean; allowPoll?: boolean; allowSchedule?: boolean; allowAnonymous?: boolean;
  mentionChannel?: number; people?: { id: number; name: string }[]; canMentionAll?: boolean;
  caseTalk?: boolean;
  onSent: (post: PostView, note?: string) => void;
  autoFocus?: boolean; compact?: boolean; rows?: number; submitLabel?: string;
};

export async function prepareImage(file: File): Promise<{ blob: Blob; w?: number; h?: number; name: string }> {
  if (file.type === "image/gif") return { blob: file, name: file.name };
  try {
    const bm = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const scale = Math.min(1, 1600 / Math.max(bm.width, bm.height));
    const w = Math.round(bm.width * scale), h = Math.round(bm.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d")!.drawImage(bm, 0, 0, w, h);
    // Drawing the photo again drops its hidden details (location, camera, time).
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.85));
    return { blob, w, h, name: `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg` };
  } catch {
    return { blob: file, name: file.name };
  }
}

export async function upload(blob: Blob, name: string, meta: Record<string, number | undefined> = {}): Promise<FileView> {
  const fd = new FormData();
  fd.set("file", new File([blob], name, { type: blob.type }));
  for (const [k, v] of Object.entries(meta)) if (v) fd.set(k, String(Math.round(v)));
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  const j = await r.json().catch(() => ({ error: "Upload failed." }));
  if (!r.ok) throw new Error(j.error ?? "Upload failed.");
  return j as FileView;
}

/**
 * The message box: words, @mentions, photos and files, a voice note, a poll,
 * posting later (staff), posting without your name (where allowed). Enter
 * sends on a computer; on a phone the send button does.
 */
export function Composer(p: ComposerProps) {
  const t = useT();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const [poll, setPoll] = useState<{ on: boolean; options: string[]; multi: boolean; closes: string }>({ on: false, options: ["", ""], multi: false, closes: "" });
  const [schedule, setSchedule] = useState<{ on: boolean; at: string }>({ on: false, at: "" });
  const [anonymous, setAnonymous] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [childAsk, setChildAsk] = useState(false);
  const [childOk, setChildOk] = useState(false);
  const [suggest, setSuggest] = useState<{ q: string; items: Suggest[]; at: number } | null>(null);
  const [sel, setSel] = useState(0);
  const picks = useRef(new Map<string, number | "all">());
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [rec, setRec] = useState<{ start: number; secs: number } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const cancelRec = useRef(false);
  // Browser-only facts, read after the first paint so the server's HTML matches.
  const [touch, setTouch] = useState(false);
  const [canRecord, setCanRecord] = useState(false);
  useEffect(() => { setTouch(window.matchMedia("(pointer: coarse)").matches); setCanRecord("MediaRecorder" in window && Boolean(navigator.mediaDevices)); }, []);

  useEffect(() => { if (p.autoFocus && !touch) ta.current?.focus(); }, [p.autoFocus, touch]);
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  }, [text]);
  useEffect(() => { if (!note) return; const x = setTimeout(() => setNote(null), 6000); return () => clearTimeout(x); }, [note]);

  // ------------------------------------------------------------- mentions ----
  const lookFor = async (value: string, caret: number) => {
    const m = value.slice(0, caret).match(/(^|\s)@([\p{L}\p{N}_.-]{0,30})$/u);
    if (!m) { setSuggest(null); return; }
    const q = m[2];
    const at = caret - q.length - 1;
    let items: Suggest[] = [];
    if (p.mentionChannel) {
      const r = await fetch(`/api/members?channel=${p.mentionChannel}&q=${encodeURIComponent(q)}`).then((x) => x.json()).catch(() => ({ items: [] }));
      items = r.items ?? [];
    } else if (p.people) items = p.people.filter((x) => x.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
    if (p.canMentionAll && "everyone".startsWith(q.toLowerCase())) items = [{ id: "all", name: "everyone" }, ...items];
    setSuggest(items.length ? { q, items, at } : null);
    setSel(0);
  };
  const pick = (s: Suggest) => {
    if (!suggest) return;
    const name = s.id === "all" ? "everyone" : s.name;
    const before = text.slice(0, suggest.at), after = text.slice(suggest.at + 1 + suggest.q.length);
    const next = `${before}@${name} ${after}`;
    picks.current.set(name, s.id);
    setText(next); setSuggest(null);
    requestAnimationFrame(() => { const pos = before.length + name.length + 2; ta.current?.focus(); ta.current?.setSelectionRange(pos, pos); });
  };
  const withTokens = (s: string) => {
    let out = s;
    const names = [...picks.current.keys()].sort((a, b) => b.length - a.length);
    for (const n of names) out = out.split(`@${n}`).join(`<@${picks.current.get(n)}>`);
    return out;
  };

  // ---------------------------------------------------------------- files ----
  const addFiles = async (list: FileList | File[]) => {
    for (const f of Array.from(list).slice(0, 10 - files.length)) {
      const key = `${Date.now()}-${Math.random()}`;
      const isImage = f.type.startsWith("image/");
      setFiles((x) => [...x, { key, name: f.name, preview: isImage ? URL.createObjectURL(f) : undefined }]);
      try {
        const prepared = isImage ? await prepareImage(f) : { blob: f as Blob, name: f.name };
        if (prepared.blob.size > 4 * 1024 * 1024) throw new Error(t("That file is over 4 MB. Please choose a smaller one."));
        const done = await upload(prepared.blob, prepared.name, { width: (prepared as { w?: number }).w, height: (prepared as { h?: number }).h });
        setFiles((x) => x.map((y) => (y.key === key ? { ...y, file: done } : y)));
      } catch (e) {
        setFiles((x) => x.map((y) => (y.key === key ? { ...y, error: (e as Error).message } : y)));
      }
    }
  };

  // ---------------------------------------------------------------- voice ----
  const startRec = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      const start = Date.now();
      cancelRec.current = false;
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        setRec(null);
        if (cancelRec.current || !chunks.length) return;
        const type = (r.mimeType || mime || "audio/webm").split(";")[0];
        const blob = new Blob(chunks, { type });
        const key = `v-${start}`;
        const name = `${t("Voice note")}.${type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"}`;
        setFiles((x) => [...x, { key, name }]);
        try {
          const done = await upload(blob, name, { duration: Date.now() - start });
          setFiles((x) => x.map((y) => (y.key === key ? { ...y, file: done } : y)));
        } catch (e) { setFiles((x) => x.map((y) => (y.key === key ? { ...y, error: (e as Error).message } : y))); }
      };
      r.start(250);
      recorder.current = r;
      setRec({ start, secs: 0 });
    } catch {
      setError(t("The microphone isn't available. Allow it for this site in your browser, then try again."));
    }
  };
  useEffect(() => {
    if (!rec) return;
    const x = setInterval(() => {
      const secs = Math.round((Date.now() - rec.start) / 1000);
      setRec((r) => (r ? { ...r, secs } : r));
      if (secs >= 180) recorder.current?.stop();
    }, 500);
    return () => clearInterval(x);
  }, [rec?.start]); // eslint-disable-line react-hooks/exhaustive-deps

  // --------------------------------------------------------------- sending ----
  const ready = files.every((f) => f.file || f.error);
  const send = async (opts: { confirmed?: boolean } = {}) => {
    if (sending || !ready) return;
    const fileIds = files.filter((f) => f.file).map((f) => f.file!.id);
    const options = poll.options.map((o) => o.trim()).filter(Boolean);
    if (!text.trim() && !fileIds.length) { setError(t("Write something first.")); return; }
    if (poll.on && options.length < 2) { setError(t("Give the poll at least two choices.")); return; }
    setSending(true); setError(null);
    const closesAt = poll.on && poll.closes ? new Date(Date.now() + Number(poll.closes) * 3600_000).toISOString() : null;
    const r = await sendPost({
      channelId: p.channelId, dmId: p.dmId, parentId: p.parentId, kind: poll.on ? "poll" : "message", body: withTokens(text),
      data: poll.on ? { options, multi: poll.multi, closesAt } : undefined, fileIds, anonymous,
      publishAt: schedule.on && schedule.at ? new Date(schedule.at).toISOString() : null, confirmed: opts.confirmed, noChildPhoto: childOk,
    }).catch(() => ({ ok: false as const, error: t("Couldn't send. Check your connection and try again.") }));
    setSending(false);
    if (!r.ok) {
      if ("confirm" in r && r.confirm === "caution") { if (window.confirm(r.error)) return send({ confirmed: true }); return; }
      if ("confirm" in r && r.confirm === "child_photo") { setChildAsk(true); setError(r.error); return; }
      setError(r.error); return;
    }
    p.onSent(r.post, r.note);
    if (r.note) setNote(r.note);
    setText(""); setFiles([]); setPoll({ on: false, options: ["", ""], multi: false, closes: "" }); setSchedule({ on: false, at: "" }); setAnonymous(false); setChildAsk(false); setChildOk(false);
    picks.current.clear();
  };

  const tool = "inline-flex size-9 items-center justify-center rounded-lg text-soft transition-colors hover:bg-paper hover:text-ink aria-pressed:bg-brand-50 aria-pressed:text-brand";
  return (
    <div className={cx("relative", p.compact ? "" : "")}>
      {suggest && (
        <ul className="absolute bottom-full start-0 z-30 mb-2 w-72 overflow-hidden rounded-2xl border border-hairline bg-surface py-1 shadow-lift" role="listbox">
          {suggest.items.map((s, i) => (
            <li key={String(s.id)}>
              <button type="button" role="option" aria-selected={i === sel} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}
                className={cx("flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm", i === sel ? "bg-brand-50 text-brand" : "text-ink hover:bg-paper")}>
                {s.id === "all" ? <span className="flex size-7 items-center justify-center rounded-full bg-champagne-soft text-xs font-bold text-brand-deep">@</span> : <Avatar name={s.name} photoId={s.avatar} size={28} />}
                <span className="truncate font-semibold">{s.id === "all" ? t("everyone (everyone in this channel)") : s.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {p.caseTalk && !p.compact && <p className="mb-2 rounded-xl bg-apricot-50 px-3 py-2 text-sm text-caution">{t("Case talk: never write a child's name, school or family details, and no photos of children.")}</p>}
      <div className={cx("rounded-2xl border border-line bg-surface shadow-card focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-50")}>
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2 border-b border-hairline p-2">
            {files.map((f) => (
              <li key={f.key} className={cx("relative flex items-center gap-2 rounded-xl border px-2 py-1.5 text-sm", f.error ? "border-danger/40 bg-danger-50 text-danger" : "border-hairline bg-paper")}>
                {f.preview ? <img src={f.preview} alt="" className="size-10 rounded-lg object-cover" /> : f.name.startsWith(t("Voice note")) ? <Mic className="size-4" /> : <FileText className="size-4" />}
                <span className="max-w-[10rem] truncate">{f.error ?? f.name}</span>
                {!f.file && !f.error && <Loader2 className="size-4 animate-spin text-soft" />}
                <button type="button" onClick={() => setFiles((x) => x.filter((y) => y.key !== f.key))} aria-label={t("Remove")} className="rounded p-0.5 hover:bg-hairline"><X className="size-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
        {rec ? (
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="rec-dot size-3 rounded-full bg-danger" />
            <span className="num flex-1 text-sm font-semibold text-ink">{t("Recording")} {Math.floor(rec.secs / 60)}:{String(rec.secs % 60).padStart(2, "0")}</span>
            <Button size="sm" variant="ghost" onClick={() => { cancelRec.current = true; recorder.current?.stop(); }}><Trash2 className="size-4" />{t("Cancel")}</Button>
            <Button size="sm" onClick={() => recorder.current?.stop()}><Square className="size-4" />{t("Stop")}</Button>
          </div>
        ) : (
          <textarea ref={ta} value={text} rows={p.rows ?? 1} placeholder={poll.on ? t("Ask your question") : p.placeholder} dir="auto"
            className="block max-h-64 w-full resize-none bg-transparent px-4 py-3 text-base outline-none placeholder:text-faint"
            onChange={(e) => { setText(e.target.value); void lookFor(e.target.value, e.target.selectionStart ?? e.target.value.length); }}
            onPaste={(e) => { const fl = e.clipboardData?.files; if (fl?.length && p.allowUpload) { e.preventDefault(); void addFiles(fl); } }}
            onKeyDown={(e) => {
              if (suggest) {
                if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => (s + 1) % suggest.items.length); return; }
                if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => (s - 1 + suggest.items.length) % suggest.items.length); return; }
                if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(suggest.items[sel]); return; }
                if (e.key === "Escape") { setSuggest(null); return; }
              }
              if (e.key === "Enter" && !e.shiftKey && !touch && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
            }} />
        )}
        {poll.on && (
          <div className="space-y-2 border-t border-hairline px-4 py-3">
            {poll.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="input !min-h-10 !py-1.5" value={o} placeholder={t("Choice {n}", { n: i + 1 })} maxLength={120} dir="auto"
                  onChange={(e) => setPoll((x) => ({ ...x, options: x.options.map((y, j) => (j === i ? e.target.value : y)) }))} />
                {poll.options.length > 2 && <button type="button" onClick={() => setPoll((x) => ({ ...x, options: x.options.filter((_, j) => j !== i) }))} aria-label={t("Remove")} className="rounded-lg p-1.5 text-soft hover:bg-paper"><X className="size-4" /></button>}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {poll.options.length < 10 && <button type="button" onClick={() => setPoll((x) => ({ ...x, options: [...x.options, ""] }))} className="font-semibold text-brand">+ {t("Add a choice")}</button>}
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={poll.multi} onChange={(e) => setPoll((x) => ({ ...x, multi: e.target.checked }))} />{t("People can choose more than one")}</label>
              <select className="rounded-lg border border-line bg-surface px-2 py-1" value={poll.closes} onChange={(e) => setPoll((x) => ({ ...x, closes: e.target.value }))} aria-label={t("Poll closes")}>
                <option value="">{t("Stays open")}</option><option value="24">{t("Closes in 1 day")}</option><option value="72">{t("Closes in 3 days")}</option><option value="168">{t("Closes in 1 week")}</option>
              </select>
            </div>
          </div>
        )}
        {schedule.on && (
          <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-4 py-2 text-sm">
            <CalendarClock className="size-4 text-brand" /><span>{t("Post it on")}</span>
            <input type="datetime-local" className="rounded-lg border border-line px-2 py-1" value={schedule.at} onChange={(e) => setSchedule({ on: true, at: e.target.value })} />
          </div>
        )}
        {childAsk && (
          <label className="flex items-start gap-2 border-t border-hairline bg-apricot-50 px-4 py-2 text-sm text-caution">
            <input type="checkbox" className="mt-1" checked={childOk} onChange={(e) => setChildOk(e.target.checked)} />{t("No child's face can be seen in these photos.")}
          </label>
        )}
        <div className="flex items-center gap-0.5 px-2 pb-2">
          {p.allowUpload && (
            <>
              <button type="button" className={tool} onClick={() => fileInput.current?.click()} aria-label={t("Add photos or files")} title={t("Add photos or files")}><Paperclip className="size-5" /></button>
              <input ref={fileInput} type="file" multiple hidden accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
            </>
          )}
          {p.allowVoice && p.allowUpload && !rec && canRecord && (
            <button type="button" className={tool} onClick={startRec} aria-label={t("Record a voice note")} title={t("Record a voice note")}><Mic className="size-5" /></button>
          )}
          {p.allowPoll && <button type="button" className={tool} aria-pressed={poll.on} onClick={() => setPoll((x) => ({ ...x, on: !x.on }))} aria-label={t("Make it a poll")} title={t("Make it a poll")}><BarChart3 className="size-5" /></button>}
          {p.allowSchedule && <button type="button" className={tool} aria-pressed={schedule.on} onClick={() => setSchedule((x) => ({ on: !x.on, at: x.at }))} aria-label={t("Post later")} title={t("Post later")}><CalendarClock className="size-5" /></button>}
          {p.allowAnonymous && (
            <button type="button" className={cx(tool, "w-auto gap-1.5 px-2 text-sm")} aria-pressed={anonymous} onClick={() => setAnonymous((a) => !a)} title={t("Staff still see who posted")}>
              <EyeOff className="size-4" />{anonymous ? t("Without my name") : t("Post without my name")}
            </button>
          )}
          <span className="flex-1" />
          <Button size="sm" onClick={() => send()} disabled={sending || !ready || Boolean(rec)} aria-label={p.submitLabel ?? t("Send")}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4 rtl:-scale-x-100" />}{!p.compact && (p.submitLabel ?? (schedule.on ? t("Schedule") : t("Send")))}
          </Button>
        </div>
      </div>
      {error && <p role="alert" className="mt-1.5 text-sm font-semibold text-danger">{error}</p>}
      {note && <p role="status" className="mt-1.5 text-sm font-semibold text-caution">{note}</p>}
    </div>
  );
}
