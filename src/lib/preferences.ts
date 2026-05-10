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

export function getAnalyticsPanelOrder(defaultOrder: string[]): string[] {
  try {
    const raw = localStorage.getItem("tm_analytics_panel_order_v9");
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
    return saved;
  } catch {
    return [...defaultOrder];
  }
}
export function setAnalyticsPanelOrder(order: string[]): void {
  localStorage.setItem("tm_analytics_panel_order_v9", JSON.stringify(order));
}
