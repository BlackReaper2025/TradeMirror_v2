// ─── Drizzle Schema — Phase 2 ───────────────────────────────────────────────
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ─── accounts ────────────────────────────────────────────────────────────────

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  brokerOrFirm: text("broker_or_firm").notNull(),
  startingBalance: real("starting_balance").notNull(),
  currentBalance: real("current_balance").notNull(),
  dailyTarget: real("daily_target").notNull(),
  accountType: text("account_type", {
    enum: ["prop", "personal", "challenge", "oanda"],
  }).notNull(),
  brokerUrl: text("broker_url"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
});

// ─── trades ──────────────────────────────────────────────────────────────────

export const trades = sqliteTable("trades", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  openedAt: text("opened_at").notNull(),
  closedAt: text("closed_at"),
  instrument: text("instrument").notNull(),
  side: text("side", { enum: ["long", "short"] }).notNull(),
  setupName: text("setup_name"),
  entryPrice: real("entry_price"),
  stopPrice: real("stop_price"),
  targetPrice: real("target_price"),
  exitPrice: real("exit_price"),
  size: real("size"),
  fees: real("fees").default(0),
  pnl: real("pnl").default(0),
  screenshotPath: text("screenshot_path"),
  technicalNotes: text("technical_notes"),
  syncNotes: text("sync_notes"), // auto-generated notes from broker sync (partial-close legs, P&L estimate debug) — kept separate from the user's own technicalNotes
  tags: text("tags"), // JSON array stored as string
  tradeRef: text("trade_ref"),
  slPips: real("sl_pips"),
  tpPips: real("tp_pips"),
  maePips: real("mae_pips"),
  mae: real("mae"),
  maeTime: text("mae_time"),
  mfePips: real("mfe_pips"),
  mfe: real("mfe"),
  mfeTime: text("mfe_time"),
});

// ─── trade_images — entry/exit/additional screenshots with descriptions ───────

