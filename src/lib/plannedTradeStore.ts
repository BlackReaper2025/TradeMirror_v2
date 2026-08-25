// ─── Planned trade store (Phase 14) ────────────────────────────────────────────
// Shared state between the Trade tab (src/components/analytics/TradeTabPanel.tsx)
// and the Analytics chart's price-line overlay (src/pages/AnalyticsV3.tsx),
// which are siblings deep inside a very large page — threading this through
// props would mean touching PriceHistoryChart's prop signature in a file this
// project is explicitly told not to rebuild. Same lightweight pub/sub shape as
// the existing src/lib/tradeEvents.ts, scoped to one purpose.
//
// This is planning-mode state only — nothing here is submitted anywhere.

export interface PlannedTrade {
  pair: string;
  side: "buy" | "sell";
  entry: number | null;
  stop: number | null;
  target: number | null;
}

const EMPTY: PlannedTrade = { pair: "", side: "buy", entry: null, stop: null, target: null };

let state: PlannedTrade = EMPTY;
const listeners = new Set<() => void>();

export const plannedTradeStore = {
  get(): PlannedTrade {
    return state;
  },
  set(next: Partial<PlannedTrade>): void {
    state = { ...state, ...next };
    listeners.forEach((fn) => fn());
  },
  clear(): void {
    state = EMPTY;
    listeners.forEach((fn) => fn());
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
