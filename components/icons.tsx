import { AtSign, BellRing, BookOpen, BriefcaseBusiness, CalendarClock, CalendarDays, CheckCircle2, Flag, Hand, Hash, HeartHandshake, Images, Inbox, LifeBuoy, Lock, type LucideIcon, Megaphone, MessageCircle, MessagesSquare, ShieldAlert, Star, UserCheck, UserPlus, UserX, VolumeX, Trash2, EyeOff, Reply } from "lucide-react";
import type { ChannelType } from "@/lib/options";

export const CHANNEL_ICON: Record<ChannelType, LucideIcon> = {
  chat: Hash, announcement: Megaphone, forum: MessagesSquare, opportunities: BriefcaseBusiness, feed: Images, events: CalendarDays, library: BookOpen,
};

export function ChannelIcon({ type, visibility, className = "size-[18px]" }: { type: ChannelType; visibility?: string; className?: string }) {
  const Icon = visibility === "hidden" ? EyeOff : visibility === "private" && type === "chat" ? Lock : CHANNEL_ICON[type];
  return <Icon className={className} aria-hidden />;
}

export const NOTE_ICON: Record<string, LucideIcon> = {
  mention: AtSign, reply: Reply, post: Megaphone, dm: MessageCircle, opportunity: BriefcaseBusiness, shortlisted: Star, filled: CheckCircle2, interest: Hand,
  event: CalendarDays, reminder: CalendarClock, broadcast: BellRing, joined: UserCheck, declined: UserX, queue: Inbox, report: Flag, help: LifeBuoy,
  request: UserPlus, removed: Trash2, muted: VolumeX, warning: ShieldAlert, welcome: HeartHandshake,
};