export const tradeImages = sqliteTable("trade_images", {
  id: text("id").primaryKey(),
  tradeId: text("trade_id")
    .notNull()
    .references(() => trades.id),
  kind: text("kind", { enum: ["entry", "exit", "additional"] }).notNull(),
  path: text("path").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ─── trade_journal ────────────────────────────────────────────────────────────

export const tradeJournal = sqliteTable("trade_journal", {
  id: text("id").primaryKey(),
  tradeId: text("trade_id")
    .notNull()
    .references(() => trades.id),
  emotionBefore: text("emotion_before"),
  emotionAfter: text("emotion_after"),
  mistakes: text("mistakes"),
  lessons: text("lessons"),
  confidenceScore: integer("confidence_score"),
  disciplineScore: integer("discipline_score"),
  freeformNotes: text("freeform_notes"),
});

// ─── daily_stats ──────────────────────────────────────────────────────────────

export const dailyStats = sqliteTable("daily_stats", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  day: text("day").notNull(), // ISO date YYYY-MM-DD
  totalPnl: real("total_pnl").default(0),
  tradeCount: integer("trade_count").default(0),
  winCount: integer("win_count").default(0),
  lossCount: integer("loss_count").default(0),
  avgWin: real("avg_win").default(0),
  avgLoss: real("avg_loss").default(0),
  winRate: real("win_rate").default(0),
  profitFactor: real("profit_factor").default(0),
  maxDrawdown: real("max_drawdown").default(0),
});

// ─── quotes ───────────────────────────────────────────────────────────────────

export const quotes = sqliteTable("quotes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  author: text("author").notNull(),
  category: text("category"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

// ─── inspiration_folders ─────────────────────────────────────────────────────

export const inspirationFolders = sqliteTable("inspiration_folders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  localPath: text("local_path").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

// ─── fatigue_settings ────────────────────────────────────────────────────────

export const fatigueSettings = sqliteTable("fatigue_settings", {
  id: integer("id").primaryKey(),
  durationMinutes: integer("duration_minutes").notNull().default(90),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  bypassCount: integer("bypass_count").notNull().default(0),
});

// ─── account_profiles — risk/discipline rules per account (Phase 2) ──────────

export const accountProfiles = sqliteTable("account_profiles", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .unique()
    .references(() => accounts.id),
  platformType: text("platform_type"), // e.g. "TradeLocker", "OANDA", "Manual"
  programType: text("program_type"), // e.g. "E8 Pro", "FTMO Challenge"
  profitTargetAmount: real("profit_target_amount"),
  profitTargetPct: real("profit_target_pct"),
  dailyDrawdownAmount: real("daily_drawdown_amount"),
  dailyDrawdownPct: real("daily_drawdown_pct"),
  staticDrawdownAmount: real("static_drawdown_amount"),
  staticDrawdownPct: real("static_drawdown_pct"),
  maxRiskPerTradePct: real("max_risk_per_trade_pct").notNull().default(1.0),
  cooldownHours: real("cooldown_hours").notNull().default(12),
  serverTimezone: text("server_timezone"), // IANA zone, e.g. "Europe/Helsinki"
  liveExecutionEnabled: integer("live_execution_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  // TradeLocker link (Phase 5) — which broker account this TradeMirror account
  // reads from. Login credentials themselves live in the OS keyring, not here.
  tradelockerAccountId: text("tradelocker_account_id"), // broker's "id" — used in URL paths
  tradelockerAccNum: text("tradelocker_acc_num"), // broker's "accNum" — used in the accNum header
  // OANDA trading-account link (Phase 8) — e.g. "101-001-1234567-001".
  // Reuses the existing OANDA API key file; no separate credential storage needed.
  oandaAccountId: text("oanda_account_id"),
});

// ─── trade_ideas — shared parent intent; may own multiple executions ─────────

export const tradeIdeas = sqliteTable("trade_ideas", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  direction: text("direction", { enum: ["long", "short"] }).notNull(),
  orderType: text("order_type", { enum: ["market", "limit", "stop"] }).notNull(),
  intendedEntry: real("intended_entry"),
  intendedStop: real("intended_stop"),
  intendedTarget: real("intended_target"),
  lifecycleState: text("lifecycle_state", {
    enum: ["planned", "submitting", "pending", "open", "closed", "error", "cooldown"],
  })
    .notNull()
    .default("planned"),
  disciplineState: text("discipline_state"),
  copyTradeEnabled: integer("copy_trade_enabled", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  closedAt: text("closed_at"),
});

// ─── executions — one row per account-specific broker fill for a trade idea ──

export const executions = sqliteTable("executions", {
  id: text("id").primaryKey(),
  tradeIdeaId: text("trade_idea_id")
    .notNull()
    .references(() => tradeIdeas.id),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  tradeId: text("trade_id").references(() => trades.id), // set once reconciled into the Trade Log
  broker: text("broker", { enum: ["tradelocker", "oanda"] }), // which sync owns this row — see brokerPositionId
  brokerOrderId: text("broker_order_id"), // stable broker identifier for idempotent reconciliation
  brokerPositionId: text("broker_position_id"),
  status: text("status", {
    enum: ["planned", "submitting", "pending", "open", "closed", "error", "cooldown"],
  })
    .notNull()
    .default("planned"),
  entryPrice: real("entry_price"),
  stopPrice: real("stop_price"),
  targetPrice: real("target_price"),
  quantity: real("quantity"),
  fees: real("fees"),
  pnl: real("pnl"),
  openedAt: text("opened_at"),
  closedAt: text("closed_at"),
  errorMessage: text("error_message"),
});

// ─── cooldowns — persistent global no-new-trade window after a stop-out (Phase 12) ──
// Append-only log, not a singleton — is-cooldown-active is "does any row's
// cooldownUntil still lie in the future," which survives app restarts for
// free since it's a plain DB read, and keeps a history for the audit trail.

export const cooldowns = sqliteTable("cooldowns", {
  id: text("id").primaryKey(),
  triggeredByExecutionId: text("triggered_by_execution_id").references(() => executions.id),
  triggeredByAccountId: text("triggered_by_account_id").references(() => accounts.id),
  stopOutAt: text("stop_out_at").notNull(),
  cooldownUntil: text("cooldown_until").notNull(),
  createdAt: text("created_at").notNull(),
});

// ─── app_settings ────────────────────────────────────────────────────────────

export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey(),
  selectedAccountId: text("selected_account_id"),
  themeMode: text("theme_mode").default("auto"),
  lastOpenedPage: text("last_opened_page").default("dashboard"),
});
