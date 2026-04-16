// ─── Schema migrations — run on every boot, safe to re-run ──────────────────
// Each migration is a raw SQL statement that adds a column if it doesn't exist.
// SQLite doesn't support IF NOT EXISTS on ALTER TABLE, so we catch the error.

import { getRawSqlite } from "./index";

const MIGRATIONS: string[] = [
  // v1 — per-account brokerage URL
  `ALTER TABLE accounts ADD COLUMN broker_url TEXT`,
];

export async function runMigrations(): Promise<void> {
  const sqlite = getRawSqlite();
  for (const sql of MIGRATIONS) {
    try {
      await sqlite.execute(sql, []);
      console.log("[migrations] applied:", sql);
    } catch {
      // "duplicate column name" — already exists, safe to ignore
    }
  }
  console.log("[migrations] ✓ done");
}
