// ─── User preferences — backed by localStorage ───────────────────────────────
// These are UI preferences that don't need to live in the DB.
// Components listen to the "tm:prefs-changed" window event to react to updates.

export type TimeFormat = "12h" | "24h";

const KEYS = {
  timeFormat:        "tm_time_format",
  musicUrl:          "tm_music_url",
  slideshowFolder:   "tm_slideshow_folder",
  slideshowInterval: "tm_slideshow_interval",
  treasuryAuctionsBackfilled: "tm_treasury_auctions_backfilled",
} as const;

export function getTimeFormat(): TimeFormat {
  return (localStorage.getItem(KEYS.timeFormat) as TimeFormat) ?? "12h";
}
export function setTimeFormat(fmt: TimeFormat): void {
  localStorage.setItem(KEYS.timeFormat, fmt);
  window.dispatchEvent(new CustomEvent("tm:prefs-changed"));
}

// Per-account brokerage URLs — keyed by account ID
export function getAccountBrokerUrl(accountId: string): string {
  return localStorage.getItem(`tm_broker_url_${accountId}`) ?? "";
}
export function setAccountBrokerUrl(accountId: string, url: string): void {
  localStorage.setItem(`tm_broker_url_${accountId}`, url.trim());
  window.dispatchEvent(new CustomEvent("tm:prefs-changed"));
}

export function getMusicUrl(): string {
  return localStorage.getItem(KEYS.musicUrl) ?? "";
}
export function setMusicUrl(url: string): void {
  localStorage.setItem(KEYS.musicUrl, url);
  window.dispatchEvent(new CustomEvent("tm:prefs-changed"));
}

export function getSlideshowFolder(): string {
  return localStorage.getItem(KEYS.slideshowFolder) ?? "";
}
export function setSlideshowFolder(path: string): void {
  localStorage.setItem(KEYS.slideshowFolder, path);
  window.dispatchEvent(new CustomEvent("tm:prefs-changed"));
}

export function getSlideshowInterval(): number {
  const raw = localStorage.getItem(KEYS.slideshowInterval);
  const n   = raw !== null ? parseInt(raw, 10) : NaN;
  return isNaN(n) || n < 1 ? 60 : n;
}
export function setSlideshowInterval(seconds: number): void {
  localStorage.setItem(KEYS.slideshowInterval, String(seconds));
  window.dispatchEvent(new CustomEvent("tm:prefs-changed"));
}

const EQUITY_PANEL_VIEW_KEY = "tm_equity_panel_view";
export type EquityPanelView = "chart" | "slideshow";

export function getEquityPanelView(): EquityPanelView {
  const v = localStorage.getItem(EQUITY_PANEL_VIEW_KEY);
  return v === "slideshow" ? "slideshow" : "chart";
}
export function setEquityPanelView(view: EquityPanelView): void {
  localStorage.setItem(EQUITY_PANEL_VIEW_KEY, view);
}

export function getSlideshowIdx(): number {
  const n = parseInt(localStorage.getItem("tm_slideshow_idx") ?? "0", 10);
  return isNaN(n) || n < 0 ? 0 : n;
}
export function setSlideshowIdx(idx: number): void {
  localStorage.setItem("tm_slideshow_idx", String(idx));
}

export function getSlideshowPlaying(): boolean {
  return localStorage.getItem("tm_slideshow_playing") !== "false";
}
export function setSlideshowPlaying(playing: boolean): void {
  localStorage.setItem("tm_slideshow_playing", String(playing));
}

export function getQuotesIdx(): number {
  const n = parseInt(localStorage.getItem("tm_quotes_idx") ?? "0", 10);
  return isNaN(n) || n < 0 ? 0 : n;
}
export function setQuotesIdx(idx: number): void {
  localStorage.setItem("tm_quotes_idx", String(idx));
}

const FAVORITE_PAIRS_KEY = "tm_favorite_pairs";

export function getFavoritePairs(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITE_PAIRS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}
export function isFavoritePair(pair: string): boolean {
  return getFavoritePairs().includes(pair);
}
export function addFavoritePair(pair: string): void {
  const cur = getFavoritePairs();
  if (cur.includes(pair)) return;
  localStorage.setItem(FAVORITE_PAIRS_KEY, JSON.stringify([...cur, pair]));
  window.dispatchEvent(new CustomEvent("tm:prefs-changed"));
}
export function removeFavoritePair(pair: string): void {
  localStorage.setItem(FAVORITE_PAIRS_KEY, JSON.stringify(getFavoritePairs().filter((p) => p !== pair)));
  window.dispatchEvent(new CustomEvent("tm:prefs-changed"));
}
export function toggleFavoritePair(pair: string): void {
  if (isFavoritePair(pair)) removeFavoritePair(pair); else addFavoritePair(pair);
}
// Drag-and-drop reorder — moves `pair` to sit at `toIndex` in the list.
export function reorderFavoritePairs(pair: string, toIndex: number): void {
  const cur = getFavoritePairs();
  const from = cur.indexOf(pair);
  if (from === -1) return;
  cur.splice(from, 1);
  cur.splice(Math.max(0, Math.min(toIndex, cur.length)), 0, pair);
  localStorage.setItem(FAVORITE_PAIRS_KEY, JSON.stringify(cur));
  window.dispatchEvent(new CustomEvent("tm:prefs-changed"));
}

