// ─── Demo data seeder — Phase 2 ──────────────────────────────────────────────
// Runs once on first launch if the DB is empty.
// Shared promise guards against React StrictMode double-invocation.

import { getDb } from "./index";
import { accounts, trades, tradeJournal, dailyStats, quotes, appSettings } from "./schema";

let _seedPromise: Promise<void> | null = null;

export function seedIfEmpty(): Promise<void> {
  if (!_seedPromise) {
    _seedPromise = doSeed().catch((err) => {
      _seedPromise = null;
      throw err;
    });
  }
  return _seedPromise;
}

// ─── Dev-only reset ──────────────────────────────────────────────────────────
// Open DevTools console and run:  localStorage.setItem('tm_reset_db', '1')
// then reload. Clears all tables before seed so first-run can be re-tested
// without deleting the file manually.  Auto-clears the flag after one use.
async function devResetIfRequested(): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  const flag =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("tm_reset_db")
      : null;
  if (!flag) return false;

  console.warn("[seed] DEV RESET requested — clearing all tables …");
  const db = getDb();
  // Delete in FK-safe order
  await db.delete(tradeJournal);
  await db.delete(dailyStats);
  await db.delete(trades);
  await db.delete(appSettings);
  await db.delete(accounts);
  localStorage.removeItem("tm_reset_db");
  console.warn("[seed] DEV RESET complete.");
  return true;
}

