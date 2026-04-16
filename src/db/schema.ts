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
    enum: ["prop", "personal", "challenge"],
  }).notNull(),
  brokerUrl: text("broker_url"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
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
  size: real("size"),
  fees: real("fees").default(0),
  pnl: real("pnl").default(0),
  screenshotPath: text("screenshot_path"),
  technicalNotes: text("technical_notes"),
  tags: text("tags"), // JSON array stored as string
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

// ─── app_settings ────────────────────────────────────────────────────────────

export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey(),
  selectedAccountId: text("selected_account_id"),
  themeMode: text("theme_mode").default("auto"),
  lastOpenedPage: text("last_opened_page").default("dashboard"),
});
