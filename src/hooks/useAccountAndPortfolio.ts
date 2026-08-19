// ─── useAccountAndPortfolio — shared account + portfolio data source ─────────
// Sidebar (always mounted via AppShell) and useDashboardData (Dashboard page)
// both need the active account and the portfolio list, and both used to
// independently call getSettings/getAccount/getPortfolio on every single
// tradeEvents notification — every trade save/edit/delete/settings change
// fired two parallel, duplicate DB round-trips for the same rows. This hook
// is the one place that fetch happens; a module-level in-flight promise
// coalesces concurrent calls from multiple mounted consumers into one.

import { useEffect, useState, useCallback } from "react";
import { useDatabase } from "../db/DatabaseProvider";
import { tradeEvents } from "../lib/tradeEvents";
import { getSettings, getAccount, getPortfolio, type Account } from "../db/queries";

export interface PortfolioItem { name: string; value: number; color: string }

export interface AccountAndPortfolio {
  account:   Account | null;
  portfolio: PortfolioItem[];
}

const EMPTY: AccountAndPortfolio = { account: null, portfolio: [] };

let cache: AccountAndPortfolio = EMPTY;
let inFlight: Promise<AccountAndPortfolio> | null = null;
const listeners = new Set<(data: AccountAndPortfolio) => void>();

function fetchAccountAndPortfolio(): Promise<AccountAndPortfolio> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const settings = await getSettings();
    const [account, portfolio] = await Promise.all([
      getAccount(settings?.selectedAccountId ?? "acc-1"),
      getPortfolio(),
    ]);
    const next = { account, portfolio };
    cache = next;
    listeners.forEach((fn) => fn(next));
    return next;
  })();
  inFlight.finally(() => { inFlight = null; });
  return inFlight;
}

export function useAccountAndPortfolio(): AccountAndPortfolio {
  const { ready } = useDatabase();
  const [data, setData] = useState<AccountAndPortfolio>(cache);

  useEffect(() => {
    listeners.add(setData);
    return () => { listeners.delete(setData); };
  }, []);

  const load = useCallback(() => {
    fetchAccountAndPortfolio().catch((err) => console.error("[useAccountAndPortfolio] load error:", err));
  }, []);

  useEffect(() => { if (ready) load(); }, [ready, load]);
  useEffect(() => { if (!ready) return; return tradeEvents.subscribe(load); }, [ready, load]);

  return data;
}