// One-time flag so the News indicator's deep Treasury-auction history
// backfill (backfill_treasury_auctions — TreasuryDirect's full 1979-2026
// archive for 10Y/30Y) only ever runs once per install rather than on
// every app launch.
export function getTreasuryAuctionsBackfilled(): boolean {
  return localStorage.getItem(KEYS.treasuryAuctionsBackfilled) === "1";
}
export function setTreasuryAuctionsBackfilled(): void {
  localStorage.setItem(KEYS.treasuryAuctionsBackfilled, "1");
}

// Reversal Candles chart indicator — location filters + which candle-shape
// groups are enabled, remembered across app restarts.
export interface ReversalSettings {
  zoneFilter: boolean;
  eightAmBoxFilter: boolean;
  trendlineFilter: boolean;
  gannFilter: boolean;
  fibFilter: boolean;
  patternGroups: string[];
  showLabels: boolean;
  // How many of the most recent qualifying reversal candles to actually
  // flag, counting back from the latest — null means no limit. A long
  // history tends to bury the ones that still matter under a wall of older
  // ones, so this caps it to whatever count is actually useful right now.
  maxCount: number | null;
}
const REVERSAL_SETTINGS_KEY = "tm_reversal_settings";

export function getReversalSettings(defaultPatternGroups: string[]): ReversalSettings {
  const fallback: ReversalSettings = {
    zoneFilter: false, eightAmBoxFilter: false, trendlineFilter: false, gannFilter: false, fibFilter: false,
    patternGroups: [...defaultPatternGroups],
    showLabels: false,
    maxCount: null,
  };
  try {
    const raw = localStorage.getItem(REVERSAL_SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ReversalSettings>;
    return {
      zoneFilter:       typeof parsed.zoneFilter === "boolean" ? parsed.zoneFilter : fallback.zoneFilter,
      eightAmBoxFilter: typeof parsed.eightAmBoxFilter === "boolean" ? parsed.eightAmBoxFilter : fallback.eightAmBoxFilter,
      trendlineFilter:  typeof parsed.trendlineFilter === "boolean" ? parsed.trendlineFilter : fallback.trendlineFilter,
      gannFilter:       typeof parsed.gannFilter === "boolean" ? parsed.gannFilter : fallback.gannFilter,
      fibFilter:        typeof parsed.fibFilter === "boolean" ? parsed.fibFilter : fallback.fibFilter,
      patternGroups:    Array.isArray(parsed.patternGroups) && parsed.patternGroups.every((g) => typeof g === "string")
        ? parsed.patternGroups
        : fallback.patternGroups,
      showLabels:       typeof parsed.showLabels === "boolean" ? parsed.showLabels : fallback.showLabels,
      maxCount:         typeof parsed.maxCount === "number" && parsed.maxCount > 0 ? parsed.maxCount : fallback.maxCount,
    };
  } catch {
    return fallback;
  }
}
export function setReversalSettings(settings: ReversalSettings): void {
  localStorage.setItem(REVERSAL_SETTINGS_KEY, JSON.stringify(settings));
}

// Quad Chart — the 4 independent instruments shown in Analytics V3's Quad
// View (slot 0 defaults to whatever pair was charted when Quad View was
// first opened; every slot is freely reassignable from then on). Remembered
// across restarts.
const QUAD_PAIRS_KEY = "tm_quad_pairs";
const DEFAULT_QUAD_PAIRS: [string, string, string, string] = ["EUR/USD", "GBP/USD", "USD/JPY", "XAU/USD"];

export function getQuadPairs(): [string, string, string, string] {
  try {
    const raw = localStorage.getItem(QUAD_PAIRS_KEY);
    if (!raw) return [...DEFAULT_QUAD_PAIRS];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 4 && parsed.every((p) => typeof p === "string")) {
      return parsed as [string, string, string, string];
    }
    return [...DEFAULT_QUAD_PAIRS];
  } catch {
    return [...DEFAULT_QUAD_PAIRS];
  }
}
export function setQuadPairs(pairs: [string, string, string, string]): void {
  localStorage.setItem(QUAD_PAIRS_KEY, JSON.stringify(pairs));
  window.dispatchEvent(new CustomEvent("tm:prefs-changed"));
}

