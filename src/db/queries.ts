// ─── Typed query functions ────────────────────────────────────────────────────
import { eq, desc, and, gte, lte, lt, sql } from "drizzle-orm";
import { getDb } from "./index";
import {
  accounts,
  trades,
  tradeJournal,
  dailyStats,
  quotes,
  appSettings,
} from "./schema";

// ─── Shared date helper ───────────────────────────────────────────────────────
// Always use LOCAL calendar date (YYYY-MM-DD) so that:
//   - trade.openedAt day (from datetime-local input, local time)
//   - daily_stats.day (written by recalculateDailyStats)
//   - queries filtering by "today" (getTodayStats, getTodayTrades)
// all refer to the same string and never diverge for non-UTC timezones.

export function localDateStr(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Trading day resets at 6pm. Before 6pm the session started yesterday at 18:00.
function tradingDayBounds(): { start: string; end: string } {
  const pad  = (n: number) => String(n).padStart(2, "0");
  const fmtDT = (d: Date, h: number, m: number, s: number) =>
    `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:${pad(s)}`;
  const now   = new Date();
  const start = new Date(now);
  if (now.getHours() < 18) start.setDate(start.getDate() - 1);
  const end   = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: fmtDT(start, 18, 0, 0), end: fmtDT(end, 17, 59, 59) };
}

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

