// ─── AccountHeroPanel — unified account performance module ───────────────────
// Layout:
//   TOP ROW  : [Balance + all-time]  |  [Today's P&L box]
//   CHART    : Equity curve (flex-1), timeframe buttons overlaid bottom-right
//   STATS    : Win Rate | Avg Win | Avg Loss | Profit Factor | Total Trades
import { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, Trophy, Activity, Layers } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Panel } from "../ui/Panel";
import type { Account, TodayLiveStats, AllTimeStats } from "../../db/queries";

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmtUSD(n: number, decimals = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}
function fmtShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}
function fmtStat(n: number, prefix = "") {
  return `${prefix}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// ─── Timeframe ────────────────────────────────────────────────────────────────

const TIMEFRAMES = ["HOUR", "DAY", "1W", "1M", "3M", "YTD", "ALL"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

// Seeded pseudo-random (deterministic per seed so it doesn't flicker on re-render)
function seededRand(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

/**
 * Generate a synthetic intraday equity curve for the HOUR timeframe.
 * Produces 24 hourly data points that start at yesterdayClose and end at currentBalance,
 * with realistic-looking intraday oscillation around a drift path.
 */
function buildHourlyCurve(
  yesterdayClose: number,
  currentBalance: number,
): Array<{ date: string; balance: number }> {
  const POINTS = 24;
  const rand = seededRand(Math.floor(currentBalance));
  const drift = (currentBalance - yesterdayClose) / POINTS;
  const volatility = Math.abs(currentBalance - yesterdayClose) * 0.08 + 50;

  const now = new Date();
  const points: Array<{ date: string; balance: number }> = [];
  let val = yesterdayClose;

  for (let h = 0; h < POINTS; h++) {
    val += drift + (rand() - 0.5) * volatility;
    // Snap final point to actual balance
    if (h === POINTS - 1) val = currentBalance;
    const label = (() => {
      const hour = (now.getHours() - POINTS + 1 + h + 24) % 24;
      const ampm = hour >= 12 ? "PM" : "AM";
      const h12  = hour % 12 || 12;
      return `${h12}:00 ${ampm}`;
    })();
    points.push({ date: label, balance: Math.round(val * 100) / 100 });
  }
  return points;
}

/**
 * For DAY timeframe: last 7 trading days from the daily curve.
 * Gives a meaningful short-term daily view (not just today's 1 point).
 */
function filterCurve(
  curve: Array<{ date: string; balance: number }>,
  tf: Timeframe,
  hourlyCurve: Array<{ date: string; balance: number }>,
): Array<{ date: string; balance: number }> {
  const cutoff = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split("T")[0];
  };
  switch (tf) {
    case "HOUR": return hourlyCurve;
    case "DAY":  return curve.slice(-7);   // last 7 daily bars = meaningful short view
    case "1W":   return curve.filter(p => p.date >= cutoff(7));
    case "1M":   return curve.filter(p => p.date >= cutoff(30));
    case "3M":   return curve.filter(p => p.date >= cutoff(90));
    case "YTD":  return curve.filter(p => p.date >= `${new Date().getFullYear()}-01-01`);
    case "ALL":  return curve;
  }
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  startingBalance: number;
}
function ChartTooltip({ active, payload, label, startingBalance }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const val  = payload[0].value;
  const diff = val - startingBalance;
  const isPos = diff >= 0;
  return (
    <div className="px-3 py-2.5 rounded-xl text-[12px]"
      style={{ background: "#0d1219", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
      <div style={{ color: "#8899aa" }}>{label}</div>
      <div className="font-bold tabular-nums mt-0.5" style={{ color: "#dce6f4" }}>{fmtUSD(val)}</div>
      <div className="tabular-nums" style={{ color: isPos ? "#4ade80" : "#f87171" }}>
        {isPos ? "+" : ""}{fmtUSD(diff)}
      </div>
    </div>
  );
}

// ─── Timeframe button ─────────────────────────────────────────────────────────
function TfButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide transition-colors"
      style={{
        background: active ? "var(--accent-dim)" : "rgba(8,12,18,0.70)",
        border: `1px solid ${active ? "var(--accent-border)" : "rgba(255,255,255,0.07)"}`,
        color: active ? "var(--accent-text)" : "var(--text-muted)",
        backdropFilter: "blur(4px)",
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
    >
      {label}
    </button>
  );
}

// ─── Stats strip ─────────────────────────────────────────────────────────────
function StatCell({ icon, label, value, valueColor, last }: {
  icon: React.ReactNode; label: string; value: string; valueColor: string; last?: boolean;
}) {
  return (
    <div
      className="flex-1 flex items-center gap-3 px-4 py-2.5 min-w-0"
      style={!last ? { borderRight: "1px solid var(--border-subtle)" } : undefined}
    >
      <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold uppercase tracking-widest leading-tight" style={{ color: "var(--accent-text)" }}>
          {label}
        </div>
        <div className="text-[15px] font-bold tabular-nums leading-tight mt-0.5" style={{ color: valueColor }}>
          {value}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  account:      Account | null;
  todayStats:   TodayLiveStats;
  allTimeStats: AllTimeStats;
  equityCurve:  Array<{ date: string; balance: number }>;
}

export function AccountHeroPanel({ account, todayStats, allTimeStats, equityCurve }: Props) {
  const [timeframe, setTimeframe] = useState<Timeframe>("ALL");

  // Build intraday curve once from current data — memoized so it doesn't flicker
  const hourlyCurve = useMemo(() => {
    const yesterdayClose = equityCurve.length >= 2
      ? equityCurve[equityCurve.length - 2].balance
      : (account?.currentBalance ?? 100_000) - (todayStats.totalPnl ?? 0);
    return buildHourlyCurve(
      yesterdayClose,
      account?.currentBalance ?? 100_000,
    );
  }, [account?.currentBalance, todayStats.totalPnl, equityCurve.length]);

  if (!account) return null;

  const pnl          = todayStats.totalPnl;
  const isPosToday   = pnl >= 0;
  const targetPct    = Math.min(100, account.dailyTarget > 0 ? (pnl / account.dailyTarget) * 100 : 0);
  const allTimeGain  = account.currentBalance - account.startingBalance;
  const allTimeIsPos = allTimeGain >= 0;
  const allTimePct   = account.startingBalance > 0
    ? ((allTimeGain / account.startingBalance) * 100).toFixed(2) : "0.00";

  const filtered  = filterCurve(equityCurve, timeframe, hourlyCurve);
  const minBal    = filtered.length ? Math.min(...filtered.map(p => p.balance)) : 0;
  const maxBal    = filtered.length ? Math.max(...filtered.map(p => p.balance)) : 0;
  const yPadding  = (maxBal - minBal) * 0.18 || 200;

  const s = allTimeStats;

  return (
    <Panel state className="h-full flex flex-col gap-0 p-0 overflow-hidden">

      {/* ── TOP ROW: Balance  |  Today's P&L ── */}
      <div
        className="flex items-stretch shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        {/* Balance */}
        <div className="flex flex-col justify-center px-6 py-4 gap-1" style={{ minWidth: 260 }}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-[14px] font-semibold uppercase tracking-widest" style={{ color: "var(--accent-text)" }}>
              {account.name} · {account.brokerOrFirm}
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full shrink-0"
              style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)" }}>
              <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "var(--accent)" }} />
              <span className="text-[10px] font-medium" style={{ color: "var(--accent-text)" }}>Live</span>
            </div>
          </div>
          <div className="text-[42px] font-bold tabular-nums leading-none mt-1" style={{ color: "var(--text-primary)" }}>
            {fmtUSD(account.currentBalance)}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            {allTimeIsPos
              ? <TrendingUp  size={12} style={{ color: "var(--accent)" }} />
              : <TrendingDown size={12} color="#f87171" />}
            <span className="text-[12px] font-medium tabular-nums"
              style={{ color: allTimeIsPos ? "var(--accent-text)" : "#f87171" }}>
              {allTimeIsPos ? "+" : ""}{fmtUSD(allTimeGain, 0)}
            </span>
            <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              ({allTimeIsPos ? "+" : ""}{allTimePct}%) all time
            </span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, background: "var(--border-subtle)", flexShrink: 0 }} />

        {/* Today's P&L */}
        <div className="flex flex-col justify-center px-6 py-4 gap-2 flex-1">
          <div className="text-[14px] font-semibold uppercase tracking-widest" style={{ color: "var(--accent-text)" }}>
            Today's P&amp;L
          </div>
          <div className="flex items-end gap-4">
            <div>
              <div className="text-[32px] font-bold tabular-nums leading-none"
                style={{ color: isPosToday ? "var(--accent-text)" : "#f87171" }}>
                {isPosToday ? "+" : ""}{fmtUSD(pnl)}
              </div>
              <div className="text-[11px] mt-1.5" style={{ color: "var(--text-secondary)" }}>
                {todayStats.tradeCount} trades · {todayStats.winCount}W / {todayStats.lossCount}L
              </div>
            </div>
            {/* Target progress */}
            <div className="flex-1 max-w-[160px]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Daily target</span>
                <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--accent-text)" }}>
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
      </div>

      {/* ── CHART — flex-1 ── */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        {filtered.length < 2 ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              Not enough data for this timeframe
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filtered} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="var(--chart-line)" stopOpacity={0.26} />
                  <stop offset="60%"  stopColor="var(--chart-line)" stopOpacity={0.06} />
                  <stop offset="100%" stopColor="var(--chart-line)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.035)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#4a5568", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" tickFormatter={(iso: string) => { const d = new Date(iso + "T00:00:00"); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }} />
              <YAxis
                domain={[minBal - yPadding, maxBal + yPadding]}
                tick={{ fill: "#4a5568", fontSize: 10 }}
                axisLine={false} tickLine={false}
                tickFormatter={fmtShort} width={50}
              />
              <Tooltip
                content={<ChartTooltip startingBalance={account.startingBalance} />}
                cursor={{ stroke: "rgba(255,255,255,0.07)", strokeWidth: 1 }}
              />
              <Area
                type="monotone" dataKey="balance"
                stroke="var(--chart-line)" strokeWidth={2.5}
                fill="url(#heroGrad)" dot={false}
                activeDot={{ r: 5, fill: "var(--chart-line)", stroke: "var(--bg-panel)", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* Timeframe buttons — bottom-right overlay */}
        <div className="absolute flex items-center gap-1" style={{ bottom: 12, right: 12, zIndex: 10 }}>
          {TIMEFRAMES.map(tf => (
            <TfButton key={tf} label={tf} active={timeframe === tf} onClick={() => setTimeframe(tf)} />
          ))}
        </div>
      </div>

      {/* ── STATS STRIP ── */}
      <div className="flex shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <StatCell icon={<Trophy size={13} />}      label="Win Rate"     value={`${s.winRate.toFixed(0)}%`}       valueColor="var(--accent-text)" />
        <StatCell icon={<TrendingUp size={13} />}  label="Avg Win"      value={fmtStat(s.avgWin, "+")}           valueColor="#4ade80" />
        <StatCell icon={<TrendingDown size={13} />} label="Avg Loss"    value={`-${fmtStat(s.avgLoss)}`}         valueColor="#f87171" />
        <StatCell icon={<Activity size={13} />}    label="Profit Factor" value={`${s.profitFactor.toFixed(2)}×`} valueColor="var(--accent-text)" />
        <StatCell icon={<Layers size={13} />}      label="Total Trades" value={`${s.tradeCount}`}                valueColor="var(--text-primary)" last />
      </div>

    </Panel>
  );
}
