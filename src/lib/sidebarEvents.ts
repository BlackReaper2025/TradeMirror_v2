// ─── sidebarEvents — lightweight pub/sub for cross-component sidebar control ──
// The app sidebar's collapsed state lives in AppShell, a distant ancestor of
// page components. Analytics V3's "collapse panels around chart" button
// mirrors that state onto the sidebar too — same pattern as tradeEvents.ts /
// pairSelectionEvents.ts, just for this one control instead of threading a
// callback through AppShell's children(page) render-prop signature.

type Listener = (collapsed: boolean) => void;

const listeners = new Set<Listener>();

export const sidebarEvents = {
  /** Subscribe to sidebar-collapse requests. Returns an unsubscribe function. */
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Request the app sidebar be set to this collapsed state. */
  setCollapsed(collapsed: boolean): void {
    listeners.forEach((fn) => fn(collapsed));
  },
};
