"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3, Ban, BookMarked, CalendarClock, ChevronDown, Compass, FileClock, Home, Inbox, LifeBuoy, LogOut, Mail, Megaphone, Menu as MenuIcon, MessageCircle, Plus, ScrollText,
  Search, Settings, ShieldCheck, Stethoscope, Upload, UserPlus, Users, UsersRound, UserRound, VolumeX, X, Link2,
} from "lucide-react";
import { signOut } from "@/app/actions/auth";
import type { ChannelType, Kind, StaffRole } from "@/lib/options";
import { Bell } from "./bell";
import { useT } from "./i18n";
import { ChannelIcon } from "./icons";
import { Menu, MenuLink } from "./overlay";
import { Avatar, buttonClass, cx } from "./ui";

export type ShellData = {
  me: { id: number; name: string; fullName: string; kind: Kind; staff: StaffRole | null; avatar: number | null; sound: string; muted: string | null };
  spaces: { id: number; slug: string; name: string; audience: "specialists" | "families" | "mixed"; country: string; member: boolean }[];
  channels: { id: number; spaceId: number; slug: string; name: string; type: ChannelType; visibility: string; notify: string }[];
  dms: { id: number; title: string; status: string }[];
  pushKey: string | null;
  community: string;
};

type Counts = { channels: Record<number, { unread: number; mentions: number }>; dms: Record<number, number>; notes: number; staff: { requests: number; queue: number; help: number } | null };
type Ctx = { counts: Counts; markRead: (s: { channelId?: number; dmId?: number }) => void; pulse: () => void; data: ShellData };
const ShellCtx = createContext<Ctx | null>(null);
export const useShell = () => useContext(ShellCtx);

const FLAG: Record<string, string> = { AE: "🇦🇪", IN: "🇮🇳", KW: "🇰🇼", QA: "🇶🇦", SA: "🇸🇦" };

/**
 * The frame, a mix of Discord and Slack: spaces down the far left, the
 * chosen space's channels and the private messages beside them, the page on
 * the right. On phones the lists live in a drawer and five big buttons sit
 * along the bottom. Unread numbers come from /api/pulse every ten seconds.
 */
