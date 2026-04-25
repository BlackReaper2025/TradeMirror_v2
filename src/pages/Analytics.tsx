// ─── Analytics — 3-row layout + pair selector ─────────────────────────────────
//
//  PairSelector  — top strip, EUR/USD active, others placeholder
//  Row 1         — Verdict:  direction · confidence bar · signal tags · history %
//  Row 2         — Evidence: 5 equal group cards (Trend, MACD, Momentum, Volatility, Directional)
//  Row 3         — Detail:   Entry/Exit plan | Signal history dots | Live indicator bars
//
import { useEffect, useState }   from "react";
import { VerdictPanel }          from "../components/analytics/VerdictPanel";
import { EvidenceCards }         from "../components/analytics/EvidenceCards";
import { EntryExitPanel }        from "../components/analytics/EntryExitPanel";
import { HistoryDotsPanel }      from "../components/analytics/HistoryDotsPanel";
import { LiveIndicatorPanel }    from "../components/analytics/LiveIndicatorPanel";
import { PairSelector }          from "../components/analytics/PairSelector";
import { useAnalytics, setLiveAnalytics, hasLiveAnalytics, signalHistory, historicalAccuracy } from "../data/analyticsData";
import { fetchSheetRows }        from "../lib/googleSheets";
import { analyze }               from "../lib/brain/analyzer";

function formatDataDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year:    "numeric",
    month:   "long",
    day:     "numeric",
    timeZone: "America/New_York",
  });
}

// ── Verdict-driven color palette ─────────────────────────────────────────────
// Overrides CSS accent vars at the container level so every child component
// that uses var(--accent-text / --accent-dim / --accent-border) inherits the
// correct verdict color without any per-component changes.
interface VerdictPalette {
  vars:     React.CSSProperties;
  gradient: string;
}

const VERDICT_COLORS: Record<"long" | "short" | "neutral", VerdictPalette> = {
  long: {
    vars: {
      "--accent-text":   "#60a5fa",
      "--accent-dim":    "rgba(96, 165, 250, 0.11)",
      "--accent-border": "rgba(96, 165, 250, 0.25)",
    } as React.CSSProperties,
    gradient: "var(--bg-base)",
  },
  short: {
    vars: {
      "--accent-text":   "#a78bfa",
      "--accent-dim":    "rgba(167, 139, 250, 0.10)",
      "--accent-border": "rgba(167, 139, 250, 0.24)",
    } as React.CSSProperties,
    gradient: "var(--bg-base)",
  },
  neutral: {
    vars: {
      "--accent-text":   "#94a3b8",
      "--accent-dim":    "rgba(148, 163, 184, 0.10)",
      "--accent-border": "rgba(148, 163, 184, 0.20)",
    } as React.CSSProperties,
    gradient: "var(--bg-base)",
  },
};

export function Analytics() {
  const { analysisResult, eurusdSnapshot } = useAnalytics();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasLiveAnalytics()) return;
    fetchSheetRows(50)
      .then(rows => {
        setLiveAnalytics({ ...analyze(rows), signalHistory, historicalAccuracy });
      })
      .catch(err => setError(String(err)));
  }, []);

  const verdict =
    analysisResult.direction === "LONG"  ? "long"    :
    analysisResult.direction === "SHORT" ? "short"   :
    "neutral";

  return (
    <div
      className="flex-1 overflow-hidden flex flex-col"
      style={{
        padding:    "12px 14px 14px",
        gap:        "12px",
        background: VERDICT_COLORS[verdict].gradient,
        ...VERDICT_COLORS[verdict].vars,
      }}
    >

      {/* ── Sheet fetch error ─────────────────────────────────────── */}
      {error && (
        <div className="shrink-0 px-4 py-2 rounded-xl text-[11px]"
          style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171" }}>
          Google Sheets error: {error}
        </div>
      )}

      {/* ── Top bar: Pair Selector + Data date ────────────────────── */}
      <div className="flex items-center gap-3 shrink-0" style={{ height: "40px" }}>
        <PairSelector />
        <div className="flex items-center gap-4 px-4 h-full rounded-[14px]"
          style={{
            background: "var(--bg-panel)",
            border:     "1px solid var(--border-subtle)",
          }}
        >
          <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
            Data for
          </span>
          <span className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>
            {formatDataDate(eurusdSnapshot.timestamp)}
          </span>
        </div>
      </div>

      {/* ── Row 1: Verdict ─────────────────────────────────────────── */}
      <div className="shrink-0" style={{ height: "162px" }}>
        <VerdictPanel />
      </div>

      {/* ── Row 2: Evidence cards ──────────────────────────────────── */}
      <div className="shrink-0" style={{ height: "360px" }}>
        <EvidenceCards />
      </div>

      {/* ── Row 3: Detail ─────────────────────────────────────────── */}
      <div
        className="flex-1 min-h-0"
        style={{
          display:               "grid",
          gridTemplateColumns:   "4fr 3fr 5fr",
          gap:                   "12px",
        }}
      >
        <EntryExitPanel />
        <HistoryDotsPanel />
        <LiveIndicatorPanel />
      </div>

    </div>
  );
}
