import { Panel } from "../ui/Panel";
import { signalHistory, analysisResult } from "../../data/analyticsData";

export function HistoryDotsPanel() {
  const wins    = signalHistory.filter((s) => s === "win").length;
  const losses  = signalHistory.filter((s) => s === "loss").length;
  const pending = signalHistory.filter((s) => s === "pending").length;
  const accuracy = Math.round((wins / (wins + losses)) * 100);

  const dotColor =
    analysisResult.direction === "LONG"  ? "#60a5fa" :
    analysisResult.direction === "SHORT" ? "#a78bfa" :
    "#7a8fa8";

  return (
    <Panel className="h-full flex flex-col p-0 overflow-hidden" style={{ border: "1px solid var(--border-subtle)", boxShadow: "0 4px 24px rgba(0,0,0,0.45)" }}>

      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <span className="text-[13px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
          Signal History
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>last 30</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-3 gap-4">

        <div className="flex flex-col items-center">
          <span className="text-[42px] font-black leading-none tabular-nums" style={{ color: "var(--text-primary)" }}>
            {accuracy}%
          </span>
          <span className="text-[10px] mt-0.5 uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            signal accuracy
          </span>
        </div>

        {/* Dot grid — 10 × 3 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: "6px" }}>
          {signalHistory.map((s, i) => (
            <div
              key={i}
              title={s}
              style={{
                width:        "12px",
                height:       "12px",
                borderRadius: "50%",
                background:   dotColor,
                opacity:      s === "win" ? 0.85 : s === "loss" ? 0.25 : 0.08,
              }}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[10px]">
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: "var(--text-secondary)", opacity: 0.85 }} />
            <span style={{ color: "var(--text-muted)" }}>{wins} wins</span>
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: "var(--text-secondary)", opacity: 0.25 }} />
            <span style={{ color: "var(--text-muted)" }}>{losses} losses</span>
          </span>
          {pending > 0 && (
            <span className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: "var(--text-secondary)", opacity: 0.08 }} />
              <span style={{ color: "var(--text-muted)" }}>{pending} open</span>
            </span>
          )}
        </div>

      </div>
    </Panel>
  );
}
