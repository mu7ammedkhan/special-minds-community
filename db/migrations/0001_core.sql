-- Special Minds Community: everything in one go.
--
-- People (members) belong to spaces (Specialists · UAE, Families · UAE …).
-- Each space has channels of seven kinds. Everything anyone writes is a post:
-- a chat message, a forum topic or reply, an opportunity, an event, a library
-- item, a feed post or comment. Staff (owner, admin, moderator) control who
-- joins, who can post where and when, and what gets held for review.

create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by bigint
);

-- ------------------------------------------------------------------ people ----

create table members (
  id bigserial primary key,
  email text,
  phone text,
  full_name text not null,
  display_name text,                       -- what others see (parents may use a nickname)
  kind text not null default 'specialist' check (kind in ('specialist', 'parent', 'team', 'guest')),
  staff_role text check (staff_role in ('owner', 'admin', 'moderator')),
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'banned', 'deleted')),
  status_reason text,
  muted_until timestamptz,
  mute_reason text,
  avatar_file_id bigint,
  bio text,
  city text,
  country text,                            -- two letters (AE, IN, KW, QA, SA)
  languages text[] not null default '{}',
  roles text[] not null default '{}',      -- specialist roles, the Talent portal's keys
  skills text[] not null default '{}',
  gender text check (gender in ('female', 'male')),
  verified_title text,                     -- "Verified BCBA": shown as a badge
  verified_at timestamptz,
  verified_by bigint,
  talent_ref text,                         -- the person's # in the Talent portal
  open_to_work boolean not null default false,
  available_from date,
  availability_note text,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  notify_sound text not null default 'chime',
  prefs jsonb not null default '{}',       -- quiet hours, digest, email and WhatsApp choices
  totp_secret text,
  totp_on boolean not null default false,
  rules_accepted_at timestamptz,
  consent_at timestamptz,
  profile_done boolean not null default false,
  joined_at timestamptz,
  last_seen_at timestamptz,
  last_digest_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index members_email on members (lower(email)) where email is not null;
create unique index members_phone on members (phone) where phone is not null;