export function Shell({ data, children }: { data: ShellData; children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const [counts, setCounts] = useState<Counts>({ channels: {}, dms: {}, notes: 0, staff: null });
  const [drawer, setDrawer] = useState(false);
  const [lastSpace, setLastSpace] = useState<string | null>(null);
  const inSpace = pathname.match(/^\/s\/([^/?#]+)/)?.[1] ?? null;
  useEffect(() => {
    try {
      if (inSpace) localStorage.setItem("smm:space", inSpace);
      else setLastSpace(localStorage.getItem("smm:space"));
    } catch { /* storage unavailable */ }
  }, [inSpace]);
  const spaceSlug = inSpace ?? (lastSpace && data.spaces.some((s) => s.slug === lastSpace) ? lastSpace : null) ?? data.spaces.find((s) => s.member)?.slug ?? data.spaces[0]?.slug;
  const space = data.spaces.find((s) => s.slug === spaceSlug) ?? null;
  const admin = pathname.startsWith("/admin");

  const pulse = useCallback(async () => {
    const r = await fetch("/api/pulse", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (!r) return;
    setCounts({
      channels: Object.fromEntries(r.channels.map((c: { id: number; unread: number; mentions: number }) => [c.id, { unread: c.unread, mentions: c.mentions }])),
      dms: Object.fromEntries(r.dms.map((d: { id: number; unread: number }) => [d.id, d.unread])),
      notes: r.notes, staff: r.staff,
    });
  }, []);
  useEffect(() => {
    void pulse();
    const timer = setInterval(() => { if (!document.hidden) void pulse(); }, 10_000);
    const onFocus = () => void pulse();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [pulse]);
  useEffect(() => { setDrawer(false); }, [pathname]);
  const markRead = useCallback((s: { channelId?: number; dmId?: number }) => setCounts((c) => ({
    ...c,
    channels: s.channelId ? { ...c.channels, [s.channelId]: { unread: 0, mentions: 0 } } : c.channels,
    dms: s.dmId ? { ...c.dms, [s.dmId]: 0 } : c.dms,
  })), []);
  const ctx = useMemo(() => ({ counts, markRead, pulse, data }), [counts, markRead, pulse, data]);

  const dmUnread = Object.values(counts.dms).reduce((a, b) => a + b, 0);
  const staffCount = counts.staff ? counts.staff.requests + counts.staff.queue + counts.staff.help : 0;
  const spaceUnread = (id: number) => data.channels.filter((c) => c.spaceId === id).reduce((a, c) => a + (counts.channels[c.id]?.mentions ?? 0), 0);
  const spaceDot = (id: number) => data.channels.some((c) => c.spaceId === id && (counts.channels[c.id]?.unread ?? 0) > 0);

  const rail = (
    <nav className="bg-rail-deep scroll-thin flex h-full w-[76px] shrink-0 flex-col items-center gap-2 overflow-y-auto py-3 text-white" aria-label={t("Spaces")}>
      <Link href="/" className="mb-1" title={data.community}><img src="/logo-mark.svg" alt={data.community} className="size-11" /></Link>
      <div className="h-px w-8 bg-white/15" />
      {data.spaces.map((s) => {
        const on = s.slug === spaceSlug && !admin;
        const n = spaceUnread(s.id);
        const Icon = s.audience === "families" ? Users : Stethoscope;
        return (
          <Link key={s.id} href={`/s/${s.slug}`} title={s.name} aria-current={on ? "page" : undefined} className="group relative">
            <span className={cx("absolute -start-3 top-1/2 h-0 w-1 -translate-y-1/2 rounded-e-full bg-champagne transition-all", on ? "h-9" : spaceDot(s.id) ? "h-2" : "group-hover:h-4")} aria-hidden />
            <span className={cx("relative flex size-12 items-center justify-center rounded-[18px] transition-all", on ? "bg-champagne text-brand-deep" : "bg-white/10 text-rail-text group-hover:rounded-2xl group-hover:bg-white/20 group-hover:text-white")}>
              <Icon className="size-6" aria-hidden />
              <span className="absolute -bottom-1 -end-1 text-base leading-none" aria-hidden>{FLAG[s.country] ?? ""}</span>
            </span>
            {n > 0 && <span className="absolute -end-1 -top-1 min-w-5 rounded-full bg-danger px-1 text-center text-xs font-bold leading-5 text-white">{n}</span>}
            <span className="sr-only">{s.name}</span>
          </Link>
        );
      })}
      <div className="h-px w-8 bg-white/15" />
      <RailLink href="/dm" label={t("Messages")} active={pathname.startsWith("/dm")} badge={dmUnread}><MessageCircle className="size-[22px]" /></RailLink>
      <RailLink href="/search" label={t("Search")} active={pathname.startsWith("/search")}><Search className="size-[22px]" /></RailLink>
      <Bell unread={counts.notes} sound={data.me.sound} pushKey={data.pushKey} variant="rail" onSeen={pulse} />
      {data.me.staff && <RailLink href="/admin" label={t("Admin")} active={admin} badge={staffCount} accent><ShieldCheck className="size-[22px]" /></RailLink>}
      <div className="flex-1" />
      <Link href="/account" title={t("My account")} className="rounded-full ring-2 ring-transparent transition hover:ring-champagne"><Avatar name={data.me.name} photoId={data.me.avatar} size={40} /></Link>
    </nav>
  );

  const sidebar = (
    <aside className="bg-rail scroll-thin flex h-full w-[272px] shrink-0 flex-col overflow-y-auto text-white" aria-label={admin ? t("Admin") : t("Channels")}>
      {admin ? <AdminNav pathname={pathname} staff={data.me.staff} counts={counts.staff} /> : space ? (
        <SpaceNav space={space} pathname={pathname} channels={data.channels.filter((c) => c.spaceId === space.id)} counts={counts} me={data.me} dms={data.dms} />
      ) : (
        <div className="p-5 text-sm text-rail-text">{t("You're not in a space yet.")} <Link href="/welcome" className="font-semibold text-champagne">{t("Ask to join")}</Link></div>
      )}
    </aside>
  );

  const phoneTitle = admin ? t("Admin") : pathname.startsWith("/dm") ? t("Messages") : pathname.startsWith("/search") ? t("Search") : pathname.startsWith("/notifications") ? t("Notifications") : pathname.startsWith("/account") ? t("My account") : space?.name ?? data.community;

  return (
    <ShellCtx.Provider value={ctx}>
      <div className="flex min-h-dvh [--bottom:calc(64px+env(safe-area-inset-bottom))] [--top:56px] lg:[--bottom:0px] lg:[--top:0px]">
        <div className="sticky top-0 hidden h-dvh lg:flex">{rail}{sidebar}</div>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="bg-rail sticky top-0 z-30 flex h-14 items-center gap-2 px-2 text-white lg:hidden">
            <button type="button" onClick={() => setDrawer(true)} aria-label={t("Open the menu")} className="relative rounded-xl p-2 hover:bg-white/10">
              <MenuIcon className="size-6" />
              {(dmUnread > 0 || Object.values(counts.channels).some((c) => c.unread > 0)) && <span className="absolute end-1.5 top-1.5 size-2.5 rounded-full bg-champagne" />}
            </button>
            <span className="min-w-0 flex-1 truncate font-display text-lg">{phoneTitle}</span>
            <Bell unread={counts.notes} sound={data.me.sound} pushKey={data.pushKey} variant="phone" onSeen={pulse} />
          </header>
          {data.me.muted && (
            <div className="flex items-center gap-2 border-b border-apricot/40 bg-apricot-50 px-4 py-2 text-sm text-caution"><VolumeX className="size-4 shrink-0" />{t("A moderator paused your posting until {when}. You can still read everything.", { when: new Date(data.me.muted).toLocaleString() })}</div>
          )}
          <main className="min-w-0 flex-1 pb-[var(--bottom)] lg:pb-0">{children}</main>
          <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label={t("Main")}>
            <ul className="grid grid-cols-5">
              <PhoneTab href={space ? `/s/${space.slug}` : "/"} label={t("Home")} active={pathname.startsWith("/s/")} dot={Object.values(counts.channels).some((c) => c.mentions > 0)}><Home className="size-6" /></PhoneTab>
              <PhoneTab href="/dm" label={t("Messages")} active={pathname.startsWith("/dm")} dot={dmUnread > 0}><MessageCircle className="size-6" /></PhoneTab>
              <PhoneTab href="/search" label={t("Search")} active={pathname.startsWith("/search")}><Search className="size-6" /></PhoneTab>
              <PhoneTab href="/notifications" label={t("Alerts")} active={pathname.startsWith("/notifications")} dot={counts.notes > 0}><Inbox className="size-6" /></PhoneTab>
              <PhoneTab href="/account" label={t("Me")} active={pathname.startsWith("/account")}><UserRound className="size-6" /></PhoneTab>
            </ul>
          </nav>
        </div>
      </div>
      {drawer && (
        <div className="fixed inset-0 z-[60] flex lg:hidden" role="dialog" aria-modal="true" aria-label={t("Menu")}>
          <div className="rise flex h-full shadow-pop">{rail}{sidebar}</div>
          <button type="button" className="flex-1 bg-ink/40" onClick={() => setDrawer(false)} aria-label={t("Close")}><X className="ms-auto me-3 mt-3 size-7 text-white" /></button>
        </div>
      )}
    </ShellCtx.Provider>
  );
}

function RailLink({ href, label, active, badge, accent, children }: { href: string; label: string; active?: boolean; badge?: number; accent?: boolean; children: ReactNode }) {
  return (
    <Link href={href} title={label} aria-label={label} aria-current={active ? "page" : undefined}
      className={cx("relative inline-flex size-11 items-center justify-center rounded-xl transition-colors", active ? "bg-white/15 text-white" : accent ? "text-champagne hover:bg-white/10" : "text-rail-text hover:bg-white/10 hover:text-white")}>
      {children}
      {!!badge && <span className="absolute -end-0.5 -top-0.5 min-w-5 rounded-full bg-champagne px-1 text-center text-xs font-bold leading-5 text-brand-deep">{badge > 99 ? "99+" : badge}</span>}
    </Link>
  );
}

function PhoneTab({ href, label, active, dot, children }: { href: string; label: string; active: boolean; dot?: boolean; children: ReactNode }) {
  return (
    <li>
      <Link href={href} aria-current={active ? "page" : undefined} className={cx("relative flex flex-col items-center gap-0.5 py-2 text-xs font-semibold", active ? "text-brand" : "text-soft")}>
        {active && <span className="absolute inset-x-4 top-0 h-[3px] rounded-b-sm bg-brand" aria-hidden />}
        {children}{label}
        {dot && <span className="absolute end-[calc(50%-1.2rem)] top-1.5 size-2.5 rounded-full bg-danger" />}
      </Link>
    </li>
  );
}

function SpaceNav({ space, pathname, channels, counts, me, dms }: {
  space: ShellData["spaces"][number]; pathname: string; channels: ShellData["channels"]; counts: Counts; me: ShellData["me"]; dms: ShellData["dms"];
}) {
  const t = useT();
  const admin = me.staff === "owner" || me.staff === "admin";
  return (
    <>
      <div className="border-b border-white/10 px-3 py-3">
        <Menu chevron={false} className="w-full rounded-xl px-2 py-1.5 text-start hover:bg-white/10" panelClassName="w-64 text-ink"
          label={<span className="flex w-full items-center gap-2"><span className="min-w-0 flex-1"><span className="block truncate font-display text-lg leading-tight">{space.name}</span><span className="block text-xs text-rail-text">{space.audience === "families" ? t("Families") : space.audience === "specialists" ? t("Specialists") : t("Everyone")}</span></span><ChevronDown className="size-4 text-rail-text" /></span>}>
          <MenuLink href={`/s/${space.slug}/browse`}><Compass className="size-4" />{t("Browse channels")}</MenuLink>
          {me.staff && <MenuLink href={`/admin/invites?space=${space.id}`}><UserPlus className="size-4" />{t("Invite people")}</MenuLink>}
          {admin && <MenuLink href={`/admin/spaces/${space.id}`}><Settings className="size-4" />{t("Space settings")}</MenuLink>}
        </Menu>
        {!space.member && <p className="mt-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-rail-text">{t("You're looking as an admin. You're not a member of this space.")}</p>}
        {space.audience === "families" && !me.staff && (
          <Link href={`/help?space=${space.slug}`} className={buttonClass("accent", "sm", "mt-3 w-full")}><LifeBuoy className="size-4" />{t("Ask Special Minds for help")}</Link>
        )}
      </div>
      <nav className="flex-1 px-2 py-3" aria-label={t("Channels")}>
        <ul className="space-y-0.5">
          {channels.map((c) => {
            const href = `/s/${space.slug}/${c.slug}`;
            const on = pathname === href || pathname.startsWith(`${href}/`);
            const n = counts.channels[c.id];
            const bold = (n?.unread ?? 0) > 0 && c.notify !== "off";
            return (
              <li key={c.id}>
                <Link href={href} aria-current={on ? "page" : undefined}
                  className={cx("flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-base transition-colors", on ? "bg-white/15 text-white" : bold ? "font-semibold text-white hover:bg-white/10" : "text-rail-text hover:bg-white/10 hover:text-white")}>
                  <ChannelIcon type={c.type} visibility={c.visibility} className="size-[18px] shrink-0 opacity-80" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {(n?.mentions ?? 0) > 0 ? <span className="rounded-full bg-danger px-2 text-xs font-bold leading-5 text-white">{n!.mentions}</span>
                    : bold ? <span className="rounded-full bg-white/20 px-2 text-xs font-semibold leading-5 text-white">{n!.unread}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
        <Link href={`/s/${space.slug}/browse`} className="mt-1 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-rail-text hover:bg-white/10 hover:text-white"><Plus className="size-[18px]" />{t("Browse channels")}</Link>
        <div className="mt-5 flex items-center justify-between px-2.5">
          <Link href="/dm" className="text-xs font-semibold uppercase tracking-wide text-rail-text hover:text-white">{t("Messages")}</Link>
          <Link href="/dm/new" aria-label={t("New message")} title={t("New message")} className="rounded-md p-1 text-rail-text hover:bg-white/10 hover:text-white"><Plus className="size-4" /></Link>
        </div>
        <ul className="mt-1 space-y-0.5">
          {dms.slice(0, 8).map((d) => {
            const href = `/dm/${d.id}`;
            const n = counts.dms[d.id] ?? 0;
            return (
              <li key={d.id}>
                <Link href={href} aria-current={pathname === href ? "page" : undefined}
                  className={cx("flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-base transition-colors", pathname === href ? "bg-white/15 text-white" : n ? "font-semibold text-white hover:bg-white/10" : "text-rail-text hover:bg-white/10 hover:text-white")}>
                  <Avatar name={d.title || "?"} size={22} />
                  <span className="min-w-0 flex-1 truncate">{d.title || t("Conversation")}</span>
                  {d.status === "pending" && <span className="text-xs text-champagne">{t("waiting")}</span>}
                  {n > 0 && <span className="rounded-full bg-danger px-2 text-xs font-bold leading-5 text-white">{n}</span>}
                </Link>
              </li>
            );
          })}
          {!dms.length && <li className="px-2.5 py-1 text-sm text-rail-text/80">{t("No messages yet.")}</li>}
        </ul>
      </nav>
      <form action={signOut} className="border-t border-white/10 p-2">
        <button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-rail-text hover:bg-white/10 hover:text-white"><LogOut className="size-4 rtl:-scale-x-100" />{t("Sign out")}</button>
      </form>
    </>
  );
}

function AdminNav({ pathname, staff, counts }: { pathname: string; staff: StaffRole | null; counts: Counts["staff"] }) {
  const t = useT();
  const admin = staff === "owner" || staff === "admin";
  const items: { href: string; label: string; icon: typeof Home; count?: number; adminOnly?: boolean }[] = [
    { href: "/admin", label: t("Overview"), icon: BarChart3 },
    { href: "/admin/members", label: t("Members"), icon: UsersRound },
    { href: "/admin/requests", label: t("Join requests"), icon: UserPlus, count: counts?.requests },
    { href: "/admin/moderation", label: t("Moderation"), icon: Inbox, count: counts?.queue },
    { href: "/admin/help", label: t("Help requests"), icon: LifeBuoy, count: counts?.help },
    { href: "/admin/broadcasts", label: t("Broadcasts"), icon: Megaphone, adminOnly: true },
    { href: "/admin/scheduled", label: t("Scheduled posts"), icon: CalendarClock },
    { href: "/admin/invites", label: t("Invites"), icon: Link2 },
    { href: "/admin/import", label: t("Import from Talent"), icon: Upload, adminOnly: true },
    { href: "/admin/spaces", label: t("Spaces and channels"), icon: BookMarked, adminOnly: true },
    { href: "/admin/words", label: t("Blocked words"), icon: Ban, adminOnly: true },
    { href: "/admin/outbox", label: t("Delivery log"), icon: Mail, adminOnly: true },
    { href: "/admin/audit", label: t("Audit log"), icon: ScrollText, adminOnly: true },
    { href: "/admin/settings", label: t("Settings"), icon: Settings, adminOnly: true },
  ];
  return (
    <>
      <div className="border-b border-white/10 px-5 py-4">
        <p className="font-display text-lg leading-tight">{t("Admin")}</p>
        <p className="text-xs text-rail-text">{t("Special Minds staff only")}</p>
      </div>
      <nav className="flex-1 px-2 py-3" aria-label={t("Admin")}>
        <ul className="space-y-0.5">
          {items.filter((i) => admin || !i.adminOnly).map((i) => {
            const on = i.href === "/admin" ? pathname === "/admin" : pathname.startsWith(i.href);
            const Icon = i.icon;
            return (
              <li key={i.href}>
                <Link href={i.href} aria-current={on ? "page" : undefined} className={cx("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-base", on ? "bg-white/15 text-white" : "text-rail-text hover:bg-white/10 hover:text-white")}>
                  <Icon className="size-[18px] shrink-0" /><span className="flex-1 truncate">{i.label}</span>
                  {!!i.count && <span className="rounded-full bg-champagne px-2 text-xs font-bold leading-5 text-brand-deep">{i.count}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-white/10 p-2"><Link href="/" className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-rail-text hover:bg-white/10 hover:text-white"><FileClock className="size-4" />{t("Back to the community")}</Link></div>
    </>
  );
}
