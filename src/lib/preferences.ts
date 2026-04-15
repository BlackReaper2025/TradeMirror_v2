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
