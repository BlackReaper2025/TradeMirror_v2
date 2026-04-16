// ─── Database connection — wraps @tauri-apps/plugin-sql with Drizzle ─────────
import Database from "@tauri-apps/plugin-sql";
import { appDataDir } from "@tauri-apps/api/path";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

export type AppDb = ReturnType<typeof drizzle<typeof schema>>;

let _db: AppDb | null = null;
let _sqlite: Database | null = null;
// Shared promise so React StrictMode double-invocation shares one open call.
let _initPromise: Promise<AppDb> | null = null;

/**
 * tauri-plugin-sql only accepts null, number, string, Uint8Array as bind params.
 * JS booleans and undefined must be coerced before every execute/select call.
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
  // Log the exact resolved path so we always know which file is being used.
  try {
    const dataDir = await appDataDir();
    console.log("[db] App data dir:", dataDir);
    console.log("[db] DB file will be:", dataDir + "trademirror.db");
  } catch {
    console.warn("[db] Could not resolve appDataDir — running outside Tauri?");
  }

  console.log("[db] Calling Database.load('sqlite:trademirror.db') …");
  const sqlite = await Database.load("sqlite:trademirror.db");
  _sqlite = sqlite;
  console.log("[db] Connection established. Building Drizzle proxy …");

  _db = drizzle(
    async (sql, params, method) => {
      const safe = serializeParams(params as unknown[]);
      if (method === "run") {
        await sqlite.execute(sql, safe);
        return { rows: [] };
      }
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

export async function initDb(): Promise<AppDb> {
  if (_db) return _db;
  if (!_initPromise) {
    _initPromise = openDb().catch((err) => {
      _initPromise = null;
      throw err;
    });
  }
  return _initPromise;
}

export function getDb(): AppDb {
  if (!_db) throw new Error("[db] Not ready — call initDb() first.");
  return _db;
}

export function getRawSqlite(): Database {
  if (!_sqlite) throw new Error("[db] Not ready — call initDb() first.");
  return _sqlite;
}
