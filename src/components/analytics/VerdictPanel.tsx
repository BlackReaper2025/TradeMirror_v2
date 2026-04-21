import { TrendingUp, TrendingDown } from "lucide-react";
import { Panel } from "../ui/Panel";
import { analysisResult, signalTags, signalHistory, historicalAccuracy } from "../../data/analyticsData";

export function VerdictPanel() {
  const { direction, confidence, longScore, shortScore } = analysisResult;
  const confHighlight = confidence >= 65;
  const last10 = signalHistory.slice(-10);

  return (
    <Panel className="h-full flex p-0 overflow-hidden" style={{ border: "1px solid var(--border-subtle)", boxShadow: "0 4px 24px rgba(0,0,0,0.45)" }}>

      {/* ── Left: Direction ─────────────────────────────────────── */}
      <div
        className="flex shrink-0"
        style={{ minWidth: "240px", borderRight: "1px solid var(--border-subtle)" }}
      >
        <div className="flex flex-col items-center justify-center px-7 gap-3">
          <div className="relative flex items-center justify-center">
            <div className="absolute" style={{ right: "calc(100% + 8px)" }}>
              {direction === "LONG"
                ? <TrendingUp   size={22} style={{ color: "var(--accent-text)", filter: "drop-shadow(0 0 6px var(--accent-text))" }} strokeWidth={2.5} />
                : <TrendingDown size={22} style={{ color: "var(--accent-text)", filter: "drop-shadow(0 0 6px var(--accent-text))" }} strokeWidth={2.5} />
              }
            </div>
            <span
              className="text-[22px] font-bold tracking-widest leading-none"
              style={{
                color:      "var(--accent-text)",
                textShadow: "0 0 6px var(--accent-text)",
              }}
            >
              {direction}
            </span>
          </div>

          <span className="text-[12px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            {direction === "LONG" ? "Bullish" : "Bearish"} Bias
          </span>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: "#60a5fa" }} />
              <span className="text-[12px]" style={{ color: "#60a5fa" }}>{longScore} long</span>
            </span>
            <span className="text-[12px]" style={{ color: "var(--border-medium)" }}>·</span>
            <span className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: "#a78bfa" }} />
              <span className="text-[12px]" style={{ color: "#a78bfa" }}>{shortScore} short</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── Center: Confidence + Signal tags ────────────────────── */}
      <div className="flex-1 flex flex-col justify-center px-6 py-5">
        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-[11px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            Confidence
          </span>
          <span className="text-[28px] font-black tabular-nums leading-none" style={{ color: "var(--text-primary)" }}>
            {confidence}%
          </span>
        </div>

        <div className="w-full h-2 rounded-full mb-4" style={{ background: "rgba(255,255,255,0.07)" }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${confidence}%`, background: confHighlight ? "var(--accent-text)" : "var(--text-secondary)", boxShadow: confHighlight ? "0 0 6px var(--accent-text)" : "none" }}
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {signalTags.map((tag) => {
            const color =
              tag.bias === "bullish" ? "#60a5fa" :
              tag.bias === "bearish" ? "#a78bfa" :
              "#7a8fa8";
            return (
              <span
                key={tag.label}
                className="text-[10px] px-2 py-0.5 rounded-md font-semibold"
                style={{
                  background: tag.active ? `${color}12` : "transparent",
                  color:      tag.active ? color         : "var(--text-muted)",
                  border:     `1px solid ${tag.active ? `${color}35` : "var(--border-subtle)"}`,
                }}
              >
                {tag.active ? "✓" : "✗"} {tag.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* ── Right: Historical accuracy ───────────────────────────── */}
      <div
        className="flex flex-col items-center justify-center px-7 shrink-0"
        style={{ minWidth: "160px", borderLeft: "1px solid var(--border-subtle)" }}
      >
        <span className="text-[11px] uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>
          Historical
        </span>
        <span className="text-[40px] font-black leading-none" style={{ color: "var(--text-primary)" }}>
          {historicalAccuracy}%
        </span>
        <div className="flex gap-1 mt-3">
          {last10.map((s, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full"
              style={{
                background: "var(--text-secondary)",
                opacity:    s === "win" ? 0.85 : s === "loss" ? 0.25 : 0.1,
              }}
            />
          ))}
        </div>
        <span className="text-[10px] mt-1.5" style={{ color: "var(--text-muted)" }}>
          last 30 signals
        </span>
      </div>

    </Panel>
  );
}
