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
  // v4 — account archiving (soft archive, preserves trade data)
  `ALTER TABLE accounts ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0`,
  // v5 — entry/exit/additional trade screenshots with per-image descriptions
  `CREATE TABLE IF NOT EXISTS trade_images (
    id TEXT PRIMARY KEY,
    trade_id TEXT NOT NULL REFERENCES trades(id),
    kind TEXT NOT NULL,
    path TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`,
  // v6 — drop the supply/demand zones table (Strategy screen feature removed)
  `DROP TABLE IF EXISTS supply_demand_zones`,
  // v7 — indexes for the hot-path stats/dashboard/trade-log queries, which all
  // filter trades by account_id (often + closed_at) and were doing full table
  // scans over every Tauri IPC round-trip.
  `CREATE INDEX IF NOT EXISTS idx_trades_account_id ON trades(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_trades_account_closed_at ON trades(account_id, closed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_daily_stats_account_day ON daily_stats(account_id, day)`,
  `CREATE INDEX IF NOT EXISTS idx_trade_journal_trade_id ON trade_journal(trade_id)`,
  `CREATE INDEX IF NOT EXISTS idx_trade_images_trade_id ON trade_images(trade_id)`,
  // v8 — MAE/MFE (max adverse/favorable excursion) tracking per trade
  `ALTER TABLE trades ADD COLUMN mae_pips REAL`,
  `ALTER TABLE trades ADD COLUMN mae REAL`,
  `ALTER TABLE trades ADD COLUMN mae_time TEXT`,
  `ALTER TABLE trades ADD COLUMN mfe_pips REAL`,
  `ALTER TABLE trades ADD COLUMN mfe REAL`,
  `ALTER TABLE trades ADD COLUMN mfe_time TEXT`,
  // v9 — planned stop-loss / take-profit distance in pips
  `ALTER TABLE trades ADD COLUMN sl_pips REAL`,
  `ALTER TABLE trades ADD COLUMN tp_pips REAL`,
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
