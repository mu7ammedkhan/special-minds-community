"use client";

import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { markNotificationsRead } from "@/app/actions/notifications";
import { useT } from "./i18n";
import { useShell } from "./shell";
import { Button } from "./ui";

export function MarkAllRead() {
  const t = useT();
  const router = useRouter();
  const shell = useShell();
  return <Button variant="secondary" size="sm" onClick={async () => { await markNotificationsRead("all"); shell?.pulse(); router.refresh(); }}><CheckCheck className="size-4" />{t("Mark all read")}</Button>;
}
