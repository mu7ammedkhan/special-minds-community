"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { submitHelp } from "@/app/actions/help";
import { HELP_SERVICES } from "@/lib/options";
import { ActionForm, ErrorLine, Field, Pills, Select, Submit, TextArea } from "./form";
import { useT } from "./i18n";

export function HelpForm({ space, name, phone, email, city }: { space: string; name: string; phone: string; email: string; city: string }) {
  const t = useT();
  const [done, setDone] = useState<string | null>(null);
  if (done) return <div className="flex flex-col items-center gap-3 py-6 text-center"><CheckCircle2 className="size-12 text-moss" /><p className="text-lg font-semibold text-ink">{done}</p></div>;
  return (
    <ActionForm action={submitHelp} hidden={{ space }} className="space-y-4" showOk={false} onOk={(s) => setDone(s.ok ?? "")}>
      <Select name="service" label={t("What do you need?")} required options={HELP_SERVICES.map((s) => ({ value: s.value, label: t(s.label) }))} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="child_age" label={t("Child's age")} optionalLabel placeholder={t("For example: 6")} />
        <Field name="city" label={t("City")} optionalLabel defaultValue={city} />
      </div>
      <Field name="area" label={t("Area")} optionalLabel />
      <TextArea name="details" label={t("Tell us a little more")} optionalLabel rows={4} maxLength={2000} hint={t("No need for your child's full name here.")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label={t("Your name")} required defaultValue={name} />
        <Field name="phone" label={t("Mobile number")} required defaultValue={phone} inputMode="tel" placeholder="+971 50 123 4567" />
      </div>
      <Field name="email" label={t("Email")} optionalLabel defaultValue={email} type="email" />
      <Pills name="contact_by" type="radio" label={t("Best way to reach you")} defaultValue="whatsapp" options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "call", label: t("A call") }, { value: "email", label: t("Email") }]} />
      <label className="flex items-start gap-3 text-sm text-ink"><input type="checkbox" name="consent" value="1" className="mt-1 size-5" />{t("Special Minds may contact me about this request.")}</label>
      <ErrorLine name="consent" />
      <Submit size="lg" className="w-full">{t("Send to Special Minds")}</Submit>
    </ActionForm>
  );
}
