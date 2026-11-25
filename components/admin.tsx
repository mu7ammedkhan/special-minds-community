"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, CheckCircle2, Copy, Loader2, Upload, X } from "lucide-react";
import {
  cancelBroadcast, channelMemberAction, clearFlag, createInvite, decideRequestAction, helpStatus, helpToCrm, importSpecialists, memberStatusAction, muteAction,
  quickChannelToggle, reportDecision, revokeInvite, scheduledAction, segmentCount, spaceMembershipAction, staffRoleAction, verifyAction, archiveChannel, removeWord,
  type ImportRow,
} from "@/app/actions/admin";
import { approvePostAction } from "@/app/actions/posts";
import { decideDm } from "@/app/actions/dms";
import { parseCsv } from "@/lib/csv";
import { rolesFromText, roleLabel } from "@/lib/options";
import { ActionForm, Field, Select, Submit, type ActionState } from "./form";
import { useT } from "./i18n";
import { Badge, Button, cx } from "./ui";

/** Small working pieces of the admin pages. Every action checks the staff role on the server. */

export function Act({ children, run, variant = "secondary", confirm, size = "xs" }: { children: React.ReactNode; run: () => Promise<unknown>; variant?: "primary" | "secondary" | "danger" | "good" | "ghost" | "soft"; confirm?: string; size?: "xs" | "sm" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button size={size} variant={variant} disabled={pending} onClick={() => { if (confirm && !window.confirm(confirm)) return; start(async () => { await run(); router.refresh(); }); }}>
      {pending && <Loader2 className="size-3.5 animate-spin" />}{children}
    </Button>
  );
}

export function RequestButtons({ id }: { id: number }) {
  const t = useT();
  const [note, setNote] = useState("");
  const [declining, setDeclining] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Act variant="good" run={() => decideRequestAction(id, true, null)}><Check className="size-3.5" />{t("Approve")}</Act>
      {declining ? (
        <>
          <input className="input !min-h-9 !w-56 !py-1 text-sm" placeholder={t("Reason (they see this)")} value={note} onChange={(e) => setNote(e.target.value)} />
          <Act variant="danger" run={() => decideRequestAction(id, false, note || null)}>{t("Decline")}</Act>
        </>
      ) : <Button size="xs" variant="ghost" onClick={() => setDeclining(true)}><X className="size-3.5" />{t("Decline")}</Button>}
    </div>
  );
}

export function CopyLink({ text, label }: { text: string; label?: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* blocked */ } }}
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm font-semibold text-ink-soft hover:border-brand hover:text-brand">
      {done ? <CheckCircle2 className="size-4 text-moss" /> : <Copy className="size-4" />}{done ? t("Copied") : label ?? t("Copy link")}
    </button>
  );
}

