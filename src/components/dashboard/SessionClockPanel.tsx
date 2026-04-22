// ─── SessionClockPanel — Local Time top, Market Session bottom ─────────────────
import React, { useEffect, useRef, useState } from "react";
import { Panel } from "../ui/Panel";
import { getTimeFormat, type TimeFormat } from "../../lib/preferences";

// ── Session definitions (all boundaries = local clock time) ───────────────────
type SessionName = "Closed" | "Sydney" | "Tokyo" | "London" | "New York" | "Rollover Hour";

const SESSION_STYLES: Record<SessionName, { color: string; hours: string }> = {
  "Closed":        { color: "#6b7280", hours: "Fri 5:00 PM – Sun 5:00 PM" },
  "Sydney":        { color: "#eab308", hours: "5:00 PM – 2:00 AM"         },
  "Tokyo":         { color: "#8b5cf6", hours: "7:00 PM – 4:00 AM"         },
  "London":        { color: "#3b82f6", hours: "3:00 AM – 12:00 PM"        },
  "New York":      { color: "#7ed62e", hours: "8:00 AM – 5:00 PM"         },
  "Rollover Hour": { color: "#ef4444", hours: "5:00 PM – 6:00 PM"         },
};

// Priority (highest first): Closed > Rollover Hour > New York > London > Tokyo > Sydney
function getSession(now: Date): SessionName {
  const day  = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  if ((day === 5 && mins >= 17 * 60) || day === 6 || (day === 0 && mins < 17 * 60)) return "Closed";
  if (day >= 1 && day <= 4 && mins >= 17 * 60 && mins < 18 * 60) return "Rollover Hour";
  if (day >= 1 && day <= 5 && mins >= 8 * 60  && mins < 17 * 60) return "New York";
  if (day >= 1 && day <= 5 && mins >= 3 * 60  && mins < 12 * 60) return "London";
  if (mins >= 19 * 60 || mins < 4 * 60) return "Tokyo";
  return "Sydney";
}

// Returns every session whose window is currently open (used for overlap detection).
// Closed and Rollover are exclusive — no overlap possible during those states.
function getActiveSessions(now: Date): SessionName[] {
  const day  = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();

  if ((day === 5 && mins >= 17 * 60) || day === 6 || (day === 0 && mins < 17 * 60)) return ["Closed"];
  if (day >= 1 && day <= 4 && mins >= 17 * 60 && mins < 18 * 60) return ["Rollover Hour"];

  const active: SessionName[] = [];
  if (day >= 1 && day <= 5 && mins >= 8 * 60  && mins < 17 * 60) active.push("New York");
  if (day >= 1 && day <= 5 && mins >= 3 * 60  && mins < 12 * 60) active.push("London");
  if (mins >= 19 * 60 || mins < 4 * 60)                          active.push("Tokyo");
  if (mins >= 17 * 60  || mins < 2 * 60)                         active.push("Sydney");
  return active.length > 0 ? active : ["Closed"];
}

const SESSION_TIMEZONES: Partial<Record<SessionName, string>> = {
  Sydney:       "Australia/Sydney",
  Tokyo:        "Asia/Tokyo",
  London:       "Europe/London",
  "New York":   "America/New_York",
};

function getSessionLocalTime(session: SessionName, fmt: TimeFormat): string | null {
  const tz = SESSION_TIMEZONES[session];
  if (!tz) return null;
  return new Date().toLocaleTimeString("en-US", {
    timeZone: tz,
    hour:     "2-digit",
    minute:   "2-digit",
    hour12:   fmt !== "24h",
  });
}

function pad(n: number) { return String(n).padStart(2, "0"); }

