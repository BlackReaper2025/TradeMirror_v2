import { Panel } from "../ui/Panel";
import { eurusdSnapshot, analysisResult } from "../../data/analyticsData";

interface Indicator {
  label:   string;
  value:   string;
  percent: number;
}

function buildIndicators(d: typeof eurusdSnapshot): Indicator[] {
  const volRatio = ((d.volume - d.volumeSma20) / d.volumeSma20) * 100;
  const bbPos    = ((d.close - d.bbLower) / (d.bbUpper - d.bbLower)) * 100;

  return [
    { label: "RSI (14)",      value: d.rsi14.toFixed(1),                                  percent: d.rsi14 },
    { label: "ADX",           value: d.adx.toFixed(1),                                    percent: Math.min((d.adx / 60) * 100, 100) },
    { label: "StochRSI K",    value: d.stochRsiK.toFixed(1),                              percent: d.stochRsiK },
    { label: "CCI",           value: `+${d.cci.toFixed(0)}`,                              percent: Math.min(((d.cci + 200) / 400) * 100, 100) },
    { label: "+DI",           value: d.diPlus.toFixed(1),                                 percent: Math.min((d.diPlus / 50) * 100, 100) },
    { label: "−DI",           value: d.diMinus.toFixed(1),                                percent: Math.min((d.diMinus / 50) * 100, 100) },
    { label: "MACD Line",     value: `+${d.macd.toFixed(5)}`,                             percent: Math.min((Math.abs(d.macd) / 0.003) * 100, 100) },
    { label: "Volume vs Avg", value: `${volRatio >= 0 ? "+" : ""}${volRatio.toFixed(0)}%`, percent: Math.min(Math.abs(volRatio) + 50, 100) },
    { label: "BB Position",   value: `${bbPos.toFixed(0)}%`,                              percent: bbPos },
  ];
}

function Bar({ ind, color }: { ind: Indicator; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{ind.label}</span>
        <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{ind.value}</span>
      </div>
      <div className="w-full rounded-full" style={{ height: "3px", background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(ind.percent, 2)}%`, background: color, opacity: 0.7 }}
        />
      </div>
    </div>
  );
}

export function LiveIndicatorPanel() {
  const indicators = buildIndicators(eurusdSnapshot);
  const barColor =
    analysisResult.direction === "LONG"  ? "#60a5fa" :
    analysisResult.direction === "SHORT" ? "#a78bfa" :
    "#7a8fa8";

  return (
    <Panel className="h-full flex flex-col p-0 overflow-hidden" style={{ border: "1px solid var(--border-subtle)", boxShadow: "0 4px 24px rgba(0,0,0,0.45)" }}>

      <div className="flex items-center px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <span className="text-[13px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
          Live Indicators
        </span>
      </div>

      <div className="flex-1 flex flex-col justify-evenly px-4 py-3 overflow-y-auto gap-2.5">
        {indicators.map((ind) => <Bar key={ind.label} ind={ind} color={barColor} />)}
      </div>

    </Panel>
  );
}
