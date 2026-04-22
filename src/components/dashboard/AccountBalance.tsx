import { TrendingUp, TrendingDown } from "lucide-react";
import { Panel } from "../ui/Panel";
import type { Account, TodayLiveStats } from "../../db/queries";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

interface Props {
  account: Account | null;
  todayStats: TodayLiveStats;
}

export function AccountBalance({ account, todayStats }: Props) {
  if (!account) return null;

  const pnl = todayStats.totalPnl;
  const isPositive = pnl >= 0;

  const targetPct = ((pnl / account.dailyTarget) * 100).toFixed(0);
  const balancePct = (
    ((account.currentBalance - account.startingBalance) / account.startingBalance) * 100
  ).toFixed(2);

  return (
    <Panel state className="flex flex-col gap-2 h-full">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[14px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
            Account Balance
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {account.name} · {account.brokerOrFirm}
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)" }}>
          <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "var(--accent)" }} />
          <span className="text-[11px] font-medium" style={{ color: "var(--accent-text)" }}>Live</span>
        </div>
      </div>

      {/* Balance */}
      <div>
        <div className="text-[36px] font-bold tabular-nums leading-none" style={{ color: "var(--text-primary)" }}>
          {formatCurrency(account.currentBalance)}
        </div>
        <div className="flex items-center gap-2 mt-1">
          {isPositive ? <TrendingUp size={13} style={{ color: "var(--accent)" }} /> : <TrendingDown size={13} color="#f87171" />}
          <span className="text-[12px] font-medium" style={{ color: isPositive ? "var(--accent-text)" : "#f87171" }}>
            {isPositive ? "+" : ""}{formatCurrency(account.currentBalance - account.startingBalance)}
          </span>
          <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            ({isPositive ? "+" : ""}{balancePct}%) all time
          </span>
        </div>
      </div>

      {/* Daily P&L */}
      <div
        className="rounded-xl p-3"
        style={{ background: "var(--bg-panel-alt)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="text-[13px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--text-secondary)" }}>
          Today's P&L
        </div>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[24px] font-bold tabular-nums" style={{ color: isPositive ? "var(--accent-text)" : "#f87171" }}>
              {isPositive ? "+" : ""}{formatCurrency(pnl)}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {todayStats.tradeCount} trades · {todayStats.winCount}W / {todayStats.lossCount}L
            </div>
            <div className="flex gap-4 mt-1.5">
              <div>
                <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Largest Win</div>
                <div className="text-[12px] font-semibold tabular-nums" style={{ color: "#4ade80" }}>
                  {todayStats.largestWin > 0 ? `+${formatCurrency(todayStats.largestWin)}` : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Largest Loss</div>
                <div className="text-[12px] font-semibold tabular-nums" style={{ color: "#f87171" }}>
                  {todayStats.largestLoss > 0 ? `-${formatCurrency(todayStats.largestLoss)}` : "—"}
                </div>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] mb-1.5" style={{ color: "var(--text-secondary)" }}>Daily target progress</div>
            <div className="text-[20px] font-bold tabular-nums" style={{ color: "var(--accent-text)" }}>
              {targetPct}%
            </div>
            {/* Progress bar */}
            <div className="w-24 h-1.5 rounded-full mt-1.5" style={{ background: "var(--border-subtle)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, Number(targetPct))}%`,
                  background: "var(--accent)",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
