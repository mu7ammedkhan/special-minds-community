// Applies db/migrations/*.sql in order, once each. Works on the local PGlite
// database and on a hosted Postgres (through a tiny adapter in db.mjs).
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export async function migrate(db, root, log = console.log) {
  await db.exec(`create table if not exists _migrations (name text primary key, applied_at timestamptz default now())`);
  const done = new Set((await db.query(`select name from _migrations`)).rows.map((r) => r.name));
  const files = readdirSync(path.join(root, "db/migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(readFileSync(path.join(root, "db/migrations", f), "utf8"));
      await tx.query(`insert into _migrations (name) values ($1)`, [f]);
    });
    log(`  applied ${f}`);
  }
}
