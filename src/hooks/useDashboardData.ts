// ─── useDashboardData — fetches all data the dashboard needs from SQLite ─────
import { useEffect, useState, useCallback } from "react";
import { useDatabase } from "../db/DatabaseProvider";
import { tradeEvents } from "../lib/tradeEvents";
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

  const load = useCallback(async () => {
    if (error) {
      console.error("[useDashboardData] DB provider errored — aborting load.");
      setLoading(false);
      return;
    }
    if (!ready) return;

    try {
      console.log("[useDashboardData] Loading dashboard data …");

      const settings   = await getSettings();
      const accountId  = settings?.selectedAccountId ?? "acc-1";
      console.log("[useDashboardData] → accountId:", accountId);

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
        currentBalance: account?.currentBalance,
        todayPnl: todayStats?.totalPnl,
        todayTrades: recentTrades.length,
        todayWinRate: todayStats?.winRate,
        todayAvgWin: todayStats?.avgWin,
        todayAvgLoss: todayStats?.avgLoss,
        todayProfitFactor: todayStats?.profitFactor,
        equityPoints: equityCurve.length,
      });

      setData({ account, todayStats, recentTrades, equityCurve, calendarDays, portfolio, quotes });
      setLoading(false);
    } catch (err) {
      console.error("[useDashboardData] Query failed:", err);
      setLoading(false);
    }
  }, [ready, error]);

  // Initial load when DB becomes ready
  useEffect(() => {
    load();
  }, [load]);

  // Refetch whenever a trade is saved/updated/deleted from any page
  useEffect(() => {
    if (!ready) return;
    console.log("[useDashboardData] Subscribing to tradeEvents");
    const unsub = tradeEvents.subscribe(() => {
      console.log("[useDashboardData] tradeEvents fired — refetching dashboard data");
      load();
    });
    return unsub;
  }, [ready, load]);

  return { data, loading };
}