export async function createAccount(data: {
  name: string;
  brokerOrFirm: string;
  startingBalance: number;
  dailyTarget: number;
  accountType: "prop" | "personal" | "challenge";
  brokerUrl?: string;
}): Promise<Account> {
  const db = getDb();
  const id = `acc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await db.insert(accounts).values({
    id,
    name:            data.name,
    brokerOrFirm:    data.brokerOrFirm,
    startingBalance: data.startingBalance,
    currentBalance:  data.startingBalance,
    dailyTarget:     data.dailyTarget,
    accountType:     data.accountType,
    brokerUrl:       data.brokerUrl ?? null,
    isActive:        true,
  });
  return (await getAccount(id))!;
}

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

// ─── Dashboard: all-time account stats ───────────────────────────────────────
// Used for the stat cards: Win Rate, Avg Win, Avg Loss, Profit Factor, Trades.
// Computed live from the trades table — NOT from daily_stats.

export interface AllTimeStats {
  tradeCount:   number;
  winCount:     number;
  lossCount:    number;
  winRate:      number;  // 0-100
  avgWin:       number;
  avgLoss:      number;
  profitFactor: number;
  largestWin:   number;
  largestLoss:  number;
}

export async function getAllTimeStats(accountId: string): Promise<AllTimeStats> {
  const db = getDb();

  const allTrades = await db
    .select({ pnl: trades.pnl })
    .from(trades)
    .where(eq(trades.accountId, accountId));

  const wins   = allTrades.filter((t) => (t.pnl ?? 0) > 0);
  const losses = allTrades.filter((t) => (t.pnl ?? 0) < 0);

  const tradeCount   = allTrades.length;
  const winCount     = wins.length;
  const lossCount    = losses.length;
  const winRate      = tradeCount > 0 ? (winCount / tradeCount) * 100 : 0;
  const avgWin       = winCount  > 0 ? wins.reduce((s, t)   => s + (t.pnl ?? 0), 0) / winCount   : 0;
  const avgLoss      = lossCount > 0 ? Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0)) / lossCount : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * winCount) / (avgLoss * Math.max(lossCount, 1)) : 0;
  const largestWin   = wins.length   > 0 ? Math.max(...wins.map(t => t.pnl ?? 0))                : 0;
  const largestLoss  = losses.length > 0 ? Math.abs(Math.min(...losses.map(t => t.pnl ?? 0)))    : 0;

  return { tradeCount, winCount, lossCount, winRate, avgWin, avgLoss, profitFactor, largestWin, largestLoss };
}

// ─── Dashboard: today's stats — computed LIVE from trades table ───────────────
// Reads directly from trades instead of daily_stats so the dashboard is always
// accurate regardless of whether recalculateDailyStats has run for today yet.

export interface TodayLiveStats {
  totalPnl:    number;
  tradeCount:  number;
  winCount:    number;
  lossCount:   number;
  largestWin:  number;
  largestLoss: number;
}

export async function getTodayLiveStats(accountId: string): Promise<TodayLiveStats> {
  const db     = getDb();
  const today  = localDateStr();
  const rows   = await db
    .select({ pnl: trades.pnl })
    .from(trades)
    .where(
      and(
        eq(trades.accountId, accountId),
        gte(trades.closedAt, today + "T00:00:00"),
        lte(trades.closedAt, today + "T23:59:59")
      )
    );

  const wins   = rows.filter((t) => (t.pnl ?? 0) > 0);
  const losses = rows.filter((t) => (t.pnl ?? 0) < 0);
  return {
    totalPnl:    rows.reduce((s, t) => s + (t.pnl ?? 0), 0),
    tradeCount:  rows.length,
    winCount:    wins.length,
    lossCount:   losses.length,
    largestWin:  wins.length  > 0 ? Math.max(...wins.map(t => t.pnl ?? 0))                   : 0,
    largestLoss: losses.length > 0 ? Math.abs(Math.min(...losses.map(t => t.pnl ?? 0)))       : 0,
  };
}

// Keep the old daily_stats reader for compatibility — used internally by equity curve etc.
export async function getTodayStats(accountId: string) {
  const db = getDb();
  const today = localDateStr();
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
  const today = localDateStr();
  return db
    .select()
    .from(trades)
    .where(
      and(
        eq(trades.accountId, accountId),
        gte(trades.openedAt, today + "T00:00:00"),
        lte(trades.openedAt, today + "T23:59:59")
      )
    )
    .orderBy(desc(trades.closedAt));
}

export async function getTradesByDate(accountId: string, dateStr: string): Promise<Trade[]> {
  const db = getDb();
  return db
    .select()
    .from(trades)
    .where(
      and(
        eq(trades.accountId, accountId),
        gte(trades.closedAt, dateStr + "T00:00:00"),
        lte(trades.closedAt, dateStr + "T23:59:59")
      )
    )
    .orderBy(desc(trades.closedAt));
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
    return {
      date: row.day,   // ISO "YYYY-MM-DD" — components format for display
      balance: runningBalance,
    };
  });
}

// ─── Candle data for equity chart ─────────────────────────────────────────────

export interface Candle {
  time:  string;
  open:  number;
  high:  number;
  low:   number;
  close: number;
}

/** Hourly OHLC of the running account balance for today, built from individual trades. */
export async function getHourlyCandles(accountId: string): Promise<Candle[]> {
  const db       = getDb();
  const account  = await getAccount(accountId);
  if (!account) return [];

  const todayStr = localDateStr();

  const priorRows = await db
    .select({ total: sql<number>`coalesce(sum(${dailyStats.totalPnl}), 0)` })
    .from(dailyStats)
    .where(and(eq(dailyStats.accountId, accountId), lt(dailyStats.day, todayStr)));

  const balanceAtDayStart = account.startingBalance + (priorRows[0]?.total ?? 0);

  const todayTrades = await db
    .select()
    .from(trades)
    .where(and(
      eq(trades.accountId, accountId),
      gte(trades.openedAt, todayStr + "T00:00:00"),
      lte(trades.openedAt, todayStr + "T23:59:59"),
    ))
    .orderBy(trades.openedAt);

  if (todayTrades.length === 0) return [];

  const hourMap = new Map<number, number[]>();
  let running = balanceAtDayStart;

  for (const trade of todayTrades) {
    const hour = new Date(trade.openedAt).getHours();
    if (!hourMap.has(hour)) hourMap.set(hour, [running]);
    running += trade.pnl ?? 0;
    hourMap.get(hour)!.push(running);
  }

  return Array.from(hourMap.keys())
    .sort((a, b) => a - b)
    .map(hour => {
      const balances = hourMap.get(hour)!;
      return {
        time:  `${String(hour).padStart(2, "0")}:00`,
        open:  balances[0],
        high:  Math.max(...balances),
        low:   Math.min(...balances),
        close: balances[balances.length - 1],
      };
    });
}

/** Daily OHLC of the running account balance, with real intra-day wicks from trade sequence. */
export async function getDailyCandles(accountId: string, days: number): Promise<Candle[]> {
  const db      = getDb();
  const account = await getAccount(accountId);
  if (!account) return [];

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);
  const sinceStr = localDateStr(sinceDate);
  const todayStr = localDateStr();

  const priorRows = await db
    .select({ total: sql<number>`coalesce(sum(${dailyStats.totalPnl}), 0)` })
    .from(dailyStats)
    .where(and(eq(dailyStats.accountId, accountId), lt(dailyStats.day, sinceStr)));

  let running = account.startingBalance + (priorRows[0]?.total ?? 0);

  const statRows = await db
    .select()
    .from(dailyStats)
    .where(and(eq(dailyStats.accountId, accountId), gte(dailyStats.day, sinceStr)))
    .orderBy(dailyStats.day);

  if (statRows.length === 0) return [];

  const periodTrades = await db
    .select()
    .from(trades)
    .where(and(
      eq(trades.accountId, accountId),
      gte(trades.openedAt, sinceStr + "T00:00:00"),
      lte(trades.openedAt, todayStr + "T23:59:59"),
    ))
    .orderBy(trades.openedAt);

  const tradesByDay = new Map<string, typeof periodTrades>();
  for (const trade of periodTrades) {
    const day = trade.openedAt.slice(0, 10);
    if (!tradesByDay.has(day)) tradesByDay.set(day, []);
    tradesByDay.get(day)!.push(trade);
  }

  const candles: Candle[] = [];
  for (const stat of statRows) {
    const dayTrades = tradesByDay.get(stat.day) ?? [];
    const balances  = [running];
    for (const t of dayTrades) {
      running += t.pnl ?? 0;
      balances.push(running);
    }
    if (dayTrades.length === 0) {
      running += stat.totalPnl ?? 0;
      balances.push(running);
    }
    const d = new Date(stat.day + "T00:00:00");
    candles.push({
      time:  d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      open:  balances[0],
      high:  Math.max(...balances),
      low:   Math.min(...balances),
      close: balances[balances.length - 1],
    });
  }

  return candles;
}

/** Running balance after each trade for a given day (intraday line chart).
 *  When `date` is today, applies a `hours`-hour trailing window.
 *  When `date` is a past day, shows all trades of that day. */
export async function getIntradayCurve(
  accountId: string,
  hours: number,
  date?: string,
): Promise<Array<{ date: string; balance: number }>> {
  const db      = getDb();
  const account = await getAccount(accountId);
  if (!account) return [];

  const todayStr  = localDateStr();
  const targetStr = date ?? todayStr;
  const isPastDay = targetStr < todayStr;

  const priorRows = await db
    .select({ total: sql<number>`coalesce(sum(${dailyStats.totalPnl}), 0)` })
    .from(dailyStats)
    .where(and(eq(dailyStats.accountId, accountId), lt(dailyStats.day, targetStr)));

  let running = account.startingBalance + (priorRows[0]?.total ?? 0);

  const allDayTrades = await db
    .select()
    .from(trades)
    .where(and(eq(trades.accountId, accountId), gte(trades.closedAt, targetStr + "T00:00:00"), lte(trades.closedAt, targetStr + "T23:59:59")))
    .orderBy(trades.closedAt);

  if (allDayTrades.length === 0) return [];

  // For past days show all trades; for today apply the hours window
  if (isPastDay) {
    const points: Array<{ date: string; balance: number }> = [];
    for (const t of allDayTrades) {
      running += t.pnl ?? 0;
      points.push({ date: (t.closedAt ?? t.openedAt).slice(11, 16), balance: running });
    }
    return points;
  }

  const windowStart    = new Date(Date.now() - hours * 60 * 60 * 1000);
  const windowStartStr = windowStart.toISOString().slice(0, 19);

  const inWindow: typeof allDayTrades = [];
  for (const t of allDayTrades) {
    const closeStr = (t.closedAt ?? t.openedAt).slice(0, 19);
    if (closeStr < windowStartStr) running += t.pnl ?? 0;
    else inWindow.push(t);
  }

  if (inWindow.length === 0) return [];

  const points: Array<{ date: string; balance: number }> = [
    { date: windowStartStr.slice(11, 16), balance: running },
  ];
  for (const t of inWindow) {
    running += t.pnl ?? 0;
    points.push({ date: (t.closedAt ?? t.openedAt).slice(11, 16), balance: running });
  }
  return points;
}

/** 15-minute OHLC candles of today's running balance, built from individual trades. */
export async function get15MinCandles(accountId: string): Promise<Candle[]> {
  const db      = getDb();
  const account = await getAccount(accountId);
  if (!account) return [];

  const todayStr = localDateStr();

  const priorRows = await db
    .select({ total: sql<number>`coalesce(sum(${dailyStats.totalPnl}), 0)` })
    .from(dailyStats)
    .where(and(eq(dailyStats.accountId, accountId), lt(dailyStats.day, todayStr)));

  const balanceAtDayStart = account.startingBalance + (priorRows[0]?.total ?? 0);

  const todayTrades = await db
    .select()
    .from(trades)
    .where(and(
      eq(trades.accountId, accountId),
      gte(trades.openedAt, todayStr + "T00:00:00"),
      lte(trades.openedAt, todayStr + "T23:59:59"),
    ))
    .orderBy(trades.closedAt);

  if (todayTrades.length === 0) return [];

  const bucketMap = new Map<string, number[]>();
  let running = balanceAtDayStart;

  for (const trade of todayTrades) {
    const closeTime = new Date(trade.closedAt ?? trade.openedAt);
    const h = closeTime.getHours();
    const m = Math.floor(closeTime.getMinutes() / 15) * 15;
    const key = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    if (!bucketMap.has(key)) bucketMap.set(key, [running]);
    running += trade.pnl ?? 0;
    bucketMap.get(key)!.push(running);
  }

  return Array.from(bucketMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, balances]) => ({
      time:  key,
      open:  balances[0],
      high:  Math.max(...balances),
      low:   Math.min(...balances),
      close: balances[balances.length - 1],
    }));
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

const ACCOUNT_COLORS = ["#8fd63e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899"];

export async function getPortfolio() {
  const db = getDb();
  const rows = await db.select().from(accounts).where(eq(accounts.isActive, true));
  return rows.map((acc, i) => ({
    name: acc.name,
    value: acc.currentBalance,
    color: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length],
  }));
}

// ─── Dashboard: monthly stats — same shape as AllTimeStats, current month ─────

export async function getMonthlyStats(accountId: string): Promise<AllTimeStats> {
  const db  = getDb();
  const now  = new Date();
  const year = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, "0");
  // SQLite stores datetimes as "YYYY-MM-DDTHH:MM:SS" local strings — use 31 as
  // a safe upper bound (lexicographically greater than any valid day in the month)
  const start = `${year}-${mm}-01T00:00:00`;
  const end   = `${year}-${mm}-31T23:59:59`;

  const rows = await db
    .select({ pnl: trades.pnl })
    .from(trades)
    .where(and(eq(trades.accountId, accountId), gte(trades.openedAt, start), lte(trades.openedAt, end)));

  const wins   = rows.filter((t) => (t.pnl ?? 0) > 0);
  const losses = rows.filter((t) => (t.pnl ?? 0) < 0);
  const tradeCount   = rows.length;
  const winCount     = wins.length;
  const lossCount    = losses.length;
  const winRate      = tradeCount > 0 ? (winCount / tradeCount) * 100 : 0;
  const avgWin       = winCount  > 0 ? wins.reduce((s, t)   => s + (t.pnl ?? 0), 0) / winCount   : 0;
  const avgLoss      = lossCount > 0 ? Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0)) / lossCount : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * winCount) / (avgLoss * Math.max(lossCount, 1)) : 0;
  const largestWin   = wins.length   > 0 ? Math.max(...wins.map(t => t.pnl ?? 0))                : 0;
  const largestLoss  = losses.length > 0 ? Math.abs(Math.min(...losses.map(t => t.pnl ?? 0)))    : 0;
  return { tradeCount, winCount, lossCount, winRate, avgWin, avgLoss, profitFactor, largestWin, largestLoss };
}

// ─── Dashboard: weekly stats — AllTimeStats shape, current Mon–Sun week ──────

export async function getWeeklyStats(accountId: string): Promise<AllTimeStats> {
  const db  = getDb();
  const now  = new Date();
  const day  = now.getDay(); // 0=Sun
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const mon  = new Date(now); mon.setDate(now.getDate() + diffToMon); mon.setHours(0, 0, 0, 0);
  const sun  = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999);
  const pad  = (n: number) => String(n).padStart(2, "0");
  const fmt  = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  const rows = await db
    .select({ pnl: trades.pnl })
    .from(trades)
    .where(and(eq(trades.accountId, accountId), gte(trades.openedAt, fmt(mon)), lte(trades.openedAt, fmt(sun))));

  const wins   = rows.filter((t) => (t.pnl ?? 0) > 0);
  const losses = rows.filter((t) => (t.pnl ?? 0) < 0);
  const tradeCount   = rows.length;
  const winCount     = wins.length;
  const lossCount    = losses.length;
  const winRate      = tradeCount > 0 ? (winCount / tradeCount) * 100 : 0;
  const avgWin       = winCount  > 0 ? wins.reduce((s, t)   => s + (t.pnl ?? 0), 0) / winCount   : 0;
  const avgLoss      = lossCount > 0 ? Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0)) / lossCount : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * winCount) / (avgLoss * Math.max(lossCount, 1)) : 0;
  const largestWin   = wins.length   > 0 ? Math.max(...wins.map(t => t.pnl ?? 0))             : 0;
  const largestLoss  = losses.length > 0 ? Math.abs(Math.min(...losses.map(t => t.pnl ?? 0))) : 0;
  return { tradeCount, winCount, lossCount, winRate, avgWin, avgLoss, profitFactor, largestWin, largestLoss };
}

// ─── Dashboard: today full stats — AllTimeStats shape, current day only ───────

export async function getTodayFullStats(accountId: string): Promise<AllTimeStats> {
  const db    = getDb();
  const today = localDateStr();
  const rows  = await db
    .select({ pnl: trades.pnl })
    .from(trades)
    .where(and(
      eq(trades.accountId, accountId),
      gte(trades.openedAt, today + "T00:00:00"),
      lte(trades.openedAt, today + "T23:59:59"),
    ));

  const wins   = rows.filter((t) => (t.pnl ?? 0) > 0);
  const losses = rows.filter((t) => (t.pnl ?? 0) < 0);
  const tradeCount   = rows.length;
  const winCount     = wins.length;
  const lossCount    = losses.length;
  const winRate      = tradeCount > 0 ? (winCount / tradeCount) * 100 : 0;
  const avgWin       = winCount  > 0 ? wins.reduce((s, t)   => s + (t.pnl ?? 0), 0) / winCount   : 0;
  const avgLoss      = lossCount > 0 ? Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0)) / lossCount : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * winCount) / (avgLoss * Math.max(lossCount, 1)) : 0;
  const largestWin   = wins.length   > 0 ? Math.max(...wins.map(t => t.pnl ?? 0))                : 0;
  const largestLoss  = losses.length > 0 ? Math.abs(Math.min(...losses.map(t => t.pnl ?? 0)))    : 0;
  return { tradeCount, winCount, lossCount, winRate, avgWin, avgLoss, profitFactor, largestWin, largestLoss };
}

// ─── Dashboard: quotes ────────────────────────────────────────────────────────

export async function getActiveQuotes(): Promise<Array<{ text: string; author: string }>> {
  const db = getDb();
  const rows = await db.select().from(quotes).where(eq(quotes.isActive, true));
  return rows.map((q) => ({ text: q.text, author: q.author }));
}

export async function getAllQuotes(): Promise<Array<{ id: number; text: string; author: string; isActive: boolean }>> {
  const db = getDb();
  const rows = await db.select().from(quotes).orderBy(quotes.id);
  return rows.map((q) => ({ id: q.id, text: q.text, author: q.author, isActive: q.isActive }));
}

export async function addQuote(text: string, author: string): Promise<void> {
  const db = getDb();
  await db.insert(quotes).values({ text, author, isActive: true });
}

export async function deleteQuote(id: number): Promise<void> {
  const db = getDb();
  await db.delete(quotes).where(eq(quotes.id, id));
}

export async function updateQuote(id: number, text: string, author: string): Promise<void> {
  const db = getDb();
  await db.update(quotes).set({ text, author }).where(eq(quotes.id, id));
}

// ─── Export: all trades across all accounts as CSV ────────────────────────────

export async function getAllTradesForExport(): Promise<TradeWithJournal[]> {
  const db = getDb();

  const tradeRows = await db
    .select()
    .from(trades)
    .orderBy(desc(trades.closedAt));

  if (tradeRows.length === 0) return [];

  const tradeIds = tradeRows.map((t) => t.id);
  const allJournals = await db
    .select()
    .from(tradeJournal)
    .where(
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
    .orderBy(desc(trades.closedAt));

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
  exitPrice?: number;
  size?: number;
  fees?: number;
  pnl?: number;
  technicalNotes?: string;
  tags?: string;
  tradeRef?: string;
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
    exitPrice: input.exitPrice ?? null,
    size: input.size ?? null,
    fees: input.fees ?? 0,
    pnl: input.pnl ?? 0,
    technicalNotes: input.technicalNotes ?? null,
    tags: input.tags ?? null,
    tradeRef: input.tradeRef ?? null,
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

// ─── Update a trade ──────────────────────────────────────────────────────────

export async function updateTrade(
  id: string,
  input: Omit<CreateTradeInput, "id" | "accountId">
): Promise<void> {
  const db = getDb();
  await db
    .update(trades)
    .set({
      openedAt:       input.openedAt,
      closedAt:       input.closedAt ?? null,
      instrument:     input.instrument,
      side:           input.side,
      setupName:      input.setupName ?? null,
      entryPrice:     input.entryPrice ?? null,
      stopPrice:      input.stopPrice ?? null,
      targetPrice:    input.targetPrice ?? null,
      exitPrice:      input.exitPrice ?? null,
      size:           input.size ?? null,
      fees:           input.fees ?? 0,
      pnl:            input.pnl ?? 0,
      technicalNotes: input.technicalNotes ?? null,
      tags:           input.tags ?? null,
      tradeRef:       input.tradeRef ?? null,
    })
    .where(eq(trades.id, id));
}

// ─── Upsert (create or update) a journal entry for an existing trade ─────────

export async function upsertJournalEntry(
  tradeId: string,
  existingJournalId: string | null,
  input: Omit<CreateJournalInput, "id" | "tradeId">
): Promise<void> {
  const db = getDb();

  const hasContent =
    input.emotionBefore  || input.emotionAfter  ||
    input.mistakes       || input.lessons        ||
    input.freeformNotes  ||
    input.confidenceScore != null || input.disciplineScore != null;

  if (!hasContent) {
    // Remove journal if it existed and is now empty
    if (existingJournalId) {
      await db.delete(tradeJournal).where(eq(tradeJournal.id, existingJournalId));
    }
    return;
  }

  if (existingJournalId) {
    await db
      .update(tradeJournal)
      .set({
        emotionBefore:   input.emotionBefore   ?? null,
        emotionAfter:    input.emotionAfter     ?? null,
        mistakes:        input.mistakes         ?? null,
        lessons:         input.lessons          ?? null,
        confidenceScore: input.confidenceScore  ?? null,
        disciplineScore: input.disciplineScore  ?? null,
        freeformNotes:   input.freeformNotes    ?? null,
      })
      .where(eq(tradeJournal.id, existingJournalId));
  } else {
    const newId = `j-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await db.insert(tradeJournal).values({
      id:              newId,
      tradeId,
      emotionBefore:   input.emotionBefore   ?? null,
      emotionAfter:    input.emotionAfter     ?? null,
      mistakes:        input.mistakes         ?? null,
      lessons:         input.lessons          ?? null,
      confidenceScore: input.confidenceScore  ?? null,
      disciplineScore: input.disciplineScore  ?? null,
      freeformNotes:   input.freeformNotes    ?? null,
    });
  }
}

