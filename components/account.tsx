"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Camera, Loader2, ShieldCheck } from "lucide-react";
import { deleteMyAccount, saveMyProfile, setAvatar, signOutEverywhere, totpConfirm, totpDisable, totpStart } from "@/app/actions/account";
import { COUNTRIES, COUNTRY, LANGUAGES, ROLES, SKILLS, type Kind } from "@/lib/options";
import { ActionForm, Field, Pills, Select, Submit, TagInput, TextArea, Toggle } from "./form";
import { useT } from "./i18n";
import { prepareImage, upload } from "./post/composer";
import { Avatar, Button, Card, CardHeader } from "./ui";

export type ProfileValues = {
  fullName: string; displayName: string; city: string; country: string; languages: string[]; roles: string[]; skills: string[]; gender: string; bio: string;
  openToWork: boolean; availableFrom: string; availabilityNote: string; avatar: number | null; kind: Kind;
};

export function ProfileForm({ v }: { v: ProfileValues }) {
  const t = useT();
  const router = useRouter();
  const [country, setCountry] = useState(v.country || "AE");
  const [busy, setBusy] = useState(false);
  const parent = v.kind === "parent";
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title={t("Profile photo")} subtitle={parent ? t("Optional. A photo of you, never of your child.") : t("Optional. Helps families and colleagues recognise you.")} />
        <div className="flex items-center gap-4 border-t border-hairline px-5 py-4">
          <Avatar name={v.displayName || v.fullName || "?"} photoId={v.avatar} size={64} />
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink-soft hover:border-brand hover:text-brand">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}{t("Choose a photo")}
            <input type="file" accept="image/*" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              setBusy(true);
              try { const p = await prepareImage(f); const done = await upload(p.blob, p.name, { width: p.w, height: p.h }); await setAvatar(done.id); router.refresh(); } catch { /* shown by upload */ }
              setBusy(false);
            }} />
          </label>
          {v.avatar && <Button variant="ghost" size="sm" onClick={async () => { await setAvatar(null); router.refresh(); }}>{t("Remove")}</Button>}
        </div>
      </Card>
      <Card>
        <CardHeader title={t("About you")} />
        <div className="border-t border-hairline px-5 py-4">
          <ActionForm action={saveMyProfile} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="full_name" label={t("Full name")} required defaultValue={v.fullName} />
              <Field name="display_name" label={t("Name others see")} optionalLabel defaultValue={v.displayName} hint={parent ? t("Only Special Minds staff see your full name.") : undefined} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select name="country" label={t("Country")} defaultValue={country} placeholder={null} onChange={setCountry} options={COUNTRIES.map((c) => ({ value: c.code, label: t(c.name) }))} />
              <Field name="city" label={t("City")} required defaultValue={v.city} list={COUNTRY[country]?.cities ?? []} />
            </div>
            <TagInput name="languages" label={t("Languages you speak")} defaultValue={v.languages} suggestions={LANGUAGES} />
            {v.kind === "specialist" && (
              <>
                <Pills name="roles" label={t("Your role")} required defaultValue={v.roles} options={ROLES.map((r) => ({ value: r.value, label: t(r.label) }))} />
                <TagInput name="skills" label={t("Methods and skills")} optionalLabel defaultValue={v.skills} suggestions={SKILLS} />
                <Pills name="gender" type="radio" label={t("Gender")} optionalLabel defaultValue={v.gender} options={[{ value: "female", label: t("Female") }, { value: "male", label: t("Male") }]} />
                <div className="rounded-2xl border border-hairline bg-paper px-4 py-3">
                  <p className="mb-2 text-sm font-semibold text-ink">{t("Availability")} <span className="font-normal text-soft">({t("only Special Minds staff see this")})</span></p>
                  <Toggle name="open_to_work" label={t("I'm open to new cases")} defaultChecked={v.openToWork} />
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Field name="available_from" type="date" label={t("Free from")} optionalLabel defaultValue={v.availableFrom} />
                    <Field name="availability_note" label={t("Note")} optionalLabel defaultValue={v.availabilityNote} placeholder={t("For example: mornings only")} />
                  </div>
                </div>
              </>
            )}
            <TextArea name="bio" label={t("About you")} optionalLabel rows={3} maxLength={600} defaultValue={v.bio} />
            <Submit>{t("Save")}</Submit>
          </ActionForm>
        </div>
      </Card>
    </div>
  );
}

