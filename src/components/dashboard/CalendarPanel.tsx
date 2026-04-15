// ─── CalendarPanel — full month view, Sun–Sat ─────────────────────────────────
import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Panel } from "../ui/Panel";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── US Market Holidays (fixed + rule-based for current ± 2 years) ─────────────
function getMarketHolidays(): Map<string, string> {
  const h = new Map<string, string>();
  const p = (n: number) => String(n).padStart(2, "0");

  // Find Nth weekday of a month: nth=1..5, dow=0=Sun..6=Sat
  const nthWeekday = (y: number, m: number, nth: number, dow: number): Date => {
    const d = new Date(y, m, 1);
    const first = d.getDay();
    const offset = (dow - first + 7) % 7;
    return new Date(y, m, 1 + offset + (nth - 1) * 7);
  };
  // Last weekday of a month
  const lastWeekday = (y: number, m: number, dow: number): Date => {
    const last = new Date(y, m + 1, 0);
    const diff = (last.getDay() - dow + 7) % 7;
    return new Date(y, m, last.getDate() - diff);
  };
  // Add holiday, shift Sat→Fri, Sun→Mon
  const add = (d: Date, name: string) => {
    const dow = d.getDay();
    if (dow === 6) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    if (dow === 0) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    h.set(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, name);
  };

  const years = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1];
  for (const y of years) {
    add(new Date(y, 0, 1),  "New Year's Day");
    add(nthWeekday(y, 0, 3, 1), "MLK Day");
    add(nthWeekday(y, 1, 3, 1), "Presidents' Day");
    // Good Friday — Easter - 2 days
    const easter = (() => {
      const a = y % 19, b = Math.floor(y / 100), c = y % 100;
      const d2 = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
      const g = Math.floor((b - f + 1) / 3), h2 = (19 * a + b - d2 - g + 15) % 30;
      const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h2 - k) % 7;
      const m2 = Math.floor((a + 11 * h2 + 22 * l) / 451);
      const month = Math.floor((h2 + l - 7 * m2 + 114) / 31) - 1;
      const day = ((h2 + l - 7 * m2 + 114) % 31) + 1;
      return new Date(y, month, day);
    })();
    add(new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 2), "Good Friday");
    add(lastWeekday(y, 4, 1), "Memorial Day");
    add(new Date(y, 5, 19), "Juneteenth");
    add(new Date(y, 6, 4),  "Independence Day");
    add(nthWeekday(y, 8, 1, 1), "Labor Day");
    add(nthWeekday(y, 10, 4, 4), "Thanksgiving");
    add(new Date(y, 11, 25), "Christmas");
  }
  return h;
}

const MARKET_HOLIDAYS = getMarketHolidays();

interface CalendarDay { date: string; pnl: number; tradeCount: number; }
interface Props {
  calendarDays:  CalendarDay[];
  selectedDate:  string | null;
  onSelectDate:  (date: string) => void;
}

