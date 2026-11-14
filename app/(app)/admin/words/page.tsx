import { addWord } from "@/app/actions/admin";
import { requireStaff } from "@/lib/auth";
import { query } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { WordRemove } from "@/components/admin";
import { ActionForm, Field, Select, Submit } from "@/components/form";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Blocked words" };

export default async function WordsPage() {
  await requireStaff("admin");
  const { t } = await getT();
  const words = await query<{ id: number; word: string; action: string }>(`select id, word, action from blocked_words order by action, lower(word)`);
  const label = (a: string) => (a === "block" ? t("Blocked") : a === "hold" ? t("Held for review") : t("Caution in case talk"));
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader title={t("Blocked words")} subtitle={t("Words and phrases in any language. Phone numbers and emails are caught automatically in spaces that filter contact details.")} />
      <Card>
        <CardHeader title={t("Add a word")} />
        <div className="border-t border-hairline px-5 py-4">
          <ActionForm action={addWord} resetOnOk className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Field name="word" label={t("Word or phrase")} />
            <Select name="action" label={t("What happens")} defaultValue="hold" placeholder={null} options={[
              { value: "hold", label: t("Held for review") }, { value: "block", label: t("Blocked: the post isn't sent") }, { value: "caution", label: t("Caution in case talk: “post anyway?”, then flagged") },
            ]} />
            <Submit>{t("Add")}</Submit>
          </ActionForm>
        </div>
      </Card>
      <Card>
        <ul className="divide-y divide-hairline">
          {words.map((w) => <li key={w.id} className="flex items-center gap-3 px-5 py-2.5"><span className="flex-1 font-semibold text-ink" dir="auto">{w.word}</span><Badge tone={w.action === "block" ? "bad" : w.action === "hold" ? "warn" : "info"}>{label(w.action)}</Badge><WordRemove id={w.id} /></li>)}
          {!words.length && <li className="px-5 py-4 text-sm text-soft">{t("No words yet.")}</li>}
        </ul>
      </Card>
    </div>
  );
}
