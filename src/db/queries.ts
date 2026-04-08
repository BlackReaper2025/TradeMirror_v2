// ─── Typed query functions ────────────────────────────────────────────────────
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { getDb } from "./index";
import {
  accounts,
  trades,
  tradeJournal,
  dailyStats,
  quotes,
  appSettings,
} from "./schema";

// ─── Inferred types ───────────────────────────────────────────────────────────

export type Account      = typeof accounts.$inferSelect;
export type Trade        = typeof trades.$inferSelect;
export type TradeJournal = typeof tradeJournal.$inferSelect;
export type DailyStat    = typeof dailyStats.$inferSelect;
export type Quote        = typeof quotes.$inferSelect;

// ─── Trade with optional joined journal ───────────────────────────────────────

export interface TradeWithJournal extends Trade {
  journal: TradeJournal | null;
}

// ─── App settings ─────────────────────────────────────────────────────────────

export async function getSettings() {
  const db = getDb();
  const rows = await db.select().from(appSettings).limit(1);
  return rows[0] ?? null;
}

export async function upsertSelectedAccount(accountId: string) {
  const db = getDb();
  await db
    .insert(appSettings)
    .values({ id: 1, selectedAccountId: accountId })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { selectedAccountId: accountId },
    });
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export async function getActiveAccounts(): Promise<Account[]> {
  const db = getDb();
  return db.select().from(accounts).where(eq(accounts.isActive, true));
}

export async function getAccount(id: string): Promise<Account | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Dashboard: today's stats ─────────────────────────────────────────────────

export async function getTodayStats(accountId: string) {
  const db = getDb();
  const today = new Date().toISOString().split("T")[0];
  const rows = await db
    .select()
    .from(dailyStats)
    .where(and(eq(dailyStats.accountId, accountId), eq(dailyStats.day, today)))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Dashboard: today's trades ────────────────────────────────────────────────

export async function getTodayTrades(accountId: string): Promise<Trade[]> {
  const db = getDb();
  const today = new Date().toISOString().split("T")[0];
  return db
    .select()
    .from(trades)
    .where(
      and(
        eq(trades.accountId, accountId),
        gte(trades.openedAt, today + "T00:00:00Z"),
        lte(trades.openedAt, today + "T23:59:59Z")
      )
    )
    .orderBy(desc(trades.openedAt));
}

// ─── Dashboard: equity curve ──────────────────────────────────────────────────

export async function getEquityCurve(
  accountId: string,
  days = 30
): Promise<Array<{ date: string; balance: number }>> {
  const db = getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];

  const rows = await db
    .select()
    .from(dailyStats)
    .where(and(eq(dailyStats.accountId, accountId), gte(dailyStats.day, sinceStr)))
    .orderBy(dailyStats.day);

  const account = await getAccount(accountId);
  if (!account) return [];

  let runningBalance = account.startingBalance;
  return rows.map((row) => {
    runningBalance += row.totalPnl ?? 0;
    const d = new Date(row.day + "T00:00:00");
    return {
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      balance: runningBalance,
    };
  });
}

// ─── Dashboard: calendar days ─────────────────────────────────────────────────

export async function getCalendarDays(
  accountId: string,
  daysBack = 35
): Promise<Array<{ date: string; pnl: number; tradeCount: number }>> {
  const db = getDb();
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceStr = since.toISOString().split("T")[0];

  const rows = await db
    .select()
    .from(dailyStats)
    .where(and(eq(dailyStats.accountId, accountId), gte(dailyStats.day, sinceStr)))
    .orderBy(dailyStats.day);

  return rows.map((row) => ({
    date: row.day,
    pnl: row.totalPnl ?? 0,
    tradeCount: row.tradeCount ?? 0,
  }));
}

// ─── Dashboard: portfolio ─────────────────────────────────────────────────────

const ACCOUNT_COLORS = ["#22c55e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899"];

export async function getPortfolio() {
  const db = getDb();
  const rows = await db.select().from(accounts).where(eq(accounts.isActive, true));
  return rows.map((acc, i) => ({
    name: acc.name,
    value: acc.currentBalance,
    color: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length],
  }));
}

// ─── Dashboard: quotes ────────────────────────────────────────────────────────

