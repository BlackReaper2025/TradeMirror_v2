import { Trophy, TrendingUp, TrendingDown, Activity, Layers } from "lucide-react";
import { Panel } from "../ui/Panel";
import type { AllTimeStats } from "../../db/queries";

function fmt(n: number, prefix = "") {
  return `${prefix}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

interface StatItemProps {
  label: string;
  value: string;
  sub: string;
  valueColor: string;
  icon: React.ReactNode;
  last?: boolean;
}

function StatItem({ label, value, sub, valueColor, icon, last }: StatItemProps) {
  return (
    <div
      className="flex-1 flex flex-col justify-center px-4 py-3 gap-1 min-w-0"
      style={!last ? { borderRight: "1px solid var(--border-subtle)" } : undefined}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className="text-[14px] font-semibold uppercase tracking-widest leading-tight truncate"
          style={{ color: "var(--accent-text)" }}
        >
          {label}
        </span>
        <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{icon}</span>
      </div>
      <span
        className="text-[18px] font-bold tabular-nums leading-tight"
        style={{ color: valueColor }}
      >
        {value}
      </span>
      <span className="text-[10px] leading-tight truncate" style={{ color: "var(--text-secondary)" }}>
        {sub}
      </span>
    </div>
  );
}

interface Props {
  allTimeStats: AllTimeStats;
}

export function StatsRow({ allTimeStats }: Props) {
  const s = allTimeStats;
  return (
    <Panel padded={false} className="flex flex-row h-full">
      <StatItem
        label="Win Rate"
        value={`${s.winRate.toFixed(0)}%`}
        sub={`${s.winCount}W / ${s.lossCount}L all time`}
        valueColor="var(--accent-text)"
        icon={<Trophy size={13} />}
      />
      <StatItem
        label="Avg Win"
        value={fmt(s.avgWin, "+")}
        sub="per winning trade"
        valueColor="#4ade80"
        icon={<TrendingUp size={13} />}
      />
      <StatItem
        label="Avg Loss"
        value={`-${fmt(s.avgLoss)}`}
        sub="per losing trade"
        valueColor="#f87171"
        icon={<TrendingDown size={13} />}
      />
      <StatItem
        label="Profit Factor"
        value={`${s.profitFactor.toFixed(2)}×`}
        sub="all time"
        valueColor="var(--accent-text)"
        icon={<Activity size={13} />}
      />
      <StatItem
        label="Total Trades"
        value={`${s.tradeCount}`}
        sub="all time"
        valueColor="var(--text-primary)"
        icon={<Layers size={13} />}
        last
      />
    </Panel>
  );
}
