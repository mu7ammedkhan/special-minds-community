import { notFound } from "next/navigation";
import { BadgeCheck, Clock } from "lucide-react";
import { dmById } from "@/lib/access";
import { requireMe } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { ctxForDm, listMessages } from "@/lib/posts";
import { tzFor } from "@/lib/options";
import { ChatRoom } from "@/components/chat-room";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Messages" };

export default async function DmPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const me = await requireMe();
  const d = await dmById(me, id);
  if (!d) notFound();
  const { t } = await getT();
  const posts = await listMessages(ctxForDm(me, d), { dmId: id }, undefined, 60);
  const others = d.members.filter((m) => m.id !== me.id);
  const header = (
    <div className="flex items-center gap-3 border-b border-hairline bg-surface/90 px-4 py-2.5 backdrop-blur sm:px-5">
      <div className="flex -space-x-2 rtl:space-x-reverse">{others.slice(0, 3).map((o) => <Avatar key={o.id} name={o.name} photoId={o.avatar} size={36} className="ring-2 ring-surface" />)}</div>
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-lg leading-tight text-ink">{d.title || others.map((o) => o.name).join(", ") || t("Conversation")}</h1>
        <p className="flex items-center gap-1 text-sm text-soft">{others.length === 1 ? (others[0].staff ? t("Special Minds staff") : others[0].kind === "parent" ? t("Parent") : t("Specialist")) : t("{n} people", { n: d.members.length })}
          {others.length === 1 && others[0].verified && <span className="inline-flex items-center gap-0.5 text-moss"><BadgeCheck className="size-4" />{t(others[0].verified)}</span>}</p>
      </div>
    </div>
  );
  const blockText = d.status === "pending" ? t("Waiting for a Special Minds admin to approve this conversation.") : d.status === "declined" ? t("This conversation was declined by Special Minds.") : me.mutedUntil ? t("You can read but not post until {when}.", { when: new Date(me.mutedUntil).toLocaleString() }) : null;
  return (
    <>
      {d.status === "pending" && <div className="flex items-center gap-2 bg-apricot-50 px-4 py-2 text-sm text-caution"><Clock className="size-4" />{t("Waiting for a Special Minds admin to approve this conversation.")}</div>}
      <ChatRoom room={{ kind: "dm", dmId: id, people: others.map((o) => ({ id: o.id, name: o.name })), canPost: !blockText, blockText }} initial={posts} since={new Date().toISOString()}
        meId={me.id} header={header} hasMore={posts.length >= 60} canMentionAll={false} tz={tzFor(me.country)} />
    </>
  );
}
