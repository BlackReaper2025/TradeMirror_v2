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
  // v10 — Phase 2 canonical multi-account model: per-account risk/discipline
  // rules, a shared parent trade idea, and per-account execution records.
  // Additive only — existing accounts/trades tables and the Trade Log are untouched.
  `CREATE TABLE IF NOT EXISTS account_profiles (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id),
    platform_type TEXT,
    program_type TEXT,
    profit_target_amount REAL,
    profit_target_pct REAL,
    daily_drawdown_amount REAL,
    daily_drawdown_pct REAL,
    static_drawdown_amount REAL,
    static_drawdown_pct REAL,
    max_risk_per_trade_pct REAL NOT NULL DEFAULT 1.0,
    cooldown_hours REAL NOT NULL DEFAULT 12,
    server_timezone TEXT,
    live_execution_enabled INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS trade_ideas (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    direction TEXT NOT NULL,
    order_type TEXT NOT NULL,
    intended_entry REAL,
    intended_stop REAL,
    intended_target REAL,
    lifecycle_state TEXT NOT NULL DEFAULT 'planned',
    discipline_state TEXT,
    copy_trade_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    closed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    trade_idea_id TEXT NOT NULL REFERENCES trade_ideas(id),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    trade_id TEXT REFERENCES trades(id),
    broker_order_id TEXT,
    broker_position_id TEXT,
    status TEXT NOT NULL DEFAULT 'planned',
    entry_price REAL,
    stop_price REAL,
    target_price REAL,
    quantity REAL,
    fees REAL,
    pnl REAL,
    opened_at TEXT,
    closed_at TEXT,
    error_message TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_executions_account_broker_order ON executions(account_id, broker_order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_executions_trade_idea_id ON executions(trade_idea_id)`,
  `CREATE INDEX IF NOT EXISTS idx_executions_account_id ON executions(account_id)`,
  // v11 — Phase 5: link an account_profile to its TradeLocker broker account.
  // Login credentials themselves live in the OS keyring, never in this DB.
  `ALTER TABLE account_profiles ADD COLUMN tradelocker_account_id TEXT`,
  `ALTER TABLE account_profiles ADD COLUMN tradelocker_acc_num TEXT`,
  // v12 — Phase 6: idempotency backstop so a repeated/restarted TradeLocker
  // sync can never insert a second execution (and therefore second Trade Log
  // record) for the same broker position.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_executions_account_broker_position ON executions(account_id, broker_position_id)`,
  // v13 — Phase 8: link an account_profile to its OANDA trading account, and
  // tag each execution with which broker's sync owns it — TradeLocker and
  // OANDA syncs share the executions table keyed by broker_position_id, and
  // without this an account linked to both could have one sync's closure
  // detection misinterpret the other broker's still-open rows as gone.
  `ALTER TABLE account_profiles ADD COLUMN oanda_account_id TEXT`,
  `ALTER TABLE executions ADD COLUMN broker TEXT`,
  `UPDATE executions SET broker = 'tradelocker' WHERE broker IS NULL AND broker_position_id IS NOT NULL`,
  // v14 — Phase 12: persistent global cooldown log, triggered when a synced
  // execution closes at/through its stop price.
  `CREATE TABLE IF NOT EXISTS cooldowns (
    id TEXT PRIMARY KEY,
    triggered_by_execution_id TEXT REFERENCES executions(id),
    triggered_by_account_id TEXT REFERENCES accounts(id),
    stop_out_at TEXT NOT NULL,
    cooldown_until TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cooldowns_until ON cooldowns(cooldown_until)`,
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
