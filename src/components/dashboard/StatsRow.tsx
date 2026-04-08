import { Trophy, TrendingUp, TrendingDown, Activity, Layers } from "lucide-react";
import { StatCard } from "../ui/StatCard";
import type { AllTimeStats } from "../../db/queries";

function fmt(n: number, prefix = "") {
  return `${prefix}$${Math.abs(n).toLocaleString("en-US")}`;
}

interface Props {
  allTimeStats: AllTimeStats;
}

export function StatsRow({ allTimeStats }: Props) {
  const s = allTimeStats;
  return (
    <div className="grid grid-cols-5 gap-3 h-full">
      <StatCard
        label="Win Rate"
        value={`${s.winRate.toFixed(0)}%`}
        sub={`${s.winCount}W / ${s.lossCount}L all time`}
        accent
        icon={<Trophy size={14} />}
      />
      <StatCard
        label="Avg Win"
        value={fmt(s.avgWin, "+")}
        sub="per winning trade"
        positive
        icon={<TrendingUp size={14} />}
      />
      <StatCard
        label="Avg Loss"
        value={`-${fmt(s.avgLoss)}`}
        sub="per losing trade"
        negative
        icon={<TrendingDown size={14} />}
      />
      <StatCard
        label="Profit Factor"
        value={`${s.profitFactor.toFixed(2)}×`}
        sub="all time"
        accent
        icon={<Activity size={14} />}
      />
      <StatCard
        label="Total Trades"
        value={`${s.tradeCount}`}
        sub="all time"
        icon={<Layers size={14} />}
      />
    </div>
  );
}