export function InviteForm({ spaces, channels, defaultSpace, appUrl }: { spaces: { id: number; name: string; audience: string }[]; channels: { id: number; space_id: number; name: string }[]; defaultSpace: number | null; appUrl: string }) {
  const t = useT();
  const [space, setSpace] = useState(String(defaultSpace ?? spaces[0]?.id ?? ""));
  const [made, setMade] = useState<string | null>(null);
  const aud = spaces.find((s) => String(s.id) === space)?.audience;
  return (
    <ActionForm action={createInvite} className="space-y-4" onOk={(s: ActionState) => setMade(String(s.data?.code ?? ""))}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select name="space" label={t("Space")} required defaultValue={space} placeholder={null} onChange={setSpace} options={spaces.map((s) => ({ value: String(s.id), label: s.name }))} />
        <Select name="kind" label={t("They join as")} defaultValue={aud === "families" ? "parent" : "specialist"} placeholder={null}
          options={[{ value: "specialist", label: t("Specialist") }, { value: "parent", label: t("Parent or carer") }, { value: "team", label: t("Special Minds team") }, { value: "guest", label: t("Guest") }]} />
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-ink">{t("Also add them to")} <span className="font-normal text-soft">({t("private channels, optional")})</span></legend>
        <div className="flex flex-wrap gap-1.5">
          {channels.filter((c) => String(c.space_id) === space).map((c) => <label key={c.id} className="pill relative"><input type="checkbox" name="channels" value={c.id} />{c.name}</label>)}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="for_address" label={t("For one person: their email or mobile")} optionalLabel hint={t("Left empty, anyone with the link can use it.")} />
        <Field name="for_name" label={t("Their name")} optionalLabel />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="max_uses" type="number" min={1} label={t("How many people can use it")} optionalLabel hint={t("Empty = no limit")} />
        <Select name="days" label={t("Expires")} defaultValue="30" placeholder={null} options={[{ value: "7", label: t("In 7 days") }, { value: "30", label: t("In 30 days") }, { value: "90", label: t("In 90 days") }, { value: "0", label: t("Never") }]} />
        <Field name="note" label={t("Note for staff")} optionalLabel placeholder={t("For example: WhatsApp group March")} />
      </div>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="auto_approve" value="1" defaultChecked className="mt-1 size-5" /><span><span className="font-semibold text-ink">{t("Let them straight in")}</span><span className="block text-soft">{t("Off: their request waits in Join requests for an admin.")}</span></span></label>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="send" value="1" className="mt-1 size-5" /><span><span className="font-semibold text-ink">{t("Send it to them now")}</span><span className="block text-soft">{t("By email, or WhatsApp for a mobile number (personal invites only).")}</span></span></label>
      <Submit>{t("Make invite link")}</Submit>
      {made && <div className="flex flex-wrap items-center gap-2 rounded-xl bg-moss-50 px-4 py-3 text-sm"><code className="break-all text-moss" dir="ltr">{appUrl}/join/{made}</code><CopyLink text={`${appUrl}/join/${made}`} /></div>}
    </ActionForm>
  );
}

export function RevokeInvite({ id }: { id: number }) {
  const t = useT();
  return <Act variant="ghost" run={() => revokeInvite(id)} confirm={t("Switch this link off? Nobody can join with it after this.")}>{t("Switch off")}</Act>;
}

