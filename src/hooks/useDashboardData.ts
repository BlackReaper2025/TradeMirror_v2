// ─── useDashboardData — fetches all data the dashboard needs from SQLite ─────
import { useEffect, useState, useCallback } from "react";
import { useDatabase } from "../db/DatabaseProvider";
import { tradeEvents } from "../lib/tradeEvents";
import { useAccountAndPortfolio } from "./useAccountAndPortfolio";
import { getAccountPropFirm } from "../lib/preferences";
import { getServerDayBoundsInStorageZone } from "../lib/serverTime";
import {
  getTodayLiveStats,
  getTodayTrades,
  getAllTimeStats,
  getMonthlyStats,
  getWeeklyStats,
  getTodayFullStats,
  getEquityCurve,
  getCalendarDays,
  getActiveQuotes,
  getAccountProfile,
  type Account,
  type Trade,
  type TodayLiveStats,
  type AllTimeStats,
  type AccountProfile,
} from "../db/queries";

export interface DashboardData {
  account:        Account | null;
  accountProfile: AccountProfile | null;
  todayStats:     TodayLiveStats;
  allTimeStats:   AllTimeStats;
  monthlyStats:   AllTimeStats;
  weeklyStats:    AllTimeStats;
  todayFullStats: AllTimeStats;
  recentTrades:   Trade[];
  equityCurve:    Array<{ date: string; balance: number }>;
  calendarDays:   Array<{ date: string; pnl: number; tradeCount: number }>;
  portfolio:      Array<{ name: string; value: number; color: string }>;
  quotes:         Array<{ text: string; author: string }>;
}

const EMPTY_STATS: AllTimeStats = {
  totalPnl: 0, tradeCount: 0, winCount: 0, lossCount: 0,
  winRate: 0, avgWin: 0, avgLoss: 0, profitFactor: 0,
  largestWin: 0, largestLoss: 0,
};

const EMPTY_TODAY: TodayLiveStats = {
  totalPnl: 0, tradeCount: 0, winCount: 0, lossCount: 0,
  largestWin: 0, largestLoss: 0,
};

const EMPTY: DashboardData = {
  account:        null,
  accountProfile: null,
  todayStats:     EMPTY_TODAY,
  allTimeStats:   EMPTY_STATS,
  monthlyStats:   EMPTY_STATS,
  weeklyStats:    EMPTY_STATS,
  todayFullStats: EMPTY_STATS,
  recentTrades:   [],
  equityCurve:    [],
  calendarDays:   [],
  portfolio:      [],
  quotes:         [],
};

export function useDashboardData() {
  const { ready, error } = useDatabase();
  // account + portfolio come from the shared hook (also used by Sidebar) so
  // a trade event doesn't trigger two independent getAccount/getPortfolio
  // round trips for the same rows.
  const { account, portfolio } = useAccountAndPortfolio();
  const [data, setData]     = useState<DashboardData>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (error) {
      console.error("[useDashboardData] DB provider errored — aborting load.");
      setLoading(false);
      return;
    }
    if (!ready || !account) return;

    try {
      const accountId = account.id;
      // "Today" follows this account's prop-firm server-day reset (e.g. E8
      // Markets resets the daily drawdown at 00:00 server time), not the
      // machine's local midnight — see getServerDayBoundsInStorageZone.
      // Deliberately resolved before the Promise.all below rather than
      // inside it, since every "today" query needs the same bounds.
      const dayBounds = await getServerDayBoundsInStorageZone(accountId, getAccountPropFirm(accountId));
      const [
        accountProfile, todayStats, allTimeStats, monthlyStats, weeklyStats, todayFullStats,
        recentTrades, equityCurve, calendarDays, quotes,
      ] = await Promise.all([
        getAccountProfile(accountId),
        getTodayLiveStats(accountId, dayBounds),
        getAllTimeStats(accountId),
        getMonthlyStats(accountId),
        getWeeklyStats(accountId),
        getTodayFullStats(accountId, dayBounds),
        getTodayTrades(accountId, dayBounds),
        // Always the full ~10y range, not just what the active EquityChart
        // timeframe needs — getEquityCurve's running balance is computed by
        // walking forward from account.startingBalance through every daily
        // row since `since`, so a shorter window would start the walk from
        // the true starting balance but skip the P&L accumulated before that
        // window, silently understating/overstating every balance in the
        // result. EquityChart already does its own client-side windowing
        // (filterCurve) over this same full array per selected timeframe, so
        // this fetch only needs to happen once per trade event rather than
        // once per timeframe click either way.
        getEquityCurve(accountId, 3650),
        // Also deliberately wider than the visible month: CalendarPanel lets
        // the user page to prior months/years client-side (prevMonth/
        // nextMonth), and re-fetching on every one of those clicks would
        // trade a bigger upfront payload for a network round-trip per
        // navigation. 365 days covers the common case of browsing back
        // within the current year without either cost.
        getCalendarDays(accountId, 365),
        getActiveQuotes(),
      ]);

      setData({ account, accountProfile, todayStats, allTimeStats, monthlyStats, weeklyStats, todayFullStats, recentTrades, equityCurve, calendarDays, portfolio, quotes });
      setLoading(false);
    } catch (err) {
      console.error("[useDashboardData] Query failed:", err);
      setLoading(false);
    }
  }, [ready, error, account, portfolio]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!ready) return;
    const unsub = tradeEvents.subscribe(() => { load(); });
    return unsub;
  }, [ready, load]);

  return { data, loading };
}