function buildTimeStr(now: Date, fmt: TimeFormat): string {
  if (fmt === "24h") {
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }
  let h = now.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${pad(h)}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${ampm}`;
}

// ── Next session open countdown ───────────────────────────────────────────────
// All upcoming session transitions (opens, rollover, and close)
const ALL_TRANSITIONS: { label: string; session: SessionName; days: number[]; h: number; m: number }[] = [
  { label: "Rollover Hour", session: "Rollover Hour", days: [1,2,3,4], h: 17, m: 0 },
  { label: "Market Closed", session: "Closed",        days: [5],       h: 17, m: 0 },
  { label: "Sydney Open",   session: "Sydney",        days: [0],       h: 17, m: 0 },
  { label: "Sydney Open",   session: "Sydney",        days: [1,2,3,4], h: 18, m: 0 },
  { label: "Tokyo Open",    session: "Tokyo",         days: [0,1,2,3,4],h: 19, m: 0 },
  { label: "London Open",   session: "London",        days: [1,2,3,4,5],h:  3, m: 0 },
  { label: "New York Open", session: "New York",      days: [1,2,3,4,5],h:  8, m: 0 },
];

function getSessionProgress(now: Date, session: SessionName): number {
  const mins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  switch (session) {
    case "New York":      return clamp((mins - 8 * 60)  / (9 * 60));   // 8AM–5PM  (9h)
    case "London":        return clamp((mins - 3 * 60)  / (9 * 60));   // 3AM–12PM (9h)
    case "Rollover Hour": return clamp((mins - 17 * 60) / 60);         // 5PM–6PM  (1h)
    case "Tokyo": {
      const start = 19 * 60, duration = 9 * 60;                        // 7PM–4AM  (9h)
      const elapsed = mins >= start ? mins - start : (24 * 60 - start) + mins;
      return clamp(elapsed / duration);
    }
    case "Sydney": {
      const start = 17 * 60, duration = 9 * 60;                        // 5PM–2AM  (9h)
      const elapsed = mins >= start ? mins - start : (24 * 60 - start) + mins;
      return clamp(elapsed / duration);
    }
    default: return 0;
  }
}

function getNextOpenInfo(now: Date, active: SessionName[]): string | null {
  const nowMs = now.getTime();
  let best: { ms: number; label: string } | null = null;

  for (const entry of ALL_TRANSITIONS) {
    if (active.includes(entry.session)) continue; // already in this state
    for (let d = 0; d <= 8; d++) {
      const c = new Date(now);
      c.setDate(c.getDate() + d);
      c.setHours(entry.h, entry.m, 0, 0);
      if (!entry.days.includes(c.getDay())) continue;
      if (c.getTime() <= nowMs) continue;
      if (!best || c.getTime() < best.ms) best = { ms: c.getTime(), label: entry.label };
      break;
    }
  }

  if (!best) return null;
  const totalMin = Math.floor((best.ms - nowMs) / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const timeStr = h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m}m`;
  return `${timeStr} until ${best.label}`;
}

function getDisplay(fmt: TimeFormat) {
  const now    = new Date();
  const active = getActiveSessions(now);
  return {
    time:     buildTimeStr(now, fmt),
    date:     now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    session:  getSession(now),
    overlap:  active,
    nextOpen: getNextOpenInfo(now, active),
  };
}

