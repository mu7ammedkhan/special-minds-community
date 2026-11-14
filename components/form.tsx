"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { useT } from "./i18n";
import { buttonClass, cx, type ButtonSize } from "./ui";

/**
 * Forms. Every form posts to a server action shaped
 * (previous state, form data) → { ok?, error?, fields? }. Fields read their own
 * error from that state, so the action can point at the exact box to fix.
 */

export type ActionState = { ok?: string; error?: string; fields?: Record<string, string>; data?: Record<string, unknown> };
export type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const FormCtx = createContext<ActionState>({});
const PendingCtx = createContext(false);

/**
 * Sends a form WITHOUT React 19's automatic reset, which would empty every
 * box when the server answers "please fix these". The clicked button's
 * name/value travels with it ("Save" vs "Save and add another").
 */
export function useKeepAction(action: Action) {
  const [state, dispatch, pending] = useActionState(action, {});
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const by = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (by?.name) fd.set(by.name, by.value);
    startTransition(() => dispatch(fd));
  };
  return { state, pending, submit };
}

export function ActionForm({ action, children, className, hidden, confirm, resetOnOk = false, showOk = true, onOk, id, focusErrors = false }: {
  action: Action;
  children: ReactNode;
  className?: string;
  hidden?: Record<string, string | number | null | undefined>;
  confirm?: string;
  resetOnOk?: boolean;
  showOk?: boolean;
  onOk?: (state: ActionState) => void;
  id?: string;
  /** On a long form, take people to the first answer that needs fixing. */
  focusErrors?: boolean;
}) {
  const { state, pending, submit } = useKeepAction(action);
  const ref = useRef<HTMLFormElement>(null);
  const okRef = useRef(onOk);
  okRef.current = onOk;
  useEffect(() => {
    if (state.ok !== undefined) {
      if (resetOnOk) ref.current?.reset();
      okRef.current?.(state);
    }
    if (focusErrors && state.fields) {
      const bad = ref.current?.querySelector<HTMLElement>('[aria-invalid="true"], fieldset[aria-describedby$="-err"]');
      bad?.scrollIntoView({ block: "center", behavior: "smooth" });
      if (bad && bad.matches("input, select, textarea")) bad.focus({ preventScroll: true });
    }
  }, [state, resetOnOk, focusErrors]);
  return (
    <FormCtx.Provider value={state}>
      <PendingCtx.Provider value={pending}>
        <form ref={ref} id={id} className={className} noValidate
          onSubmit={(e) => {
            if (confirm && !window.confirm(confirm)) { e.preventDefault(); return; }
            submit(e);
          }}>
          {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v ?? ""} />)}
          {children}
          <FormMessage state={state} showOk={showOk} />
        </form>
      </PendingCtx.Provider>
    </FormCtx.Provider>
  );
}

/** Lets fields in a hand-built form show the errors in `state`. */
export function FieldErrors({ state, pending = false, children }: { state: ActionState; pending?: boolean; children: ReactNode }) {
  return <FormCtx.Provider value={state}><PendingCtx.Provider value={pending}>{children}</PendingCtx.Provider></FormCtx.Provider>;
}

export function FormMessage({ state, showOk = true }: { state: ActionState; showOk?: boolean }) {
  const t = useT();
  if (state.error) {
    return (
      <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{state.error}
      </p>
    );
  }
  if (state.fields && Object.keys(state.fields).length > 1) {
    return <p role="alert" className="mt-4 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger">{t("Please fix the {n} boxes marked in red.", { n: Object.keys(state.fields).length })}</p>;
  }
  if (showOk && state.ok) {
    return (
      <p role="status" className="mt-4 flex items-start gap-2 rounded-xl bg-moss-50 px-4 py-3 text-sm text-moss">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />{state.ok}
      </p>
    );
  }
  return null;
}

