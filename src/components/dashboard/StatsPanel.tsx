// ─── StatsPanel — win rate / avg win / avg loss / profit factor / trades ──────
// Toggle between All Time, Monthly, and Current Day views
import { useState } from "react";
import { Trophy, TrendingUp, TrendingDown, Activity, Layers } from "lucide-react";
import { Panel } from "../ui/Panel";
import type { AllTimeStats } from "../../db/queries";

type Period = "All Time" | "Monthly" | "Today";
const PERIODS: Period[] = ["All Time", "Monthly", "Today"];

function fmtStat(n: number, prefix = ""): string {
  return `${prefix}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function StatRow({
  icon, label, value, valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor: string;
}) {
  return (
    <div className="flex items-center justify-between px-1 py-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center gap-2.5">
        <span style={{ color: "var(--text-muted)" }}>{icon}</span>
        <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>{label}</span>
      </div>
      <span className="text-[14px] font-bold tabular-nums" style={{ color: valueColor }}>
        {value}
      </span>
    </div>
  );
}

interface Props {
  allTimeStats:   AllTimeStats;
  monthlyStats:   AllTimeStats;
  todayFullStats: AllTimeStats;
}

export function StatsPanel({ allTimeStats, monthlyStats, todayFullStats }: Props) {
  const [period, setPeriod] = useState<Period>("All Time");

  const s =
    period === "All Time" ? allTimeStats :
    period === "Monthly"  ? monthlyStats :
    todayFullStats;

  const noData = s.tradeCount === 0;

  return (
    <Panel state className="h-full flex flex-col gap-0 p-0 overflow-hidden">

      {/* ── Header + toggles ── */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <span
          className="text-[14px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--accent-text)" }}
        >
          Stats
        </span>

        {/* Toggle pills */}
        <div
          className="flex items-center gap-0.5 p-0.5 rounded-lg"
          style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-subtle)" }}
        >
          {PERIODS.map(p => {
            const isActive = period === p;
            return (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="px-2.5 py-1 rounded-md text-[10px] font-semibold tracking-wide transition-all"
                style={{
                  background: isActive ? "var(--accent-dim)" : "transparent",
                  border:     isActive ? "1px solid var(--accent-border)" : "1px solid transparent",
                  color:      isActive ? "var(--accent-text)" : "var(--text-muted)",
                }}
                onMouseEnter={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                }}
                onMouseLeave={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                }}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Stats rows ── */}
      <div className="flex-1 flex flex-col justify-center px-4 py-2">
        {noData ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              No trades {period === "Today" ? "today" : period === "Monthly" ? "this month" : "yet"}
            </span>
          </div>
        ) : (
          <>
            <StatRow
              icon={<Trophy size={13} />}
              label="Win Rate"
              value={`${s.winRate.toFixed(0)}%`}
              valueColor="var(--accent-text)"
            />
            <StatRow
              icon={<TrendingUp size={13} />}
              label="Avg Win"
              value={fmtStat(s.avgWin, "+")}
              valueColor="#4ade80"
            />
            <StatRow
              icon={<TrendingDown size={13} />}
              label="Avg Loss"
              value={`-${fmtStat(s.avgLoss)}`}
              valueColor="#f87171"
            />
            <StatRow
              icon={<Activity size={13} />}
              label="Profit Factor"
              value={`${s.profitFactor.toFixed(2)}×`}
              valueColor="var(--accent-text)"
            />
            <div className="flex items-center justify-between px-1 py-2">
              <div className="flex items-center gap-2.5">
                <span style={{ color: "var(--text-muted)" }}><Layers size={13} /></span>
                <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>Total Trades</span>
              </div>
              <span className="text-[14px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                {s.tradeCount}
              </span>
            </div>
          </>
        )}
      </div>

    </Panel>
  );
}
