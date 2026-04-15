import { useEffect, useState } from "react";
import { Panel } from "../ui/Panel";
import { getTimeFormat, type TimeFormat } from "../../lib/preferences";

function pad(n: number) { return String(n).padStart(2, "0"); }

function buildTimeStr(now: Date, fmt: TimeFormat): string {
  if (fmt === "24h") {
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }
  let h = now.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${pad(h)}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${ampm}`;
}

function getTimeDisplay(fmt: TimeFormat) {
  const now = new Date();
  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const utc = now.toLocaleString("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false });
  return { time: buildTimeStr(now, fmt), date, utc };
}

export function ClockPanel() {
  const [fmt, setFmt] = useState<TimeFormat>(getTimeFormat);
  const [display, setDisplay] = useState(() => getTimeDisplay(fmt));

  // Re-read format when preferences change
  useEffect(() => {
    const handler = () => {
      const f = getTimeFormat();
      setFmt(f);
    };
    window.addEventListener("tm:prefs-changed", handler);
    return () => window.removeEventListener("tm:prefs-changed", handler);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setDisplay(getTimeDisplay(fmt)), 1000);
    return () => clearInterval(id);
  }, [fmt]);

  return (
    <Panel state className="h-full flex flex-col justify-between">
      <div className="text-[15px] font-semibold uppercase tracking-widest" style={{ color: "var(--accent-text)" }}>
        Local Time
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <div className="text-[32px] font-bold tabular-nums leading-none" style={{ color: "var(--text-primary)" }}>
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
