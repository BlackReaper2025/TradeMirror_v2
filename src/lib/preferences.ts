// ─── User preferences — backed by localStorage ───────────────────────────────
// These are UI preferences that don't need to live in the DB.
// Components listen to the "tm:prefs-changed" window event to react to updates.

export type TimeFormat = "12h" | "24h";

const KEYS = {
  timeFormat:        "tm_time_format",
  brokerageUrl:      "tm_brokerage_url",
  musicUrl:          "tm_music_url",
  slideshowFolder:   "tm_slideshow_folder",
  slideshowInterval: "tm_slideshow_interval",
} as const;

export function getTimeFormat(): TimeFormat {
  return (localStorage.getItem(KEYS.timeFormat) as TimeFormat) ?? "12h";
}
export function setTimeFormat(fmt: TimeFormat): void {
  localStorage.setItem(KEYS.timeFormat, fmt);
  window.dispatchEvent(new CustomEvent("tm:prefs-changed"));
}

export function getBrokerageUrl(): string {
  return localStorage.getItem(KEYS.brokerageUrl) ?? "";
}
export function setBrokerageUrl(url: string): void {
  localStorage.setItem(KEYS.brokerageUrl, url);
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

// Reversal Candles chart indicator — location filters + which candle-shape
// groups are enabled, remembered across app restarts.
export interface ReversalSettings {
  zoneFilter: boolean;
  eightAmBoxFilter: boolean;
  trendlineFilter: boolean;
  patternGroups: string[];
}
const REVERSAL_SETTINGS_KEY = "tm_reversal_settings";

export function getReversalSettings(defaultPatternGroups: string[]): ReversalSettings {
  const fallback: ReversalSettings = {
    zoneFilter: false, eightAmBoxFilter: false, trendlineFilter: false,
    patternGroups: [...defaultPatternGroups],
  };
  try {
    const raw = localStorage.getItem(REVERSAL_SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ReversalSettings>;
    return {
      zoneFilter:       typeof parsed.zoneFilter === "boolean" ? parsed.zoneFilter : fallback.zoneFilter,
      eightAmBoxFilter: typeof parsed.eightAmBoxFilter === "boolean" ? parsed.eightAmBoxFilter : fallback.eightAmBoxFilter,
      trendlineFilter:  typeof parsed.trendlineFilter === "boolean" ? parsed.trendlineFilter : fallback.trendlineFilter,
      patternGroups:    Array.isArray(parsed.patternGroups) && parsed.patternGroups.every((g) => typeof g === "string")
        ? parsed.patternGroups
        : fallback.patternGroups,
    };
  } catch {
    return fallback;
  }
}
export function setReversalSettings(settings: ReversalSettings): void {
  localStorage.setItem(REVERSAL_SETTINGS_KEY, JSON.stringify(settings));
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
