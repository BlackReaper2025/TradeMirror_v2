// ─── useDashboardData — fetches all data the dashboard needs from SQLite ─────
import { useEffect, useState, useCallback } from "react";
import { useDatabase } from "../db/DatabaseProvider";
import { tradeEvents } from "../lib/tradeEvents";
import {
  getSettings,
  getAccount,
  getTodayLiveStats,
  getTodayTrades,
  getAllTimeStats,
  getMonthlyStats,
  getTodayFullStats,
  getEquityCurve,
  getCalendarDays,
  getPortfolio,
  getActiveQuotes,
  type Account,
  type Trade,
  type TodayLiveStats,
  type AllTimeStats,
} from "../db/queries";

export interface DashboardData {
  account:        Account | null;
  todayStats:     TodayLiveStats;
  allTimeStats:   AllTimeStats;
  monthlyStats:   AllTimeStats;
  todayFullStats: AllTimeStats;
  recentTrades:   Trade[];
  equityCurve:    Array<{ date: string; balance: number }>;
  calendarDays:   Array<{ date: string; pnl: number; tradeCount: number }>;
  portfolio:      Array<{ name: string; value: number; color: string }>;
  quotes:         Array<{ text: string; author: string }>;
}

const EMPTY_STATS: AllTimeStats = {
  tradeCount: 0, winCount: 0, lossCount: 0,
  winRate: 0, avgWin: 0, avgLoss: 0, profitFactor: 0,
};

const EMPTY_TODAY: TodayLiveStats = { totalPnl: 0, tradeCount: 0, winCount: 0, lossCount: 0 };

const EMPTY: DashboardData = {
  account:        null,
  todayStats:     EMPTY_TODAY,
  allTimeStats:   EMPTY_STATS,
  monthlyStats:   EMPTY_STATS,
  todayFullStats: EMPTY_STATS,
  recentTrades:   [],
  equityCurve:    [],
  calendarDays:   [],
  portfolio:      [],
  quotes:         [],
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
      const settings  = await getSettings();
      const accountId = settings?.selectedAccountId ?? "acc-1";

      const [
        account, todayStats, allTimeStats, monthlyStats, todayFullStats,
        recentTrades, equityCurve, calendarDays, portfolio, quotes,
      ] = await Promise.all([
        getAccount(accountId),
        getTodayLiveStats(accountId),
        getAllTimeStats(accountId),
        getMonthlyStats(accountId),
        getTodayFullStats(accountId),
        getTodayTrades(accountId),
        getEquityCurve(accountId, 3650),
        getCalendarDays(accountId, 365),
        getPortfolio(),
        getActiveQuotes(),
      ]);

      setData({ account, todayStats, allTimeStats, monthlyStats, todayFullStats, recentTrades, equityCurve, calendarDays, portfolio, quotes });
      setLoading(false);
    } catch (err) {
      console.error("[useDashboardData] Query failed:", err);
      setLoading(false);
    }
  }, [ready, error]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!ready) return;
    const unsub = tradeEvents.subscribe(() => { load(); });
    return unsub;
  }, [ready, load]);

  return { data, loading };
}
