import { Trophy, TrendingUp, TrendingDown, Activity, Layers } from "lucide-react";
import { StatCard } from "../ui/StatCard";
import { TODAY_STATS } from "../../data/mockData";

function fmt(n: number, prefix = "") {
  return `${prefix}$${Math.abs(n).toLocaleString("en-US")}`;
}

export function StatsRow() {
  return (
    <div className="grid grid-cols-5 gap-3 h-full">
      <StatCard
        label="Win Rate"
        value={`${TODAY_STATS.winRate}%`}
        sub={`${TODAY_STATS.winCount}W / ${TODAY_STATS.lossCount}L today`}
        accent
        icon={<Trophy size={14} />}
      />
      <StatCard
        label="Avg Win"
        value={fmt(TODAY_STATS.avgWin, "+")}
        sub="per winning trade"
        positive
        icon={<TrendingUp size={14} />}
      />
      <StatCard
        label="Avg Loss"
        value={`-${fmt(TODAY_STATS.avgLoss)}`}
        sub="per losing trade"
        negative
        icon={<TrendingDown size={14} />}
      />
      <StatCard
        label="Profit Factor"
        value={`${TODAY_STATS.profitFactor}×`}
        sub="win / loss ratio"
        accent
        icon={<Activity size={14} />}
      />
      <StatCard
        label="Trades Today"
        value={`${TODAY_STATS.tradeCount}`}
        sub="all sessions"
        icon={<Layers size={14} />}
      />
    </div>
  );
}
