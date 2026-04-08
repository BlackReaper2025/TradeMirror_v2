// ─── useDashboardData — fetches all data the dashboard needs from SQLite ─────
import { useEffect, useState, useCallback } from "react";
import { useDatabase } from "../db/DatabaseProvider";
import { tradeEvents } from "../lib/tradeEvents";
import {
  getSettings,
  getAccount,
  getTodayStats,
  getTodayTrades,
  getAllTimeStats,
  getEquityCurve,
  getCalendarDays,
  getPortfolio,
  getActiveQuotes,
  type Account,
  type Trade,
  type DailyStat,
  type AllTimeStats,
} from "../db/queries";

export interface DashboardData {
  account:      Account | null;
  todayStats:   DailyStat | null;
  allTimeStats: AllTimeStats;
  recentTrades: Trade[];
  equityCurve:  Array<{ date: string; balance: number }>;
  calendarDays: Array<{ date: string; pnl: number; tradeCount: number }>;
  portfolio:    Array<{ name: string; value: number; color: string }>;
  quotes:       Array<{ text: string; author: string }>;
}

const EMPTY_ALL_TIME: AllTimeStats = {
  tradeCount: 0, winCount: 0, lossCount: 0,
  winRate: 0, avgWin: 0, avgLoss: 0, profitFactor: 0,
};

const EMPTY: DashboardData = {
  account:      null,
  todayStats:   null,
  allTimeStats: EMPTY_ALL_TIME,
  recentTrades: [],
  equityCurve:  [],
  calendarDays: [],
  portfolio:    [],
  quotes:       [],
};

export function useDashboardData() {
  const { ready, error } = useDatabase();
  const [data, setData]     = useState<DashboardData>(EMPTY);
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

      const settings  = await getSettings();
      const accountId = settings?.selectedAccountId ?? "acc-1";
      console.log("[useDashboardData] → accountId:", accountId);

      const [
        account, todayStats, allTimeStats,
        recentTrades, equityCurve, calendarDays, portfolio, quotes,
      ] = await Promise.all([
        getAccount(accountId),
        getTodayStats(accountId),
        getAllTimeStats(accountId),
        getTodayTrades(accountId),
        getEquityCurve(accountId, 30),
        getCalendarDays(accountId, 35),
        getPortfolio(),
        getActiveQuotes(),
      ]);

      console.log("[useDashboardData] complete:", {
        account:         account?.name,
        currentBalance:  account?.currentBalance,
        // today-only
        todayPnl:        todayStats?.totalPnl,
        todayTrades:     recentTrades.length,
        // all-time
        allTrades:       allTimeStats.tradeCount,
        allWinRate:      allTimeStats.winRate.toFixed(1) + "%",
        allAvgWin:       allTimeStats.avgWin.toFixed(2),
        allAvgLoss:      allTimeStats.avgLoss.toFixed(2),
        allProfitFactor: allTimeStats.profitFactor.toFixed(2),
      });

      setData({ account, todayStats, allTimeStats, recentTrades, equityCurve, calendarDays, portfolio, quotes });
      setLoading(false);
    } catch (err) {
      console.error("[useDashboardData] Query failed:", err);
      setLoading(false);
    }
  }, [ready, error]);

  // Initial load
  useEffect(() => { load(); }, [load]);

  // Refetch on any trade change
  useEffect(() => {
    if (!ready) return;
    const unsub = tradeEvents.subscribe(() => {
      console.log("[useDashboardData] tradeEvents fired — refetching");
      load();
    });
    return unsub;
  }, [ready, load]);

  return { data, loading };
}
