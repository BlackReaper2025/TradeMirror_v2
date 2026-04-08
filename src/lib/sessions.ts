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

export const SESSIONS: SessionWindow[] = [
  { name: "Pre-Asia",  utcStart: 20, utcEnd: 23, color: "#6366f1" },
  { name: "Asia",      utcStart: 23, utcEnd: 8,  color: "#3b82f6" },
  { name: "London",    utcStart: 7,  utcEnd: 16, color: "#f59e0b" },
  { name: "New York",  utcStart: 12, utcEnd: 21, color: "#22c55e" },
  { name: "Roll Over", utcStart: 21, utcEnd: 22, color: "#8b5cf6" },
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
