import { Panel } from "../ui/Panel";
import { analysisResult, eurusdSnapshot } from "../../data/analyticsData";

function fmt(price: number): string {
  return price.toFixed(5);
}

function pips(a: number, b: number): string {
  return Math.round(Math.abs(a - b) * 10000).toString();
}

function LevelRow({
  label,
  value,
  color,
  subLabel,
}: {
  label: string;
  value: string;
  color?: string;
  subLabel?: string;
}) {
  return (
    <div
      className="flex items-center justify-between py-2.5 px-1"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <div className="flex flex-col gap-0.5">
        <span
          className="text-[11px] uppercase tracking-widest font-semibold"
          style={{ color: "var(--text-muted)" }}
        >
          {label}
        </span>
        {subLabel && (
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {subLabel}
          </span>
        )}
      </div>
      <span
        className="text-[15px] font-bold tabular-nums"
        style={{ color: color ?? "var(--text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}

export function AnalysisPrimaryPanel() {
  const { direction, confidence, entry, stopLoss, tp1, tp2, tp3, riskReward, longScore, shortScore } =
    analysisResult;
  const { close } = eurusdSnapshot;

  const isLong = direction === "LONG";
  const dirColor = isLong ? "#4ade80" : "#f87171";
  const dirGlow = isLong ? "rgba(74,222,128,0.10)" : "rgba(248,113,113,0.10)";
  const dirBorder = isLong ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)";
  const confColor =
    confidence >= 70 ? "#4ade80" : confidence >= 50 ? "#fbbf24" : "#f87171";

  return (
    <Panel className="h-full flex flex-col p-0 overflow-hidden">

      {/* Direction hero */}
      <div
        className="flex flex-col items-center justify-center py-7 px-5 shrink-0"
        style={{ background: dirGlow, borderBottom: `1px solid ${dirBorder}` }}
      >
        <span
          className="text-[80px] font-black leading-none tracking-tight"
          style={{ color: dirColor }}
        >
          {direction}
        </span>

        {/* Confidence bar */}
        <div className="w-full mt-5 px-2">
          <div className="flex items-center justify-between mb-1.5">
            <span
              className="text-[11px] uppercase tracking-widest"
              style={{ color: "var(--text-muted)" }}
            >
              Confidence
            </span>
            <span
              className="text-[13px] font-bold tabular-nums"
              style={{ color: confColor }}
            >
              {confidence}%
            </span>
          </div>
          <div
            className="w-full h-1.5 rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${confidence}%`,
                background: confColor,
                boxShadow: `0 0 8px ${confColor}88`,
              }}
            />
          </div>
        </div>

        {/* Signal counts */}
        <div className="flex items-center gap-5 mt-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: "#4ade80" }} />
            <span className="text-[11px]" style={{ color: "#4ade80" }}>
              {longScore} long signals
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: "#f87171" }} />
            <span className="text-[11px]" style={{ color: "#f87171" }}>
              {shortScore} short signals
            </span>
          </div>
        </div>
      </div>

      {/* Price levels */}
      <div className="flex-1 flex flex-col px-5 py-3 overflow-y-auto">
        <div
          className="flex items-center justify-between py-2 mb-0.5"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <span
            className="text-[11px] uppercase tracking-widest"
            style={{ color: "var(--text-muted)" }}
          >
            Current Price
          </span>
          <span
            className="text-[16px] font-bold tabular-nums"
            style={{ color: "var(--text-primary)" }}
          >
            {fmt(close)}
          </span>
        </div>

        <LevelRow
          label="Entry"
          value={fmt(entry)}
          color="var(--accent-text)"
          subLabel="Market · current close"
        />
        <LevelRow
          label="Stop Loss"
          value={fmt(stopLoss)}
          color="#f87171"
          subLabel={`−${pips(entry, stopLoss)} pips`}
        />
        <LevelRow
          label="TP 1"
          value={fmt(tp1)}
          color="#4ade80"
          subLabel={`R2 pivot · +${pips(entry, tp1)} pips`}
        />
        <LevelRow
          label="TP 2"
          value={fmt(tp2)}
          color="#4ade80"
          subLabel={`R3 pivot · +${pips(entry, tp2)} pips`}
        />
        <LevelRow
          label="TP 3"
          value={fmt(tp3)}
          color="#4ade80"
          subLabel={`Extension · +${pips(entry, tp3)} pips`}
        />

        {/* Risk / Reward */}
        <div
          className="flex items-center justify-between mt-4 p-3 rounded-xl"
          style={{
            background: "rgba(126,214,46,0.06)",
            border: "1px solid var(--accent-border)",
          }}
        >
          <span
            className="text-[12px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-secondary)" }}
          >
            Risk / Reward
          </span>
          <span
            className="text-[20px] font-black tabular-nums"
            style={{ color: "var(--accent-text)" }}
          >
            1 : {riskReward.toFixed(1)}
          </span>
        </div>
      </div>
    </Panel>
  );
}
