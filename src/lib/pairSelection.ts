// ─── pairSelectionEvents — lightweight pub/sub for cross-page pair selection ──
// Clicking a favorite in the Sidebar needs to tell the (already-mounted,
// just hidden) Analytics page which pair to switch to. Mirrors tradeEvents.ts.

type Listener = (pair: string) => void;

const listeners = new Set<Listener>();

export const pairSelectionEvents = {
  /** Subscribe to pair-selection requests. Returns an unsubscribe function. */
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Request that every subscriber switch to this pair. */
  select(pair: string): void {
    listeners.forEach((fn) => fn(pair));
  },
};