// ─── Delete a single trade + its journal entry ────────────────────────────────
// Returns the { accountId, day } so the caller can recalculate stats.

export async function deleteTradeById(
  tradeId: string
): Promise<{ accountId: string; day: string } | null> {
  const db = getDb();

  const rows = await db.select().from(trades).where(eq(trades.id, tradeId)).limit(1);
  if (rows.length === 0) return null;
  const trade = rows[0];
  const day   = (trade.closedAt ?? trade.openedAt).slice(0, 10); // "YYYY-MM-DD"

  // Delete journal first (FK order)
  await db.delete(tradeJournal).where(eq(tradeJournal.tradeId, tradeId));
  await db.delete(trades).where(eq(trades.id, tradeId));

  return { accountId: trade.accountId, day };
}

// ─── Clear ALL trades (+ journals + daily_stats) for an account ───────────────
// Dev/testing only — resets the account balance back to starting balance.

export async function clearAllTradesForAccount(accountId: string): Promise<void> {
  const db = getDb();

  // Get all trade IDs for FK-safe journal deletion
  const accountTrades = await db
    .select({ id: trades.id })
    .from(trades)
    .where(eq(trades.accountId, accountId));

  if (accountTrades.length > 0) {
    const ids = accountTrades.map((t) => t.id);
    await db.delete(tradeJournal).where(
      sql`${tradeJournal.tradeId} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`
    );
    await db.delete(trades).where(eq(trades.accountId, accountId));
  }

  // Remove all daily_stats for this account
  await db.delete(dailyStats).where(eq(dailyStats.accountId, accountId));

  // Reset current_balance to starting_balance
  const account = await getAccount(accountId);
  if (account) {
    await db
      .update(accounts)
      .set({ currentBalance: account.startingBalance })
      .where(eq(accounts.id, accountId));
  }
}

