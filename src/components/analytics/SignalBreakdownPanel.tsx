import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { Panel } from "../ui/Panel";
import { analysisResult } from "../../data/analyticsData";
import type { SignalGroup } from "../../data/analyticsData";

const BIAS_CONFIG = {
  bullish: { color: "#4ade80", label: "Bullish", Icon: CheckCircle2 },
  bearish: { color: "#f87171", label: "Bearish", Icon: XCircle },
  neutral: { color: "#7a8fa8", label: "Neutral", Icon: MinusCircle },
};

function SignalSection({ label, group }: { label: string; group: SignalGroup }) {
  const cfg = BIAS_CONFIG[group.bias];
  const { Icon } = cfg;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon size={13} style={{ color: cfg.color }} />
        <span
          className="text-[12px] font-bold uppercase tracking-widest"
          style={{ color: cfg.color }}
        >
          {label}
        </span>
        <span
          className="text-[10px] px-2 py-0.5 rounded-md font-semibold uppercase tracking-wide ml-auto"
          style={{
            background: `${cfg.color}15`,
            color: cfg.color,
            border: `1px solid ${cfg.color}30`,
          }}
        >
          {cfg.label}
        </span>
      </div>
      <div className="flex flex-col gap-1 pl-5">
        {group.conditions.map((c, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <div
              className="w-1 h-1 rounded-full mt-[5px] shrink-0"
              style={{ background: cfg.color, opacity: 0.6 }}
            />
            <span className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {c}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SignalBreakdownPanel() {
  const { signals } = analysisResult;

  return (
    <Panel className="h-full flex flex-col p-0 overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <span
          className="text-[13px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-secondary)" }}
        >
          Signal Breakdown
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Why this decision was made
        </span>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-4 p-4 overflow-y-auto">
        <SignalSection label="Trend" group={signals.trend} />
        <SignalSection label="Momentum" group={signals.momentum} />
        <SignalSection label="Structure" group={signals.structure} />
        <SignalSection label="Volatility" group={signals.volatility} />
      </div>
    </Panel>
  );
}
