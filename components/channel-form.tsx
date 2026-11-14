"use client";

import { useState } from "react";
import { saveChannel } from "@/app/actions/admin";
import { ALL_CITIES, CHANNEL_TYPES, DIAGNOSES, LANGUAGES, PERM_AUDIENCES, PERM_KEYS, defaultPerms, type ChannelType, type PermAudience, type Perms } from "@/lib/options";
import { ActionForm, Choices, Field, Select, Submit, TagInput, TextArea, Toggle } from "./form";
import { useT } from "./i18n";
import { cx } from "./ui";

export type ChannelValues = {
  id?: number; space_id: number; name: string; name_ar: string; topic: string; topic_ar: string; type: ChannelType; visibility: string; auto_join: boolean;
  tags: { city?: string[]; diagnosis?: string[]; language?: string[] }; perms: Partial<Record<PermAudience, Partial<Perms>>>;
  posting_hours: { from: string; to: string; days?: number[] } | null; slow_mode: number; locked: boolean; announce_only: boolean; approval: string;
  allow_anonymous: boolean; child_photos: boolean; case_talk: boolean;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A channel's settings: what it is, who sees it, what each kind of member may do, and when. */
export function ChannelForm({ v, audience }: { v: ChannelValues; audience: string }) {
  const t = useT();
  const [type, setType] = useState<ChannelType>(v.type);
  const d = defaultPerms(type);
  const perm = (a: PermAudience, k: keyof Perms) => (v.id && v.type === type ? v.perms?.[a]?.[k] ?? d[a][k] : d[a][k]);
  const [hoursOn, setHoursOn] = useState(Boolean(v.posting_hours));
  return (
    <ActionForm action={saveChannel} hidden={{ id: v.id ?? "", space_id: v.space_id, perms_form: "1" }} className="space-y-6" focusErrors>
      <section className="space-y-4">
        {!v.id && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-ink">{t("What kind of channel")} *</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {CHANNEL_TYPES.map((c) => (
                <label key={c.value} className="option-card"><input type="radio" name="type" value={c.value} checked={type === c.value} onChange={() => setType(c.value)} />
                  <span><span className="block text-sm font-semibold text-ink">{t(c.label)}</span><span className="block text-xs text-soft">{t(c.hint)}</span></span></label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label={t("Name")} required defaultValue={v.name} placeholder={t("For example: Dubai parents")} />
          <Field name="name_ar" label={t("Name in Arabic")} optionalLabel defaultValue={v.name_ar} />
        </div>
        {!v.id && <Field name="slug" label={t("Web address")} optionalLabel hint={t("Letters and dashes. Left empty, it's made from the name.")} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextArea name="topic" label={t("What it's for")} optionalLabel rows={2} defaultValue={v.topic} />
          <TextArea name="topic_ar" label={t("What it's for, in Arabic")} optionalLabel rows={2} defaultValue={v.topic_ar} />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg text-ink">{t("Who sees it")}</h3>
        <Choices name="visibility" defaultValue={v.visibility} columns={3} label="" options={[
          { value: "open", label: t("Open"), hint: t("Everyone in the space can find, read and join it.") },
          { value: "private", label: t("Private"), hint: t("Listed, but only members you add can read it.") },
          { value: "hidden", label: t("Hidden"), hint: t("Only its members know it's there.") },
        ]} />
        <Toggle name="auto_join" label={t("Everyone in the space joins it automatically")} hint={t("Open channels only. New members are added as they join.")} defaultChecked={v.auto_join} />
        <div className="grid gap-4 sm:grid-cols-3">
          <TagInput name="tag_city" label={t("City group")} optionalLabel defaultValue={v.tags.city ?? []} suggestions={ALL_CITIES} />
          <TagInput name="tag_language" label={t("Language group")} optionalLabel defaultValue={v.tags.language ?? []} suggestions={LANGUAGES} />
          <div>
            <p className="mb-1.5 text-sm font-semibold text-ink">{t("Diagnosis group")} <span className="font-normal text-soft">({t("optional")})</span></p>
            <div className="flex flex-wrap gap-1.5">{DIAGNOSES.map((x) => <label key={x.value} className="pill relative"><input type="checkbox" name="tag_diagnosis" value={x.value} defaultChecked={v.tags.diagnosis?.includes(x.value)} />{t(x.label)}</label>)}</div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg text-ink">{t("What members may do")}</h3>
        <p className="text-sm text-soft">{t("Staff (owner, admins and this space's moderators) can always do everything.")}</p>
        <div className="table-scroll rounded-2xl border border-hairline">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="bg-paper"><tr><th className="px-3 py-2 text-start font-semibold text-soft" />{PERM_KEYS.map((k) => <th key={k.key} className="px-3 py-2 text-center font-semibold text-ink" title={t(k.hint)}>{t(k.label)}</th>)}</tr></thead>
            <tbody className="divide-y divide-hairline">
              {PERM_AUDIENCES.filter((a) => !(audience === "specialists" && a.key === "parent") && !(audience === "families" && a.key === "specialist")).map((a) => (
                <tr key={`${type}-${a.key}`}>
                  <td className="px-3 py-2 font-semibold text-ink">{t(a.label)}</td>
                  {PERM_KEYS.map((k) => (
                    <td key={k.key} className="px-3 py-2 text-center"><input type="checkbox" name={`perm_${a.key}_${k.key}`} value="1" defaultChecked={perm(a.key, k.key)} className="size-5" aria-label={`${t(a.label)}: ${t(k.label)}`} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {audience !== "mixed" && PERM_AUDIENCES.filter((a) => (audience === "specialists" && a.key === "parent") || (audience === "families" && a.key === "specialist")).map((a) =>
          PERM_KEYS.map((k) => perm(a.key, k.key) ? <input key={`${a.key}-${k.key}`} type="hidden" name={`perm_${a.key}_${k.key}`} value="1" /> : null))}
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-lg text-ink">{t("When and how")}</h3>
        <div className="rounded-2xl border border-hairline p-4">
          <label className="flex items-center gap-3 text-sm font-semibold text-ink"><input type="checkbox" name="hours_on" value="1" checked={hoursOn} onChange={(e) => setHoursOn(e.target.checked)} className="size-5" />{t("Only take posts at certain hours")}</label>
          <div className={cx("mt-3 flex flex-wrap items-center gap-2 text-sm", !hoursOn && "pointer-events-none opacity-50")}>
            {t("from")} <input type="time" name="hours_from" defaultValue={v.posting_hours?.from ?? "08:00"} className="rounded-lg border border-line px-2 py-1" />
            {t("to")} <input type="time" name="hours_to" defaultValue={v.posting_hours?.to ?? "22:00"} className="rounded-lg border border-line px-2 py-1" />
            <span className="text-soft">{t("on")}</span>
            {DAYS.map((day, i) => <label key={day} className="pill relative !px-3 !py-1"><input type="checkbox" name="hours_days" value={i} defaultChecked={!v.posting_hours?.days?.length || v.posting_hours.days.includes(i)} />{t(day)}</label>)}
          </div>
          <p className="mt-2 text-xs text-soft">{t("On the space's own clock. Outside these hours members can read but not post.")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select name="slow_mode" label={t("Slow mode")} defaultValue={String(v.slow_mode)} placeholder={null} options={[
            { value: "0", label: t("Off") }, { value: "30", label: t("One post every 30 seconds") }, { value: "60", label: t("One post a minute") }, { value: "300", label: t("One post every 5 minutes") }, { value: "900", label: t("One post every 15 minutes") }, { value: "3600", label: t("One post an hour") },
          ]} />
          <Select name="approval" label={t("Posts wait for a moderator")} defaultValue={v.approval} placeholder={null} options={[
            { value: "none", label: t("Never") }, { value: "new", label: t("From new members (their first days)") }, { value: "all", label: t("Every post") },
          ]} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle name="locked" label={t("Locked")} hint={t("Nobody but staff can post or reply.")} defaultChecked={v.locked} />
          <Toggle name="announce_only" label={t("Staff only post")} hint={t("Members can still react and reply to posts.")} defaultChecked={v.announce_only} />
          <Toggle name="allow_anonymous" label={t("Allow posting without a name")} hint={t("Shown as “A parent”. Staff still see who.")} defaultChecked={v.allow_anonymous} />
          <Toggle name="child_photos" label={t("Children's photos allowed")} hint={t("Off: people confirm no child's face can be seen before sharing a photo.")} defaultChecked={v.child_photos} />
          <Toggle name="case_talk" label={t("Case discussion rules")} hint={t("A reminder not to name a child, school or family, and a check for words on the caution list.")} defaultChecked={v.case_talk} />
        </div>
      </section>
      <Submit size="lg">{v.id ? t("Save") : t("Make the channel")}</Submit>
    </ActionForm>
  );
}