// Manual chart drawings (trend line / ray / horizontal / rectangle / fib /
// gann / text) placed via the chart's drawing-tool rail. Kept per
// instrument+timeframe, same way TradingView scopes drawings to a chart.
export interface StoredDrawPoint { time: number; price: number; }
export interface StoredDrawing {
  id: string;
  kind: "trendline" | "ray" | "horizontal" | "horizontalray" | "rectangle" | "fib" | "fibext" | "gann" | "text";
  p1: StoredDrawPoint;
  p2?: StoredDrawPoint;
  p3?: StoredDrawPoint; // "fibext" only — the 3rd (retracement) anchor point
  text?: string;
  color: string;
  hidden?: boolean; // toggled from the Layers panel — kept, not deleted
}

// Keyed by instrument only (not timeframe) — a drawing's (time, price) point
// is meaningful on any timeframe of the same instrument, and TradingView
// itself shows the same drawings across all of a symbol's timeframes rather
// than hiding them the moment you switch chart resolution.
function chartDrawingsKey(pair: string): string {
  return `tm_chart_drawings_${pair}`;
}

function isStoredDrawPoint(v: unknown): v is StoredDrawPoint {
  return !!v && typeof v === "object"
    && typeof (v as StoredDrawPoint).time === "number"
    && typeof (v as StoredDrawPoint).price === "number";
}

const DRAWING_KINDS = new Set(["trendline", "ray", "horizontal", "horizontalray", "rectangle", "fib", "fibext", "gann", "text"]);

function isStoredDrawing(v: unknown): v is StoredDrawing {
  if (!v || typeof v !== "object") return false;
  const d = v as StoredDrawing;
  if (typeof d.id !== "string" || !DRAWING_KINDS.has(d.kind) || typeof d.color !== "string") return false;
  if (!isStoredDrawPoint(d.p1)) return false;
  if (d.p2 !== undefined && !isStoredDrawPoint(d.p2)) return false;
  if (d.p3 !== undefined && !isStoredDrawPoint(d.p3)) return false;
  if (d.text !== undefined && typeof d.text !== "string") return false;
  if (d.hidden !== undefined && typeof d.hidden !== "boolean") return false;
  return true;
}

export function getChartDrawings(pair: string): StoredDrawing[] {
  try {
    const raw = localStorage.getItem(chartDrawingsKey(pair));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isStoredDrawing) : [];
  } catch {
    return [];
  }
}
export function setChartDrawings(pair: string, drawings: StoredDrawing[]): void {
  localStorage.setItem(chartDrawingsKey(pair), JSON.stringify(drawings));
}

// Last instrument+timeframe viewed on the Analytics chart. Drawings are
// already durable per pair+tf (above) — what wasn't durable is which pair+tf
// the chart opens back up on, so navigating away and back (AppShell
// unmounts/remounts pages, no keep-alive) or restarting the app landed back
// on the hardcoded EUR/USD 1D default and made any drawings on whatever the
// user had actually been looking at seem to have vanished.
const LAST_CHART_SELECTION_KEY = "tm_analytics_last_selection";
export interface LastChartSelection { pair: string; chartTf: string; }

