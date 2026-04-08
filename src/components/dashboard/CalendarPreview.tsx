import { Panel, PanelHeader } from "../ui/Panel";
import { CALENDAR_DAYS } from "../../data/mockData";

const WEEK_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function cellColor(pnl: number): string {
  if (pnl === 0) return "transparent";
  if (pnl > 500) return "rgba(34,197,94,0.30)";
  if (pnl > 0)   return "rgba(34,197,94,0.16)";
  if (pnl < -300) return "rgba(239,68,68,0.30)";
  return "rgba(239,68,68,0.16)";
}

function cellTextColor(pnl: number): string {
  if (pnl === 0) return "var(--text-muted)";
  if (pnl > 0)   return "#4ade80";
  return "#f87171";
}

export function CalendarPreview() {
  const days = CALENDAR_DAYS.slice(-35); // last 5 weeks

  return (
    <Panel className="h-full flex flex-col">
      <PanelHeader label="Calendar" />

      {/* Day labels */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEK_LABELS.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1 flex-1">
        {days.map((day) => {
          const label = new Date(day.date + "T00:00:00").getDate();
          const today = day.date === new Date().toISOString().split("T")[0];
          return (
            <div
              key={day.date}
              className="aspect-square flex flex-col items-center justify-center rounded-lg cursor-pointer transition-opacity hover:opacity-80"
              style={{
                background: today ? "var(--accent-dim)" : cellColor(day.pnl),
                border: today ? "1px solid var(--accent-border)" : "1px solid transparent",
              }}
              title={day.pnl !== 0 ? `${day.pnl > 0 ? "+" : ""}$${day.pnl} · ${day.tradeCount} trades` : "No trades"}
            >
              <span
                className="text-[11px] font-medium"
                style={{ color: today ? "var(--accent-text)" : day.pnl !== 0 ? cellTextColor(day.pnl) : "var(--text-muted)" }}
              >
                {label}
              </span>
              {day.pnl !== 0 && (
                <span className="text-[9px] tabular-nums" style={{ color: cellTextColor(day.pnl), opacity: 0.8 }}>
                  {day.pnl > 0 ? "+" : ""}{(day.pnl / 1000).toFixed(1)}k
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
