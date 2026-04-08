import { useEffect, useState } from "react";
import { Panel } from "../ui/Panel";

function pad(n: number) { return String(n).padStart(2, "0"); }

function getTimeDisplay() {
  const now = new Date();
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const utc = now.toLocaleString("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false });
  return { time: `${hh}:${mm}:${ss}`, date, utc };
}

export function ClockPanel() {
  const [display, setDisplay] = useState(getTimeDisplay);

  useEffect(() => {
    const id = setInterval(() => setDisplay(getTimeDisplay()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Panel className="h-full flex flex-col justify-between">
      <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
        Local Time
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <div className="text-[38px] font-bold tabular-nums leading-none" style={{ color: "var(--text-primary)" }}>
          {display.time}
        </div>
        <div className="text-[12px] mt-2" style={{ color: "var(--text-secondary)" }}>
          {display.date}
        </div>
      </div>

      <div
        className="flex items-center justify-between px-3 py-2 rounded-lg"
        style={{ background: "var(--bg-panel-alt)", border: "1px solid var(--border-subtle)" }}
      >
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>UTC</span>
        <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-secondary)" }}>
          {display.utc}
        </span>
      </div>
    </Panel>
  );
}
