import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { Tone } from "@/lib/options";
import { initials } from "@/lib/format";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** A label inside a sentence: "The enquiry form" becomes "the enquiry form", but "WhatsApp" and "Special Minds" keep their capitals. */
export const inSentence = (s: string) => (/^[A-Z][a-z]*(\s|$)/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/**
 * Cards two across (sm) or three (lg) in a grid of 4 or 6 columns, each card
 * spanning 2: the classes that centre a short last row, so 5 cards sit 3 + 2.
 */
export function centreLastRow(i: number, n: number, threeOnLarge = true): string {
  const last = i === n - 1;
  return cx(
    last && n % 2 === 1 && "sm:col-start-2",
    threeOnLarge && n % 3 === 2 && i === n - 2 && "lg:col-start-2",
    threeOnLarge && last && n % 3 === 1 && "lg:col-start-3",
    threeOnLarge && last && n % 2 === 1 && n % 3 !== 1 && "lg:col-start-auto",
  );
}

// ---------------------------------------------------------------- buttons ----
type Variant = "primary" | "secondary" | "ghost" | "danger" | "good" | "soft" | "accent";
const btnBase = "tap inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";
const btnVariant: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-deep",
  secondary: "bg-surface text-ink border border-line hover:border-brand hover:text-brand",
  ghost: "text-ink-soft hover:bg-brand-50 hover:text-ink",
  danger: "bg-danger text-white hover:brightness-95",
  good: "bg-moss text-white hover:brightness-95",
  soft: "bg-brand-50 text-brand hover:bg-brand-100",
  accent: "bg-champagne text-brand-deep hover:bg-champagne-soft",
};
const btnSize = { xs: "text-sm px-3 py-1", sm: "text-sm px-4 py-2", md: "text-base px-5 py-2.5", lg: "text-lg px-6 py-3" };
export type ButtonSize = keyof typeof btnSize;

