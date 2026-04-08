// ─── Database connection — wraps @tauri-apps/plugin-sql with Drizzle ─────────
import Database from "@tauri-apps/plugin-sql";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

export type AppDb = ReturnType<typeof drizzle<typeof schema>>;

let _db: AppDb | null = null;
// Shared promise: concurrent callers (e.g. React StrictMode double-invocation)
// all await the same open operation instead of racing to call Database.load() twice.
let _initPromise: Promise<AppDb> | null = null;

/**
 * tauri-plugin-sql only understands null, numbers, strings, and Uint8Array as
 * bind parameters. JS booleans (true/false) and undefined are not valid — they
 * cause silent bind failures or crashes on the Rust side.
 * This helper coerces every param to a safe SQLite-compatible value.
 */
function serializeParams(params: unknown[]): unknown[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (p === true) return 1;
    if (p === false) return 0;
    return p;
  });
}

async function openDb(): Promise<AppDb> {
  console.log("[db] Opening sqlite:trademirror.db …");
  const sqlite = await Database.load("sqlite:trademirror.db");
  console.log("[db] Connection established. Building Drizzle proxy …");

  _db = drizzle(
    async (sql, params, method) => {
      const safe = serializeParams(params as unknown[]);
      if (method === "run") {
        await sqlite.execute(sql, safe);
        return { rows: [] };
      }
      // SELECT — plugin returns array of row-objects; proxy expects array of value-arrays
      const rows = await sqlite.select<Record<string, unknown>[]>(sql, safe);
      return {
        rows: (rows as Record<string, unknown>[]).map((row) =>
          Object.values(row)
        ),
      };
    },
    { schema }
  );

  console.log("[db] Drizzle proxy ready.");
  return _db;
}

/**
 * Opens the SQLite database and returns a typed Drizzle instance.
 * Migrations are handled by tauri-plugin-sql on the Rust side.
 * Safe to call multiple times — all callers share one open operation.
 */
export async function initDb(): Promise<AppDb> {
  if (_db) return _db;
  if (!_initPromise) {
    _initPromise = openDb().catch((err) => {
      // Reset so a retry is possible after failure
      _initPromise = null;
      throw err;
    });
  }
  return _initPromise;
}

/** Returns the initialized db. Throws if initDb() was not awaited first. */
export function getDb(): AppDb {
  if (!_db) throw new Error("[db] Not ready — call initDb() first.");
  return _db;
}
