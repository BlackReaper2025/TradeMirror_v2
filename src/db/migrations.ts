// ─── Schema migrations — run on every boot, safe to re-run ──────────────────
// Each migration is a raw SQL statement that adds a column if it doesn't exist.
// SQLite doesn't support IF NOT EXISTS on ALTER TABLE, so we catch the error.

import { getRawSqlite } from "./index";

const MIGRATIONS: string[] = [
  // v1 — per-account brokerage URL
  `ALTER TABLE accounts ADD COLUMN broker_url TEXT`,
  // v2 — user-facing trade reference number
  `ALTER TABLE trades ADD COLUMN trade_ref TEXT`,
  // v3 — actual exit price (separate from take-profit target)
  `ALTER TABLE trades ADD COLUMN exit_price REAL`,
  // v3b — copy existing target_price values into exit_price (idempotent)
  `UPDATE trades SET exit_price = target_price WHERE exit_price IS NULL AND target_price IS NOT NULL`,
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
