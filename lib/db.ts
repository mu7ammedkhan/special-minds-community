import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * One way into the database for the whole app.
 *
 *   DATABASE_URL=pglite://.data/pglite   an in-process Postgres on this laptop (default, no setup)
 *   DATABASE_URL=postgres://…            any hosted Postgres (Neon, a new Supabase project, RDS…)
 *
 * The community has its own database. It never connects to the Special Minds
 * websites, the CRM or the talent portal.
 */

export type Params = unknown[];
export interface Tx {
  query<T = Record<string, unknown>>(sql: string, params?: Params): Promise<T[]>;
  one<T = Record<string, unknown>>(sql: string, params?: Params): Promise<T | null>;
}

interface Driver {
  run(sql: string, params: Params): Promise<Record<string, unknown>[]>;
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

const url = process.env.DATABASE_URL || "pglite://.data/pglite";

// date → 'YYYY-MM-DD', timestamptz → ISO string, numeric/bigint → number in
// both drivers, so pages never juggle Date objects or strings for sums, and
// everything passes cleanly from server to browser.
const DATE = 1082, NUMERIC = 1700, INT8 = 20, TIMESTAMPTZ = 1184;
function isoInstant(v: string): string {
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-]\d{2})(?::?(\d{2}))?$/);
  if (!m) return v;
  const d = new Date(`${m[1]}T${m[2]}${m[3]}:${m[4] ?? "00"}`);
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
}

function wrap(run: (sql: string, params: Params) => Promise<Record<string, unknown>[]>): Tx {
  return {
    query: (sql, params = []) => run(sql, params) as never,
    one: async (sql, params = []) => ((await run(sql, params))[0] ?? null) as never,
  };
}

async function createPglite(): Promise<Driver> {
  const { PGlite } = await import("@electric-sql/pglite");
  const path = await import("node:path");
  const db = new PGlite(path.resolve(/*turbopackIgnore: true*/ process.cwd(), url.slice("pglite://".length)), {
    parsers: {
      [DATE]: (v: string) => v,
      [NUMERIC]: (v: string) => Number(v),
      [INT8]: (v: string) => Number(v),
      [TIMESTAMPTZ]: (v: string) => isoInstant(v),
    },
  });
  return {
    run: async (sql, params) => (await db.query(sql, params)).rows as Record<string, unknown>[],
    transaction: (fn) => db.transaction(async (t) => fn(wrap(async (sql, params) => (await t.query(sql, params)).rows as Record<string, unknown>[]))),
  };
}

async function createPostgres(): Promise<Driver> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(url, {
    prepare: false, // works behind transaction poolers (Neon, Supabase)
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    idle_timeout: 20,
    types: {
      date: { to: DATE, from: [DATE], serialize: (x: string) => x, parse: (x: string) => x },
      numeric: { to: NUMERIC, from: [NUMERIC], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      int8: { to: INT8, from: [INT8], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      timestamptz: { to: TIMESTAMPTZ, from: [TIMESTAMPTZ], serialize: (x: string | Date) => (x instanceof Date ? x.toISOString() : x), parse: (x: string) => isoInstant(x) },
    },
  });
  return {
    run: async (q, params) => (await sql.unsafe(q, params as never[])) as unknown as Record<string, unknown>[],
    transaction: (fn) =>
      sql.begin(async (t) => fn(wrap(async (q, params) => (await t.unsafe(q, params as never[])) as unknown as Record<string, unknown>[]))) as never,
  };
}

const g = globalThis as unknown as { __communityDb?: Promise<Driver> };
function driver(): Promise<Driver> {
  // One PGlite instance per process: it owns its data directory.
  g.__communityDb ??= url.startsWith("pglite://") ? createPglite() : createPostgres();
  return g.__communityDb;
}

// Inside a transaction, every statement must go through its `tx`. On the local
// database one connection serves everything, so a stray query() there would wait
// for the transaction to finish while the transaction waits for it: a deadlock.
const inTx = new AsyncLocalStorage<boolean>();

/** A single statement. */
export async function query<T = Record<string, unknown>>(sql: string, params: Params = []): Promise<T[]> {
  if (inTx.getStore()) throw new Error("query() called inside a transaction: use the transaction's tx.query()");
  return (await (await driver()).run(sql, params)) as T[];
}

/** The first row, or null. */
export async function one<T = Record<string, unknown>>(sql: string, params: Params = []): Promise<T | null> {
  return ((await query<T>(sql, params))[0] ?? null) as T | null;
}

/** Several statements that succeed or fail together. */
export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await driver()).transaction((tx) => inTx.run(true, () => fn(tx)));
}

export const isLocalDatabase = () => url.startsWith("pglite://");

/** Runs work as if no transaction were open (for work scheduled from inside one, to run after it). */
export const outsideTransaction = <T>(fn: () => Promise<T>): Promise<T> => inTx.exit(fn);

/** Postgres error → a sentence a person can act on. */
export function dbErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string; constraint_name?: string; constraint?: string };
  if (err?.code === "23505") return "That already exists.";
  if (err?.code === "23514") return "Some details don't add up. Check the numbers and dates.";
  if (err?.code === "23503") return "That record is linked to something that no longer exists.";
  if (err?.code === "22P02" || err?.code === "22007" || err?.code === "22008") return "One of the values isn't in the right format.";
  console.error(e);
  return "Something went wrong saving that. Please try again.";
}
