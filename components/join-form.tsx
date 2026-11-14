"use client";

import { useState } from "react";
import { submitJoin } from "@/app/actions/join";
import { ActionForm, ErrorLine, Field, Pills, Select, Submit, TagInput, TextArea } from "./form";
import { useLocale, useT } from "./i18n";
import { COUNTRIES, COUNTRY, LANGUAGES, ROLES, SKILLS, type Kind } from "@/lib/options";
import { pick } from "@/lib/i18n";

export type JoinDefaults = {
  fullName: string; displayName: string; city: string; country: string; languages: string[]; roles: string[]; skills: string[]; gender: string; bio: string;
};

/** Who you are, the space's own questions and the rules: one page, big and plain. */
export function JoinForm({ code, space, kind, chooseKind, defaults, questions, rules, rulesAr, cta }: {
  code?: string; space?: string; kind: Kind; chooseKind: boolean; defaults: JoinDefaults;
  questions: { id: string; label: string; label_ar?: string; required?: boolean }[]; rules: string | null; rulesAr: string | null; cta: string;
}) {
  const t = useT();
  const locale = useLocale();
  const [k, setK] = useState<Kind>(kind);
  const [country, setCountry] = useState(defaults.country || "AE");
  const cities = COUNTRY[country]?.cities ?? [];
  const parent = k === "parent";
  return (
    <ActionForm action={submitJoin} hidden={{ code: code ?? "", space: space ?? "" }} className="space-y-5" focusErrors>
      {chooseKind && (
        <Pills name="kind" type="radio" label={t("I am a…")} defaultValue={k} options={[{ value: "parent", label: t("Parent or carer") }, { value: "specialist", label: t("Specialist") }]} />
      )}
      {chooseKind && <KindWatcher onChange={setK} />}
      <Field name="full_name" label={t("Full name")} required defaultValue={defaults.fullName} autoComplete="name" />
      <Field name="display_name" label={parent ? t("Name others see") : t("Name others see (if different)")} optionalLabel defaultValue={defaults.displayName}
        hint={parent ? t("A first name or a nickname like “Umm Yusuf” is fine. Only Special Minds staff see your full name.") : undefined} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select name="country" label={t("Country")} required defaultValue={country} placeholder={null} onChange={setCountry} options={COUNTRIES.map((c) => ({ value: c.code, label: t(c.name) }))} />
        <Field name="city" label={t("City")} required defaultValue={defaults.city} list={cities} />
      </div>
      <TagInput name="languages" label={t("Languages you speak")} defaultValue={defaults.languages.length ? defaults.languages : ["English"]} suggestions={LANGUAGES} />
      {k === "specialist" && (
        <>
          <Pills name="roles" label={t("Your role")} required defaultValue={defaults.roles} options={ROLES.map((r) => ({ value: r.value, label: t(r.label) }))} />
          <TagInput name="skills" label={t("Methods and skills")} optionalLabel defaultValue={defaults.skills} suggestions={SKILLS} />
          <Pills name="gender" type="radio" label={t("Gender")} optionalLabel hint={t("Some families ask for a female or male specialist. Only used to match opportunities.")} defaultValue={defaults.gender} options={[{ value: "female", label: t("Female") }, { value: "male", label: t("Male") }]} />
        </>
      )}
      <TextArea name="bio" label={parent ? t("A line about your family (optional)") : t("A line about your experience")} optionalLabel rows={3} maxLength={600} defaultValue={defaults.bio}
        hint={parent ? t("Please don't write your child's full name or school.") : undefined} />
      {questions.map((q) => (
        <Field key={q.id} name={`q_${q.id}`} label={pick(locale, q.label, q.label_ar)} required={q.required} optionalLabel={!q.required} />
      ))}
      {(rules || rulesAr) && (
        <div className="rounded-2xl border border-hairline bg-paper px-4 py-3">
          <p className="text-sm font-semibold text-ink">{t("Community rules")}</p>
          <p className="prose-note mt-1 whitespace-pre-line text-sm text-ink-soft">{pick(locale, rules ?? "", rulesAr)}</p>
        </div>
      )}
      <div className="space-y-2">
        <label className="flex items-start gap-3 text-sm text-ink"><input type="checkbox" name="rules" value="1" className="mt-1 size-5" />{t("I agree to the community rules.")}</label>
        <ErrorLine name="rules" />
        <label className="flex items-start gap-3 text-sm text-ink"><input type="checkbox" name="consent" value="1" className="mt-1 size-5" />{t("I agree that Special Minds keeps my details to run the community. I can download or delete them at any time from My account.")}</label>
        <ErrorLine name="consent" />
      </div>
      <Submit size="lg" className="w-full">{cta}</Submit>
    </ActionForm>
  );
}

/** Shows the specialist questions as soon as "Specialist" is picked. */
function KindWatcher({ onChange }: { onChange: (k: Kind) => void }) {
  return (
    <span hidden ref={(el) => {
      const form = el?.closest("form");
      if (!form || form.dataset.kindWatch) return;
      form.dataset.kindWatch = "1";
      form.addEventListener("change", (e) => { const tgt = e.target as HTMLInputElement; if (tgt.name === "kind") onChange(tgt.value as Kind); });
    }} />
  );
}
