-- One-time sign-in links: the owner's first sign-in on a fresh live site (before
-- email is set up), made with `node scripts/db.mjs owner-link <email>`.
-- Only the token's hash is kept; each link works once.
create table login_links (
  id text primary key,
  member_id bigint not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