export function Submit({ children, variant = "primary", size = "md", className, name, value, disabled }: {
  children: ReactNode; variant?: "primary" | "secondary" | "danger" | "good" | "soft" | "ghost"; size?: ButtonSize; className?: string; name?: string; value?: string; disabled?: boolean;
}) {
  const sending = useContext(PendingCtx);
  const { pending: native } = useFormStatus();
  const pending = sending || native;
  return (
    <button type="submit" name={name} value={value} disabled={pending || disabled} className={buttonClass(variant, size, cx("disabled:cursor-wait", className))}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export const useFieldError = (name: string) => useContext(FormCtx).fields?.[name];

type Common = { name: string; label: ReactNode; hint?: ReactNode; required?: boolean; className?: string; optionalLabel?: boolean };

function Label({ htmlFor, label, hint, required, optionalLabel = false }: { htmlFor: string; label: ReactNode; hint?: ReactNode; required?: boolean; optionalLabel?: boolean }) {
  const t = useT();
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-ink">
      {label}
      {required ? <span className="text-danger" aria-hidden> *</span> : optionalLabel ? <span className="font-normal text-soft"> ({t("optional")})</span> : null}
      {hint && <span className="mt-0.5 block text-xs font-normal leading-snug text-soft">{hint}</span>}
    </label>
  );
}

export function ErrorLine({ name, hint }: { name: string; hint?: ReactNode }) {
  const err = useFieldError(name);
  if (err) return <span id={`f-${name}-err`} className="mt-1 block text-xs font-semibold text-danger">{err}</span>;
  return hint ? <span id={`f-${name}-hint`} className="mt-1 block text-xs leading-snug text-soft">{hint}</span> : null;
}

export function Field({ name, label, hint, required, className, type = "text", defaultValue, placeholder, autoComplete, maxLength, min, max, step, inputMode, list, optionalLabel, autoFocus }: Common & {
  type?: string; defaultValue?: string | number | null; placeholder?: string; autoComplete?: string; maxLength?: number; min?: string | number; max?: string | number; step?: string | number;
  inputMode?: "text" | "email" | "tel" | "numeric" | "decimal" | "url" | "search" | "none"; list?: string[]; autoFocus?: boolean;
}) {
  const err = useFieldError(name);
  const listId = useId();
  return (
    <div className={className}>
      <Label htmlFor={`f-${name}`} label={label} required={required} optionalLabel={optionalLabel} />
      <input id={`f-${name}`} name={name} type={type} defaultValue={defaultValue ?? undefined} placeholder={placeholder} autoComplete={autoComplete}
        maxLength={maxLength} min={min} max={max} step={step} inputMode={inputMode} required={required} autoFocus={autoFocus}
        list={list ? listId : undefined} aria-invalid={err ? true : undefined} aria-describedby={err ? `f-${name}-err` : hint ? `f-${name}-hint` : undefined} className="input" dir="auto" />
      {list && <datalist id={listId}>{list.map((o) => <option key={o} value={o} />)}</datalist>}
      <ErrorLine name={name} hint={hint} />
    </div>
  );
}

export function TextArea({ name, label, hint, required, className, defaultValue, rows = 4, maxLength, placeholder, optionalLabel }: Common & {
  defaultValue?: string | null; rows?: number; maxLength?: number; placeholder?: string;
}) {
  const err = useFieldError(name);
  return (
    <div className={className}>
      <Label htmlFor={`f-${name}`} label={label} required={required} optionalLabel={optionalLabel} />
      <textarea id={`f-${name}`} name={name} rows={rows} defaultValue={defaultValue ?? undefined} maxLength={maxLength} placeholder={placeholder} required={required}
        aria-invalid={err ? true : undefined} aria-describedby={err ? `f-${name}-err` : hint ? `f-${name}-hint` : undefined} className="input" dir="auto" />
      <ErrorLine name={name} hint={hint} />
    </div>
  );
}

type Opt = string | { value: string; label: string; hint?: string };
const ov = (o: Opt) => (typeof o === "string" ? o : o.value);
const ol = (o: Opt) => (typeof o === "string" ? o : o.label);

export function Select({ name, label, hint, required, className, options, defaultValue, placeholder, optionalLabel, groups, onChange }: Common & {
  options: Opt[]; defaultValue?: string | null; placeholder?: string | null; groups?: { label: string; options: Opt[] }[]; onChange?: (value: string) => void;
}) {
  const t = useT();
  const err = useFieldError(name);
  if (placeholder === undefined) placeholder = t("Choose…");
  return (
    <div className={className}>
      <Label htmlFor={`f-${name}`} label={label} required={required} optionalLabel={optionalLabel} />
      <select id={`f-${name}`} name={name} defaultValue={defaultValue ?? ""} required={required} onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        aria-invalid={err ? true : undefined} aria-describedby={err ? `f-${name}-err` : hint ? `f-${name}-hint` : undefined} className="input">
        {placeholder !== null && <option value="">{placeholder}</option>}
        {groups
          ? groups.map((g) => <optgroup key={g.label} label={g.label}>{g.options.map((o) => <option key={ov(o)} value={ov(o)}>{ol(o)}</option>)}</optgroup>)
          : options.map((o) => <option key={ov(o)} value={ov(o)}>{ol(o)}</option>)}
      </select>
      <ErrorLine name={name} hint={hint} />
    </div>
  );
}

/** Pick-several (or pick-one) as pills: quick to scan, quick to tap. */
export function Pills({ name, label, hint, required, className, options, defaultValue, type = "checkbox", optionalLabel }: Common & {
  options: Opt[]; defaultValue?: string[] | string | null; type?: "checkbox" | "radio";
}) {
  const t = useT();
  const err = useFieldError(name);
  const chosen = new Set(Array.isArray(defaultValue) ? defaultValue : defaultValue ? [defaultValue] : []);
  return (
    <fieldset className={className} aria-describedby={err ? `f-${name}-err` : undefined}>
      <legend className="mb-1.5 block text-sm font-semibold text-ink">
        {label}{required ? <span className="text-danger" aria-hidden> *</span> : optionalLabel ? <span className="font-normal text-soft"> ({t("optional")})</span> : null}
        {hint && <span className="mt-0.5 block text-xs font-normal text-soft">{hint}</span>}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label key={ov(o)} className="pill relative" title={typeof o === "object" ? o.hint : undefined}>
            <input type={type} name={name} value={ov(o)} defaultChecked={chosen.has(ov(o))} />
            {ol(o)}
          </label>
        ))}
      </div>
      <ErrorLine name={name} />
    </fieldset>
  );
}

