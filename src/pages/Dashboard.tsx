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

/**
 * Dashboard — Phase 1 static shell with mock data.
 *
 * Layout (3-column grid, scrollable):
 *   Row 1: AccountBalance (2/3) | StatCards (3/3)  [but stats are 5 cols inside their container]
 *   Row 2: EquityChart (2/3)    | Portfolio (1/3)
 *   Row 3: MarketSession | Clock | Quote
 *   Row 4: TradeLog (wide) | Calendar | FatigueTimer
 */
export function Dashboard() {
  return (
    <div
      className="flex-1 overflow-y-auto overflow-x-hidden"
      style={{ padding: "20px 24px 24px" }}
    >
      <div className="flex flex-col gap-4" style={{ maxWidth: 1200 }}>

        {/* ── Row 1: Balance + Stats ───────────────────────── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr", gridTemplateRows: "auto" }}>
          <div style={{ minHeight: 220 }}>
            <AccountBalance />
          </div>
          <div style={{ minHeight: 220 }}>
            <StatsRow />
          </div>
        </div>

        {/* ── Row 2: Equity Chart + Portfolio ─────────────── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 1fr", gridTemplateRows: "240px" }}>
          <EquityChart />
          <PortfolioPanel />
        </div>

        {/* ── Row 3: Market Session + Clock + Quote ────────── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr 2fr", gridTemplateRows: "220px" }}>
          <MarketSession />
          <ClockPanel />
          <QuotePanel />
        </div>

        {/* ── Row 4: Trade Log + Calendar + Fatigue Timer ──── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 1fr 1fr", gridTemplateRows: "280px" }}>
          <TradeLogPreview />
          <CalendarPreview />
          <FatigueTimer />
        </div>
      </div>
    </div>
  );
}
