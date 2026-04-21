import { Panel } from "../ui/Panel";
import { analysisResult, eurusdSnapshot, priceHistory } from "../../data/analyticsData";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

const PRICE_COLOR = "#dce6f4";
const EMA_COLOR = "#7ed62e";
const ENTRY_COLOR = "#7ed62e";
const SL_COLOR = "#f87171";
const TP_COLOR = "#4ade80";
const LEVEL_COLOR = "rgba(255,255,255,0.18)";

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { dataKey: string; name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-3 py-2 text-[11px] tabular-nums"
      style={{
        background: "rgba(8,12,18,0.95)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      }}
    >
      <div className="mb-1" style={{ color: "var(--text-muted)" }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
          <span style={{ color: "var(--text-secondary)" }}>{p.name}</span>
          <span className="font-bold" style={{ color: p.color }}>
            {p.value.toFixed(5)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsChartPanel() {
  const { entry, stopLoss, tp1 } = analysisResult;
  const { r1, s1 } = eurusdSnapshot;

  const prices = priceHistory.map((d) => d.price);
  const yMin = Math.min(...prices, stopLoss) - 0.0012;
  const yMax = Math.max(...prices, tp1) + 0.0012;

  return (
    <Panel className="h-full flex flex-col p-0 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <span
          className="text-[13px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-secondary)" }}
        >
          EUR/USD — Intraday
        </span>
        <div className="flex items-center gap-4">
          {[
            { color: PRICE_COLOR, label: "Price", dash: false },
            { color: EMA_COLOR, label: "EMA 9", dash: false },
            { color: ENTRY_COLOR, label: "Entry", dash: true },
            { color: SL_COLOR, label: "SL", dash: true },
            { color: TP_COLOR, label: "TP1", dash: true },
          ].map(({ color, label, dash }) => (
            <span key={label} className="flex items-center gap-1.5">
              <svg width="14" height="8">
                <line
                  x1="0" y1="4" x2="14" y2="4"
                  stroke={color}
                  strokeWidth="1.5"
                  strokeDasharray={dash ? "4 2" : undefined}
                  opacity={0.85}
                />
              </svg>
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 p-3 pr-2 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={priceHistory} margin={{ top: 8, right: 56, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="analyticsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={PRICE_COLOR} stopOpacity={0.10} />
                <stop offset="95%" stopColor={PRICE_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />

            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: "#4a5568" }}
              axisLine={false}
              tickLine={false}
              interval={4}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 10, fill: "#4a5568" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => v.toFixed(4)}
              width={52}
            />

            <Tooltip content={<ChartTooltip />} />

            <ReferenceLine
              y={r1}
              stroke={LEVEL_COLOR}
              strokeDasharray="4 4"
              label={{ value: "R1", position: "right", fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
            />
            <ReferenceLine
              y={s1}
              stroke={LEVEL_COLOR}
              strokeDasharray="4 4"
              label={{ value: "S1", position: "right", fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
            />
            <ReferenceLine
              y={entry}
              stroke={ENTRY_COLOR}
              strokeDasharray="5 3"
              strokeOpacity={0.55}
              label={{ value: "Entry", position: "right", fontSize: 9, fill: ENTRY_COLOR }}
            />
            <ReferenceLine
              y={stopLoss}
              stroke={SL_COLOR}
              strokeDasharray="5 3"
              strokeOpacity={0.55}
              label={{ value: "SL", position: "right", fontSize: 9, fill: SL_COLOR }}
            />
            <ReferenceLine
              y={tp1}
              stroke={TP_COLOR}
              strokeDasharray="5 3"
              strokeOpacity={0.45}
              label={{ value: "TP1", position: "right", fontSize: 9, fill: TP_COLOR }}
            />

            <Area
              type="monotone"
              dataKey="price"
              name="Price"
              stroke={PRICE_COLOR}
              strokeWidth={1.5}
              fill="url(#analyticsGrad)"
              dot={false}
              activeDot={{ r: 3, fill: PRICE_COLOR }}
            />

            <Line
              type="monotone"
              dataKey="ema9"
              name="EMA 9"
              stroke={EMA_COLOR}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: EMA_COLOR }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
