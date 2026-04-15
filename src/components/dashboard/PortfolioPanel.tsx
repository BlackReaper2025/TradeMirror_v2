import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Panel, PanelHeader } from "../ui/Panel";

interface PortfolioSlice {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { color: string } }>;
  total: number;
}

function CustomTooltip({ active, payload, total }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const pct = ((item.value / total) * 100).toFixed(1);
  return (
    <div
      className="px-3 py-2 rounded-xl text-[12px]"
      style={{ background: "#0d1219", border: "1px solid rgba(255,255,255,0.1)" }}
    >
      <div style={{ color: item.payload.color }}>{item.name}</div>
      <div className="font-bold tabular-nums" style={{ color: "#dce6f4" }}>
        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(item.value)}
      </div>
      <div style={{ color: "#64748b" }}>{pct}%</div>
    </div>
  );
}

interface Props {
  portfolio: PortfolioSlice[];
}

export function PortfolioPanel({ portfolio }: Props) {
  const total = portfolio.reduce((s, p) => s + p.value, 0);

  return (
    <Panel state className="h-full flex flex-col">
      <PanelHeader label="Portfolio">
        <span
          className="text-[13px] font-bold tabular-nums"
          style={{ color: "var(--text-primary)" }}
        >
          {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(total)}
        </span>
      </PanelHeader>

      {/* Donut */}
      <div className="flex-1" style={{ minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <Pie
              data={portfolio}
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={66}
              paddingAngle={3}
              dataKey="value"
              strokeWidth={0}
            >
              {portfolio.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-2 shrink-0">
        {portfolio.map((item) => {
          const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";
          return (
            <div key={item.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {item.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(item.value)}
                </span>
                <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
