// ─── Demo data seeder — Phase 2 ──────────────────────────────────────────────
// Runs once on first launch if the DB is empty. Mirrors the Phase 1 mock data.

import { getDb } from "./index";
import { accounts, trades, dailyStats, quotes, appSettings } from "./schema";

export async function seedIfEmpty() {
  const db = getDb();

  // Check if already seeded
  const existing = await db.select().from(accounts).limit(1);
  if (existing.length > 0) return;

  console.log("[seed] Seeding demo data...");

  // ── Accounts ────────────────────────────────────────────────────────────────
  await db.insert(accounts).values([
    {
      id: "acc-1",
      name: "FTMO Challenge",
      brokerOrFirm: "FTMO",
      startingBalance: 100_000,
      currentBalance: 102_340,
      dailyTarget: 1_000,
      accountType: "challenge",
      isActive: true,
    },
    {
      id: "acc-2",
      name: "E8 Funded",
      brokerOrFirm: "E8 Markets",
      startingBalance: 50_000,
      currentBalance: 48_750,
      dailyTarget: 500,
      accountType: "prop",
      isActive: true,
    },
    {
      id: "acc-3",
      name: "Personal — OANDA",
      brokerOrFirm: "OANDA",
      startingBalance: 10_000,
      currentBalance: 12_100,
      dailyTarget: 200,
      accountType: "personal",
      isActive: true,
    },
  ]);

  // ── App settings (select FTMO as active account) ───────────────────────────
  await db.insert(appSettings).values({
    id: 1,
    selectedAccountId: "acc-1",
    themeMode: "auto",
    lastOpenedPage: "dashboard",
  });

  // ── Today's trades (April 8 2026) ──────────────────────────────────────────
  const today = "2026-04-08";
  await db.insert(trades).values([
    {
      id: "t-1",
      accountId: "acc-1",
      openedAt: `${today}T08:12:00Z`,
      closedAt: `${today}T08:47:00Z`,
      instrument: "EUR/USD",
      side: "long",
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
      side: "short",
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
      side: "long",
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
      side: "long",
      setupName: "Fib Retracement",
      size: 1.0,
      pnl: 487,
      fees: 0,
    },
  ]);

  // ── Daily stats — 30 days of equity + 35 days of calendar data ────────────
  const pnlByDay: Record<string, number> = {};

  // Equity curve data (30 days ending April 8 2026)
  const rawReturns = [
    0, 340, 820, 1050, 720, 1340, 980, 1600, 1220, 900,
    1100, 1480, 1020, 1780, 2100, 1850, 2340, 2100, 1900, 2500,
    2200, 2700, 2400, 2900, 2650, 3100, 2850, 3300, 2900, 2340,
  ];
  // Calculate daily PnL from cumulative returns
  for (let i = 0; i < rawReturns.length; i++) {
    const d = new Date(2026, 3, 8); // April 8 2026
    d.setDate(d.getDate() - (29 - i));
    const dateStr = d.toISOString().split("T")[0];
    const dailyPnl = i === 0 ? 0 : rawReturns[i] - rawReturns[i - 1];
    pnlByDay[dateStr] = dailyPnl;
  }

  // Calendar data (35 days from March 5 2026)
  const calData = [
    240, 0, -120, 580, 320, 0, 0,
    0, 450, -80, 720, 0, 280, 0,
    0, 390, 510, -150, 620, 310, 0,
    0, 0, 280, 490, -90, 530, 420,
    0, 640, -110, 410, 380, 510, 0,
  ];
  for (let i = 0; i < calData.length; i++) {
    const d = new Date(2026, 2, 5); // March 5 2026
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    if (!(dateStr in pnlByDay)) {
      pnlByDay[dateStr] = calData[i];
    }
  }

  // Insert all daily stats rows
  const statsRows = Object.entries(pnlByDay)
    .filter(([, pnl]) => pnl !== 0)
    .map(([day, pnl]) => {
      const tradeCount = Math.floor(Math.random() * 4) + 1;
      const winCount = pnl > 0 ? Math.ceil(tradeCount * 0.65) : Math.floor(tradeCount * 0.35);
      const lossCount = tradeCount - winCount;
      const avgWin = pnl > 0 ? pnl / Math.max(winCount, 1) * 1.5 : 300;
      const avgLoss = pnl < 0 ? Math.abs(pnl) / Math.max(lossCount, 1) : 150;
      const winRate = tradeCount > 0 ? (winCount / tradeCount) * 100 : 0;

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
        winRate,
        profitFactor: avgLoss > 0 ? (avgWin * winCount) / (avgLoss * Math.max(lossCount, 1)) : 0,
        maxDrawdown: avgLoss,
      };
    });

  // Override today's stats with real trade data
  const todayIdx = statsRows.findIndex((r) => r.day === today);
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
  if (todayIdx >= 0) {
    statsRows[todayIdx] = todayStats;
  } else {
    statsRows.push(todayStats);
  }

  for (const row of statsRows) {
    await db
      .insert(dailyStats)
      .values(row)
      .onConflictDoNothing();
  }

  // ── Quotes ─────────────────────────────────────────────────────────────────
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

  console.log("[seed] Demo data seeded successfully.");
}