export function getLastChartSelection(): LastChartSelection | null {
  try {
    const raw = localStorage.getItem(LAST_CHART_SELECTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastChartSelection>;
    if (typeof parsed.pair === "string" && typeof parsed.chartTf === "string") {
      return { pair: parsed.pair, chartTf: parsed.chartTf };
    }
    return null;
  } catch {
    return null;
  }
}
export function setLastChartSelection(pair: string, chartTf: string): void {
  localStorage.setItem(LAST_CHART_SELECTION_KEY, JSON.stringify({ pair, chartTf }));
}

// Which indicators/overlays are toggled on and how the chart is currently
// styled — the toolbar state, not tied to any one instrument (unlike
// drawings, which are anchored to specific price/time coordinates and stay
// scoped per pair+tf). Turning Sessions on for EUR/USD and expecting it
// still on after switching to GBP/USD or restarting the app means this is
// meant to behave like a standing display preference, not per-chart state.
// Only the single (non-Quad-View) chart reads/writes this — 4 independent
// Quad View tiles sharing one stored toggle set would otherwise clobber
// each other every time any one of them changed something.
export interface ChartViewSettings {
  viewMode: "candles" | "line";
  activeInds: string[];
  candleColorScheme: "default" | "tradingview";
  showDailyZones: boolean;
  show4HZones: boolean;
  show1HZones: boolean;
  show15MZones: boolean;
  show5MZones: boolean;
  showWeeklyTrend: boolean;
  showDailyTrend: boolean;
  show4HTrend: boolean;
  show1HTrend: boolean;
  show15MTrend: boolean;
  show5MTrend: boolean;
  show1MTrend: boolean;
  showNews: boolean;
  showTappedZone: boolean;
  showSessions: boolean;
  sessionVisibility: { tokyo: boolean; london: boolean; newyork: boolean };
  sessionBackCount: number;
}
const DEFAULT_CHART_VIEW_SETTINGS: ChartViewSettings = {
  viewMode: "candles",
  activeInds: ["volume"],
  candleColorScheme: "tradingview",
  showDailyZones: false, show4HZones: false, show1HZones: false, show15MZones: false, show5MZones: false,
  showWeeklyTrend: true, showDailyTrend: false, show4HTrend: false, show1HTrend: false, show15MTrend: false,
  show5MTrend: false, show1MTrend: false,
  showNews: false,
  showTappedZone: true,
  showSessions: false,
  sessionVisibility: { tokyo: true, london: true, newyork: true },
  sessionBackCount: 5,
};
const CHART_VIEW_SETTINGS_KEY = "tm_chart_view_settings";

export function getChartViewSettings(): ChartViewSettings {
  const d = DEFAULT_CHART_VIEW_SETTINGS;
  try {
    const raw = localStorage.getItem(CHART_VIEW_SETTINGS_KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<ChartViewSettings>;
    return {
      viewMode: p.viewMode === "line" ? "line" : d.viewMode,
      activeInds: Array.isArray(p.activeInds) && p.activeInds.every((v) => typeof v === "string") ? p.activeInds : d.activeInds,
      candleColorScheme: p.candleColorScheme === "default" || p.candleColorScheme === "tradingview" ? p.candleColorScheme : d.candleColorScheme,
      showDailyZones: typeof p.showDailyZones === "boolean" ? p.showDailyZones : d.showDailyZones,
      show4HZones: typeof p.show4HZones === "boolean" ? p.show4HZones : d.show4HZones,
      show1HZones: typeof p.show1HZones === "boolean" ? p.show1HZones : d.show1HZones,
      show15MZones: typeof p.show15MZones === "boolean" ? p.show15MZones : d.show15MZones,
      show5MZones: typeof p.show5MZones === "boolean" ? p.show5MZones : d.show5MZones,
      showWeeklyTrend: typeof p.showWeeklyTrend === "boolean" ? p.showWeeklyTrend : d.showWeeklyTrend,
      showDailyTrend: typeof p.showDailyTrend === "boolean" ? p.showDailyTrend : d.showDailyTrend,
      show4HTrend: typeof p.show4HTrend === "boolean" ? p.show4HTrend : d.show4HTrend,
      show1HTrend: typeof p.show1HTrend === "boolean" ? p.show1HTrend : d.show1HTrend,
      show15MTrend: typeof p.show15MTrend === "boolean" ? p.show15MTrend : d.show15MTrend,
      show5MTrend: typeof p.show5MTrend === "boolean" ? p.show5MTrend : d.show5MTrend,
      show1MTrend: typeof p.show1MTrend === "boolean" ? p.show1MTrend : d.show1MTrend,
      showNews: typeof p.showNews === "boolean" ? p.showNews : d.showNews,
      showTappedZone: typeof p.showTappedZone === "boolean" ? p.showTappedZone : d.showTappedZone,
      showSessions: typeof p.showSessions === "boolean" ? p.showSessions : d.showSessions,
      sessionVisibility: (p.sessionVisibility && typeof p.sessionVisibility === "object")
        ? {
            tokyo: p.sessionVisibility.tokyo !== false,
            london: p.sessionVisibility.london !== false,
            newyork: p.sessionVisibility.newyork !== false,
          }
        : d.sessionVisibility,
      sessionBackCount: typeof p.sessionBackCount === "number" ? p.sessionBackCount : d.sessionBackCount,
    };
  } catch {
    return d;
  }
}
export function setChartViewSettings(settings: ChartViewSettings): void {
  localStorage.setItem(CHART_VIEW_SETTINGS_KEY, JSON.stringify(settings));
}

export function getAnalyticsPanelOrder(defaultOrder: string[]): string[] {
  try {
    const raw = localStorage.getItem("tm_analytics_panel_order_v10");
    if (!raw) return [...defaultOrder];
    const saved = JSON.parse(raw) as unknown;
    const ids = saved as unknown[];
    if (
      !Array.isArray(ids) ||
      ids.length !== defaultOrder.length ||
      !ids.every((id): id is string => typeof id === "string" && defaultOrder.includes(id)) ||
      new Set(ids).size !== ids.length || // reject duplicates
      ids[0] !== defaultOrder[0] ||       // pinned slot 0 must match
      ids[1] !== defaultOrder[1]          // pinned slot 1 must match
    ) return [...defaultOrder];
    return ids as string[];
  } catch {
    return [...defaultOrder];
  }
}
export function setAnalyticsPanelOrder(order: string[]): void {
  localStorage.setItem("tm_analytics_panel_order_v10", JSON.stringify(order));
}
