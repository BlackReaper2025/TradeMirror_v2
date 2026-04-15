// ─── AccountSummaryPanel ──────────────────────────────────────────────────────
// Combined module: Account Balance (top) + Today's P&L + Stats with toggle.
// Replaces the two separate AccountBalance and StatsPanel cards with one
// integrated panel that spans both visual areas.
import { useState } from "react";
import { TrendingUp, TrendingDown, Trophy, Activity, Layers } from "lucide-react";
import { Panel } from "../ui/Panel";
import type { Account, TodayLiveStats, AllTimeStats } from "../../db/queries";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtUSD(n: number, dec = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: dec, maximumFractionDigits: dec,
  }).format(n);
}

function fmtStat(n: number, prefix = "") {
  return `${prefix}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// ─── Stats toggle ─────────────────────────────────────────────────────────────

type StatPeriod = "All Time" | "Monthly" | "Today";
const PERIODS: StatPeriod[] = ["All Time", "Monthly", "Today"];

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  account:        Account | null;
  todayStats:     TodayLiveStats;
  allTimeStats:   AllTimeStats;
  monthlyStats:   AllTimeStats;
  todayFullStats: AllTimeStats;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AccountSummaryPanel({
  account, todayStats, allTimeStats, monthlyStats, todayFullStats,
}: Props) {
  const [period, setPeriod] = useState<StatPeriod>("All Time");

  if (!account) return null;

  const pnl          = todayStats.totalPnl;
  const isPosToday   = pnl >= 0;
  const targetPct    = Math.min(100, account.dailyTarget > 0 ? (pnl / account.dailyTarget) * 100 : 0);
  const allTimeGain  = account.currentBalance - account.startingBalance;
  const allTimeIsPos = allTimeGain >= 0;
  const allTimePct   = account.startingBalance > 0
    ? ((allTimeGain / account.startingBalance) * 100).toFixed(2)
    : "0.00";

  const s      = period === "All Time" ? allTimeStats : period === "Monthly" ? monthlyStats : todayFullStats;
  const noData = s.tradeCount === 0;

  const statRows = [
    { icon: <Trophy size={12} />,      label: "Win Rate",      value: `${s.winRate.toFixed(0)}%`,        color: "var(--text-secondary)" },
    { icon: <TrendingUp size={12} />,  label: "Avg Win",       value: fmtStat(s.avgWin, "+"),            color: "var(--text-secondary)" },
    { icon: <TrendingDown size={12} />, label: "Avg Loss",     value: `-${fmtStat(s.avgLoss)}`,          color: "var(--text-secondary)" },
    { icon: <Activity size={12} />,    label: "Profit Factor", value: `${s.profitFactor.toFixed(2)}×`,   color: "var(--text-secondary)" },
    { icon: <Layers size={12} />,      label: "Total Trades",  value: `${s.tradeCount}`,                 color: "var(--text-secondary)" },
  ];

  return (
    <div style={{ position: "relative", height: "100%" }}>

      {/* Border-only gradient overlay — CSS mask punches out the interior */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: "14px", padding: "1.5px", pointerEvents: "none", zIndex: 1,
        background: "rgba(255,255,255,0.12)",
        WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
        WebkitMaskComposite: "xor",
        maskComposite: "exclude",
      } as React.CSSProperties} />

    <Panel state className="h-full flex flex-col gap-0 p-0 overflow-hidden" style={{ border: "none", borderRadius: "14px", background: "radial-gradient(ellipse at top left, rgba(255,255,255,0.07) 0%, transparent 60%), rgba(8,12,18,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", boxShadow: "none" } as React.CSSProperties}>

      {/* ══ ACCOUNT BALANCE ══════════════════════════════════════════════════ */}
      <div
        className="px-5 py-4 shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-1">
          <div
            className="text-[14px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-secondary)" }}
          >
            Account Balance
          </div>
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
            style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "var(--accent)" }} />
            <span className="text-[10px] font-medium" style={{ color: "var(--accent-text)" }}>Live</span>
          </div>
        </div>

        {/* Account name */}
        <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
          {account.name} · {account.brokerOrFirm}
        </div>

        {/* Balance */}
        <div
          className="text-[38px] font-bold tabular-nums leading-none mt-3"
          style={{ color: "var(--text-primary)" }}
        >
          {fmtUSD(account.currentBalance)}
        </div>

        {/* All-time gain */}
        <div className="flex items-center gap-1.5 mt-1.5">
          {allTimeIsPos
            ? <TrendingUp size={12} style={{ color: "var(--accent)" }} />
            : <TrendingDown size={12} color="#f87171" />}
          <span
            className="text-[12px] font-medium tabular-nums"
            style={{ color: allTimeIsPos ? "var(--accent-text)" : "#f87171" }}
          >
            {allTimeIsPos ? "+" : ""}{fmtUSD(allTimeGain, 0)}
          </span>
          <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            ({allTimeIsPos ? "+" : ""}{allTimePct}%) all time
          </span>
        </div>
      </div>

      {/* ══ TODAY'S P&L ═══════════════════════════════════════════════════════ */}
      <div
        className="px-5 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div
          className="text-[14px] font-semibold uppercase tracking-widest mb-2"
          style={{ color: "var(--text-secondary)" }}
        >
          Today's P&amp;L
        </div>

        <div className="flex items-end gap-4">
          <div>
            <div
              className="text-[26px] font-bold tabular-nums leading-none"
              style={{ color: isPosToday ? "var(--accent-text)" : "#f87171" }}
            >
              {isPosToday ? "+" : ""}{fmtUSD(pnl)}
            </div>
            <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
              {todayStats.tradeCount} trades · {todayStats.winCount}W / {todayStats.lossCount}L
            </div>
          </div>

          {/* Target progress */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Daily target</span>
              <span
                className="text-[11px] font-bold tabular-nums"
                style={{ color: "var(--accent-text)" }}
              >
                {targetPct.toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: "var(--border-subtle)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${targetPct}%`, background: "var(--accent)" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ══ STATS WITH TOGGLE ════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-h-0">

        {/* Stats header + period pills */}
        <div
          className="flex items-center justify-between px-5 py-2 shrink-0"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <span
            className="text-[14px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-secondary)" }}
          >
            Stats
          </span>

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
                  className="px-2 py-0.5 rounded-md text-[9px] font-semibold tracking-wide transition-all"
                  style={{
                    background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                    border:     isActive ? "1px solid rgba(255,255,255,0.15)" : "1px solid transparent",
                    color:      isActive ? "var(--text-primary)" : "var(--text-muted)",
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>

        {/* Stat rows */}
        <div className="flex-1 flex flex-col justify-center px-5 py-1 min-h-0">
          {noData ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                No trades {period === "Today" ? "today" : period === "Monthly" ? "this month" : "yet"}
              </span>
            </div>
          ) : (
            <div className="flex flex-col">
              {statRows.map((row, i) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between py-1.5 px-1"
                  style={i < statRows.length - 1 ? { borderBottom: "1px solid var(--border-subtle)" } : undefined}
                >
                  <div className="flex items-center gap-2">
                    <span style={{ color: "var(--text-muted)" }}>{row.icon}</span>
                    <span className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
                      {row.label}
                    </span>
                  </div>
                  <span
                    className="text-[13px] font-bold tabular-nums"
                    style={{ color: row.color }}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </Panel>
    </div>
  );
}