/** Cards with a line of explanation each (for the few choices that need one). */
export function Choices({ name, label, hint, required, className, options, defaultValue, type = "radio", columns = 2 }: Common & {
  options: { value: string; label: string; hint?: string }[]; defaultValue?: string[] | string | null; type?: "checkbox" | "radio"; columns?: 1 | 2 | 3;
}) {
  const err = useFieldError(name);
  const chosen = new Set(Array.isArray(defaultValue) ? defaultValue : defaultValue ? [defaultValue] : []);
  return (
    <fieldset className={className} aria-describedby={err ? `f-${name}-err` : undefined}>
      <legend className="mb-1.5 block text-sm font-semibold text-ink">
        {label}{required && <span className="text-danger" aria-hidden> *</span>}
        {hint && <span className="mt-0.5 block text-xs font-normal text-soft">{hint}</span>}
      </legend>
      <div className={cx("grid gap-2", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3")}>
        {options.map((o) => (
          <label key={o.value} className="option-card">
            <input type={type} name={name} value={o.value} defaultChecked={chosen.has(o.value)} required={required && type === "radio"} />
            <span>
              <span className="block text-sm font-semibold text-ink">{o.label}</span>
              {o.hint && <span className="mt-0.5 block text-xs leading-snug text-soft">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
      <ErrorLine name={name} />
    </fieldset>
  );
}

/**
 * Free tags with suggestions (skills, languages, cities, tags). Type and press
 * Enter or comma; click a suggestion; × removes. Sent as one hidden input per tag.
 */
export function TagInput({ name, label, hint, className, defaultValue, suggestions = [], placeholder, max = 40, optionalLabel }: Common & {
  defaultValue?: string[] | null; suggestions?: string[]; placeholder?: string; max?: number;
}) {
  const t = useT();
  placeholder ??= t("Type and press Enter");
  const [tags, setTags] = useState<string[]>(defaultValue ?? []);
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(false);
  const err = useFieldError(name);
  const add = (raw: string) => {
    const v = raw.trim().replace(/,$/, "").trim();
    if (!v || tags.length >= max || tags.some((t) => t.toLowerCase() === v.toLowerCase())) { setText(""); return; }
    setTags([...tags, v]);
    setText("");
  };
  const matches = text
    ? suggestions.filter((s) => s.toLowerCase().includes(text.toLowerCase()) && !tags.some((t) => t.toLowerCase() === s.toLowerCase())).slice(0, 8)
    : focus ? suggestions.filter((s) => !tags.includes(s)).slice(0, 8) : [];
  return (
    <div className={className}>
      <Label htmlFor={`f-${name}`} label={label} hint={hint} optionalLabel={optionalLabel} />
      <div className={cx("input flex min-h-[2.75rem] flex-wrap items-center gap-1.5 !py-1.5", err && "!border-danger")}>
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-sm font-medium text-brand">
            {tag}
            <button type="button" onClick={() => setTags(tags.filter((x) => x !== tag))} aria-label={`${t("Remove")} ${tag}`} className="rounded-full p-0.5 hover:bg-brand-100"><X className="size-4" /></button>
            <input type="hidden" name={name} value={tag} />
          </span>
        ))}
        <input id={`f-${name}`} value={text} placeholder={tags.length ? "" : placeholder}
          onChange={(e) => { const v = e.target.value; if (v.endsWith(",")) add(v); else setText(v); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(matches[0] && text && matches[0].toLowerCase().startsWith(text.toLowerCase()) ? matches[0] : text); }
            else if (e.key === "Backspace" && !text && tags.length) setTags(tags.slice(0, -1));
          }}
          onFocus={() => setFocus(true)} onBlur={() => { setTimeout(() => setFocus(false), 150); if (text) add(text); }}
          className="min-w-[8rem] flex-1 bg-transparent py-1 text-base outline-none placeholder:text-faint" />
      </div>
      {matches.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {matches.map((s) => (
            <button key={s} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)} className="pill">+ {s}</button>
          ))}
        </div>
      )}
      <ErrorLine name={name} />
    </div>
  );
}

/** A yes/no switch that still posts like a checkbox. */
export function Toggle({ name, label, hint, defaultChecked }: { name: string; label: ReactNode; hint?: ReactNode; defaultChecked?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" name={name} value="1" defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="relative mt-0.5 h-6 w-10 shrink-0 rounded-full bg-hairline transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 after:absolute after:start-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4 rtl:peer-checked:after:-translate-x-4" aria-hidden />
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {hint && <span className="block text-xs text-soft">{hint}</span>}
      </span>
    </label>
  );
}

/** A one-button form (Archive, Delete, Restore…) with an optional "Are you sure?". */
export function ActionButton({ action, hidden, confirm, children, variant = "secondary", size = "sm", className }: {
  action: Action; hidden?: Record<string, string | number | null | undefined>; confirm?: string; children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "good" | "soft" | "ghost"; size?: ButtonSize; className?: string;
}) {
  return (
    <ActionForm action={action} hidden={hidden} confirm={confirm} className={cx("inline-block", className)} showOk={false}>
      <Submit variant={variant} size={size}>{children}</Submit>
    </ActionForm>
  );
}