// ─── Main seed function ───────────────────────────────────────────────────────
async function doSeed(): Promise<void> {
  const db = getDb();

  await devResetIfRequested();

  console.log("[seed] Checking if DB is empty …");
  const existing = await db.select().from(accounts).limit(1);
  if (existing.length > 0) {
    console.log("[seed] Already seeded — skipping.");
    return;
  }

  console.log("[seed] DB is empty. Starting seed …");

  // ── Accounts ─────────────────────────────────────────────────────────────────
  const accountRows = [
    {
      id: "acc-1",
      name: "FTMO Challenge",
      brokerOrFirm: "FTMO",
      startingBalance: 100_000,
      currentBalance: 102_340,
      dailyTarget: 1_000,
      accountType: "challenge" as const,
      brokerUrl: "https://mt5demo.ftmo.oanda.com/?_gl=1*rjsr60*_gcl_au*MTA0MTkzMzMzMy4xNzc1MDI2NDM5LjYzNDcxMjg0Ny4xNzc1MDI2NDczLjE3NzUwMjY1MTQ.*trader_oanda_ga*MTA2MTUxODQwNi4xNzc1MDI2NDM5*trader_oanda_ga_K8N84T0NCP*czE3NzUwMjY0NTckbzEkZzEkdDE3NzUwMjY3NzMkajIkbDAkaDA.*_ga*MTA2MTUxODQwNi4xNzc1MDI2NDM5*_ga_QNHG9RT9Q8*czE3NzUwMjY0MzkkbzEkZzEkdDE3NzUwMjY3ODYkajQ0JGwwJGgw",
      isActive: true,
    },
    {
      id: "acc-2",
      name: "E8 Funded",
      brokerOrFirm: "E8 Markets",
      startingBalance: 50_000,
      currentBalance: 48_750,
      dailyTarget: 500,
      accountType: "prop" as const,
      brokerUrl: "https://e8x.e8markets.com/account-overview/forex",
      isActive: true,
    },
    {
      id: "acc-3",
      name: "Personal — OANDA",
      brokerOrFirm: "OANDA",
      startingBalance: 10_000,
      currentBalance: 12_100,
      dailyTarget: 200,
      accountType: "personal" as const,
      isActive: true,
    },
  ];

  // Log what will be sent so we can confirm boolean → integer coercion
  console.log("[seed] → accounts (sample row keys):", Object.keys(accountRows[0]));
  console.log("[seed] → accounts isActive type:", typeof accountRows[0].isActive, "value:", accountRows[0].isActive);

  await db.insert(accounts).values(accountRows);
  console.log("[seed] ✓ accounts inserted");

  // ── App settings ─────────────────────────────────────────────────────────────
  console.log("[seed] → app_settings");
  await db.insert(appSettings).values({
    id: 1,
    selectedAccountId: "acc-1",
    themeMode: "auto",
    lastOpenedPage: "dashboard",
  });
  console.log("[seed] ✓ app_settings inserted");

  // ── 3 months of trade history (Jan 15 – Apr 15, 2026) ────────────────────────
  // Every weekday gets exactly 2 trades. Daily stats derived from those trades.
  console.log("[seed] → 3-month trade history");

  const INSTRUMENTS = ["EUR/USD", "GBP/USD", "NAS100", "GBP/JPY", "USD/JPY", "GOLD", "US30"];
  const SETUPS = [
    "London Open Break", "Rejection Wick", "Break & Retest", "Fib Retracement",
    "Order Block", "Fair Value Gap", "Liquidity Sweep", "NY Session Open",
  ];

  // Fixed cycle of [morning pnl, afternoon pnl] per day — varied but deterministic
  const PNL_CYCLE: [number, number][] = [
    [ 342, -187], [ 521,  298], [-142,  415], [ 267, -231], [ 523, -221],
    [ 478,  312], [-167,  543], [ 291, -213], [ 467, -156], [ 334,  289],
    [ 389, -198], [ 610,  -95], [-230,  480], [ 315,  175], [ 540,  -88],
    [-175,  380], [ 425,  260], [ 193, -140], [ 680,  -55], [ 310,  490],
    [-220,  355], [ 445,  -72], [ 275,  510], [-185,  430], [ 365,  210],
    [ 590,  -65], [-145,  420], [ 325,  480], [ 155,  -90], [ 475,  335],
    [-200,  390], [ 555,  -78], [ 285,  330], [-165,  445], [ 398,  220],
    [ 512,  -88], [-138,  465], [ 348,  282], [ 175, -112], [ 530,  -65],
    [-195,  415], [ 440,  275], [ 268, -155], [ 610,  -92], [ 385,  230],
    [ 455,  -82], [-170,  490], [ 325,  368], [ 190, -125], [ 572,  -45],
    [-215,  435], [ 468,  295], [ 238, -148], [ 645,  -98], [ 395,  248],
    [ 478,  -75], [-158,  510], [ 362,  315], [ 205, -118], [ 545,  -58],
    [-205,  452], [ 492,  285], [ 248, -162], [ 628,  -85], [ 412,  255],
  ];

  const allTrades:     (typeof trades.$inferInsert)[]     = [];
  const allDailyStats: (typeof dailyStats.$inferInsert)[] = [];

  const rangeStart = new Date(Date.UTC(2026, 0, 15)); // Jan 15
  const rangeEnd   = new Date(Date.UTC(2026, 3, 15)); // Apr 15

  let dayIndex = 0;
  let tradeNum = 1;

  for (let d = new Date(rangeStart); d <= rangeEnd; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;

    const dateStr       = d.toISOString().split("T")[0];
    const [pnl1, pnl2]  = PNL_CYCLE[dayIndex % PNL_CYCLE.length];
    const instr1        = INSTRUMENTS[(dayIndex * 3)     % INSTRUMENTS.length];
    const instr2        = INSTRUMENTS[(dayIndex * 5 + 2) % INSTRUMENTS.length];
    const setup1        = SETUPS[(dayIndex * 2)     % SETUPS.length];
    const setup2        = SETUPS[(dayIndex * 3 + 1) % SETUPS.length];
    dayIndex++;

    allTrades.push(
      { id: `t-3m-${tradeNum++}`, accountId: "acc-1", openedAt: `${dateStr}T08:10:00Z`, closedAt: `${dateStr}T08:52:00Z`, instrument: instr1, side: pnl1 > 0 ? "long" : "short", setupName: setup1, size: 1.5, pnl: pnl1, fees: 0 },
      { id: `t-3m-${tradeNum++}`, accountId: "acc-1", openedAt: `${dateStr}T10:30:00Z`, closedAt: `${dateStr}T11:15:00Z`, instrument: instr2, side: pnl2 > 0 ? "long" : "short", setupName: setup2, size: 1.0, pnl: pnl2, fees: 0 },
    );

    const wins    = [pnl1, pnl2].filter(p => p > 0);
    const losses  = [pnl1, pnl2].filter(p => p < 0);
    const sumWins = wins.reduce((a, b) => a + b, 0);
    const sumLoss = losses.reduce((a, b) => a + Math.abs(b), 0);

    allDailyStats.push({
      id:           `ds-3m-${dateStr}`,
      accountId:    "acc-1",
      day:          dateStr,
      totalPnl:     pnl1 + pnl2,
      tradeCount:   2,
      winCount:     wins.length,
      lossCount:    losses.length,
      avgWin:       wins.length  > 0 ? sumWins / wins.length   : 0,
      avgLoss:      losses.length > 0 ? sumLoss / losses.length : 0,
      winRate:      wins.length * 50,
      profitFactor: sumLoss > 0 ? sumWins / sumLoss : sumWins > 0 ? 99 : 0,
      maxDrawdown:  losses.length > 0 ? sumLoss / losses.length : 0,
    });
  }

  await db.insert(trades).values(allTrades);
  await db.insert(dailyStats).values(allDailyStats).onConflictDoNothing();
  console.log("[seed] ✓ 3-month trades:", allTrades.length, "/ daily_stats:", allDailyStats.length);

  // ── 20 trades across the last 48 hours (Apr 14–15, 2026) ────────────────────
  console.log("[seed] → 48h trades");
  await db.insert(trades).values([
    // Apr 14 — morning
    { id: "t-48h1",  accountId: "acc-1", openedAt: "2026-04-14T07:05:00Z", closedAt: "2026-04-14T07:38:00Z", instrument: "EUR/USD", side: "long",  setupName: "London Open Break", size: 2.0, pnl:  312, fees: 0 },
    { id: "t-48h2",  accountId: "acc-1", openedAt: "2026-04-14T08:20:00Z", closedAt: "2026-04-14T08:55:00Z", instrument: "GBP/USD", side: "short", setupName: "Rejection Wick",    size: 1.5, pnl: -148, fees: 0 },
    { id: "t-48h3",  accountId: "acc-1", openedAt: "2026-04-14T09:10:00Z", closedAt: "2026-04-14T09:52:00Z", instrument: "GOLD",    side: "long",  setupName: "Order Block",        size: 1.0, pnl:  476, fees: 0 },
    { id: "t-48h4",  accountId: "acc-1", openedAt: "2026-04-14T10:30:00Z", closedAt: "2026-04-14T11:05:00Z", instrument: "NAS100",  side: "long",  setupName: "Break & Retest",    size: 0.5, pnl:  389, fees: 0 },
    // Apr 14 — midday
    { id: "t-48h5",  accountId: "acc-1", openedAt: "2026-04-14T11:45:00Z", closedAt: "2026-04-14T12:20:00Z", instrument: "USD/JPY", side: "short", setupName: "Fair Value Gap",     size: 1.5, pnl: -203, fees: 0 },
    { id: "t-48h6",  accountId: "acc-1", openedAt: "2026-04-14T13:00:00Z", closedAt: "2026-04-14T13:44:00Z", instrument: "GBP/JPY", side: "long",  setupName: "Fib Retracement",   size: 1.0, pnl:  267, fees: 0 },
    { id: "t-48h7",  accountId: "acc-1", openedAt: "2026-04-14T14:15:00Z", closedAt: "2026-04-14T14:58:00Z", instrument: "EUR/USD", side: "short", setupName: "NY Session Open",    size: 2.0, pnl:  431, fees: 0 },
    // Apr 14 — afternoon
    { id: "t-48h8",  accountId: "acc-1", openedAt: "2026-04-14T15:30:00Z", closedAt: "2026-04-14T16:10:00Z", instrument: "US30",    side: "long",  setupName: "Liquidity Sweep",   size: 0.5, pnl: -175, fees: 0 },
    { id: "t-48h9",  accountId: "acc-1", openedAt: "2026-04-14T17:00:00Z", closedAt: "2026-04-14T17:40:00Z", instrument: "NAS100",  side: "short", setupName: "Order Block",        size: 0.5, pnl:  358, fees: 0 },
    { id: "t-48h10", accountId: "acc-1", openedAt: "2026-04-14T18:20:00Z", closedAt: "2026-04-14T18:55:00Z", instrument: "GOLD",    side: "short", setupName: "Rejection Wick",    size: 1.0, pnl: -122, fees: 0 },
    // Apr 15 — morning
    { id: "t-48h11", accountId: "acc-1", openedAt: "2026-04-15T07:10:00Z", closedAt: "2026-04-15T07:48:00Z", instrument: "GBP/USD", side: "long",  setupName: "London Open Break", size: 2.0, pnl:  524, fees: 0 },
    { id: "t-48h12", accountId: "acc-1", openedAt: "2026-04-15T08:25:00Z", closedAt: "2026-04-15T09:05:00Z", instrument: "EUR/USD", side: "long",  setupName: "Fair Value Gap",     size: 1.5, pnl:  298, fees: 0 },
    { id: "t-48h13", accountId: "acc-1", openedAt: "2026-04-15T09:40:00Z", closedAt: "2026-04-15T10:15:00Z", instrument: "USD/JPY", side: "short", setupName: "Break & Retest",    size: 1.0, pnl: -187, fees: 0 },
    { id: "t-48h14", accountId: "acc-1", openedAt: "2026-04-15T10:50:00Z", closedAt: "2026-04-15T11:28:00Z", instrument: "GBP/JPY", side: "long",  setupName: "Order Block",        size: 1.5, pnl:  412, fees: 0 },
    // Apr 15 — midday
    { id: "t-48h15", accountId: "acc-1", openedAt: "2026-04-15T11:55:00Z", closedAt: "2026-04-15T12:35:00Z", instrument: "NAS100",  side: "long",  setupName: "NY Session Open",    size: 0.5, pnl:  347, fees: 0 },
    { id: "t-48h16", accountId: "acc-1", openedAt: "2026-04-15T13:10:00Z", closedAt: "2026-04-15T13:50:00Z", instrument: "GOLD",    side: "long",  setupName: "Fib Retracement",   size: 1.0, pnl:  289, fees: 0 },
    { id: "t-48h17", accountId: "acc-1", openedAt: "2026-04-15T14:20:00Z", closedAt: "2026-04-15T15:00:00Z", instrument: "EUR/USD", side: "short", setupName: "Liquidity Sweep",   size: 2.0, pnl: -164, fees: 0 },
    // Apr 15 — afternoon
    { id: "t-48h18", accountId: "acc-1", openedAt: "2026-04-15T15:35:00Z", closedAt: "2026-04-15T16:15:00Z", instrument: "US30",    side: "long",  setupName: "Rejection Wick",    size: 0.5, pnl:  378, fees: 0 },
    { id: "t-48h19", accountId: "acc-1", openedAt: "2026-04-15T17:00:00Z", closedAt: "2026-04-15T17:42:00Z", instrument: "GBP/USD", side: "short", setupName: "Order Block",        size: 1.5, pnl:  445, fees: 0 },
    { id: "t-48h20", accountId: "acc-1", openedAt: "2026-04-15T18:30:00Z", closedAt: "2026-04-15T19:05:00Z", instrument: "NAS100",  side: "short", setupName: "Fair Value Gap",     size: 0.5, pnl: -139, fees: 0 },
  ]);

  // Daily stats for the 48h trades
  await db.insert(dailyStats).values([
    { id: "ds-48h-2026-04-14", accountId: "acc-1", day: "2026-04-14", totalPnl: 1508, tradeCount: 10, winCount: 7, lossCount: 3, avgWin: 376, avgLoss: 183, winRate: 70, profitFactor: 4.80, maxDrawdown: 183 },
    { id: "ds-48h-2026-04-15", accountId: "acc-1", day: "2026-04-15", totalPnl: 1803, tradeCount: 10, winCount: 7, lossCount: 3, avgWin: 385, avgLoss: 163, winRate: 70, profitFactor: 5.52, maxDrawdown: 163 },
  ]).onConflictDoNothing();
  console.log("[seed] ✓ 48h trades inserted: 20");

  // ── Quotes — only seed if table is empty (preserves user-added quotes) ───────
  console.log("[seed] → quotes");
  const existingQuotes = await db.select().from(quotes).limit(1);
  if (existingQuotes.length > 0) {
    console.log("[seed] ✓ quotes already exist — skipping to preserve user data");
  } else {
  await db.insert(quotes).values([
    {
      text: "The goal of a successful trader is to make the best trades. Money is secondary.",
      author: "Alexander Elder",
      category: "mindset",
      isActive: true,
    },
    {
      text: "Risk comes from not knowing what you're doing.",
      author: "Warren Buffett",
      category: "risk",
      isActive: true,
    },
    {
      text: "The market is a device for transferring money from the impatient to the patient.",
      author: "Warren Buffett",
      category: "psychology",
      isActive: true,
    },
    {
      text: "In trading, the only certainty is uncertainty. Your edge is how you handle it.",
      author: "Mark Douglas",
      category: "psychology",
      isActive: true,
    },
    {
      text: "Amateurs think about how much money they can make. Professionals think about how much money they could lose.",
      author: "Jack Schwager",
      category: "risk",
      isActive: true,
    },
    {
      text: "Every loss is tuition paid at the school of experience.",
      author: "Unknown",
      category: "mindset",
      isActive: true,
    },
    {
      text: "Do not focus on making money; focus on protecting what you have.",
      author: "Paul Tudor Jones",
      category: "risk",
      isActive: true,
    },
  ]);
  console.log("[seed] ✓ quotes inserted");
  } // end else (quotes were empty)

  console.log("[seed] ✓ All demo data seeded successfully.");
}
