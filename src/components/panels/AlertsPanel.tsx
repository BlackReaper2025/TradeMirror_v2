import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Trash2, Settings } from "lucide-react";
import { playAlertSound, ALERT_SOUNDS } from "../../lib/alertSound";
import type { AlertSound } from "../../lib/alertSound";

export interface Alert {
  id: string;
  name: string;
  instrument: string;
  direction: "above" | "below" | "crosses";
  price: number;
  active: boolean;
  status: "watching" | "triggered" | "paused" | "deleted";
  sound?: string;
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

// ─── Portal popup ─────────────────────────────────────────────────────────────

interface SettingsPopupProps {
  alert: Alert;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onUpdate: (id: string, patch: Partial<Alert>) => void;
  onClose: () => void;
}

function SettingsPopup({ alert, anchorRef, onUpdate, onClose }: SettingsPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  // Position popup below-right of the anchor button
  useEffect(() => {
    if (anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 5, right: window.innerWidth - r.right });
    }
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return createPortal(
    <div
      ref={popupRef}
      style={{
        position: "fixed",
        top: pos.top,
        right: pos.right,
        zIndex: 99999,
        background: "#14142a",
        border: "1px solid rgba(167,139,250,0.30)",
        borderRadius: 10,
        padding: "10px 12px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.70)",
        display: "flex", flexDirection: "column", gap: 8,
        minWidth: 164,
      }}
    >
      {/* Notifications */}
      <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Notifications
      </span>

      <button
        onClick={() => onUpdate(alert.id, { notifications: { ...alert.notifications, in_app: !alert.notifications.in_app } })}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: 10, padding: "5px 8px", borderRadius: 6, fontWeight: 600,
          background: alert.notifications.in_app ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${alert.notifications.in_app ? "rgba(255,255,255,0.28)" : "var(--border-subtle)"}`,
          color: alert.notifications.in_app ? "rgba(255,255,255,0.85)" : "var(--text-muted)",
          cursor: "pointer", width: "100%",
        }}
      >
        <span>In-app</span>
        <span style={{ fontSize: 9, opacity: 0.7 }}>{alert.notifications.in_app ? "ON" : "OFF"}</span>
      </button>

      <button
        onClick={() => onUpdate(alert.id, { notifications: { ...alert.notifications, telegram: !alert.notifications.telegram } })}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: 10, padding: "5px 8px", borderRadius: 6, fontWeight: 600,
          background: alert.notifications.telegram ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${alert.notifications.telegram ? "rgba(255,255,255,0.28)" : "var(--border-subtle)"}`,
          color: alert.notifications.telegram ? "rgba(255,255,255,0.85)" : "var(--text-muted)",
          cursor: "pointer", width: "100%",
        }}
      >
        <span>Telegram</span>
        <span style={{ fontSize: 9, opacity: 0.7 }}>{alert.notifications.telegram ? "ON" : "OFF"}</span>
      </button>

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "0 -2px" }} />

      {/* Sound */}
      <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Sound
      </span>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
        {ALERT_SOUNDS.map(s => {
          const selected = (alert.sound ?? "chime") === s.id;
          return (
            <button
              key={s.id}
              onClick={() => {
                onUpdate(alert.id, { sound: s.id });
                playAlertSound(s.id);
              }}
              style={{
                fontSize: 10, padding: "5px 0", borderRadius: 6, fontWeight: 600,
                background: selected ? "rgba(167,139,250,0.18)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${selected ? "rgba(167,139,250,0.45)" : "var(--border-subtle)"}`,
                color: selected ? "#c4b5fd" : "var(--text-muted)",
                cursor: "pointer", textAlign: "center",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

// ─── Direction popup ──────────────────────────────────────────────────────────

interface DirectionPopupProps {
  alert: Alert;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onUpdate: (id: string, patch: Partial<Alert>) => void;
  onClose: () => void;
}

function DirectionPopup({ alert, anchorRef, onUpdate, onClose }: DirectionPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return createPortal(
    <div
      ref={popupRef}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 99999,
        background: "#14142a",
        border: "1px solid rgba(167,139,250,0.30)",
        borderRadius: 8,
        padding: "5px 8px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.70)",
        display: "flex", flexDirection: "column", gap: 4,
      }}
    >
      {(["above", "below", "crosses"] as const).map(dir => (
        <label key={dir} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "2px 0" }}>
          <input
            type="radio"
            name={`dir-portal-${alert.id}`}
            value={dir}
            checked={alert.direction === dir}
            onChange={() => { onUpdate(alert.id, { direction: dir }); onClose(); }}
            style={{ accentColor: "#a78bfa", width: 10, height: 10, cursor: "pointer" }}
          />
          <span style={{ fontSize: 10, color: alert.direction === dir ? "#c4b5fd" : "var(--text-muted)", fontWeight: alert.direction === dir ? 600 : 400 }}>
            {dir}
          </span>
        </label>
      ))}
    </div>,
    document.body,
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function AlertsPanel({ instrument, alerts, onUpdate, onDelete }: AlertsPanelProps) {
  const visible = alerts.filter(a => a.instrument === instrument && a.status !== "deleted");
  const [openSettings, setOpenSettings] = useState<string | null>(null);
  const [openDir, setOpenDir] = useState<string | null>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const dirRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dirAnchorRefs = useRef<Record<string, React.RefObject<HTMLDivElement | null>>>({});

  const close = useCallback(() => setOpenSettings(null), []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "8px", gap: 4 }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {visible.length === 0 && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>
            No alerts for {instrument}
          </div>
        )}
        {visible.map((alert, i) => {
          const isOpen = openSettings === alert.id;
          const isDirOpen = openDir === alert.id;
          const btnRef = { current: btnRefs.current[alert.id] ?? null } as React.RefObject<HTMLButtonElement | null>;
          if (!dirAnchorRefs.current[alert.id]) {
            dirAnchorRefs.current[alert.id] = { current: null } as React.RefObject<HTMLDivElement | null>;
          }
          const dirAnchorRef = dirAnchorRefs.current[alert.id];

          return (
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
              <div
                ref={el => { dirRefs.current[alert.id] = el; dirAnchorRef.current = el; }}
                onClick={() => setOpenDir(isDirOpen ? null : alert.id)}
                style={{
                  fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6,
                  background: isDirOpen ? "rgba(167,139,250,0.22)" : "rgba(167,139,250,0.10)",
                  border: `1px solid ${isDirOpen ? "rgba(167,139,250,0.55)" : "rgba(167,139,250,0.30)"}`,
                  color: isDirOpen ? "#c4b5fd" : "#a78bfa",
                  cursor: "pointer", flexShrink: 0, userSelect: "none",
                  display: "flex", alignItems: "center",
                }}
              >
                {alert.direction}
              </div>

              {/* Direction portal */}
              {isDirOpen && (
                <DirectionPopup
                  alert={alert}
                  anchorRef={dirAnchorRef}
                  onUpdate={onUpdate}
                  onClose={() => setOpenDir(null)}
                />
              )}

              {/* Price */}
              <input
                type="number"
                step="0.00001"
                value={alert.price.toFixed(5)}
                onChange={e => onUpdate(alert.id, { price: parseFloat(e.target.value) || 0 })}
                style={{ ...inputStyle, width: 64 }}
              />

              {/* Status */}
              <span style={{ fontSize: 10, fontWeight: 600, color: STATUS_COLORS[alert.status], flex: 1, textAlign: "center" }}>
                {alert.status}
              </span>

              {/* Settings button */}
              <button
                ref={el => { btnRefs.current[alert.id] = el; }}
                onClick={() => setOpenSettings(isOpen ? null : alert.id)}
                title="Alert settings"
                style={{
                  padding: "3px 6px", borderRadius: 6, flexShrink: 0,
                  background: isOpen ? "rgba(167,139,250,0.22)" : "rgba(167,139,250,0.10)",
                  border: `1px solid ${isOpen ? "rgba(167,139,250,0.55)" : "rgba(167,139,250,0.30)"}`,
                  color: isOpen ? "#c4b5fd" : "#a78bfa",
                  cursor: "pointer", display: "flex", alignItems: "center",
                }}
              >
                <Settings size={11} />
              </button>

              {/* Portal popup */}
              {isOpen && (
                <SettingsPopup
                  alert={alert}
                  anchorRef={btnRef}
                  onUpdate={onUpdate}
                  onClose={close}
                />
              )}

              {/* Delete */}
              <button
                onClick={() => onDelete(alert.id)}
                style={{
                  padding: "3px 6px", borderRadius: 6,
                  background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.20)",
                  color: "#f87171", cursor: "pointer", flexShrink: 0,
                  display: "flex", alignItems: "center",
                }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
