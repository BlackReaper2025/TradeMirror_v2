import { Panel } from "../ui/Panel";
import { eurusdSnapshot } from "../../data/analyticsData";

type Status = "bullish" | "bearish" | "neutral";

const STATUS_COLOR: Record<Status, string> = {
  bullish: "#4ade80",
  bearish: "#f87171",
  neutral: "var(--text-primary)",
};

function Row({ label, value, status = "neutral" }: { label: string; value: string; status?: Status }) {
  return (
    <div
      className="flex items-center justify-between py-2 px-1"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <span
        className="text-[13px] font-bold tabular-nums"
        style={{ color: STATUS_COLOR[status] }}
      >
        {value}
      </span>
    </div>
  );
}

export function IndicatorSnapshotPanel() {
  const d = eurusdSnapshot;

  const veEma20 = ((d.close - d.ema20) * 10000).toFixed(1);
  const veKijun = ((d.close - d.kijun) * 10000).toFixed(1);
  const sign = (v: string) => (parseFloat(v) >= 0 ? `+${v}` : v);

  return (
    <Panel className="h-full flex flex-col p-0 overflow-hidden">
      <div
        className="flex items-center px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <span
          className="text-[13px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-secondary)" }}
        >
          Indicators
        </span>
      </div>

      <div className="flex-1 flex flex-col px-4 py-1 overflow-y-auto">
        <Row
          label="RSI (14)"
          value={`${d.rsi14.toFixed(1)} ↑`}
          status={d.rsi14 > 50 ? "bullish" : "bearish"}
        />
        <Row
          label="MACD"
          value={`+${d.macd.toFixed(5)}`}
          status={d.macd > d.macdSignal ? "bullish" : "bearish"}
        />
        <Row
          label="MACD Histogram"
          value={`+${d.macdHistogram.toFixed(5)}`}
          status="bullish"
        />
        <Row
          label="ADX"
          value={d.adx.toFixed(1)}
          status={d.adx > 25 ? "bullish" : "neutral"}
        />
        <Row
          label="ATR (14)"
          value={d.atr14.toFixed(5)}
          status="neutral"
        />
        <Row
          label="vs EMA 20"
          value={`${sign(veEma20)} pips`}
          status={parseFloat(veEma20) > 0 ? "bullish" : "bearish"}
        />
        <Row
          label="vs Kijun"
          value={`${sign(veKijun)} pips`}
          status={parseFloat(veKijun) > 0 ? "bullish" : "bearish"}
        />
        <Row
          label="StochRSI K"
          value={d.stochRsiK.toFixed(1)}
          status={d.stochRsiK > 50 ? "bullish" : "bearish"}
        />
        <Row
          label="CCI"
          value={`+${d.cci.toFixed(1)}`}
          status={d.cci > 0 ? "bullish" : "bearish"}
        />
        <Row
          label="Volume vs Avg"
          value={`+${(((d.volume - d.volumeSma20) / d.volumeSma20) * 100).toFixed(0)}%`}
          status={d.volume > d.volumeSma20 ? "bullish" : "neutral"}
        />
      </div>
    </Panel>
  );
}