// ─── Update account current_balance from actual trade PnL ────────────────────
// Recomputes: starting_balance + SUM(pnl) across all trades for that account.
// Must be called after any trade is created, updated, or deleted.

export async function updateAccountBalance(accountId: string): Promise<void> {
  const db = getDb();

  const allTrades = await db
    .select({ pnl: trades.pnl })
    .from(trades)
    .where(eq(trades.accountId, accountId));

  const account = await getAccount(accountId);
  if (!account) return;

  const totalPnl       = allTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const newBalance     = account.startingBalance + totalPnl;

  console.log("[updateAccountBalance] accountId:", accountId, "totalPnl:", totalPnl, "newBalance:", newBalance);

  await db
    .update(accounts)
    .set({ currentBalance: newBalance })
    .where(eq(accounts.id, accountId));
}

// ─── Rebuild ALL daily_stats from scratch using closedAt dates ───────────────
// Run once on boot to migrate stale openedAt-based stats rows.

export async function rebuildAllDailyStats(): Promise<void> {
  const db = getDb();

  // Get all accounts
  const allAccounts = await db.select({ id: accounts.id }).from(accounts);

  for (const { id: accountId } of allAccounts) {
    // Delete all existing stats for this account
    await db.delete(dailyStats).where(eq(dailyStats.accountId, accountId));

    // Get all trades, grouped by closedAt date (fall back to openedAt if no closedAt)
    const allTrades = await db
      .select({ closedAt: trades.closedAt, openedAt: trades.openedAt })
      .from(trades)
      .where(eq(trades.accountId, accountId));

    const uniqueDays = new Set<string>();
    for (const t of allTrades) {
      uniqueDays.add((t.closedAt ?? t.openedAt).slice(0, 10));
    }

    for (const day of uniqueDays) {
      await recalculateDailyStats(accountId, day);
    }

    await updateAccountBalance(accountId);
  }
}

// ─── Recalculate daily_stats for a given account + day ───────────────────────
// Called after any trade is created/updated/deleted for that day.

export async function recalculateDailyStats(
  accountId: string,
  day: string // YYYY-MM-DD local date
): Promise<void> {
  const db = getDb();

  console.log("[recalculateDailyStats] accountId:", accountId, "day:", day);

  // Bounds without Z — trades stored as local datetime strings
  // Use closedAt so trades appear on the calendar date they were closed
  const dayTrades = await db
    .select()
    .from(trades)
    .where(
      and(
        eq(trades.accountId, accountId),
        gte(trades.closedAt, day + "T00:00:00"),
        lte(trades.closedAt, day + "T23:59:59")
      )
    );

  console.log("[recalculateDailyStats] found", dayTrades.length, "trades for", day);

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

  // Delete any existing row for this (accountId, day) — including rows whose id
  // was generated with a different pattern (e.g. old seed used "ds-acc1-" without
  // the accountId hyphen). This prevents duplicate rows returning stale values.
  await db
    .delete(dailyStats)
    .where(and(eq(dailyStats.accountId, accountId), eq(dailyStats.day, day)));

  const statsId = `ds-${accountId}-${day}`;

  await db.insert(dailyStats).values({
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
  });
}
