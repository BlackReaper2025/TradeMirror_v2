// ─── AnalyticsClock — small live digital clock for the Analytics V3 top bar ───
import { useEffect, useState } from "react";
import { getTimeFormat, type TimeFormat } from "../../lib/preferences";

function pad(n: number) { return String(n).padStart(2, "0"); }

function buildTimeStr(now: Date, fmt: TimeFormat): string {
  if (fmt === "24h") return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  let h = now.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${pad(h)}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${ampm}`;
}

export function AnalyticsClock() {
  const [fmt,  setFmt]  = useState<TimeFormat>(getTimeFormat);
  const [time, setTime] = useState(() => buildTimeStr(new Date(), getTimeFormat()));

  useEffect(() => {
    const handler = () => setFmt(getTimeFormat());
    window.addEventListener("tm:prefs-changed", handler);
    return () => window.removeEventListener("tm:prefs-changed", handler);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTime(buildTimeStr(new Date(), fmt)), 1000);
    return () => clearInterval(id);
  }, [fmt]);

  return (
    <div className="h-full flex items-center shrink-0 px-3">
      <span className="text-[20px] font-bold tabular-nums tracking-wide whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
        {time}
      </span>
    </div>
  );
}
