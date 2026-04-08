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
  const { ready } = useDatabase();
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    async function load() {
      try {
        const settings = await getSettings();
        const accountId = settings?.selectedAccountId ?? "acc-1";

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

        if (!cancelled) {
          setData({ account, todayStats, recentTrades, equityCurve, calendarDays, portfolio, quotes });
          setLoading(false);
        }
      } catch (err) {
        console.error("[useDashboardData]", err);
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [ready]);

  return { data, loading };
}