export function SessionClockPanel() {
  const [fmt,       setFmt]       = useState<TimeFormat>(getTimeFormat);
  const [display,   setDisplay]   = useState(() => getDisplay(getTimeFormat()));
  const [flipIdx,   setFlipIdx]   = useState(0);
  const [fadeIn,    setFadeIn]    = useState(true);

  useEffect(() => {
    const handler = () => setFmt(getTimeFormat());
    window.addEventListener("tm:prefs-changed", handler);
    return () => window.removeEventListener("tm:prefs-changed", handler);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setDisplay(getDisplay(fmt)), 1000);
    return () => clearInterval(id);
  }, [fmt]);

  // Cycle through overlapping sessions every 3 s (only when >1 active)
  const overlapCount = display.overlap.length;
  useEffect(() => {
    if (overlapCount <= 1) { setFlipIdx(0); return; }
    const id = setInterval(() => {
      setFadeIn(false);
      setTimeout(() => {
        setFlipIdx(i => (i + 1) % overlapCount);
        setFadeIn(true);
      }, 250);
    }, 6000);
    return () => clearInterval(id);
  }, [overlapCount]);

  // Reset flip index when the overlap set changes size
  useEffect(() => { setFlipIdx(0); setFadeIn(true); }, [overlapCount]);

  const { time, date, overlap } = display;
  // During overlap, badge cycles through all active sessions; otherwise use priority session
  const displayedSession = overlap.length > 1 ? overlap[flipIdx % overlap.length] : display.session;
  const style             = SESSION_STYLES[displayedSession];
  const isOpen            = displayedSession !== "Closed";
  const overlapPeers      = overlap.filter(s => s !== display.session);
  const sessionProgress   = isOpen ? getSessionProgress(new Date(), displayedSession) : 0;

  // Disable the width transition when the displayed session changes (snap, not animate)
  const prevSessionRef  = useRef(displayedSession);
  const [barTransition, setBarTransition] = useState("width 1s linear");
  useEffect(() => {
    if (prevSessionRef.current !== displayedSession) {
      setBarTransition("none");
      prevSessionRef.current = displayedSession;
      // Re-enable smooth transition after the snap has rendered
      const id = setTimeout(() => setBarTransition("width 1s linear"), 50);
      return () => clearTimeout(id);
    }
  }, [displayedSession]);

  return (
    <div style={{ position: "relative" }}>
    {/* Gradient border overlay — zero layout impact via CSS mask */}
    <div style={{
      position: "absolute", inset: 0, borderRadius: "14px", padding: "1.5px", pointerEvents: "none", zIndex: 10,
      background: "rgba(255,255,255,0.12)",
      WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
      WebkitMaskComposite: "xor",
      maskComposite: "exclude",
    } as React.CSSProperties} />
    <Panel state className="flex flex-col gap-0 p-0 overflow-hidden" style={{ border: "none", borderRadius: "14px", background: "radial-gradient(ellipse at top left, rgba(255,255,255,0.07) 0%, transparent 60%), rgba(8,12,18,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", boxShadow: "none" } as React.CSSProperties}>
      <style>{`
        @keyframes session-badge-glow {
          from { box-shadow: 0 0 2px 0px var(--badge-glow); }
          to   { box-shadow: 0 0 8px 3px var(--badge-glow); }
        }
        .session-badge-glow {
          animation: session-badge-glow 1.4s ease-in-out infinite alternate;
        }
      `}</style>

      {/* ── Top: Local Time ── */}
      <div
        className="flex flex-col justify-center px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="text-[14px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-secondary)" }}>
          Local Time
        </div>
        <div className="text-[40px] font-bold tabular-nums leading-none whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
          {time}
        </div>
        <div className="text-[12px] mt-2" style={{ color: "var(--text-secondary)" }}>
          {date}
        </div>
      </div>

      {/* ── Bottom: Market Session ── */}
      <div className="flex flex-col justify-center px-5 pt-4 pb-2.5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[14px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
            Market Session
          </span>
          {overlapPeers.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span
                className="text-[9px] font-semibold uppercase tracking-widest"
                style={{ color: "#6b7280" }}
              >
                Overlap
              </span>
              {overlap.map(s => (
                <span
                  key={s}
                  className="session-badge-glow text-[9px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap"
                  style={{
                    background:        SESSION_STYLES[s].color + "22",
                    color:             SESSION_STYLES[s].color,
                    border:            `1px solid ${SESSION_STYLES[s].color}40`,
                    "--badge-glow":    SESSION_STYLES[s].color + "88",
                  } as React.CSSProperties}
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Session badge — fades between sessions during overlap */}
        <div
          className="flex flex-col gap-2.5 px-3 py-2.5 rounded-xl mb-1"
          style={{
            background:  style.color + "18",
            border:      `1px solid ${style.color}30`,
            opacity:     fadeIn ? 1 : 0,
            transition:  "opacity 0.25s ease, background 0.25s ease, border-color 0.25s ease",
          }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2 h-2 rounded-full shrink-0${isOpen ? " pulse-dot" : ""}`}
              style={{ background: style.color }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[17px] font-bold leading-tight" style={{ color: style.color, transition: "color 0.25s ease" }}>
                  {displayedSession}
                </div>
                {getSessionLocalTime(displayedSession, fmt) && (
                  <div className="text-[12px] font-semibold tabular-nums shrink-0" style={{ color: style.color, opacity: 0.8 }}>
                    {getSessionLocalTime(displayedSession, fmt)}
                  </div>
                )}
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                {isOpen ? "Market open" : "Market closed"}
              </div>
              <div className="text-[11px] font-medium tabular-nums mt-1" style={{ color: "var(--text-secondary)" }}>
                {style.hours}
              </div>
            </div>
          </div>

          {/* Session progress bar */}
          {isOpen && (
            <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: `${style.color}22` }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${sessionProgress * 100}%`,
                  background: style.color,
                  transition: barTransition,
                }}
              />
            </div>
          )}
        </div>

        {/* Next session countdown */}
        {display.nextOpen && (
          <div className="text-[11px] font-bold text-center mt-3" style={{ color: "var(--text-muted)" }}>
            {display.nextOpen}
          </div>
        )}
      </div>

    </Panel>
    </div>
  );
}
