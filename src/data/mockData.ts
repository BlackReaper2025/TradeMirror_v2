// ─── Mock Data — Phase 1 static shell ──────────────────────────────────────
// All data is seeded/fake. Replace with real DB queries in Phase 2.

export interface Account {
  id: string;
  name: string;
  broker: string;
  startingBalance: number;
  currentBalance: number;
  dailyTarget: number;
  accountType: "prop" | "personal" | "challenge";
  isActive: boolean;
}

export interface Trade {
  id: string;
  accountId: string;
  openedAt: string;
  closedAt: string;
  instrument: string;
  side: "long" | "short";
  setupName: string;
  pnl: number;
  size: number;
  rr: number;
}

export interface EquityPoint {
  date: string;
  balance: number;
}

export interface CalendarDay {
  date: string;
  pnl: number;
  tradeCount: number;
}

export interface Quote {
  text: string;
  author: string;
}

export interface PortfolioSlice {
  name: string;
  value: number;
  color: string;
}

// ─── Accounts ───────────────────────────────────────────────────────────────

export const ACCOUNTS: Account[] = [
  {
    id: "acc-1",
    name: "FTMO Challenge",
    broker: "FTMO",
    startingBalance: 100_000,
    currentBalance: 102_340,
    dailyTarget: 1_000,
    accountType: "challenge",
    isActive: true,
  },
  {
    id: "acc-2",
    name: "E8 Funded",
    broker: "E8 Markets",
    startingBalance: 50_000,
    currentBalance: 48_750,
    dailyTarget: 500,
    accountType: "prop",
    isActive: true,
  },
  {
    id: "acc-3",
    name: "Personal — OANDA",
    broker: "OANDA",
    startingBalance: 10_000,
    currentBalance: 12_100,
    dailyTarget: 200,
    accountType: "personal",
    isActive: true,
  },
];

export const ACTIVE_ACCOUNT = ACCOUNTS[0];

// ─── Today's stats ───────────────────────────────────────────────────────────

export const TODAY_STATS = {
  pnl:        1_240,
  tradeCount: 4,
  winCount:   3,
  lossCount:  1,
  winRate:    75,
  avgWin:     487,
  avgLoss:    221,
  maxDrawdown: 221,
  profitFactor: 2.21,
};

// ─── Recent trades ───────────────────────────────────────────────────────────

export const RECENT_TRADES: Trade[] = [
  {
    id: "t-1",
    accountId: "acc-1",
    openedAt: "2026-04-08T08:12:00Z",
    closedAt: "2026-04-08T08:47:00Z",
    instrument: "EUR/USD",
    side: "long",
    setupName: "London Open Break",
    pnl: 523,
    size: 2.0,
    rr: 2.4,
  },
  {
    id: "t-2",
    accountId: "acc-1",
    openedAt: "2026-04-08T09:05:00Z",
    closedAt: "2026-04-08T09:22:00Z",
    instrument: "GBP/USD",
    side: "short",
    setupName: "Rejection Wick",
    pnl: -221,
    size: 1.5,
    rr: -1.0,
  },
  {
    id: "t-3",
    accountId: "acc-1",
    openedAt: "2026-04-08T10:14:00Z",
    closedAt: "2026-04-08T10:51:00Z",
    instrument: "NAS100",
    side: "long",
    setupName: "Break & Retest",
    pnl: 451,
    size: 0.5,
    rr: 3.1,
  },
  {
    id: "t-4",
    accountId: "acc-1",
    openedAt: "2026-04-08T11:30:00Z",
    closedAt: "2026-04-08T11:58:00Z",
    instrument: "GBP/JPY",
    side: "long",
    setupName: "Fib Retracement",
    pnl: 487,
    size: 1.0,
    rr: 2.8,
  },
];

// ─── Equity curve (30 days) ───────────────────────────────────────────────

