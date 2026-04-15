import { useEffect, useState } from "react";
import { Panel, PanelHeader } from "../ui/Panel";
import { SESSIONS, getCurrentSession, type SessionWindow } from "../../lib/sessions";

const SESSION_COLORS: Record<string, string> = {
  "Pre-Asia":  "#6366f1",
  "Asia":      "#3b82f6",
  "London":    "#f59e0b",
  "New York":  "#22c55e",
  "Roll Over": "#8b5cf6",
};

function sessionBg(color: string) {
  const map: Record<string, string> = {
    "#6366f1": "rgba(99,102,241,0.12)",
    "#3b82f6": "rgba(59,130,246,0.12)",
    "#f59e0b": "rgba(245,158,11,0.12)",
    "#22c55e": "rgba(34,197,94,0.12)",
    "#8b5cf6": "rgba(139,92,246,0.12)",
  };
  return map[color] ?? "rgba(255,255,255,0.06)";
}

export function MarketSession() {
  const [session, setSession] = useState<SessionWindow | null>(null);

  useEffect(() => {
    const tick = () => {
      const h = new Date().getUTCHours();
      setSession(getCurrentSession(h));
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const activeColor = session ? SESSION_COLORS[session.name] ?? "#8899aa" : "#374151";

  return (
    <Panel state className="h-full flex flex-col">
      <PanelHeader label="Market Session" />

      {/* Active session */}
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl mb-4"
        style={{ background: session ? sessionBg(activeColor) : "var(--bg-panel-alt)", border: `1px solid ${session ? activeColor + "33" : "var(--border-subtle)"}` }}
      >
        <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: activeColor }} />
        <div>
          <div className="text-[15px] font-semibold" style={{ color: session ? activeColor : "var(--text-muted)" }}>
            {session ? session.name : "Closed"}
          </div>
          <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {session ? `UTC ${session.utcStart}:00 – ${session.utcEnd}:00` : "Markets closed"}
          </div>
        </div>
      </div>

      {/* Session list */}
      <div className="flex flex-col gap-1.5">
        {SESSIONS.map((s) => {
          const isActive = session?.name === s.name;
          const color = SESSION_COLORS[s.name] ?? "#8899aa";
          return (
            <div
              key={s.name}
              className="flex items-center justify-between px-3 py-2 rounded-lg"
              style={{
                background: isActive ? sessionBg(color) : "transparent",
                border: `1px solid ${isActive ? color + "33" : "transparent"}`,
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: color, opacity: isActive ? 1 : 0.3 }}
                />
                <span
                  className="text-[12px] font-medium"
                  style={{ color: isActive ? color : "var(--text-secondary)" }}
                >
                  {s.name}
                </span>
              </div>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {s.utcStart}:00 – {s.utcEnd}:00
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
