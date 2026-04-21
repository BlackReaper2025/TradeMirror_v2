import { analysisResult } from "../../data/analyticsData";
import type { SignalGroup } from "../../data/analyticsData";

const BIAS_COLORS = {
  bullish: "#4ade80",
  bearish: "#f87171",
  neutral: "#7a8fa8",
};

const BIAS_LABELS = {
  bullish: "Bullish",
  bearish: "Bearish",
  neutral: "Neutral",
};

function BiasPill({ label, group }: { label: string; group: SignalGroup }) {
  const color = BIAS_COLORS[group.bias];
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[11px] uppercase tracking-widest font-semibold"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <div
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
        style={{
          background: `${color}18`,
          border: `1px solid ${color}40`,
        }}
      >
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        <span
          className="text-[11px] font-bold uppercase tracking-wide"
          style={{ color }}
        >
          {BIAS_LABELS[group.bias]}
        </span>
      </div>
    </div>
  );
}

export function BiasSummaryBar() {
  const { signals, direction, confidence } = analysisResult;
  const directionColor = direction === "LONG" ? "#4ade80" : "#f87171";

  return (
    <div
      className="h-full flex items-center justify-between px-5"
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--accent-border)",
        borderRadius: "14px",
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="text-[13px] font-bold tracking-wider"
          style={{ color: "var(--text-primary)" }}
        >
          EUR/USD
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Daily · Updated 6:00 PM ET
        </span>
      </div>

      <div className="flex items-center gap-6">
        <BiasPill label="Trend" group={signals.trend} />
        <div className="w-px h-4" style={{ background: "var(--border-subtle)" }} />
        <BiasPill label="Momentum" group={signals.momentum} />
        <div className="w-px h-4" style={{ background: "var(--border-subtle)" }} />
        <BiasPill label="Structure" group={signals.structure} />
        <div className="w-px h-4" style={{ background: "var(--border-subtle)" }} />
        <BiasPill label="Volatility" group={signals.volatility} />
      </div>

      <div className="flex items-center gap-3">
        <span
          className="text-[11px] uppercase tracking-widest"
          style={{ color: "var(--text-muted)" }}
        >
          Overall
        </span>
        <div
          className="flex items-center gap-2 px-3 py-1 rounded-full"
          style={{
            background: `${directionColor}22`,
            border: `1px solid ${directionColor}55`,
          }}
        >
          <span
            className="text-[13px] font-black tracking-widest"
            style={{ color: directionColor }}
          >
            {direction}
          </span>
          <span
            className="text-[11px] font-semibold"
            style={{ color: `${directionColor}cc` }}
          >
            {confidence}%
          </span>
        </div>
      </div>
    </div>
  );
}
