// ─── useDashboardData — fetches all data the dashboard needs from SQLite ─────
import { useEffect, useState } from "react";
import { useDatabase } from "../db/DatabaseProvider";
import {
  getSettings,
  getAccount,
  getTodayStats,
  getTodayTrades,
  getEquityCurve,
  getCalendarDays,
  getPortfolio,
  getActiveQuotes,
  type Account,
  type Trade,
  type DailyStat,
} from "../db/queries";

export interface DashboardData {
  account: Account | null;
  todayStats: DailyStat | null;
  recentTrades: Trade[];
  equityCurve: Array<{ date: string; balance: number }>;
  calendarDays: Array<{ date: string; pnl: number; tradeCount: number }>;
  portfolio: Array<{ name: string; value: number; color: string }>;
  quotes: Array<{ text: string; author: string }>;
}

const EMPTY: DashboardData = {
  account: null,
  todayStats: null,
  recentTrades: [],
  equityCurve: [],
  calendarDays: [],
  portfolio: [],
  quotes: [],
};

export function useDashboardData() {
  const { ready, error } = useDatabase();
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If DB errored out, stop loading — don't hang forever
    if (error) {
      console.error("[useDashboardData] DB provider errored — aborting load.");
      setLoading(false);
      return;
    }

    if (!ready) return;

    let cancelled = false;

    async function load() {
      try {
        console.log("[useDashboardData] Loading dashboard data …");

        console.log("[useDashboardData] → getSettings");
        const settings = await getSettings();
        const accountId = settings?.selectedAccountId ?? "acc-1";
        console.log("[useDashboardData] → accountId:", accountId);

        console.log("[useDashboardData] → parallel queries …");
        const [account, todayStats, recentTrades, equityCurve, calendarDays, portfolio, quotes] =
          await Promise.all([
            getAccount(accountId),
            getTodayStats(accountId),
            getTodayTrades(accountId),
            getEquityCurve(accountId, 30),
            getCalendarDays(accountId, 35),
            getPortfolio(),
            getActiveQuotes(),
          ]);

        console.log("[useDashboardData] All queries complete:", {
          account: account?.name,
          todayStats: todayStats?.totalPnl,
          trades: recentTrades.length,
          equityPoints: equityCurve.length,
          calDays: calendarDays.length,
          portfolioSlices: portfolio.length,
          quotes: quotes.length,
        });

        if (!cancelled) {
          setData({ account, todayStats, recentTrades, equityCurve, calendarDays, portfolio, quotes });
          setLoading(false);
        }
      } catch (err) {
        console.error("[useDashboardData] Query failed:", err);
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [ready, error]);

  return { data, loading };
}