export function TwoStep({ on: initOn, staff, required }: { on: boolean; staff: boolean; required: boolean }) {
  const t = useT();
  const [on, setOn] = useState(initOn);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader title={t("Two-step sign-in")} subtitle={t("After your email or phone code, a second code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).")} />
      <div className="space-y-3 border-t border-hairline px-5 py-4 text-sm">
        {required && !on && <p className="rounded-xl bg-apricot-50 px-3 py-2 text-caution">{t("Special Minds asks all staff to turn this on before using the admin pages.")}</p>}
        {on ? (
          <>
            <p className="flex items-center gap-2 font-semibold text-moss"><ShieldCheck className="size-5" />{t("On")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <input className="input !min-h-10 !w-40 num" inputMode="numeric" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} aria-label={t("6-digit code")} dir="ltr" />
              <Button size="sm" variant="secondary" onClick={async () => { const r = await totpDisable(code); if (!r.ok) setErr(r.error ?? null); else { setOn(false); setCode(""); setErr(null); setDone(t("Two-step sign-in is off.")); } }}>{t("Turn off")}</Button>
            </div>
          </>
        ) : setup ? (
          <>
            <p className="text-ink-soft">{t("1. Scan this with your authenticator app (or type the key). 2. Type the 6-digit code it shows.")}</p>
            <div className="flex flex-wrap items-center gap-4">
              <img src={setup.qr} alt={t("QR code for your authenticator app")} className="size-44 rounded-xl border border-hairline bg-white p-2" />
              <code className="num break-all rounded-lg bg-paper px-2 py-1 text-xs" dir="ltr">{setup.secret}</code>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input className="input !min-h-10 !w-40 num" inputMode="numeric" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} aria-label={t("6-digit code")} dir="ltr" />
              <Button size="sm" onClick={async () => { const r = await totpConfirm(code); if (!r.ok) setErr(r.error ?? null); else { setOn(true); setSetup(null); setCode(""); setErr(null); setDone(t("Two-step sign-in is on.")); } }}>{t("Turn on")}</Button>
            </div>
          </>
        ) : (
          <Button size="sm" onClick={async () => setSetup(await totpStart())}>{staff ? t("Set up two-step sign-in") : t("Set it up (optional)")}</Button>
        )}
        {err && <p role="alert" className="font-semibold text-danger">{err}</p>}
        {done && <p role="status" className="font-semibold text-moss">{done}</p>}
      </div>
    </Card>
  );
}

export function Sessions() {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <Card>
      <CardHeader title={t("Signed-in devices")} subtitle={t("Lost a phone? Sign out everywhere except here.")} />
      <div className="border-t border-hairline px-5 py-4">
        {done ? <p className="text-sm font-semibold text-moss">{t("Signed out on every other device.")}</p> : <Button variant="secondary" size="sm" onClick={async () => { await signOutEverywhere(); setDone(true); }}>{t("Sign out everywhere else")}</Button>}
      </div>
    </Card>
  );
}

export function DeleteAccount() {
  const t = useT();
  return (
    <Card>
      <CardHeader title={t("Delete my account")} subtitle={t("Your name, contact details and photo are removed for good. Your posts stay as “Deleted member” unless you remove them too.")} />
      <div className="border-t border-hairline px-5 py-4">
        <ActionForm action={deleteMyAccount} className="space-y-3">
          <label className="flex items-start gap-3 text-sm text-ink"><input type="checkbox" name="remove_posts" value="1" className="mt-1 size-5" />{t("Also remove everything I've posted")}</label>
          <Field name="confirm" label={t("Type DELETE to confirm")} />
          <Submit variant="danger">{t("Delete my account")}</Submit>
        </ActionForm>
      </div>
    </Card>
  );
}
