import { Trophy, TrendingUp, TrendingDown, Activity, Layers } from "lucide-react";
import { StatCard } from "../ui/StatCard";
import type { DailyStat } from "../../db/queries";

function fmt(n: number, prefix = "") {
  return `${prefix}$${Math.abs(n).toLocaleString("en-US")}`;
}

interface Props {
  todayStats: DailyStat | null;
}

export function StatsRow({ todayStats }: Props) {
  const s = todayStats;
  return (
    <div className="grid grid-cols-5 gap-3 h-full">
      <StatCard
        label="Win Rate"
        value={`${(s?.winRate ?? 0).toFixed(0)}%`}
        sub={`${s?.winCount ?? 0}W / ${s?.lossCount ?? 0}L today`}
        accent
        icon={<Trophy size={14} />}
      />
      <StatCard
        label="Avg Win"
        value={fmt(s?.avgWin ?? 0, "+")}
        sub="per winning trade"
        positive
        icon={<TrendingUp size={14} />}
      />
      <StatCard
        label="Avg Loss"
        value={`-${fmt(s?.avgLoss ?? 0)}`}
        sub="per losing trade"
        negative
        icon={<TrendingDown size={14} />}
      />
      <StatCard
        label="Profit Factor"
        value={`${(s?.profitFactor ?? 0).toFixed(2)}×`}
        sub="win / loss ratio"
        accent
        icon={<Activity size={14} />}
      />
      <StatCard
        label="Trades Today"
        value={`${s?.tradeCount ?? 0}`}
        sub="all sessions"
        icon={<Layers size={14} />}
      />
    </div>
  );
}
