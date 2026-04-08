// ─── Demo data seeder — Phase 2 ──────────────────────────────────────────────
// Runs once on first launch if the DB is empty.
// Shared promise guards against React StrictMode double-invocation.

import { getDb } from "./index";
import { accounts, trades, dailyStats, quotes, appSettings } from "./schema";

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
  await db.delete(quotes);
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

  // ── Trades ───────────────────────────────────────────────────────────────────
  console.log("[seed] → trades");
  const today = "2026-04-08";
  await db.insert(trades).values([
    {
      id: "t-1",
      accountId: "acc-1",
      openedAt: `${today}T08:12:00Z`,
      closedAt: `${today}T08:47:00Z`,
      instrument: "EUR/USD",
      side: "long" as const,
      setupName: "London Open Break",
      size: 2.0,
      pnl: 523,
      fees: 0,
    },
    {
      id: "t-2",
      accountId: "acc-1",
      openedAt: `${today}T09:05:00Z`,
      closedAt: `${today}T09:22:00Z`,
      instrument: "GBP/USD",
      side: "short" as const,
      setupName: "Rejection Wick",
      size: 1.5,
      pnl: -221,
      fees: 0,
    },
    {
      id: "t-3",
      accountId: "acc-1",
      openedAt: `${today}T10:14:00Z`,
      closedAt: `${today}T10:51:00Z`,
      instrument: "NAS100",
      side: "long" as const,
      setupName: "Break & Retest",
      size: 0.5,
      pnl: 451,
      fees: 0,
    },
    {
      id: "t-4",
      accountId: "acc-1",
      openedAt: `${today}T11:30:00Z`,
      closedAt: `${today}T11:58:00Z`,
      instrument: "GBP/JPY",
      side: "long" as const,
      setupName: "Fib Retracement",
      size: 1.0,
      pnl: 487,
      fees: 0,
    },
  ]);
  console.log("[seed] ✓ trades inserted");

  // ── Daily stats ───────────────────────────────────────────────────────────────
  console.log("[seed] → daily_stats");
  const pnlByDay: Record<string, number> = {};

  const rawReturns = [
    0, 340, 820, 1050, 720, 1340, 980, 1600, 1220, 900,
    1100, 1480, 1020, 1780, 2100, 1850, 2340, 2100, 1900, 2500,
    2200, 2700, 2400, 2900, 2650, 3100, 2850, 3300, 2900, 2340,
  ];
  for (let i = 0; i < rawReturns.length; i++) {
    const d = new Date(2026, 3, 8);
    d.setDate(d.getDate() - (29 - i));
    pnlByDay[d.toISOString().split("T")[0]] =
      i === 0 ? 0 : rawReturns[i] - rawReturns[i - 1];
  }

  const calData = [
    240, 0, -120, 580, 320, 0, 0,
    0, 450, -80, 720, 0, 280, 0,
    0, 390, 510, -150, 620, 310, 0,
    0, 0, 280, 490, -90, 530, 420,
    0, 640, -110, 410, 380, 510, 0,
  ];
  for (let i = 0; i < calData.length; i++) {
    const d = new Date(2026, 2, 5);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().split("T")[0];
    if (!(key in pnlByDay)) pnlByDay[key] = calData[i];
  }

  const statsRows = Object.entries(pnlByDay)
    .filter(([, pnl]) => pnl !== 0)
    .map(([day, pnl]) => {
      const tradeCount = Math.floor(Math.random() * 4) + 1;
      const winCount = pnl > 0
        ? Math.ceil(tradeCount * 0.65)
        : Math.floor(tradeCount * 0.35);
      const lossCount = tradeCount - winCount;
      const avgWin = pnl > 0 ? (pnl / Math.max(winCount, 1)) * 1.5 : 300;
      const avgLoss = pnl < 0 ? Math.abs(pnl) / Math.max(lossCount, 1) : 150;
      return {
        id: `ds-acc1-${day}`,
        accountId: "acc-1",
        day,
        totalPnl: pnl,
        tradeCount,
        winCount,
        lossCount,
        avgWin,
        avgLoss,
        winRate: tradeCount > 0 ? (winCount / tradeCount) * 100 : 0,
        profitFactor:
          avgLoss > 0
            ? (avgWin * winCount) / (avgLoss * Math.max(lossCount, 1))
            : 0,
        maxDrawdown: avgLoss,
      };
    });

  const todayStats = {
    id: `ds-acc1-${today}`,
    accountId: "acc-1",
    day: today,
    totalPnl: 1_240,
    tradeCount: 4,
    winCount: 3,
    lossCount: 1,
    avgWin: 487,
    avgLoss: 221,
    winRate: 75,
    profitFactor: 2.21,
    maxDrawdown: 221,
  };
  const todayIdx = statsRows.findIndex((r) => r.day === today);
  if (todayIdx >= 0) statsRows[todayIdx] = todayStats;
  else statsRows.push(todayStats);

  // Single bulk INSERT
  if (statsRows.length > 0) {
    await db.insert(dailyStats).values(statsRows).onConflictDoNothing();
  }
  console.log("[seed] ✓ daily_stats inserted", statsRows.length, "rows");

  // ── Quotes ────────────────────────────────────────────────────────────────────
  console.log("[seed] → quotes");
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

  console.log("[seed] ✓ All demo data seeded successfully.");
}
