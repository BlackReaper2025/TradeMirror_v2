// ─── pairSelectionEvents — lightweight pub/sub for cross-page pair selection ──
// Clicking a favorite in the Sidebar needs to tell the Analytics page which
// pair to switch to. Mirrors tradeEvents.ts.
//
// AppShell actually unmounts/remounts each page on navigation (it's a plain
// switch over the active page, no keep-alive) — so a favorite clicked from
// any other page fires select() and navigates in the same synchronous
// handler, before the freshly-mounting Analytics page's subscribe() effect
// has had a chance to run. That left the request dispatched into an empty
// listener set and the page fell back to its hardcoded default pair. lastPair
// makes the request durable across that race: select() stashes it, and a
// newly-mounting page's initial state consumes it directly instead of
// relying on already being subscribed in time.
type Listener = (pair: string) => void;

const listeners = new Set<Listener>();
let lastPair: string | null = null;

export const pairSelectionEvents = {
  /** Subscribe to pair-selection requests. Returns an unsubscribe function. */
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Request that every subscriber switch to this pair. */
  select(pair: string): void {
    lastPair = pair;
    listeners.forEach((fn) => fn(pair));
  },

  /** One-shot read of the most recent select() not yet consumed by a mount. */
  consume(): string | null {
    const pair = lastPair;
    lastPair = null;
    return pair;
  },
};
