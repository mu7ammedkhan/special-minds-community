"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, BellOff, Check, Info, LogIn, LogOut, Pin, Settings, Users } from "lucide-react";
import { joinChannelAction, leaveChannelAction, notifyLevelAction } from "@/app/actions/posts";
import { NOTIFY_LEVELS } from "@/lib/options";
import type { ChannelView, PostView } from "@/lib/types";
import { useT } from "./i18n";
import { ChannelIcon } from "./icons";
import { Menu, Modal } from "./overlay";
import { Body } from "./post/body";
import { cx } from "./ui";

/** The bar over every channel: its name and purpose, pinned posts, your alerts for it, join or leave, and settings for staff. */
export function ChannelHeader({ channel, pinned = [], members, meId, actions }: { channel: ChannelView; pinned?: PostView[]; members: number; meId: number; actions?: React.ReactNode }) {
  const t = useT();
  const router = useRouter();
  const [notify, setNotify] = useState(channel.notify);
  const [showPins, setShowPins] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const set = async (level: "all" | "mentions" | "off") => { setNotify(level); await notifyLevelAction(channel.id, level); router.refresh(); };
  return (
    <div className="flex items-center gap-2 border-b border-hairline bg-surface/90 px-4 py-2.5 backdrop-blur sm:px-5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand"><ChannelIcon type={channel.type} visibility={channel.visibility} className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-lg leading-tight text-ink">{channel.name}</h1>
        {channel.topic && <button type="button" onClick={() => setShowInfo(true)} className="block max-w-full truncate text-start text-sm text-soft hover:text-ink">{channel.topic}</button>}
      </div>
      {actions}
      {pinned.length > 0 && (
        <button type="button" onClick={() => setShowPins(true)} className="hidden items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-soft hover:bg-paper hover:text-ink sm:inline-flex" title={t("Pinned")}>
          <Pin className="size-4" />{pinned.length}
        </button>
      )}
      <span className="hidden items-center gap-1 px-1 text-sm text-soft md:inline-flex" title={t("{n} members", { n: members })}><Users className="size-4" />{members}</span>
      <Menu align="right" chevron={false} ariaLabel={t("Alerts for this channel")} className="rounded-lg p-2 text-soft hover:bg-paper hover:text-ink"
        label={notify === "off" ? <BellOff className="size-5" /> : <Bell className={cx("size-5", notify === "all" && "text-brand")} />}>
        <p className="px-3 pb-1 pt-2 text-xs font-semibold text-soft">{t("Tell me about")}</p>
        {NOTIFY_LEVELS.map((l) => (
          <button key={l.value} data-close type="button" onClick={() => set(l.value)} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-sm text-ink-soft hover:bg-paper hover:text-ink">
            <Check className={cx("size-4", notify === l.value ? "text-brand" : "invisible")} />{t(l.label)}
          </button>
        ))}
        <div className="my-1 border-t border-hairline" />
        <button data-close type="button" onClick={() => setShowInfo(true)} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-sm text-ink-soft hover:bg-paper hover:text-ink"><Info className="size-4" />{t("About this channel")}</button>
        {channel.joined && channel.visibility === "open" && (
          <button data-close type="button" onClick={async () => { await leaveChannelAction(channel.id); router.refresh(); }} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-sm text-ink-soft hover:bg-paper hover:text-ink"><LogOut className="size-4 rtl:-scale-x-100" />{t("Leave channel")}</button>
        )}
        {channel.moderate && <Link href={`/admin/channels/${channel.id}`} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-ink-soft hover:bg-paper hover:text-ink"><Settings className="size-4" />{t("Channel settings")}</Link>}
      </Menu>
      {!channel.joined && (
        <button type="button" onClick={async () => { await joinChannelAction(channel.id); router.refresh(); }} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-primary-deep">
          <LogIn className="size-4 rtl:-scale-x-100" />{t("Join")}
        </button>
      )}
      <Modal open={showPins} onClose={() => setShowPins(false)} title={t("Pinned")}>
        <ul className="space-y-3">
          {pinned.map((p) => (
            <li key={p.id} className="rounded-xl border border-hairline p-3">
              {p.title && <p className="font-semibold text-ink">{p.title}</p>}
              <Body text={p.body.slice(0, 400)} mentions={p.mentions} meId={meId} className="text-sm text-ink-soft" />
            </li>
          ))}
        </ul>
      </Modal>
      <Modal open={showInfo} onClose={() => setShowInfo(false)} title={channel.name}>
        <div className="space-y-3 text-sm text-ink-soft">
          {channel.topic && <p className="text-base text-ink">{channel.topic}</p>}
          <p>{channel.visibility === "open" ? t("Open: everyone in the space can find and read it.") : channel.visibility === "private" ? t("Private: only its members can read it.") : t("Hidden: only its members know it's here.")}</p>
          <p>{t("{n} members", { n: members })}</p>
          {channel.caseTalk && <p className="rounded-xl bg-apricot-50 px-3 py-2 text-caution">{t("Case talk: never write a child's name, school or family details, and no photos of children.")}</p>}
          {channel.audience === "families" && <p className="rounded-xl bg-paper px-3 py-2">{t("Answers here come from parents and specialists. They aren't medical advice: for your child's care, speak to their own doctor or therapist.")}</p>}
        </div>
      </Modal>
    </div>
  );
}