/** Import from the Talent portal: its candidate export (CSV) → check the rows → a personal invite for each. */
export function TalentImport({ spaces }: { spaces: { id: number; name: string }[] }) {
  const t = useT();
  const router = useRouter();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [space, setSpace] = useState(String(spaces[0]?.id ?? ""));
  const [send, setSend] = useState(false);
  const [filter, setFilter] = useState({ role: "", city: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const read = async (file: File) => {
    const grid = parseCsv(await file.text());
    if (grid.length < 2) { setRows([]); return; }
    const head = grid[0].map((h) => h.trim().toLowerCase());
    const col = (...names: RegExp[]) => head.findIndex((h) => names.some((n) => n.test(h)));
    const c = { name: col(/^name$/, /full\s*name/), email: col(/e-?mail/), phone: col(/^whatsapp$/, /phone|mobile/), role: col(/^role$/), other: col(/other roles/), city: col(/^city$/), country: col(/^country$/), langs: col(/language/), gender: col(/gender/), ref: col(/^ref$/, /^#$/) };
    const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    setRows(grid.slice(1).map((r) => ({
      name: cell(r, c.name), email: cell(r, c.email), phone: cell(r, c.phone), roles: [cell(r, c.role), cell(r, c.other)].filter(Boolean).join("; "),
      city: cell(r, c.city), country: cell(r, c.country), languages: cell(r, c.langs), gender: cell(r, c.gender), ref: cell(r, c.ref),
    })).filter((r) => r.name));
    setDone(null);
  };
  const shown = rows.filter((r) => (!filter.role || rolesFromText(r.roles).includes(filter.role)) && (!filter.city || r.city.toLowerCase() === filter.city.toLowerCase()));
  const roles = [...new Set(rows.flatMap((r) => rolesFromText(r.roles)))];
  const cities = [...new Set(rows.map((r) => r.city).filter(Boolean))];
  return (
    <div className="space-y-4">
      <label className="dropzone flex cursor-pointer flex-col items-center gap-2 px-6 py-8 text-center">
        <Upload className="size-8 text-brand" />
        <span className="font-semibold text-ink">{t("Choose the Talent portal export (CSV)")}</span>
        <span className="text-sm text-soft">{t("In the Talent portal: Candidates → filter → Export. Name, Email, WhatsApp/Phone, Role, City, Languages and Ref are read.")}</span>
        <input type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); }} />
      </label>
      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm"><span className="mb-1 block font-semibold text-ink">{t("Role")}</span>
              <select className="input !min-h-10 !py-1.5" value={filter.role} onChange={(e) => setFilter((f) => ({ ...f, role: e.target.value }))}><option value="">{t("All")}</option>{roles.map((r) => <option key={r} value={r}>{t(roleLabel(r))}</option>)}</select></label>
            <label className="text-sm"><span className="mb-1 block font-semibold text-ink">{t("City")}</span>
              <select className="input !min-h-10 !py-1.5" value={filter.city} onChange={(e) => setFilter((f) => ({ ...f, city: e.target.value }))}><option value="">{t("All")}</option>{cities.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
            <label className="text-sm"><span className="mb-1 block font-semibold text-ink">{t("Into")}</span>
              <select className="input !min-h-10 !py-1.5" value={space} onChange={(e) => setSpace(e.target.value)}>{spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          </div>
          <div className="table-scroll rounded-2xl border border-hairline bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-paper text-start text-xs text-soft"><tr>{[t("Name"), t("Email or mobile"), t("Role"), t("City"), t("Languages"), "Ref"].map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-hairline">
                {shown.slice(0, 200).map((r, i) => (
                  <tr key={i} className={cx(!r.email && !r.phone && "bg-danger-50")}>
                    <td className="px-3 py-2 font-semibold text-ink">{r.name}</td><td className="px-3 py-2" dir="ltr">{r.email || r.phone || t("Missing")}</td>
                    <td className="px-3 py-2">{rolesFromText(r.roles).map((x) => t(roleLabel(x))).join(", ") || r.roles}</td><td className="px-3 py-2">{r.city}</td><td className="px-3 py-2">{r.languages}</td><td className="px-3 py-2">{r.ref}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-soft">{t("{n} rows ready", { n: shown.length })}{shown.length > 200 ? ` · ${t("first 200 shown")}` : ""}</p>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} className="mt-1 size-5" /><span><span className="font-semibold text-ink">{t("Send each person their invite now")}</span><span className="block text-soft">{t("By email, or WhatsApp when there's only a mobile number. Off: copy the links from Invites yourself.")}</span></span></label>
          <Button disabled={busy || !shown.length} onClick={async () => { setBusy(true); const r = await importSpecialists(shown, Number(space), send); setBusy(false); setDone(r.ok ? t("{n} invites made", { n: r.made ?? 0 }) + (r.skipped ? ` · ${t("{n} skipped (no contact, or already in)", { n: r.skipped })}` : "") : r.error ?? ""); router.refresh(); }}>
            {busy && <Loader2 className="size-4 animate-spin" />}{t("Make {n} personal invites", { n: shown.length })}
          </Button>
          {done && <p className="rounded-xl bg-moss-50 px-4 py-3 text-sm font-semibold text-moss">{done}</p>}
        </>
      )}
    </div>
  );
}

export function MemberControls({ id, status, muted, staffRole, myRole, verified, spaces, memberSpaces }: {
  id: number; status: string; muted: string | null; staffRole: string | null; myRole: string; verified: string | null;
  spaces: { id: number; name: string }[]; memberSpaces: number[];
}) {
  const t = useT();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState("24");
  const [title, setTitle] = useState(verified ?? "");
  const [err, setErr] = useState<string | null>(null);
  const admin = myRole === "admin" || myRole === "owner";
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink">{t("Spaces")}</p>
        <div className="flex flex-wrap gap-2">
          {spaces.map((s) => {
            const inIt = memberSpaces.includes(s.id);
            return <Act key={s.id} variant={inIt ? "soft" : "ghost"} run={() => spaceMembershipAction(id, s.id, !inIt)} confirm={inIt ? t("Remove them from {space}?", { space: s.name }) : undefined}>{inIt ? <Check className="size-3.5" /> : "+"} {s.name}</Act>;
          })}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink">{t("Posting")}</p>
        <input className="input !min-h-10 !py-1.5 text-sm" placeholder={t("Reason (they see this)")} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          {muted ? <Act run={() => muteAction(id, null, null)}>{t("Let them post again")}</Act> : (
            <>
              <select className="rounded-lg border border-line px-2 py-1 text-sm" value={hours} onChange={(e) => setHours(e.target.value)} aria-label={t("How long")}>
                <option value="1">{t("1 hour")}</option><option value="24">{t("1 day")}</option><option value="72">{t("3 days")}</option><option value="168">{t("1 week")}</option><option value="720">{t("30 days")}</option>
              </select>
              <Act run={() => muteAction(id, Number(hours), reason || null)}>{t("Pause their posting")}</Act>
            </>
          )}
          {status === "active" ? (
            <>
              <Act variant="secondary" run={() => memberStatusAction(id, "suspended", reason || null)} confirm={t("Suspend? They're signed out and can't sign in until you reinstate them.")}>{t("Suspend")}</Act>
              {admin && <Act variant="danger" run={() => memberStatusAction(id, "banned", reason || null)} confirm={t("Ban? They're signed out and their email and number can't join again.")}>{t("Ban")}</Act>}
            </>
          ) : status !== "pending" && <Act variant="good" run={() => memberStatusAction(id, "active", null)}>{t("Reinstate")}</Act>}
        </div>
      </div>
      {admin && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">{t("Verified badge")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input className="input !min-h-10 !w-64 !py-1.5 text-sm" placeholder={t("For example: Verified BCBA")} value={title} onChange={(e) => setTitle(e.target.value)} list="badge-titles" />
            <datalist id="badge-titles">{["Verified BCBA", "Verified speech therapist", "Verified occupational therapist", "Verified psychologist", "Special Minds team"].map((x) => <option key={x} value={x} />)}</datalist>
            <Act run={() => verifyAction(id, title || null)}>{t("Save badge")}</Act>
            {verified && <Act variant="ghost" run={() => verifyAction(id, null)}>{t("Remove badge")}</Act>}
          </div>
        </div>
      )}
      {admin && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">{t("Staff role")}</p>
          <div className="flex flex-wrap gap-2">
            {(["moderator", "admin", null] as const).map((r) => (
              <Button key={String(r)} size="xs" variant={staffRole === r ? "primary" : "secondary"} onClick={async () => { const e = await staffRoleAction(id, r); setErr(e ? t(e) : null); router.refresh(); }}>
                {r === null ? t("Not staff") : r === "admin" ? t("Admin") : t("Moderator")}
              </Button>
            ))}
          </div>
          {err && <p className="text-sm text-danger">{err}</p>}
        </div>
      )}
    </div>
  );
}

export function QueueButtons({ postId, dm }: { postId: number; dm?: boolean }) {
  const t = useT();
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Act variant="good" run={() => approvePostAction(postId, true, null)}><Check className="size-3.5" />{t("Approve")}</Act>
      <input className="input !min-h-9 !w-56 !py-1 text-sm" placeholder={t("Reason if rejecting")} value={reason} onChange={(e) => setReason(e.target.value)} />
      <Act variant="danger" run={() => approvePostAction(postId, false, reason || null)}>{dm ? t("Remove") : t("Reject")}</Act>
    </div>
  );
}

export function ReportButtons({ reportId }: { reportId: number }) {
  const t = useT();
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input className="input !min-h-9 !w-56 !py-1 text-sm" placeholder={t("Reason (the author sees this)")} value={reason} onChange={(e) => setReason(e.target.value)} />
      <Act variant="danger" run={() => reportDecision(reportId, true, reason || null)}>{t("Remove the post")}</Act>
      <Act variant="ghost" run={() => reportDecision(reportId, false, null)}>{t("Keep it")}</Act>
    </div>
  );
}

