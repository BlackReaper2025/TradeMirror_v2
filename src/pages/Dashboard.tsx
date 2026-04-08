import { useEffect } from "react";
import { AccountBalance } from "../components/dashboard/AccountBalance";
import { StatsRow } from "../components/dashboard/StatsRow";
import { EquityChart } from "../components/dashboard/EquityChart";
import { PortfolioPanel } from "../components/dashboard/PortfolioPanel";
import { MarketSession } from "../components/dashboard/MarketSession";
import { ClockPanel } from "../components/dashboard/ClockPanel";
import { QuotePanel } from "../components/dashboard/QuotePanel";
import { TradeLogPreview } from "../components/dashboard/TradeLogPreview";
import { CalendarPreview } from "../components/dashboard/CalendarPreview";
import { FatigueTimer } from "../components/dashboard/FatigueTimer";
import { useDashboardData } from "../hooks/useDashboardData";
import { useTheme } from "../theme/ThemeContext";

/**
 * Dashboard — Phase 2.
 * Fetches all data from SQLite via useDashboardData and passes it to components.
 * Theme state is driven by today's P&L vs daily target.
 */
export function Dashboard() {
  const { data, loading } = useDashboardData();
  const { setThemeState } = useTheme();

  // Auto-drive theme from real P&L data
  useEffect(() => {
    if (!data.account || !data.todayStats) return;
    const pnl = data.todayStats.totalPnl ?? 0;
    const target = data.account.dailyTarget;
    if (pnl >= target) setThemeState("green");
    else if (pnl > 0) setThemeState("yellow");
    else setThemeState("red");
  }, [data.account, data.todayStats, setThemeState]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          Loading...
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto overflow-x-hidden"
      style={{ padding: "20px 24px 24px" }}
    >
      <div className="flex flex-col gap-4" style={{ maxWidth: 1200 }}>

        {/* ── Row 1: Balance + Stats ───────────────────────── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr", gridTemplateRows: "auto" }}>
          <div style={{ minHeight: 220 }}>
            <AccountBalance account={data.account} todayStats={data.todayStats} />
          </div>
          <div style={{ minHeight: 220 }}>
            <StatsRow todayStats={data.todayStats} />
          </div>
        </div>

        {/* ── Row 2: Equity Chart + Portfolio ─────────────── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 1fr", gridTemplateRows: "240px" }}>
          <EquityChart equityCurve={data.equityCurve} account={data.account} />
          <PortfolioPanel portfolio={data.portfolio} />
        </div>

        {/* ── Row 3: Market Session + Clock + Quote ────────── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr 2fr", gridTemplateRows: "220px" }}>
          <MarketSession />
          <ClockPanel />
          <QuotePanel quotes={data.quotes} />
        </div>

        {/* ── Row 4: Trade Log + Calendar + Fatigue Timer ──── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 1fr 1fr", gridTemplateRows: "280px" }}>
          <TradeLogPreview trades={data.recentTrades} />
          <CalendarPreview calendarDays={data.calendarDays} />
          <FatigueTimer />
        </div>
      </div>
    </div>
  );
}
