import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, RotateCcw, X, ChevronRight } from "lucide-react";
import { Panel } from "../ui/Panel";

// Cycle order for the single duration button
const DURATIONS = [60, 90, 120, 180] as const;
const DEFAULT_IDX = 2; // 120 minutes

// Fixed waveform heights for the drain visualiser (20 bars, percent of container height)
const BAR_HEIGHTS = [65, 85, 45, 95, 58, 75, 40, 88, 52, 78, 48, 92, 42, 70, 60, 82, 50, 68, 90, 62];

function pad(n: number) { return String(n).padStart(2, "0"); }

export function FatigueTimer() {
  const [durIdx,      setDurIdx]      = useState(DEFAULT_IDX);
  const [remaining,   setRemaining]   = useState(DURATIONS[DEFAULT_IDX] * 60);
  const [running,     setRunning]     = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalSecs  = DURATIONS[durIdx] * 60;
  const durationMins = DURATIONS[durIdx];

  // Tick
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) { setRunning(false); setShowOverlay(true); return 0; }
          return r - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const reset = (mins: number) => {
    setRunning(false);
    setRemaining(mins * 60);
  };

  // Cycle to next duration and reset timer
  const cycleDuration = () => {
    const next = (durIdx + 1) % DURATIONS.length;
    setDurIdx(next);
    reset(DURATIONS[next]);
  };

  const pct   = totalSecs > 0 ? ((totalSecs - remaining) / totalSecs) * 100 : 0;
  const hrs   = Math.floor(remaining / 3600);
  const mins  = Math.floor((remaining % 3600) / 60);
  const secs  = remaining % 60;
  const timeStr = hrs > 0
    ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}`
    : `${pad(mins)}:${pad(secs)}`;

  const minsLeft     = Math.ceil(remaining / 60);
  const warningLevel = remaining < 300 ? "red" : remaining < 600 ? "yellow" : "normal";
  const ringColor    = warningLevel === "red" ? "#ef4444" : warningLevel === "yellow" ? "#f59e0b" : "var(--accent)";
  const timeColor    = warningLevel === "red" ? "#f87171" : warningLevel === "yellow" ? "#fbbf24" : "var(--text-primary)";

  return (
    <>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "14px", padding: "1.5px", pointerEvents: "none", zIndex: 1, background: "rgba(255,255,255,0.12)", WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude" } as React.CSSProperties} />
      <Panel state className="flex-1 flex flex-col gap-0 p-0 overflow-hidden" style={{ border: "none", borderRadius: "14px", background: "radial-gradient(ellipse at top left, rgba(255,255,255,0.07) 0%, transparent 60%), rgba(8,12,18,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", boxShadow: "none" } as React.CSSProperties}>

        {/* Header — label left, controls right */}
        <div
          className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0 gap-3"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <span className="text-[14px] font-semibold uppercase tracking-widest shrink-0" style={{ color: "var(--text-secondary)" }}>
            Fatigue Timer
          </span>

          {/* Controls inline in header */}
          <div className="flex items-center gap-2">

            {/* Duration cycle */}
            <button
              onClick={cycleDuration}
              title="Cycle duration (60 → 90 → 120 → 180m)"
              className="flex items-center gap-1 px-2 h-7 rounded-lg transition-colors"
              style={{
                background: "var(--bg-panel-alt)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-border)";
                (e.currentTarget as HTMLElement).style.color = "var(--accent-text)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)";
                (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
              }}
            >
              <span className="text-[11px] font-semibold tabular-nums">{durationMins}m</span>
              <ChevronRight size={10} style={{ opacity: 0.6 }} />
            </button>

            {/* Reset */}
            <button
              onClick={() => reset(durationMins)}
              title="Reset"
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{
                background: "var(--bg-panel-alt)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
            >
              <RotateCcw size={11} />
            </button>

            {/* Start / Pause */}
            <button
              onClick={() => setRunning((r) => !r)}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
              style={{
                background: running ? "var(--accent-dim)" : "var(--accent)",
                border: "1px solid var(--accent-border)",
                color: running ? "var(--accent-text)" : "#000",
                boxShadow: running ? "none" : "0 0 12px var(--accent-glow)",
              }}
            >
              {running ? <Pause size={12} /> : <Play size={12} />}
            </button>

          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col justify-center px-5 py-3 gap-4">

          {/* Time display */}
          <div className="flex items-baseline justify-between">
            <span
              className="font-bold tabular-nums leading-none"
              style={{ color: timeColor, fontSize: 32, letterSpacing: "-0.03em", transition: "color 0.5s ease" }}
            >
              {timeStr}
            </span>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {minsLeft}m left
            </span>
          </div>

          {/* Waveform drain */}
          <div className="flex items-end" style={{ height: 34, gap: 3 }}>
            {BAR_HEIGHTS.map((h, i) => {
              const elapsed = totalSecs > 0 ? (totalSecs - remaining) / totalSecs : 1;
              const active  = i / BAR_HEIGHTS.length >= elapsed;
              return (
                <div
                  key={i}
                  className="flex-1"
                  style={{
                    height: `${h}%`,
                    borderRadius: 3,
                    background: active ? ringColor : "rgba(255,255,255,0.06)",
                    boxShadow:  active ? `0 0 6px ${ringColor}55` : "none",
                    transition: "background 0.5s ease, box-shadow 0.5s ease",
                  }}
                />
              );
            })}
          </div>

          {/* Duration dots */}
          <div className="flex gap-2">
            {DURATIONS.map((d, i) => (
              <div
                key={d}
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: i === durIdx ? "var(--accent)" : "var(--border-subtle)" }}
              />
            ))}
          </div>

        </div>
      </Panel>
      </div>

      {/* Fatigue overlay */}
      {showOverlay && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(12px)" }}
        >
          <div
            className="max-w-md w-full mx-6 p-10 rounded-2xl text-center"
            style={{ background: "#0d1219", border: "1px solid rgba(239,68,68,0.25)", boxShadow: "0 0 60px rgba(239,68,68,0.12)" }}
          >
            <div className="text-[48px] mb-4">⚠️</div>
            <h2 className="text-[24px] font-bold mb-3" style={{ color: "#dce6f4" }}>
              Trading Session Complete
            </h2>
            <p className="text-[15px] leading-relaxed mb-2" style={{ color: "#8899aa" }}>
              Your session timer has ended. Mental fatigue is a real risk.
            </p>
            <p className="text-[14px] mb-8" style={{ color: "#64748b" }}>
              Step away, rest, and return with a fresh perspective.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setShowOverlay(false); reset(durationMins); }}
                className="w-full py-3 rounded-xl font-semibold text-[14px] transition-opacity hover:opacity-90"
                style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}
              >
                Stop Trading — I'm Done
              </button>
              <button
                onClick={() => setShowOverlay(false)}
                className="w-full py-3 rounded-xl font-medium text-[14px] transition-opacity hover:opacity-70"
                style={{ color: "#374151" }}
              >
                Continue anyway
              </button>
            </div>
          </div>
          <button onClick={() => setShowOverlay(false)} className="absolute top-6 right-6 p-2 rounded-lg" style={{ color: "var(--text-muted)" }}>
            <X size={20} />
          </button>
        </div>
      )}
    </>
  );
}