export const FlagButton = ({ postId }: { postId: number }) => { const t = useT(); return <Act variant="ghost" run={() => clearFlag(postId)}>{t("Looks fine")}</Act>; };
export const DmDecision = ({ id }: { id: number }) => {
  const t = useT();
  return <div className="flex gap-2"><Act variant="good" run={() => decideDm(id, true)}>{t("Approve")}</Act><Act variant="danger" run={() => decideDm(id, false)}>{t("Decline")}</Act></div>;
};
export const WordRemove = ({ id }: { id: number }) => { const t = useT(); return <Act variant="ghost" run={() => removeWord(id)}>{t("Remove")}</Act>; };
export const HelpButtons = ({ id, status, crm }: { id: number; status: string; crm: boolean }) => {
  const t = useT();
  return (
    <div className="flex shrink-0 flex-wrap items-start gap-2 self-start">
      {status !== "done" ? <Act variant="good" run={() => helpStatus(id, "done")}>{t("Mark as handled")}</Act> : <Act variant="ghost" run={() => helpStatus(id, "new")}>{t("Reopen")}</Act>}
      {crm && status !== "sent" && <Act run={() => helpToCrm(id)}>{t("Send to the CRM")}</Act>}
    </div>
  );
};
export const ScheduledButtons = ({ id }: { id: number }) => {
  const t = useT();
  return <div className="flex gap-2"><Act variant="good" run={() => scheduledAction(id, true)}>{t("Post now")}</Act><Act variant="ghost" run={() => scheduledAction(id, false)} confirm={t("Cancel this post?")}>{t("Cancel")}</Act></div>;
};
export const CancelBroadcast = ({ id }: { id: number }) => { const t = useT(); return <Act variant="ghost" run={() => cancelBroadcast(id)} confirm={t("Cancel this broadcast?")}>{t("Cancel")}</Act>; };
export const ChannelQuick = ({ id, locked, announceOnly, archived }: { id: number; locked: boolean; announceOnly: boolean; archived: boolean }) => {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2">
      <Act variant={locked ? "primary" : "secondary"} run={() => quickChannelToggle(id, "locked", !locked)}>{locked ? t("Unlock") : t("Lock now")}</Act>
      <Act variant={announceOnly ? "primary" : "secondary"} run={() => quickChannelToggle(id, "announce_only", !announceOnly)}>{announceOnly ? t("Let members post again") : t("Staff only for now")}</Act>
      <Act variant="ghost" run={() => archiveChannel(id, !archived)} confirm={archived ? undefined : t("Archive? It disappears for members; nothing is deleted.")}>{archived ? t("Bring back") : t("Archive")}</Act>
    </div>
  );
};
export const ChannelMemberButton = ({ channelId, memberId, add }: { channelId: number; memberId: number; add: boolean }) => {
  const t = useT();
  return <Act variant={add ? "secondary" : "ghost"} run={() => channelMemberAction(channelId, memberId, add)}>{add ? t("Add") : t("Remove")}</Act>;
};

