# Notes for whoever works on this next

- **Next.js 16** (as in the CRM): async `params`/`searchParams`/`cookies()`; read `node_modules/next/dist/docs/` before relying on memory.
- **Database**: never call `query()`/`one()` inside `transaction()`; use its `tx`. JSON goes in as `$n::text::jsonb`.
- **Permissions** live in `lib/access.ts`. Server actions (`"use server"`) are public endpoints: each checks `requireMe()`/`requireStaff()` and the channel's access first.
- **Posting** always goes through `createPost` (lib/posts.ts); notifications through `notify()` (lib/notify.ts), whose title and body can be functions `(t, locale)` so each person gets their language.
- **Words**: every line on screen goes through `t("English line")`. Add the Arabic to `lib/i18n/ar.ts` (`npm run i18n:check`). Plain English, no long dashes, "Special Minds" in full.
- **RTL**: use logical Tailwind classes (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`); flip arrows with `rtl:-scale-x-100`; user text gets `dir="auto"`.
- **Look**: the Special Minds look from the CRM: deep purple frame, cream page, champagne accent, Fraunces + Space Grotesk (+ IBM Plex Sans Arabic), nothing under 14px.
- **Sending**: nothing leaves without provider keys; demo addresses (@demo.local, +97150000xxxx) are never sent to.
- Port 4810 locally (4800 is Hamd Projects).
