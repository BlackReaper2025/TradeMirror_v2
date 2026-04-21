import { Panel } from "../ui/Panel";
import { analysisResult, eurusdSnapshot } from "../../data/analyticsData";

const fmt  = (p: number) => p.toFixed(4);
const pips = (a: number, b: number) => Math.round(Math.abs(a - b) * 10000);

function LevelRow({
  label, value, note, highlight = false,
}: {
  label: string; value: string; note: string; highlight?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between py-2.5 px-1"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <div className="flex flex-col gap-0.5">
        <span
          className="text-[10px] uppercase tracking-widest font-semibold"
          style={{ color: "var(--text-muted)" }}
        >
          {label}
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {note}
        </span>
      </div>
      <span
        className="text-[14px] font-bold tabular-nums"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}

export function EntryExitPanel() {
  const { entry, stopLoss, tp1, tp2, tp3, riskReward } = analysisResult;
  const { atr14 } = eurusdSnapshot;

  return (
    <Panel className="h-full flex flex-col p-0 overflow-hidden" style={{ border: "1px solid var(--border-subtle)", boxShadow: "0 4px 24px rgba(0,0,0,0.45)" }}>

      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <span
          className="text-[13px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-secondary)" }}
        >
          Entry / Exit Plan
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          ATR {atr14.toFixed(5)}
        </span>
      </div>

      <div className="flex-1 flex flex-col px-4 py-2 overflow-y-auto">

        <LevelRow
          label="Entry"
          value={fmt(entry)}
          note="Market · current close"
          highlight
        />
        <LevelRow
          label="Stop Loss"
          value={fmt(stopLoss)}
          note={`1.5 × ATR · −${pips(entry, stopLoss)} pips`}
        />

        <div className="my-1" />

        <LevelRow
          label="TP 1"
          value={fmt(tp1)}
          note={`R2 pivot · +${pips(entry, tp1)} pips`}
        />
        <LevelRow
          label="TP 2"
          value={fmt(tp2)}
          note={`R3 pivot · +${pips(entry, tp2)} pips`}
        />
        <LevelRow
          label="TP 3"
          value={fmt(tp3)}
          note={`Extension · +${pips(entry, tp3)} pips`}
        />

        <div
          className="flex items-center justify-between mt-4 px-3 py-3 rounded-xl"
          style={{
            background: "rgba(255,255,255,0.04)",
            border:     "1px solid var(--border-subtle)",
          }}
        >
          <span
            className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-muted)" }}
          >
            Risk / Reward
          </span>
          <span
            className="text-[22px] font-black tabular-nums"
            style={{ color: "var(--text-primary)" }}
          >
            1 : {riskReward.toFixed(1)}
          </span>
        </div>

      </div>
    </Panel>
  );
}