export function SegmentCounter() {
  const t = useT();
  const [n, setN] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-xl bg-brand-50 px-4 py-3 text-sm">
      <span className="flex-1 text-ink-soft">{n === null ? t("Check how many people this reaches before sending.") : t("{n} recipients", { n })}</span>
      <Button size="sm" variant="secondary" disabled={busy} onClick={async (e) => { setBusy(true); const form = (e.currentTarget as HTMLElement).closest("form")!; setN(await segmentCount(new FormData(form))); setBusy(false); }}>{busy && <Loader2 className="size-4 animate-spin" />}{t("Count")}</Button>
    </div>
  );
}

export const StatusPill = ({ status }: { status: string }) => {
  const t = useT();
  const map: Record<string, ["neutral" | "good" | "warn" | "bad" | "info", string]> = {
    active: ["good", t("Active")], pending: ["warn", t("Waiting")], suspended: ["warn", t("Suspended")], banned: ["bad", t("Banned")], deleted: ["neutral", t("Deleted")],
    simulated: ["info", t("Simulated")], sent: ["good", t("Sent")], failed: ["bad", t("Failed")], new: ["warn", t("New")], done: ["good", t("Handled")],
  };
  const [tone, label] = map[status] ?? ["neutral", status];
  return <Badge tone={tone}>{label}</Badge>;
};
