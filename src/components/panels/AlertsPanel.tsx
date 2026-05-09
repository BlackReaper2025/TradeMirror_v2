import React from "react";
import { Trash2 } from "lucide-react";

export interface Alert {
  id: string;
  name: string;
  instrument: string;
  direction: "above" | "below";
  price: number;
  active: boolean;
  status: "watching" | "triggered" | "paused" | "deleted";
  notifications: {
    in_app: boolean;
    telegram: boolean;
  };
  created_at_utc: string;
  triggered_at_utc: string | null;
  last_hit_price: number | null;
}

const STATUS_COLORS: Record<Alert["status"], string> = {
  watching:  "#fbbf24",
  triggered: "#a78bfa",
  paused:    "var(--text-muted)",
  deleted:   "#f87171",
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
  const visible = alerts.filter(a => a.instrument === instrument && a.status !== "deleted");

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
            {/* Number */}
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", flexShrink: 0, minWidth: 14, textAlign: "right" }}>
              {i + 1}
            </span>

            {/* Name */}
            <input
              type="text"
              value={alert.name}
              onChange={e => onUpdate(alert.id, { name: e.target.value })}
              style={{ ...inputStyle, width: 120, minWidth: 0, fontWeight: 600 }}
            />

            {/* Direction */}
            <select
              value={alert.direction}
              onChange={e => onUpdate(alert.id, { direction: e.target.value as Alert["direction"] })}
              style={{ ...inputStyle, width: 58 }}
            >
              <option value="above">above</option>
              <option value="below">below</option>
            </select>

            {/* Price */}
            <input
              type="number"
              step="0.0001"
              value={alert.price}
              onChange={e => onUpdate(alert.id, { price: parseFloat(e.target.value) || 0 })}
              style={{ ...inputStyle, width: 72 }}
            />

            {/* Status */}
            <span style={{ fontSize: 10, fontWeight: 600, color: STATUS_COLORS[alert.status], flex: 1, textAlign: "center" }}>
              {alert.status}
            </span>

            {/* In-app toggle */}
            <button
              onClick={() => onUpdate(alert.id, { notifications: { ...alert.notifications, in_app: !alert.notifications.in_app } })}
              title="In-app notification"
              style={{
                fontSize: 9, padding: "2px 5px", borderRadius: 5, fontWeight: 700, flexShrink: 0,
                background: alert.notifications.in_app ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${alert.notifications.in_app ? "rgba(96,165,250,0.35)" : "var(--border-subtle)"}`,
                color: alert.notifications.in_app ? "#60a5fa" : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              A
            </button>

            {/* Telegram toggle */}
            <button
              onClick={() => onUpdate(alert.id, { notifications: { ...alert.notifications, telegram: !alert.notifications.telegram } })}
              title="Telegram notification"
              style={{
                fontSize: 9, padding: "2px 5px", borderRadius: 5, fontWeight: 700, flexShrink: 0,
                background: alert.notifications.telegram ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${alert.notifications.telegram ? "rgba(52,211,153,0.35)" : "var(--border-subtle)"}`,
                color: alert.notifications.telegram ? "#34d399" : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              T
            </button>

            {/* Delete */}
            <button
              onClick={() => onDelete(alert.id)}
              style={{
                marginLeft: 10, padding: "3px 6px", borderRadius: 6,
                background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.20)",
                color: "#f87171", cursor: "pointer", flexShrink: 0,
                display: "flex", alignItems: "center",
              }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