const BASE = 100_000;
const rawReturns = [
  0, 340, 820, 1050, 720, 1340, 980, 1600, 1220, 900,
  1100, 1480, 1020, 1780, 2100, 1850, 2340, 2100, 1900, 2500,
  2200, 2700, 2400, 2900, 2650, 3100, 2850, 3300, 2900, 2340,
];

function dateStr(daysAgo: number): string {
  const d = new Date(2026, 3, 8); // April 8 2026
  d.setDate(d.getDate() - (29 - daysAgo));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const EQUITY_CURVE: EquityPoint[] = rawReturns.map((r, i) => ({
  date: dateStr(i),
  balance: BASE + r,
}));

// ─── Calendar (last 35 days) ─────────────────────────────────────────────

const calData = [
  240, 0, -120, 580, 320, 0, 0,
  0, 450, -80, 720, 0, 280, 0,
  0, 390, 510, -150, 620, 310, 0,
  0, 0, 280, 490, -90, 530, 420,
  0, 640, -110, 410, 380, 510, 0,
];

export const CALENDAR_DAYS: CalendarDay[] = calData.map((pnl, i) => {
  const d = new Date(2026, 2, 5); // March 5
  d.setDate(d.getDate() + i);
  return {
    date: d.toISOString().split("T")[0],
    pnl,
    tradeCount: pnl === 0 ? 0 : Math.floor(Math.random() * 4) + 1,
  };
});

// ─── Portfolio distribution ──────────────────────────────────────────────

export const PORTFOLIO: PortfolioSlice[] = [
  { name: "FTMO Challenge", value: 102_340, color: "#22c55e" },
  { name: "E8 Funded",      value: 48_750,  color: "#3b82f6" },
  { name: "Personal OANDA", value: 12_100,  color: "#8b5cf6" },
];

export const PORTFOLIO_TOTAL = PORTFOLIO.reduce((s, p) => s + p.value, 0);

// ─── Quotes ─────────────────────────────────────────────────────────────

export const QUOTES: Quote[] = [
  {
    text: "The goal of a successful trader is to make the best trades. Money is secondary.",
    author: "Alexander Elder",
  },
  {
    text: "Risk comes from not knowing what you're doing.",
    author: "Warren Buffett",
  },
  {
    text: "The market is a device for transferring money from the impatient to the patient.",
    author: "Warren Buffett",
  },
  {
    text: "In trading, the only certainty is uncertainty. Your edge is how you handle it.",
    author: "Mark Douglas",
  },
  {
    text: "Amateurs think about how much money they can make. Professionals think about how much money they could lose.",
    author: "Jack Schwager",
  },
  {
    text: "Every loss is tuition paid at the school of experience.",
    author: "Unknown",
  },
  {
    text: "Do not focus on making money; focus on protecting what you have.",
    author: "Paul Tudor Jones",
  },
];

// ─── Market sessions ─────────────────────────────────────────────────────

export type SessionName = "Pre-Asia" | "Asia" | "London" | "New York" | "Roll Over" | "Closed";

export interface SessionWindow {
  name: SessionName;
  utcStart: number; // hour in UTC
  utcEnd: number;
  color: string;
}

export const SESSIONS: SessionWindow[] = [
  { name: "Pre-Asia",  utcStart: 20, utcEnd: 23,  color: "#6366f1" },
  { name: "Asia",      utcStart: 23, utcEnd: 8,   color: "#3b82f6" },
  { name: "London",    utcStart: 7,  utcEnd: 16,  color: "#f59e0b" },
  { name: "New York",  utcStart: 12, utcEnd: 21,  color: "#22c55e" },
  { name: "Roll Over", utcStart: 21, utcEnd: 22,  color: "#8b5cf6" },
];

export function getCurrentSession(utcHour: number): SessionWindow | null {
  for (const s of SESSIONS) {
    if (s.utcStart < s.utcEnd) {
      if (utcHour >= s.utcStart && utcHour < s.utcEnd) return s;
    } else {
      // wraps midnight
      if (utcHour >= s.utcStart || utcHour < s.utcEnd) return s;
    }
  }
  return null;
}
