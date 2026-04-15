// ─── Market session definitions — static config, not stored in DB ────────────

export type SessionName =
  | "Pre-Asia"
  | "Asia"
  | "London"
  | "New York"
  | "Roll Over"
  | "Closed";

export interface SessionWindow {
  name: SessionName;
  utcStart: number; // hour in UTC
  utcEnd: number;
  color: string;
}

// Order matters: first match wins. New York (12–21) is listed before Pre-Asia
// (20–23) so the 20:00–21:00 UTC overlap correctly shows New York, not Pre-Asia.
export const SESSIONS: SessionWindow[] = [
  { name: "Asia",      utcStart: 23, utcEnd: 8,  color: "#eab308" }, // yellow
  { name: "London",    utcStart: 7,  utcEnd: 16, color: "#3b82f6" }, // blue
  { name: "New York",  utcStart: 12, utcEnd: 21, color: "#8b5cf6" }, // purple
  { name: "Roll Over", utcStart: 21, utcEnd: 22, color: "#ef4444" }, // red
  { name: "Pre-Asia",  utcStart: 22, utcEnd: 23, color: "#6b7280" }, // grey
];

export function getCurrentSession(utcHour: number): SessionWindow | null {
  for (const s of SESSIONS) {
    if (s.utcStart < s.utcEnd) {
      if (utcHour >= s.utcStart && utcHour < s.utcEnd) return s;
    } else {
      // wraps midnight
      if (utcHour >= s.utcStart || utcHour < s.utcEnd) return s;
    }
  }
  return null;
}
