import { useState, useEffect, useRef } from "react";
import { Timer, Play, Pause, RotateCcw, X } from "lucide-react";
import { Panel, PanelHeader } from "../ui/Panel";

const PRESETS = [30, 60, 90, 120]; // minutes

function pad(n: number) { return String(n).padStart(2, "0"); }

export function FatigueTimer() {
  const [totalSecs, setTotalSecs] = useState(60 * 60); // 60 min default
  const [remaining, setRemaining] = useState(60 * 60);
  const [running, setRunning] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            setRunning(false);
            setShowOverlay(true);
            return 0;
          }
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
    setTotalSecs(mins * 60);
    setRemaining(mins * 60);
  };

  const pct = totalSecs > 0 ? ((totalSecs - remaining) / totalSecs) * 100 : 0;
  const hours = Math.floor(remaining / 3600);
  const mins = Math.floor((remaining % 3600) / 60);
  const secs = remaining % 60;
  const timeStr = hours > 0 ? `${pad(hours)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;

  const warningLevel = remaining < 300 ? "red" : remaining < 600 ? "yellow" : "normal";

  return (
    <>
      <Panel className="h-full flex flex-col">
        <PanelHeader label="Fatigue Timer">
          <Timer size={14} style={{ color: "var(--text-muted)" }} />
        </PanelHeader>

        {/* Time display */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          {/* Circular progress */}
          <div className="relative w-24 h-24">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 96 96">
              <circle cx="48" cy="48" r="40" fill="none" stroke="var(--border-subtle)" strokeWidth="6" />
              <circle
                cx="48" cy="48" r="40" fill="none"
                stroke={warningLevel === "red" ? "#ef4444" : warningLevel === "yellow" ? "#f59e0b" : "var(--accent)"}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - pct / 100)}`}
                style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="text-[18px] font-bold tabular-nums leading-none"
                style={{ color: warningLevel === "red" ? "#f87171" : warningLevel === "yellow" ? "#fbbf24" : "var(--text-primary)" }}
              >
                {timeStr}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => reset(totalSecs / 60)}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ background: "var(--bg-panel-alt)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
            >
              <RotateCcw size={13} />
            </button>
            <button
              onClick={() => setRunning((r) => !r)}
              className="w-10 h-10 rounded-xl flex items-center justify-center font-medium transition-all"
              style={{
                background: running ? "var(--accent-dim)" : "var(--accent)",
                border: `1px solid var(--accent-border)`,
                color: running ? "var(--accent-text)" : "#000",
              }}
            >
              {running ? <Pause size={15} /> : <Play size={15} />}
            </button>
          </div>

          {/* Preset buttons */}
          <div className="flex gap-1.5">
            {PRESETS.map((m) => (
              <button
                key={m}
                onClick={() => reset(m)}
                className="px-2 py-1 rounded-lg text-[11px] font-medium transition-colors"
                style={{ background: "var(--bg-panel-alt)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
              >
                {m}m
              </button>
            ))}
          </div>
        </div>
      </Panel>

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
              Step away, rest, and return with a fresh perspective. Protect your edge.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setShowOverlay(false); reset(60); }}
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
          <button
            onClick={() => setShowOverlay(false)}
            className="absolute top-6 right-6 p-2 rounded-lg"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={20} />
          </button>
        </div>
      )}
    </>
  );
}
