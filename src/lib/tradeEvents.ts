// ─── tradeEvents — lightweight pub/sub for cross-page data invalidation ───────
// When a trade is created/updated/deleted the Trade Log page calls notify().
// Any hook that holds dashboard data subscribes and refetches.
// No external dependencies — just a Set of callbacks.

type Listener = () => void;

const listeners = new Set<Listener>();

export const tradeEvents = {
  /** Subscribe to trade-change events. Returns an unsubscribe function. */
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Notify all subscribers that trade data has changed. */
  notify(): void {
    console.log(`[tradeEvents] notify — ${listeners.size} subscriber(s)`);
    listeners.forEach((fn) => fn());
  },
};