// Full P&L, no abbreviation
function fmtPnl(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function cellBg(pnl: number, isToday: boolean): string {
  if (isToday && pnl === 0) return "rgba(255,255,255,0.02)";
  if (pnl > 500)  return "rgba(34,197,94,0.20)";
  if (pnl > 0)    return "rgba(34,197,94,0.10)";
  if (pnl < -300) return "rgba(239,68,68,0.20)";
  if (pnl < 0)    return "rgba(239,68,68,0.10)";
  return "rgba(255,255,255,0.02)";
}

function cellBorder(pnl: number, isToday: boolean): string {
  if (isToday) return "1px solid var(--accent-border)";
  if (pnl > 0)  return "1px solid rgba(34,197,94,0.18)";
  if (pnl < 0)  return "1px solid rgba(239,68,68,0.18)";
  return "1px solid transparent";
}

function pnlColor(pnl: number): string {
  if (pnl > 0) return "#4ade80";
  if (pnl < 0) return "#f87171";
  return "var(--text-muted)";
}

export function CalendarPanel({ calendarDays, selectedDate, onSelectDate }: Props) {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const dayMap = useMemo(() => {
    const m = new Map<string, CalendarDay>();
    for (const d of calendarDays) m.set(d.date, d);
    return m;
  }, [calendarDays]);

  const grid = useMemo(() => {
    const firstDow    = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ date: string | null; day: CalendarDay | null }> = [];
    for (let i = 0; i < firstDow; i++) cells.push({ date: null, day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const p = (n: number) => String(n).padStart(2, "0");
      const dateStr = `${year}-${p(month + 1)}-${p(d)}`;
      cells.push({ date: dateStr, day: dayMap.get(dateStr) ?? null });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
    return cells;
  }, [year, month, dayMap]);

  const todayStr   = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const prevMonth = () => month === 0  ? (setYear(y => y - 1), setMonth(11)) : setMonth(m => m - 1);
  const nextMonth = () => month === 11 ? (setYear(y => y + 1), setMonth(0))  : setMonth(m => m + 1);

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: "14px", padding: "1.5px", pointerEvents: "none", zIndex: 1,
        background: "rgba(255,255,255,0.12)",
        WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
        WebkitMaskComposite: "xor",
        maskComposite: "exclude",
      } as React.CSSProperties} />
    <Panel state className="h-full flex flex-col overflow-hidden" style={{ border: "none", borderRadius: "14px", background: "radial-gradient(ellipse at top left, rgba(255,255,255,0.07) 0%, transparent 60%), rgba(8,12,18,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", boxShadow: "none" } as React.CSSProperties}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <span className="text-[14px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
          Calendar
        </span>

        {/* Month navigation */}
        <div className="flex items-center gap-1">
          <button onClick={prevMonth}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent";    (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-[14px] font-semibold px-2" style={{ color: "var(--text-primary)", minWidth: 148, textAlign: "center" }}>
            {monthLabel}
          </span>
          <button onClick={nextMonth}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent";    (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* ── Calendar grid ── */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Day-of-week labels */}
        <div className="grid grid-cols-7 gap-1 mb-1.5">
          {DOW.map(d => (
            <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wider py-0.5"
              style={{ color: d === "Sun" || d === "Sat" ? "var(--text-muted)" : "var(--text-secondary)" }}>
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div
          className="grid grid-cols-7 gap-1 flex-1"
          style={{ gridTemplateRows: `repeat(${grid.length / 7}, 1fr)` }}
        >
          {grid.map((cell, i) => {
            if (!cell.date) {
              return <div key={`e-${i}`} className="rounded-lg" style={{ background: "rgba(255,255,255,0.01)" }} />;
            }

            const isToday      = cell.date === todayStr;
            const isSelected   = cell.date === selectedDate;
            const pnl          = cell.day?.pnl ?? 0;
            const tradeCount   = cell.day?.tradeCount ?? 0;
            const hasTrades    = tradeCount > 0;
            const dayNum       = parseInt(cell.date.slice(8), 10);
            const dow          = new Date(cell.date + "T00:00:00").getDay();
            const isWeekend    = dow === 0 || dow === 6;
            const holiday      = MARKET_HOLIDAYS.get(cell.date) ?? null;

            // Determine the natural border color for selection highlight
            const selectedBorder = isToday
              ? "var(--accent-border)"
              : pnl > 0  ? "rgba(34,197,94,0.7)"
              : pnl < 0  ? "rgba(239,68,68,0.7)"
              : "rgba(255,255,255,0.35)";

            const borderStyle = isSelected
              ? `1.5px solid ${selectedBorder}`
              : holiday
              ? "1px solid rgba(239,68,68,0.6)"
              : cellBorder(pnl, isToday);

            return (
              <div
                key={cell.date}
                className="flex flex-col rounded-lg transition-opacity hover:opacity-80"
                onClick={() => onSelectDate(cell.date!)}
                style={{
                  cursor:     "pointer",
                  background: cellBg(pnl, isToday),
                  border:     borderStyle,
                  padding:    "4px 5px 5px",
                  minHeight:  0,
                  overflow:   "hidden",
                }}
              >
                {/* Day number row — date left, holiday name right */}
                <div className="flex items-start justify-between gap-0.5 leading-tight">
                  <span
                    className="text-[13px] font-semibold shrink-0"
                    style={{
                      color: isToday ? "var(--accent-text)"
                           : hasTrades ? pnlColor(pnl)
                           : isWeekend ? "var(--text-muted)"
                           : "var(--text-secondary)",
                    }}
                  >
                    {dayNum}
                  </span>
                  {holiday && (
                    <span
                      className="text-[8px] font-semibold leading-tight text-right"
                      style={{ color: "#f87171", lineHeight: 1.2 }}
                    >
                      {holiday}
                    </span>
                  )}
                </div>

                {hasTrades && (
                  <>
                    <span
                      className="text-[12px] font-semibold tabular-nums leading-tight mt-0.5"
                      style={{ color: pnlColor(pnl) }}
                    >
                      {fmtPnl(pnl)}
                    </span>
                    <span
                      className="text-[10px] font-semibold leading-tight mt-0.5"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {tradeCount} {tradeCount === 1 ? "trade" : "trades"}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

    </Panel>
    </div>
  );
}
