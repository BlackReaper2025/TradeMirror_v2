// ─── Database connection — wraps @tauri-apps/plugin-sql with Drizzle ─────────
import Database from "@tauri-apps/plugin-sql";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

export type AppDb = ReturnType<typeof drizzle<typeof schema>>;

let _db: AppDb | null = null;

/**
 * Opens the SQLite database and returns a typed Drizzle instance.
 * Migrations are run by the Tauri plugin on the Rust side before this is called.
 * Safe to call multiple times — returns the same instance.
 */
export async function initDb(): Promise<AppDb> {
  if (_db) return _db;

  const sqlite = await Database.load("sqlite:trademirror.db");

  _db = drizzle(
    async (sql, params, method) => {
      if (method === "run") {
        await sqlite.execute(sql, params as unknown[]);
        return { rows: [] };
      }
      // SELECT — plugin returns array of row objects; Drizzle proxy expects array of value arrays
      const rows = await sqlite.select<Record<string, unknown>[]>(
        sql,
        params as unknown[]
      );
      return { rows: (rows as Record<string, unknown>[]).map((row) => Object.values(row)) };
    },
    { schema }
  );

  return _db;
}

/** Returns the initialized db instance. Throws if initDb() was not awaited first. */
export function getDb(): AppDb {
  if (!_db) throw new Error("DB not ready — await initDb() first.");
  return _db;
}
