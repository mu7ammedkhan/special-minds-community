// Database tasks.
//
//   npm run db:migrate                 apply new migrations (local, or DATABASE_URL)
//   npm run db:reset                   LOCAL ONLY: wipe .data/, migrate, load demo data
//   npm run db:seed                    load demo data into an empty database (local, or a throwaway demo
//                                      database with --demo-database)
//   node scripts/db.mjs setup          a fresh live database: spaces and channels, no people or posts
//   npm run member:add -- you@org.com "Your Name"
//                                      the first owner on a fresh live database (signs in with an email code)
//   node scripts/db.mjs owner-link you@org.com [hours]
//                                      a one-time sign-in link for an owner or admin (before email is set up)
//   node scripts/db.mjs staff-role someone@org.com owner|admin|moderator|none
//                                      change a staff role, owners included (the admin screens can't)
//
// Demo data is made up. reset and seed refuse a hosted database unless you add
// --demo-database. Stop `npm run dev` before running these against the local
// database: PGlite allows one process per data directory.

import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { migrate } from "./migrate-lib.mjs";
import { seed } from "./seed.mjs";
import { structure } from "./structure.mjs";
import { createHash, randomBytes } from "node:crypto";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
for (const f of [".env.local", ".env"]) {
  const p = path.join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.DATABASE_URL || "pglite://.data/pglite";
const local = url.startsWith("pglite://");
const args = process.argv.slice(2);
const cmd = args[0];

async function open() {
  if (local) {
    const { PGlite } = await import("@electric-sql/pglite");
    const dir = path.join(root, url.slice("pglite://".length));
    mkdirSync(path.dirname(dir), { recursive: true });
    return new PGlite(dir);
  }
  const postgres = (await import("postgres")).default;
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  const wrap = (s) => ({ exec: (q) => s.unsafe(q), query: async (q, p = []) => ({ rows: await s.unsafe(q, p) }) });
  return { ...wrap(sql), transaction: (fn) => sql.begin((t) => fn(wrap(t))), close: () => sql.end() };
}

const demoOk = local || args.includes("--demo-database");

if (cmd === "migrate") {
  const db = await open();
  console.log(`Migrating ${local ? "the local database" : "the hosted database"}`);
  await migrate(db, root);
  await db.close();
  console.log("Done.");
} else if (cmd === "reset") {
  if (!local) { console.error("reset only works on the local database (it deletes everything)."); process.exit(1); }
  rmSync(path.join(root, url.slice("pglite://".length)), { recursive: true, force: true });
  const db = await open();
  console.log("Migrating");
  await migrate(db, root);
  console.log("Loading demo data (made up)");
  await seed(db, root);
  await db.close();
  console.log("Done. Start the app with: npm run dev");
} else if (cmd === "seed") {
  if (!demoOk) { console.error("Refusing to load demo data into a hosted database. Add --demo-database if this is a throwaway demo."); process.exit(1); }
  const db = await open();
  await migrate(db, root);
  const { rows } = await db.query(`select count(*)::int as n from members`);
  if (rows[0].n > 0) { console.error("This database already has members: demo data only goes into an empty one."); process.exit(1); }
  await seed(db, root);
  await db.close();
  console.log("Demo data loaded.");
} else if (cmd === "add-owner") {
  const [email, ...nameParts] = args.slice(1);
  const name = nameParts.join(" ");
  if (!email || !name || !email.includes("@")) { console.log('usage: npm run member:add -- someone@specialminds.ae "Full Name"'); process.exit(1); }
  const db = await open();
  await migrate(db, root, () => {});
  await db.query(
    `insert into members (email, full_name, kind, staff_role, status, profile_done, joined_at, rules_accepted_at, consent_at) values ($1, $2, 'team', 'owner', 'active', true, now(), now(), now())
     on conflict (lower(email)) where email is not null do update set staff_role = 'owner', status = 'active'`, [email.toLowerCase(), name]);
  await db.query(`insert into space_members (space_id, member_id) select s.id, m.id from spaces s, members m where lower(m.email) = $1 on conflict do nothing`, [email.toLowerCase()]);
  // The owner is in every channel, private and hidden ones included.
  await db.query(`insert into channel_members (channel_id, member_id, notify) select c.id, m.id, case when c.type in ('announcement', 'opportunities', 'events') then 'all' else 'mentions' end
                  from channels c, members m where lower(m.email) = $1 and c.archived_at is null on conflict do nothing`, [email.toLowerCase()]);
  await db.close();
  console.log(`\n  ${email} is the owner. They sign in at /login with a code sent to that email.\n`);
} else if (cmd === "setup") {
  const db = await open();
  await migrate(db, root);
  const { rows } = await db.query(`select count(*)::int as n from spaces`);
  if (rows[0].n > 0) { console.error("This database already has spaces: nothing changed."); process.exit(1); }
  const made = await structure(db);
  await db.close();
  console.log(`Made ${made.spaces} spaces and ${made.channels} channels, with no people or posts. Next: npm run member:add -- you@example.com "Your Name"`);
} else if (cmd === "owner-link") {
  const email = (args[1] ?? "").toLowerCase();
  const hours = Math.min(72, Math.max(1, Number(args[2]) || 24));
  if (!email.includes("@")) { console.log("usage: node scripts/db.mjs owner-link someone@example.com [hours]"); process.exit(1); }
  const db = await open();
  const { rows } = await db.query(`select id from members where lower(email) = $1 and staff_role in ('owner', 'admin') and status = 'active'`, [email]);
  if (!rows.length) { console.error("No active owner or admin with that email."); process.exit(1); }
  const token = randomBytes(32).toString("base64url");
  await db.query(`insert into login_links (id, member_id, expires_at) values ($1, $2, now() + make_interval(hours => $3))`, [createHash("sha256").update(token).digest("hex"), rows[0].id, hours]);
  await db.close();
  console.log(`${(process.env.APP_URL ?? "").replace(/\/$/, "")}/login/link/${token}`);
  console.error(`One-time sign-in link for ${email}: works once, for ${hours} hours.`);
} else if (cmd === "staff-role") {
  // The admin screens never change an owner (nor let anyone make one): handing the community over is done here.
  const email = (args[1] ?? "").toLowerCase();
  const role = args[2];
  if (!email.includes("@") || !["owner", "admin", "moderator", "none"].includes(role)) { console.log("usage: node scripts/db.mjs staff-role someone@example.com owner|admin|moderator|none"); process.exit(1); }
  const db = await open();
  const value = role === "none" ? null : role;
  const { rows } = await db.query(`update members set staff_role = $2 where lower(email) = $1 and status <> 'deleted' returning id`, [email, value]);
  if (!rows.length) { console.error("No member with that email: nothing changed."); process.exit(1); }
  await db.query(`insert into audit_log (actor_id, actor_name, action, target, detail) values (null, 'Database command', 'member.staff_role', $1, $2::text::jsonb)`,
    [`member:${rows[0].id}`, JSON.stringify({ role: value, via: "scripts/db.mjs" })]);
  await db.close();
  console.log(role === "none" ? `${email} now has no staff role.` : `${email} is now ${/^[aeiou]/.test(role) ? "an" : "a"} ${role}.`);
} else {
  console.log("usage: node scripts/db.mjs migrate | reset | seed [--demo-database] | setup | add-owner <email> <name> | owner-link <email> [hours] | staff-role <email> owner|admin|moderator|none");
}
