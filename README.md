# Special Minds Community

One place for Special Minds specialists and families: a mix of Slack (channels, threads), Discord
(roles, per-channel permissions, moderation) and Telegram (broadcasts, polls, buttons), plus a
Facebook-style feed for parents. Members join with their email or phone number; Special Minds
controls who joins, who can post where and when, and what is held for review.

Built from the scope brief of 14 Nov 2026 (Phase 1 and Phase 2), the same way as the CRM.

## Run it

```bash
npm install
npm run db:reset      # local database with made-up demo data (stop `npm run dev` first)
npm run dev           # http://localhost:4810
```

`.env.local` (see `.env.example`): `DEMO_LOGINS=1` lists the demo accounts on the sign-in page and
shows sign-in codes on screen; `node scripts/vapid.mjs .env.local` adds pop-up keys.

## What's in it

**Members and joining**: sign in with a 6-digit code by email (Resend) or WhatsApp (Meta Cloud API);
invite links and QR codes (one-use or shared, expiry, seat limit, straight in or approval); join
requests with each space's questions and rules; import specialists from the Talent portal's CSV
export (personal invites with role, city, languages and Talent # filled in); roles owner, admin,
moderator, specialist, parent, team, guest; nicknames for parents; verified badges; mute, suspend,
ban (the email and number can't come back); two-step sign-in for staff (authenticator app).

**Spaces and channels**: separate spaces per audience and country (Specialists · UAE, Families · UAE,
Specialists · India…). Seven channel kinds: announcements, chat, forum, opportunities, feed, events,
library. Open, private or hidden; auto-join; city, diagnosis and language groups; per-channel
permissions for each kind of member (see, post, reply, react, upload); posting hours; slow mode;
lock; staff-only mode; approval for new members or every post; anonymous posting; children's photo
rule; case-talk rules.

**Posting**: text with @mentions (and @everyone for staff), links with previews, photos (re-drawn in
the browser so location data is gone), files, voice notes, polls, reactions, threads, pins, edits,
scheduled posts, search in any language, private messages (1:1 and groups up to 8) under the
parent–specialist rule in Settings.

**Opportunities**: structured job posts; alerts only to matching specialists (role, city, languages,
gender); "I'm interested" with a note or "Not for me"; staff see who is interested, their profile and
Talent link, who has seen it; shortlist (they're told), mark filled (everyone else is told), send the
shortlist to the Talent portal (signed JSON, `TALENT_SHORTLIST_URL`), WhatsApp nudge if unopened.

**Families**: the feed (likes, comments), questions with "Specialist answer" and "Best answer" marks,
events with RSVP, reminders and calendar files, guides library, "Ask Special Minds for help" (a lead
in the CRM when `CRM_INTAKE_*` is set).

**Control**: Admin console with numbers and CSV exports, members, join requests, invites, Talent
import, spaces and channels, moderation queue (held, waiting, reports, flagged case talk, message
requests), blocked words (block, hold, caution), broadcasts to chosen groups by bell, pop-up, email
and WhatsApp with "Seen by", help requests, scheduled posts, delivery log, audit log, settings.

**Notifications**: bell, pop-ups (web push), sounds, quiet hours, per-channel levels, email for
important things still unread, daily or weekly digest, WhatsApp (opt-in).

**Languages**: English and Arabic (right to left). Pages write English, `t("…")`; Arabic lines live in
`lib/i18n/ar.ts`; `npm run i18n:check` lists anything not translated yet.

## How it fits together

- `lib/db.ts` one driver for PGlite (laptop) and Postgres (hosted). Migrations in `db/migrations`.
- `lib/auth.ts` sessions and sign-in codes; `lib/access.ts` every permission rule; `lib/posts.ts`
  the one way to post (checks, holds, mentions, notifications); `lib/opportunities.ts`, `lib/members.ts`,
  `lib/broadcasts.ts`, `lib/jobs.ts` (scheduled posts, reminders, nudges, emails, digests: run from
  `/api/pulse` while anyone has the app open, and from `/api/cron/tick`).
- Live updates: the browser asks `/api/sync` every few seconds while a page is on screen (no
  third-party realtime service, nothing that a regional block on another domain could stop).
- Files are stored in the database (4 MB each) to keep the preview self-contained.
- Nothing is sent without provider keys: every email and WhatsApp message is written to the delivery
  log as "simulated".

## Preview

Vercel project `special-minds-community-preview` with its own free Neon database
(`special-minds-community-preview-db`, Frankfurt) and made-up demo data
(`DATABASE_URL=<unpooled> node scripts/db.mjs seed --demo-database`). Deployed from a clean copy of
this folder with `npx vercel@64.0.2 deploy --prod --yes --archive=tgz`.

## Live site

https://community.specialminds.app: Vercel project `special-minds-community` with its own free Neon
database (`special-minds-community-db`, Frankfurt), started empty on 14 Nov 2026. Never put demo data
here, and never set `DEMO_LOGINS` or `SHOW_CODES` on it.

```bash
DATABASE_URL=<unpooled> node scripts/db.mjs setup                                  # tables, 3 spaces, 24 channels, word list; no people or posts
DATABASE_URL=<unpooled> npm run member:add -- someone@example.com "Their Name"    # an owner, in every space and channel
DATABASE_URL=<unpooled> APP_URL=https://community.specialminds.app \
  node scripts/db.mjs owner-link someone@example.com 72                            # one-time sign-in link (before email works)
DATABASE_URL=<unpooled> node scripts/db.mjs staff-role someone@example.com admin   # owner|admin|moderator|none (the admin screens never change an owner)
```

A one-time link opens a "Sign in as …, Continue" page and is used only when Continue is pressed, so a
WhatsApp or Slack preview can't use it up.

Settings on the project: `APP_URL`, `NEXT_PUBLIC_APP_TIMEZONE`, `DATABASE_POOL_MAX`, its own VAPID keys,
`CRON_SECRET`, and the Neon ones. Still to add: `RESEND_API_KEY` + `EMAIL_FROM` (email sign-in codes),
optionally the WhatsApp ones, `CRM_INTAKE_*` and `TALENT_SHORTLIST_*`. DNS: CNAME `community` at
Hostinger. Deploy the same way as the preview, from a clean copy linked to this project.

## User guide

`docs/guide` builds `Special Minds Community - User Guide.pdf` (38 pages, the same style as the CRM's guide). The
screenshots come from a local copy with made-up data, never the live site:

```bash
rm -rf .data/guide && DATABASE_URL=pglite://.data/guide node scripts/db.mjs reset
npm run build
DATABASE_URL=pglite://.data/guide APP_URL=https://community.specialminds.app npx next start -p 4812
cd docs/guide && node shots.mjs            # or: node shots.mjs opps thread  (only those)
node build.mjs "/path/to/Special Minds Community - User Guide.pdf"
```

Text-only changes need just `node build.mjs`. The contents page numbers are typed in guide.html: check them after a change.
