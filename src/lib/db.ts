import "server-only";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { seedIfEmpty } from "./seed";

export type Query = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

const DATE_OID = 1082;
const INT8_OID = 20;
const NUMERIC_OID = 1700;

pg.types.setTypeParser(DATE_OID, (v: string) => v);
pg.types.setTypeParser(INT8_OID, (v: string) => Number(v));
pg.types.setTypeParser(NUMERIC_OID, (v: string) => Number(v));

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const localDir = process.env.LOCAL_DB_DIR?.trim() || path.join(process.cwd(), ".data", "pglite");

type DbState = {
  pool?: pg.Pool;
  local?: Promise<PGlite>;
  ready?: Promise<void>;
};

const globalForDb = globalThis as unknown as { __opsDb?: DbState };
const state: DbState = (globalForDb.__opsDb ??= {});

async function migrationFiles() {
  const dir = path.join(process.cwd(), "migrations");
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".sql")).sort();
  return Promise.all(files.map(async (name) => ({ name, text: await readFile(path.join(dir, name), "utf8") })));
}

async function startLocal(): Promise<PGlite> {
  await mkdir(localDir, { recursive: true });
  const db = new PGlite(localDir, {
    parsers: {
      [DATE_OID]: (v: string) => v,
      [INT8_OID]: (v: string) => Number(v),
      [NUMERIC_OID]: (v: string) => Number(v),
    },
  });
  await db.exec(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const done = new Set(
    (await db.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name),
  );
  for (const file of await migrationFiles()) {
    if (done.has(file.name)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(file.text);
      await tx.query("insert into schema_migrations (name) values ($1)", [file.name]);
    });
  }
  return db;
}

function getLocal() {
  state.local ??= startLocal().catch((error: unknown) => {
    state.local = undefined;
    throw error;
  });
  return state.local;
}

function getPool() {
  state.pool ??= new pg.Pool({ connectionString: databaseUrl, max: 5 });
  return state.pool;
}

const rawQuery: Query = async <T,>(text: string, params: unknown[] = []) => {
  if (databaseUrl !== "") {
    return (await getPool().query(text, params)).rows as T[];
  }
  return (await (await getLocal()).query<T>(text, params)).rows;
};

export async function withTx<R>(fn: (q: Query) => Promise<R>): Promise<R> {
  if (databaseUrl !== "") {
    const client = await getPool().connect();
    try {
      await client.query("begin");
      const q: Query = async <T,>(text: string, params: unknown[] = []) =>
        (await client.query(text, params)).rows as T[];
      const result = await fn(q);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  const db = await getLocal();
  return db.transaction(async (tx) => {
    const q: Query = async <T,>(text: string, params: unknown[] = []) =>
      (await tx.query<T>(text, params)).rows;
    return fn(q);
  });
}

function ensureReady() {
  state.ready ??= seedIfEmpty(rawQuery, withTx).catch((error: unknown) => {
    state.ready = undefined;
    throw error;
  });
  return state.ready;
}

export const sql: Query = async <T,>(text: string, params: unknown[] = []) => {
  await ensureReady();
  return rawQuery<T>(text, params);
};

export async function tx<R>(fn: (q: Query) => Promise<R>): Promise<R> {
  await ensureReady();
  return withTx(fn);
}
