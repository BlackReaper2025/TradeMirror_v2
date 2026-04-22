// ─── Dashboard — 12-column CSS grid collage layout ───────────────────────────
//
//  12 equal columns, 10 row tracks.
//  No margin/offset hacks — all placement via gridColumn / gridRow spans only.
//
//  AccountSummary  cols 1–3,  rows 1–5   (tall left anchor)
//  EquityChart     cols 4–9,  rows 1–4   (dominant centre-top)
//  SessionClock    cols 10–12, rows 1–3  (compact right-top)
//  QuotesPanel     cols 4–9,  rows 5–5   (shallow strip under chart)
//  FatigueTimer    cols 10–12, rows 4–5  (fills below session)
//  RiskCalc        cols 1–3,  rows 6–10  (tall left-bottom)
//  TradeLogPreview cols 4–7,  rows 6–10  (half-width centre-bottom)
//  CalendarPanel   cols 8–12, rows 6–10  (wide right-bottom)
//
//  Portfolio panel lives in the sidebar (not here).
//
import { useEffect, useState, useCallback } from "react";
import { AccountSummaryPanel }       from "../components/dashboard/AccountSummaryPanel";
import { EquityChart }               from "../components/dashboard/EquityChart";
import { SessionClockPanel }         from "../components/dashboard/SessionClockPanel";
import { QuotesPanel }               from "../components/dashboard/QuotesPanel";
import { FatigueTimer }              from "../components/dashboard/FatigueTimer";
import { RiskCalculatorPlaceholder } from "../components/dashboard/RiskCalculatorPlaceholder";
import { TradeLogPreview }           from "../components/dashboard/TradeLogPreview";
import { CalendarPanel }             from "../components/dashboard/CalendarPanel";
import { useDashboardData }          from "../hooks/useDashboardData";
import { useTheme }                  from "../theme/ThemeContext";
import { getTradesByDate, type Trade } from "../db/queries";
import { useDatabase }               from "../db/DatabaseProvider";

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function Dashboard() {
  const { data, loading } = useDashboardData();
  const { setThemeState } = useTheme();
  const { ready }         = useDatabase();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTrades, setSelectedTrades] = useState<Trade[]>([]);

  useEffect(() => {
    if (!data.account || !data.todayStats) return;
    const pnl = data.todayStats.totalPnl ?? 0;
    if (pnl > 0)      setThemeState("green");
    else if (pnl < 0) setThemeState("red");
    else               setThemeState("yellow");
  }, [data.account, data.todayStats, setThemeState]);

  const handleSelectDate = useCallback(async (date: string) => {
    setSelectedDate(date);
    if (!data.account || !ready) return;
    try {
      const t = await getTradesByDate(data.account.id, date);
      setSelectedTrades(t);
    } catch { setSelectedTrades([]); }
  }, [data.account, ready]);

  // Keep selected trades in sync when recentTrades refresh (only when no date selected)
  useEffect(() => {
    if (!selectedDate) setSelectedTrades(data.recentTrades);
  }, [data.recentTrades, selectedDate]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</span>
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-hidden"
      style={{ padding: "12px 14px 14px" }}
    >
      <div
        style={{
          display: "grid",
          height: "100%",
          gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
          //  r1–r3:  80px each — SessionClock (rows 1–3) = 264px (unchanged)
          //  r4:    138px   — EquityChart (rows 1–4) = 414px (+38px); FatigueTimer starts
          //  r5:     51px   — AccountSummary row 5
          //  r6:     51px   — AccountSummary ends (rows 1–6 = 540px); QuotesPanel starts
          //  r7:     51px   — QuotesPanel ends (rows 6–7 = 114px, −25%); FatigueTimer ends (rows 4–7 = 327px)
          //                   QuotesPanel center = 546px = gap center between AccountSummary/RiskCalc ✓
          //  r8–r12: 1fr    — bottom panels fill remaining space
          gridTemplateRows: "80px 80px 80px 138px 51px 51px 51px repeat(5, 1fr)",
          gap: "12px",
        }}
      >

        {/* AccountSummary — tall left anchor, rows 1–6 */}
        <div style={{ gridColumn: "1 / 4", gridRow: "1 / 7" }}>
          <AccountSummaryPanel
            account={data.account}
            todayStats={data.todayStats}
            allTimeStats={data.allTimeStats}
            monthlyStats={data.monthlyStats}
            weeklyStats={data.weeklyStats}
            todayFullStats={data.todayFullStats}
          />
        </div>

        {/* EquityChart — dominant centre-top, rows 1–5 */}
        <div style={{ gridColumn: "4 / 10", gridRow: "1 / 6" }}>
          <EquityChart equityCurve={data.equityCurve} account={data.account} />
        </div>

        {/* SessionClock — compact right-top, rows 1–4 */}
        <div style={{ gridColumn: "10 / 13", gridRow: "1 / 5" }}>
          <SessionClockPanel />
        </div>

        {/* QuotesPanel — strip under equity chart, rows 6–7 (114px, center=546px aligns with AccountSummary/RiskCalc gap) */}
        <div style={{ gridColumn: "4 / 10", gridRow: "6 / 8" }}>
          <QuotesPanel quotes={data.quotes} />
        </div>

        {/* FatigueTimer — right column, rows 5–8 */}
        <div style={{ gridColumn: "10 / 13", gridRow: "5 / 8", marginTop: "-54px", height: "calc(100% + 54px)" }}>
          <FatigueTimer />
        </div>

        {/* RiskCalc — tall left-bottom, rows 7–12 */}
        <div style={{ gridColumn: "1 / 4", gridRow: "7 / 13" }}>
          <RiskCalculatorPlaceholder />
        </div>

        {/* TradeLogPreview — half-width centre-bottom, rows 8–12 */}
        <div style={{ gridColumn: "4 / 8", gridRow: "8 / 13" }}>
          <TradeLogPreview trades={selectedTrades} selectedDate={selectedDate} onTradeChanged={() => handleSelectDate(selectedDate ?? todayStr())} />
        </div>

        {/* CalendarPanel — wide right-bottom, rows 8–13 */}
        <div style={{ gridColumn: "8 / 13", gridRow: "8 / 13" }}>
          <CalendarPanel calendarDays={data.calendarDays} selectedDate={selectedDate} onSelectDate={handleSelectDate} />
        </div>

      </div>
    </div>
  );
}
