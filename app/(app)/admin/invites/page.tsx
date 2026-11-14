import QRCode from "qrcode";
import { isAdmin, requireStaff } from "@/lib/auth";
import { query } from "@/lib/db";
import { fmtDate, maskContact } from "@/lib/format";
import { pick } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { KIND_LABEL, type Kind } from "@/lib/options";
import { CopyLink, InviteForm, RevokeInvite } from "@/components/admin";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invites" };

export default async function InvitesPage({ searchParams }: { searchParams: Promise<{ space?: string }> }) {
  const me = await requireStaff("moderator");
  const { t, locale } = await getT();
  const sp = await searchParams;
  const mine = isAdmin(me) ? null : me.spaces;
  const spaces = await query<{ id: number; name: string; name_ar: string | null; audience: string }>(`select id, name, name_ar, audience from spaces where enabled and ($1::int[] is null or id = any($1::int[])) order by position`, [mine]);
  const channels = await query<{ id: number; space_id: number; name: string }>(`select id, space_id, name from channels where archived_at is null and visibility <> 'open' order by position`);
  const app = process.env.APP_URL ?? "";
  const invites = await query<{ id: number; code: string; kind: Kind; for_address: string | null; for_name: string | null; uses: number; max_uses: number | null; expires_at: string | null; revoked_at: string | null; note: string | null; auto_approve: boolean; created_at: string; space: string }>(
    `select i.id, i.code, i.kind, i.for_address, i.for_name, i.uses, i.max_uses, i.expires_at, i.revoked_at, i.note, i.auto_approve, i.created_at, s.name as space
       from invites i join spaces s on s.id = i.space_id where ($1::int[] is null or i.space_id = any($1::int[])) order by i.created_at desc limit 150`, [mine]);
  const shared = invites.filter((i) => !i.for_address);
  const personal = invites.filter((i) => i.for_address);
  const live = (i: (typeof invites)[number]) => !i.revoked_at && (!i.expires_at || new Date(i.expires_at) > new Date()) && (i.max_uses === null || i.uses < i.max_uses);
  const qrs = Object.fromEntries(await Promise.all(shared.filter(live).slice(0, 12).map(async (i) => [i.id, await QRCode.toDataURL(`${app}/join/${i.code}`, { margin: 1, width: 160 })])));
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader title={t("Invites")} subtitle={t("Links and QR codes to join a space. Share a link in a WhatsApp group, print the QR code at an event, or invite one person.")} />
      <Card>
        <CardHeader title={t("Make an invite")} />
        <div className="border-t border-hairline px-5 py-4">
          <InviteForm spaces={spaces.map((s) => ({ id: s.id, name: pick(locale, s.name, s.name_ar), audience: s.audience }))} channels={channels} defaultSpace={Number(sp.space) || null} appUrl={app} />
        </div>
      </Card>
      <Card>
        <CardHeader title={t("Shared links")} />
        <ul className="divide-y divide-hairline border-t border-hairline">
          {shared.map((i) => (
            <li key={i.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              {qrs[i.id] && <img src={qrs[i.id]} alt={t("QR code")} className="size-24 rounded-lg border border-hairline bg-white p-1" />}
              <div className="min-w-0 flex-1 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">{i.space} · {t(KIND_LABEL[i.kind])}{!live(i) && <Badge tone="neutral">{t("Off")}</Badge>}{!i.auto_approve && <Badge tone="warn">{t("Requests need approval")}</Badge>}</p>
                <p className="text-soft">{t("Used {n} times", { n: i.uses })}{i.max_uses ? ` / ${i.max_uses}` : ""}{i.expires_at ? ` · ${t("expires {date}", { date: fmtDate(i.expires_at, locale) })}` : ""}{i.note ? ` · ${i.note}` : ""}</p>
                <code className="break-all text-xs text-faint" dir="ltr">{app}/join/{i.code}</code>
              </div>
              {live(i) && <div className="flex gap-2"><CopyLink text={`${app}/join/${i.code}`} /><RevokeInvite id={i.id} /></div>}
            </li>
          ))}
          {!shared.length && <li className="px-5 py-4 text-sm text-soft">{t("None yet.")}</li>}
        </ul>
      </Card>
      <Card>
        <CardHeader title={t("Personal invites")} subtitle={t("One person each, from the form above or the Talent import.")} />
        <ul className="divide-y divide-hairline border-t border-hairline">
          {personal.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <span className="min-w-0 flex-1"><span className="font-semibold text-ink">{i.for_name ?? maskContact(i.for_address)}</span> <span className="text-soft" dir="ltr">{maskContact(i.for_address)}</span> · <span className="text-soft">{i.space}</span></span>
              {i.uses > 0 ? <Badge tone="good">{t("Joined")}</Badge> : live(i) ? <><CopyLink text={`${app}/join/${i.code}`} /><RevokeInvite id={i.id} /></> : <Badge>{t("Off")}</Badge>}
            </li>
          ))}
          {!personal.length && <li className="px-5 py-4 text-sm text-soft">{t("None yet.")}</li>}
        </ul>
      </Card>
    </div>
  );
}