-- An email or phone number that may not come back after a ban.
create table banned_contacts (
  contact text primary key,
  member_id bigint references members(id) on delete set null,
  reason text,
  created_by bigint references members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table sessions (
  id text primary key,                     -- sha-256 of the cookie's token
  member_id bigint not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  mfa_ok boolean not null default false,
  user_agent text,
  ip text
);
create index on sessions (member_id);

create table login_codes (
  id bigserial primary key,
  address text not null,                   -- lower-case email, or +E.164 phone
  channel text not null check (channel in ('email', 'whatsapp', 'sms')),
  code_hash text not null,
  attempts int not null default 0,
  ip text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index on login_codes (address, created_at desc);
create index on login_codes (ip, created_at desc);

-- ------------------------------------------------------------------- files ----

create table files (
  id bigserial primary key,
  owner_id bigint references members(id) on delete set null,
  kind text not null check (kind in ('image', 'audio', 'file')),
  name text not null,
  mime text not null,
  size int not null,
  width int,
  height int,
  duration_ms int,
  data bytea not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ spaces ----

create table spaces (
  id serial primary key,
  slug text not null unique,
  name text not null,
  name_ar text,
  audience text not null check (audience in ('specialists', 'families', 'mixed')),
  country text not null default 'AE',
  tz text not null default 'Asia/Dubai',
  description text,
  description_ar text,
  join_policy text not null default 'request' check (join_policy in ('invite', 'request', 'open')),
  questions jsonb not null default '[]',   -- [{id, label, label_ar, required}]
  rules text,
  rules_ar text,
  filter_contacts boolean not null default false,
  enabled boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table space_members (
  space_id int not null references spaces(id) on delete cascade,
  member_id bigint not null references members(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (space_id, member_id)
);
create index on space_members (member_id);

create table invites (
  id bigserial primary key,
  code text not null unique,
  space_id int not null references spaces(id) on delete cascade,
  channel_ids int[] not null default '{}',
  kind text not null default 'specialist' check (kind in ('specialist', 'parent', 'team', 'guest')),
  for_address text,                        -- a personal invite: only this email or phone may use it
  for_name text,
  prefill jsonb not null default '{}',     -- from the Talent portal: roles, city, languages, ref
  auto_approve boolean not null default true,
  max_uses int,
  uses int not null default 0,
  expires_at timestamptz,
  note text,
  created_by bigint references members(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table join_requests (
  id bigserial primary key,
  space_id int not null references spaces(id) on delete cascade,
  member_id bigint not null references members(id) on delete cascade,
  invite_id bigint references invites(id) on delete set null,
  answers jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by bigint references members(id) on delete set null,
  decided_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create unique index join_requests_open on join_requests (space_id, member_id) where status = 'pending';

-- ---------------------------------------------------------------- channels ----

create table channels (
  id serial primary key,
  space_id int not null references spaces(id) on delete cascade,
  slug text not null,
  name text not null,
  name_ar text,
  topic text,
  topic_ar text,
  type text not null check (type in ('chat', 'announcement', 'forum', 'opportunities', 'feed', 'events', 'library')),
  visibility text not null default 'open' check (visibility in ('open', 'private', 'hidden')),
  auto_join boolean not null default true,
  tags jsonb not null default '{}',        -- {city: [], skill: [], diagnosis: [], language: []}
  perms jsonb not null default '{}',       -- per member kind: view, post, reply, react, upload
  posting_hours jsonb,                     -- {from: "08:00", to: "22:00", days: [0..6]} on the space's clock
  slow_mode int not null default 0,        -- seconds between one person's posts
  locked boolean not null default false,
  announce_only boolean not null default false,
  approval text not null default 'none' check (approval in ('none', 'new', 'all')),
  allow_anonymous boolean not null default false,
  child_photos boolean not null default false,
  case_talk boolean not null default false,
  position int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (space_id, slug)
);

create table channel_members (
  channel_id int not null references channels(id) on delete cascade,
  member_id bigint not null references members(id) on delete cascade,
  joined_at timestamptz not null default now(),
  notify text not null default 'all' check (notify in ('all', 'mentions', 'off')),
  last_read_at timestamptz not null default now(),
  primary key (channel_id, member_id)
);
create index on channel_members (member_id);

-- ----------------------------------------------------- direct messages ----

create table dms (
  id serial primary key,
  is_group boolean not null default false,
  title text,
  status text not null default 'active' check (status in ('active', 'pending', 'declined')),
  created_by bigint references members(id) on delete set null,
  decided_by bigint references members(id) on delete set null,
  created_at timestamptz not null default now(),
  last_post_at timestamptz
);

create table dm_members (
  dm_id int not null references dms(id) on delete cascade,
  member_id bigint not null references members(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  primary key (dm_id, member_id)
);
create index on dm_members (member_id);

-- ------------------------------------------------------------------- posts ----

create table posts (
  id bigserial primary key,
  channel_id int references channels(id) on delete cascade,
  dm_id int references dms(id) on delete cascade,
  parent_id bigint references posts(id) on delete cascade,
  author_id bigint not null references members(id),
  kind text not null default 'message' check (kind in ('message', 'topic', 'opportunity', 'event', 'resource', 'poll', 'system')),
  title text,
  body text not null default '',
  data jsonb not null default '{}',
  anonymous boolean not null default false,
  status text not null default 'published' check (status in ('published', 'pending', 'held', 'removed', 'scheduled')),
  hold_reason text,
  flagged text,                            -- published, but a moderator should look (a caution word)
  publish_at timestamptz,
  pinned_at timestamptz,
  locked boolean not null default false,
  edited_at timestamptz,
  removed_by bigint references members(id) on delete set null,
  removed_reason text,
  reply_count int not null default 0,
  last_reply_at timestamptz,
  mentions bigint[] not null default '{}',
  mention_all boolean not null default false,
  best_answer_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body, ''))) stored,
  check ((channel_id is null) <> (dm_id is null))
);
create index on posts (channel_id, created_at desc) where parent_id is null;
create index on posts (parent_id, created_at);
create index on posts (dm_id, created_at desc);
create index on posts (updated_at);
create index posts_search on posts using gin (search);
create index on posts (status) where status in ('pending', 'held', 'scheduled');
create index on posts (author_id, created_at desc);

create table post_files (
  post_id bigint not null references posts(id) on delete cascade,
  file_id bigint not null references files(id) on delete cascade,
  position int not null default 0,
  primary key (post_id, file_id)
);
create index on post_files (file_id);

create table reactions (
  post_id bigint not null references posts(id) on delete cascade,
  member_id bigint not null references members(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, member_id, emoji)
);

create table poll_votes (
  post_id bigint not null references posts(id) on delete cascade,
  member_id bigint not null references members(id) on delete cascade,
  option int not null,
  created_at timestamptz not null default now(),
  primary key (post_id, member_id, option)
);

-- Who has seen an announcement, opportunity or event (for "Seen by").
create table post_views (
  post_id bigint not null references posts(id) on delete cascade,
  member_id bigint not null references members(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (post_id, member_id)
);

-- ----------------------------------------------------------- opportunities ----

-- The specialists an opportunity matched, and so alerted.
create table opportunity_targets (
  post_id bigint not null references posts(id) on delete cascade,
  member_id bigint not null references members(id) on delete cascade,
  alerted_at timestamptz not null default now(),
  nudged_at timestamptz,
  primary key (post_id, member_id)
);
create index on opportunity_targets (member_id);

create table responses (
  post_id bigint not null references posts(id) on delete cascade,
  member_id bigint not null references members(id) on delete cascade,
  answer text not null check (answer in ('interested', 'not_for_me')),
  note text,
  stage text not null default 'new' check (stage in ('new', 'shortlisted', 'declined')),
  staged_by bigint references members(id) on delete set null,
  staged_at timestamptz,
  talent_sent_at timestamptz,
  talent_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, member_id)
);

-- ------------------------------------------------------------------ events ----

create table rsvps (
  post_id bigint not null references posts(id) on delete cascade,
  member_id bigint not null references members(id) on delete cascade,
  answer text not null check (answer in ('going', 'maybe', 'no')),
  reminded_day boolean not null default false,
  reminded_hour boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (post_id, member_id)
);

-- -------------------------------------------------------------- moderation ----

create table reports (
  id bigserial primary key,
  post_id bigint not null references posts(id) on delete cascade,
  reporter_id bigint references members(id) on delete set null,
  reason text not null,
  note text,
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  handled_by bigint references members(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index reports_once on reports (post_id, reporter_id) where status = 'open';

create table blocked_words (
  id serial primary key,
  word text not null,
  action text not null default 'hold' check (action in ('hold', 'block', 'caution')),
  created_by bigint references members(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index blocked_words_word on blocked_words (lower(word));

-- ----------------------------------------------------------- notifications ----

create table notifications (
  id bigserial primary key,
  member_id bigint not null references members(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  actor_id bigint references members(id) on delete set null,
  post_id bigint references posts(id) on delete cascade,
  important boolean not null default false,
  urgent boolean not null default false,
  read_at timestamptz,
  pushed_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (member_id, created_at desc);
create index notifications_unpushed on notifications (created_at) where pushed_at is null;

create table push_subscriptions (
  id bigserial primary key,
  member_id bigint not null references members(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);

-- Every email, WhatsApp and text message the community sends. Without a
-- provider's key nothing leaves: the message is kept here as "simulated".
create table outbox (
  id bigserial primary key,
  channel text not null check (channel in ('email', 'whatsapp', 'sms')),
  member_id bigint references members(id) on delete set null,
  to_address text not null,
  subject text,
  body text not null,
  purpose text not null,
  status text not null check (status in ('simulated', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now()
);
create index on outbox (created_at desc);

create table broadcasts (
  id bigserial primary key,
  author_id bigint references members(id) on delete set null,
  title text not null,
  body text not null,
  segment jsonb not null default '{}',
  via jsonb not null default '{}',
  urgent boolean not null default false,
  post_id bigint references posts(id) on delete set null,
  recipients int not null default 0,
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table broadcast_recipients (
  broadcast_id bigint not null references broadcasts(id) on delete cascade,
  member_id bigint not null references members(id) on delete cascade,
  seen_at timestamptz,
  primary key (broadcast_id, member_id)
);
create index on broadcast_recipients (member_id);

-- ---------------------------------------------------------- help requests ----

-- "Ask Special Minds for help" from the Families space; sent on to the CRM when it's linked.
create table help_requests (
  id bigserial primary key,
  member_id bigint references members(id) on delete set null,
  space_id int references spaces(id) on delete set null,
  service text not null,
  child_age text,
  city text,
  area text,
  details text,
  name text not null,
  phone text,
  email text,
  contact_by text not null default 'whatsapp',
  status text not null default 'new' check (status in ('new', 'sent', 'failed', 'done')),
  crm_ref text,
  error text,
  handled_by bigint references members(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------- audit ----

create table audit_log (
  id bigserial primary key,
  actor_id bigint references members(id) on delete set null,
  actor_name text,
  action text not null,
  target text,
  detail jsonb not null default '{}',
  ip text,
  created_at timestamptz not null default now()
);
create index on audit_log (created_at desc);

-- Background work bookkeeping (one runner at a time).
create table job_runs (
  key text primary key,
  ran_at timestamptz not null default '-infinity'
);
insert into job_runs (key) values ('tick');
