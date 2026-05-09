import React from "react";

export interface Alert {
  id: string;
  instrument: string;
  name: string;
  price: number;
  direction: "above" | "below";
  status: "active" | "triggered" | "paused" | "watching";
}

export const MOCK_ALERTS: Alert[] = [
  { id: "1", instrument: "EUR_USD", name: "Resistance break", price: 1.1200, direction: "above",  status: "active"    },
  { id: "2", instrument: "EUR_USD", name: "Support test",     price: 1.1050, direction: "below",  status: "active"    },
  { id: "3", instrument: "EUR_USD", name: "Daily high",       price: 1.1180, direction: "above",  status: "triggered" },
  { id: "4", instrument: "GBP_USD", name: "Key level",        price: 1.2700, direction: "above",  status: "active"    },
];

const STATUS_COLORS: Record<Alert["status"], string> = {
  active:    "#60a5fa",
  triggered: "#a78bfa",
  paused:    "var(--text-muted)",
  watching:  "#fbbf24",
};

const inputStyle: React.CSSProperties = {
  fontSize: 11, padding: "3px 6px", borderRadius: 6, outline: "none",
  background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-subtle)",
  color: "var(--text-primary)",
};

interface AlertsPanelProps {
  instrument: string;
  alerts: Alert[];
  onUpdate: (id: string, patch: Partial<Alert>) => void;
  onDelete: (id: string) => void;
}

export function AlertsPanel({ instrument, alerts, onUpdate, onDelete }: AlertsPanelProps) {
  const visible = alerts.filter(a => a.instrument === instrument);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "8px", gap: 4 }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {visible.length === 0 && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>
            No alerts for {instrument}
          </div>
        )}
        {visible.map((alert, i) => (
          <div
            key={alert.id}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 8px", borderRadius: 8,
              background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-subtle)",
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", flexShrink: 0, minWidth: 14, textAlign: "right" }}>
              {i + 1}
            </span>

            <input
              type="text"
              value={alert.name}
              onChange={e => onUpdate(alert.id, { name: e.target.value })}
              style={{ ...inputStyle, width: 120, minWidth: 0, fontWeight: 600 }}
            />

            <select
              value={alert.direction}
              onChange={e => onUpdate(alert.id, { direction: e.target.value as Alert["direction"] })}
              style={{ ...inputStyle, width: 58 }}
            >
              <option value="above">above</option>
              <option value="below">below</option>
            </select>

            <input
              type="number"
              step="0.0001"
              value={alert.price}
              onChange={e => onUpdate(alert.id, { price: parseFloat(e.target.value) || 0 })}
              style={{ ...inputStyle, width: 72 }}
            />

            <span style={{ fontSize: 10, fontWeight: 600, color: STATUS_COLORS[alert.status], flex: 1, textAlign: "center" }}>
              {alert.status}
            </span>

            <button
              onClick={() => onDelete(alert.id)}
              style={{
                fontSize: 11, padding: "2px 6px", borderRadius: 6, fontWeight: 700,
                background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.20)",
                color: "#f87171", cursor: "pointer", flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