export function buttonClass(variant: Variant = "primary", size: ButtonSize = "md", extra?: string) {
  return cx(btnBase, btnVariant[variant], btnSize[size], extra);
}
export function Button({ variant = "primary", size = "md", className, type = "button", ...rest }: ComponentProps<"button"> & { variant?: Variant; size?: ButtonSize }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}
export function LinkButton({ variant = "primary", size = "md", className, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

// --------------------------------------------------------------- surfaces ----
export function Card({ className, children, ...rest }: ComponentProps<"div">) {
  return <div className={cx("rounded-xl2 border border-hairline bg-surface shadow-card", className)} {...rest}>{children}</div>;
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-start justify-between gap-3 px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="font-display text-lg text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-soft">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-deep">
          <span aria-hidden className="rtl:-scale-x-100">←</span> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-sm font-medium text-soft">{eyebrow}</div>}
          <h1 className="font-display text-[2.125rem] leading-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1 max-w-3xl text-base text-soft">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("mb-6", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Choose one of a few views: the current one is filled in. */
export function Segmented({ items, label, className }: { items: { href: string; label: ReactNode; active: boolean }[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cx("inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1", className)}>
      {items.map((it) => (
        <Link key={it.href} href={it.href} aria-current={it.active ? "page" : undefined}
          className={cx("tap inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
            it.active ? "bg-brand text-white" : "text-ink-soft hover:bg-brand-50 hover:text-ink")}>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

/** A panel that opens and closes, so a long page stays short and easy to read. */
export function Fold({ title, summary, open = false, children, flush = false }: { title: ReactNode; summary?: ReactNode; open?: boolean; children: ReactNode; flush?: boolean }) {
  return (
    <details open={open} className="group rounded-xl2 border border-hairline bg-surface shadow-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl2 px-5 py-4 hover:bg-brand-50/50 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-display text-lg text-ink">{title}</span>
          {summary && <span className="mt-0.5 block text-sm text-soft">{summary}</span>}
        </span>
        <ChevronDown className="size-5 shrink-0 text-soft transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className={cx("border-t border-hairline", !flush && "px-5 py-3")}>{children}</div>
    </details>
  );
}

// ----------------------------------------------------------------- badges ----
const toneClass: Record<Tone, string> = {
  neutral: "bg-paper text-ink-soft border-line",
  brand: "bg-brand-50 text-brand border-brand-100",
  info: "bg-info-50 text-info border-info/15",
  good: "bg-moss-50 text-moss border-moss/15",
  warn: "bg-apricot-50 text-caution border-apricot/40",
  bad: "bg-danger-50 text-danger border-danger/15",
};
export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return <span title={title} className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold", toneClass[tone], className)}>{children}</span>;
}
export function StatusBadge({ map, value }: { map: Record<string, { label: string; tone: Tone; hint?: string }>; value: string }) {
  const s = map[value];
  return <Badge tone={s?.tone ?? "neutral"} title={s?.hint}><span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />{s?.label ?? value}</Badge>;
}

// ----------------------------------------------------------------- people ----
const avatarColours = ["bg-brand-100 text-brand", "bg-moss-50 text-moss", "bg-apricot-50 text-caution", "bg-info-50 text-info"];
export function Avatar({ name, size = 36, photoId, className }: { name: string; size?: number; photoId?: string | number | null; className?: string }) {
  if (photoId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- private, signed-in file route
      <img src={`/api/files/${photoId}`} alt="" width={size} height={size} loading="lazy"
        className={cx("shrink-0 rounded-full bg-paper object-cover ring-1 ring-hairline", className)} style={{ width: size, height: size }} />
    );
  }
  const n = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-bold", avatarColours[n % avatarColours.length], className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }} aria-hidden>
      {initials(name)}
    </span>
  );
}

// ------------------------------------------------------------------- misc ----
export function Empty({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-xl2 border border-dashed border-line bg-surface px-6 py-12 text-center">
      {icon && <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand">{icon}</div>}
      <p className="font-display text-lg text-ink">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-base text-soft">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** The numbers that matter, big and side by side. */
export function StatStrip({ children, className, five = false }: { children: ReactNode; className?: string; five?: boolean }) {
  return <div className={cx("stat-strip grid grid-cols-2 gap-3 lg:gap-4", five ? "lg:grid-cols-5" : "lg:grid-cols-4", className)}>{children}</div>;
}

export function Stat({ label, value, sub, tone, href }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; href?: string }) {
  const colour = tone === "bad" ? "text-danger" : tone === "warn" ? "text-caution" : tone === "good" ? "text-moss" : "text-ink";
  const inner = (
    <>
      <div className="text-sm font-medium leading-snug text-soft">{label}</div>
      <div className={cx("mt-1.5 font-display text-[2.25rem] leading-none", colour)}>{value}</div>
      {sub && <div className="mt-1.5 text-xs text-soft">{sub}</div>}
    </>
  );
  const box = "block rounded-xl2 border border-hairline bg-surface px-5 py-4 shadow-card";
  return href
    ? <Link href={href} className={cx(box, "transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift")}>{inner}</Link>
    : <div className={box}>{inner}</div>;
}

export function Tabs({ items }: { items: { href: string; label: string; active: boolean; count?: number | null; warn?: boolean }[] }) {
  return (
    <nav className="-mx-4 mb-6 overflow-x-auto border-b border-hairline sm:mx-0" aria-label="Sections">
      <ul className="flex min-w-max gap-1 px-4 sm:px-0">
        {items.map((t) => (
          <li key={t.href}>
            <Link href={t.href} scroll={false} aria-current={t.active ? "page" : undefined}
              className={cx("tap -mb-px inline-flex items-center gap-1.5 border-b-2 px-3.5 py-3 text-base font-semibold",
                t.active ? "border-brand text-brand" : "border-transparent text-soft hover:text-ink")}>
              {t.label}
              {t.count ? <span className={cx("rounded-full px-1.5 text-xs", t.warn ? "bg-apricot-50 text-caution" : "bg-paper text-ink-soft")}>{t.count}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function KeyValue({ items, cols = 1 }: { items: [string, ReactNode][]; cols?: 1 | 2 }) {
  const shown = items.filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0));
  return (
    <dl className={cx("grid gap-x-8", cols === 2 ? "sm:grid-cols-2" : "")}>
      {shown.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 border-b border-hairline py-3 text-sm last:border-b-0">
          <dt className="text-soft">{k}</dt>
          <dd className="text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Alert({ tone = "info", title, children, action }: { tone?: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={cx("flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between", toneClass[tone])} role={tone === "bad" ? "alert" : "status"}>
      <div>
        {title && <div className="font-semibold">{title}</div>}
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** A tidy row of small chips (skills, languages, tags). */
export function Chips({ items, tone = "neutral", max, none = "None" }: { items: string[]; tone?: Tone; max?: number; none?: string }) {
  if (!items.length) return <span className="text-soft">{none}</span>;
  const shown = max ? items.slice(0, max) : items;
  return (
    <span className="flex flex-wrap gap-1.5">
      {shown.map((t) => <Badge key={t} tone={tone} className="font-medium">{t}</Badge>)}
      {max && items.length > max && <Badge tone="neutral" className="font-medium">+{items.length - max}</Badge>}
    </span>
  );
}

