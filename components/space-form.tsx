"use client";

import { saveSpace } from "@/app/actions/admin";
import { COUNTRIES } from "@/lib/options";
import { ActionForm, Field, Select, Submit, TextArea, Toggle } from "./form";
import { useT } from "./i18n";

export type SpaceValues = { id?: number; name: string; name_ar: string; slug: string; audience: string; country: string; description: string; description_ar: string; join_policy: string; questions: string; rules: string; rules_ar: string; filter_contacts: boolean; enabled: boolean };

export function SpaceForm({ v }: { v: SpaceValues }) {
  const t = useT();
  return (
    <ActionForm action={saveSpace} hidden={{ id: v.id ?? "" }} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label={t("Name")} required defaultValue={v.name} />
        <Field name="name_ar" label={t("Name in Arabic")} optionalLabel defaultValue={v.name_ar} />
      </div>
      {!v.id && <Field name="slug" label={t("Web address")} optionalLabel hint={t("Letters and dashes, like families-uae. Left empty, it's made from the name.")} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Select name="audience" label={t("Who it's for")} defaultValue={v.audience} placeholder={null} options={[{ value: "specialists", label: t("Specialists") }, { value: "families", label: t("Families") }, { value: "mixed", label: t("Everyone") }]} />
        <Select name="country" label={t("Country")} defaultValue={v.country} placeholder={null} options={COUNTRIES.map((c) => ({ value: c.code, label: t(c.name) }))} />
        <Select name="join_policy" label={t("How people join")} defaultValue={v.join_policy} placeholder={null} options={[{ value: "invite", label: t("Invite link only") }, { value: "request", label: t("Ask to join, an admin approves") }, { value: "open", label: t("Anyone signed in can join") }]} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextArea name="description" label={t("What it's for")} optionalLabel rows={2} defaultValue={v.description} />
        <TextArea name="description_ar" label={t("What it's for, in Arabic")} optionalLabel rows={2} defaultValue={v.description_ar} />
      </div>
      <TextArea name="questions" label={t("Questions for people joining")} optionalLabel rows={3} defaultValue={v.questions} hint={t("One per line. End a line with * to make it required.")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextArea name="rules" label={t("Community rules")} optionalLabel rows={6} defaultValue={v.rules} />
        <TextArea name="rules_ar" label={t("Community rules in Arabic")} optionalLabel rows={6} defaultValue={v.rules_ar} />
      </div>
      <Toggle name="filter_contacts" label={t("Hold phone numbers and emails for review")} hint={t("Stops members swapping contact details in this space without a moderator seeing it first.")} defaultChecked={v.filter_contacts} />
      <Toggle name="enabled" label={t("Switched on")} hint={t("Off hides the whole space from members.")} defaultChecked={v.enabled} />
      <Submit>{v.id ? t("Save") : t("Make the space")}</Submit>
    </ActionForm>
  );
}
