// ─── Typed query functions for the dashboard ────────────────────────────────
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { getDb } from "./index";
import {
  accounts,
  trades,
  dailyStats,
  quotes,
  appSettings,
} from "./schema";

// ─── Types re-exported for components ────────────────────────────────────────

export type Account = typeof accounts.$inferSelect;
export type Trade = typeof trades.$inferSelect;
export type DailyStat = typeof dailyStats.$inferSelect;
export type Quote = typeof quotes.$inferSelect;

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

// ─── Today's stats ────────────────────────────────────────────────────────────

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

// ─── Recent trades (today) ────────────────────────────────────────────────────

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

// ─── Equity curve (daily balances from daily_stats) ───────────────────────────

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
    .where(
      and(
        eq(dailyStats.accountId, accountId),
        gte(dailyStats.day, sinceStr)
      )
    )
    .orderBy(dailyStats.day);

  // Build running balance from starting balance
  const account = await getAccount(accountId);
  if (!account) return [];

  // Calculate starting balance at the beginning of the window
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

// ─── Calendar days ────────────────────────────────────────────────────────────

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
    .where(
      and(
        eq(dailyStats.accountId, accountId),
        gte(dailyStats.day, sinceStr)
      )
    )
    .orderBy(dailyStats.day);

  return rows.map((row) => ({
    date: row.day,
    pnl: row.totalPnl ?? 0,
    tradeCount: row.tradeCount ?? 0,
  }));
}

// ─── Portfolio (all active accounts) ─────────────────────────────────────────

const ACCOUNT_COLORS = ["#22c55e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899"];

export async function getPortfolio() {
  const db = getDb();
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.isActive, true));

  return rows.map((acc, i) => ({
    name: acc.name,
    value: acc.currentBalance,
    color: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length],
  }));
}

// ─── Quotes ───────────────────────────────────────────────────────────────────

export async function getActiveQuotes(): Promise<
  Array<{ text: string; author: string }>
> {
  const db = getDb();
  const rows = await db
    .select()
    .from(quotes)
    .where(eq(quotes.isActive, true));
  return rows.map((q) => ({ text: q.text, author: q.author }));
}
