"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check } from "lucide-react";
import { joinChannelAction, leaveChannelAction } from "@/app/actions/posts";
import { useT } from "./i18n";
import { Button } from "./ui";

export function JoinButton({ channelId, joined: init, href }: { channelId: number; joined: boolean; href: string }) {
  const t = useT();
  const router = useRouter();
  const [joined, setJoined] = useState(init);
  if (joined) {
    return (
      <span className="flex items-center gap-2">
        <Link href={href} className="inline-flex items-center gap-1.5 rounded-full bg-moss-50 px-3.5 py-1.5 text-sm font-semibold text-moss"><Check className="size-4" />{t("Joined")}</Link>
        <Button size="xs" variant="ghost" onClick={async () => { await leaveChannelAction(channelId); setJoined(false); router.refresh(); }}>{t("Leave")}</Button>
      </span>
    );
  }
  return <Button size="sm" onClick={async () => { await joinChannelAction(channelId); setJoined(true); router.refresh(); }}>{t("Join")}</Button>;
}
