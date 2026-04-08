import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Panel, PanelHeader } from "../ui/Panel";
import { EQUITY_CURVE, ACTIVE_ACCOUNT } from "../../data/mockData";

function formatBalance(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  const diff = val - ACTIVE_ACCOUNT.startingBalance;
  const isPos = diff >= 0;
  return (
    <div
      className="px-3 py-2.5 rounded-xl text-[12px]"
      style={{
        background: "#0d1219",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ color: "#8899aa" }}>{label}</div>
      <div className="font-bold tabular-nums mt-0.5" style={{ color: "#dce6f4" }}>
        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val)}
      </div>
      <div className="tabular-nums" style={{ color: isPos ? "#4ade80" : "#f87171" }}>
        {isPos ? "+" : ""}
        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(diff)}
      </div>
    </div>
  );
}

export function EquityChart() {
  const min = Math.min(...EQUITY_CURVE.map((p) => p.balance));
  const max = Math.max(...EQUITY_CURVE.map((p) => p.balance));
  const padding = (max - min) * 0.15;

  return (
    <Panel className="h-full flex flex-col">
      <PanelHeader label="Equity Curve">
        <span className="text-[11px] tabular-nums" style={{ color: "var(--accent-text)" }}>
          +$2,340 all time
        </span>
      </PanelHeader>

      <div className="flex-1" style={{ minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={EQUITY_CURVE}
            margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-line)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--chart-line)" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />

            <XAxis
              dataKey="date"
              tick={{ fill: "#374151", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval={4}
            />

            <YAxis
              domain={[min - padding, max + padding]}
              tick={{ fill: "#374151", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatBalance}
              width={52}
            />

            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }} />

            <Area
              type="monotone"
              dataKey="balance"
              stroke="var(--chart-line)"
              strokeWidth={2}
              fill="url(#equityGradient)"
              dot={false}
              activeDot={{ r: 4, fill: "var(--chart-line)", strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