export async function getActiveQuotes(): Promise<Array<{ text: string; author: string }>> {
  const db = getDb();
  const rows = await db.select().from(quotes).where(eq(quotes.isActive, true));
  return rows.map((q) => ({ text: q.text, author: q.author }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 3 — Trade Log read/write
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Get all trades for an account (newest first) with joined journal ─────────

export async function getAllTradesWithJournal(
  accountId: string
): Promise<TradeWithJournal[]> {
  const db = getDb();

  const tradeRows = await db
    .select()
    .from(trades)
    .where(eq(trades.accountId, accountId))
    .orderBy(desc(trades.openedAt));

  if (tradeRows.length === 0) return [];

  // Fetch journals for all returned trade IDs in one query
  const tradeIds = tradeRows.map((t) => t.id);
  const allJournals = await db
    .select()
    .from(tradeJournal)
    .where(
      // IN clause via OR chain — works with the sqlite-proxy
      sql`${tradeJournal.tradeId} IN (${sql.join(
        tradeIds.map((id) => sql`${id}`),
        sql`, `
      )})`
    );

  const journalByTradeId = new Map<string, TradeJournal>();
  for (const j of allJournals) journalByTradeId.set(j.tradeId, j);

  return tradeRows.map((t) => ({
    ...t,
    journal: journalByTradeId.get(t.id) ?? null,
  }));
}

// ─── Input types for create ───────────────────────────────────────────────────

export interface CreateTradeInput {
  id: string;
  accountId: string;
  openedAt: string;
  closedAt?: string;
  instrument: string;
  side: "long" | "short";
  setupName?: string;
  entryPrice?: number;
  stopPrice?: number;
  targetPrice?: number;
  size?: number;
  fees?: number;
  pnl?: number;
  technicalNotes?: string;
  tags?: string;
}

export interface CreateJournalInput {
  id: string;
  tradeId: string;
  emotionBefore?: string;
  emotionAfter?: string;
  mistakes?: string;
  lessons?: string;
  confidenceScore?: number;
  disciplineScore?: number;
  freeformNotes?: string;
}

// ─── Create a trade ───────────────────────────────────────────────────────────

export async function createTrade(input: CreateTradeInput): Promise<void> {
  const db = getDb();
  await db.insert(trades).values({
    id: input.id,
    accountId: input.accountId,
    openedAt: input.openedAt,
    closedAt: input.closedAt ?? null,
    instrument: input.instrument,
    side: input.side,
    setupName: input.setupName ?? null,
    entryPrice: input.entryPrice ?? null,
    stopPrice: input.stopPrice ?? null,
    targetPrice: input.targetPrice ?? null,
    size: input.size ?? null,
    fees: input.fees ?? 0,
    pnl: input.pnl ?? 0,
    technicalNotes: input.technicalNotes ?? null,
    tags: input.tags ?? null,
  });
}

// ─── Create a journal entry ───────────────────────────────────────────────────

export async function createJournalEntry(input: CreateJournalInput): Promise<void> {
  const db = getDb();

  // Only insert if there's something meaningful to store
  const hasContent =
    input.emotionBefore ||
    input.emotionAfter ||
    input.mistakes ||
    input.lessons ||
    input.freeformNotes ||
    input.confidenceScore != null ||
    input.disciplineScore != null;

  if (!hasContent) return;

  await db.insert(tradeJournal).values({
    id: input.id,
    tradeId: input.tradeId,
    emotionBefore: input.emotionBefore ?? null,
    emotionAfter: input.emotionAfter ?? null,
    mistakes: input.mistakes ?? null,
    lessons: input.lessons ?? null,
    confidenceScore: input.confidenceScore ?? null,
    disciplineScore: input.disciplineScore ?? null,
    freeformNotes: input.freeformNotes ?? null,
  });
}

// ─── Recalculate daily_stats for a given account + day ───────────────────────
// Called after any trade is created/updated/deleted for that day.

export async function recalculateDailyStats(
  accountId: string,
  day: string // YYYY-MM-DD
): Promise<void> {
  const db = getDb();

  const dayTrades = await db
    .select()
    .from(trades)
    .where(
      and(
        eq(trades.accountId, accountId),
        gte(trades.openedAt, day + "T00:00:00"),
        lte(trades.openedAt, day + "T23:59:59")
      )
    );

  if (dayTrades.length === 0) {
    // Remove the stats row if no trades remain
    await db
      .delete(dailyStats)
      .where(and(eq(dailyStats.accountId, accountId), eq(dailyStats.day, day)));
    return;
  }

  const wins  = dayTrades.filter((t) => (t.pnl ?? 0) > 0);
  const losses = dayTrades.filter((t) => (t.pnl ?? 0) < 0);

  const totalPnl     = dayTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const tradeCount   = dayTrades.length;
  const winCount     = wins.length;
  const lossCount    = losses.length;
  const avgWin       = winCount  > 0 ? wins.reduce((s, t)   => s + (t.pnl ?? 0), 0) / winCount  : 0;
  const avgLoss      = lossCount > 0 ? Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0)) / lossCount : 0;
  const winRate      = tradeCount > 0 ? (winCount / tradeCount) * 100 : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * winCount) / (avgLoss * Math.max(lossCount, 1)) : 0;
  const maxDrawdown  = avgLoss;

  const statsId = `ds-${accountId}-${day}`;

  await db
    .insert(dailyStats)
    .values({
      id: statsId,
      accountId,
      day,
      totalPnl,
      tradeCount,
      winCount,
      lossCount,
      avgWin,
      avgLoss,
      winRate,
      profitFactor,
      maxDrawdown,
    })
    .onConflictDoUpdate({
      target: dailyStats.id,
      set: {
        totalPnl,
        tradeCount,
        winCount,
        lossCount,
        avgWin,
        avgLoss,
        winRate,
        profitFactor,
        maxDrawdown,
      },
    });
}
