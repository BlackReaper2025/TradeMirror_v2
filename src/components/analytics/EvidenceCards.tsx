import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { ResponsiveContainer, LineChart, ComposedChart, Area, Line, Bar, Tooltip, YAxis, Legend, ReferenceLine } from "recharts";
import { evidenceCards, emaStackData, macdChartData, momentumChartData, volatilityChartData, directionalChartData } from "../../data/analyticsData";
import type { EvidenceCard, Status } from "../../data/analyticsData";


const MOMENTUM_DISPLAY = [
  { key: "rsi14",    label: "RSI 14",   color: "#60a5fa" },
  { key: "rsi9",     label: "RSI 9",    color: "#818cf8" },
  { key: "stochRsi", label: "StochRSI", color: "#a78bfa" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MomentumTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const vals: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload.forEach((p: any) => {
    if (p.dataKey !== undefined) vals[p.dataKey] = p.value;
    if (p.name    !== undefined) vals[p.name]    = p.value;
  });
  return (
    <div style={{
      background: "var(--bg-panel)", border: "1px solid var(--border-subtle)",
      borderRadius: "8px", fontSize: "10px", color: "var(--text-secondary)", padding: "6px 10px",
    }}>
      {MOMENTUM_DISPLAY.map(({ key, label, color }) => {
        const val = vals[key];
        if (val === undefined) return null;
        return (
          <div key={key} style={{ display: "flex", gap: "8px", padding: "1px 0" }}>
            <span style={{ color, fontWeight: 600, minWidth: "52px" }}>{label}</span>
            <span>{val.toFixed(1)}</span>
          </div>
        );
      })}
    </div>
  );
}

const VOLATILITY_DISPLAY = [
  { key: "price",    label: "Price",    color: "#e2e8f0" },
  { key: "bbUpper",  label: "BB Upper", color: "#60a5fa" },
  { key: "bbMiddle", label: "BB Mid",   color: "#a78bfa" },
  { key: "bbLower",  label: "BB Lower", color: "#60a5fa" },
];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function VolatilityTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const vals: Record<string, number> = {};
  payload.forEach((p: any) => {
    if (p.dataKey !== undefined) vals[p.dataKey] = p.value;
    if (p.name    !== undefined) vals[p.name]    = p.value;
  });
  return (
    <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: "10px", color: "var(--text-secondary)", padding: "6px 10px" }}>
      {VOLATILITY_DISPLAY.map(({ key, label, color }) => {
        const val = vals[key];
        if (val === undefined) return null;
        return (
          <div key={key} style={{ display: "flex", gap: "8px", padding: "1px 0" }}>
            <span style={{ color, fontWeight: 600, minWidth: "52px" }}>{label}</span>
            <span>{val.toFixed(4)}</span>
          </div>
        );
      })}
    </div>
  );
}

const EMA_DISPLAY = [
  { key: "price",  label: "Price",   color: "#e2e8f0" },
  { key: "ema9",   label: "EMA 9",   color: "#60a5fa" },
  { key: "ema20",  label: "EMA 20",  color: "#818cf8" },
  { key: "ema50",  label: "EMA 50",  color: "#a78bfa" },
  { key: "ema200", label: "EMA 200", color: "#6366f1" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EmaTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  // Build a value map keyed by both dataKey and name (Recharts is inconsistent)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vals: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload.forEach((p: any) => {
    if (p.dataKey !== undefined) vals[p.dataKey] = p.value;
    if (p.name    !== undefined) vals[p.name]    = p.value;
  });
  return (
    <div style={{
      background: "var(--bg-panel)", border: "1px solid var(--border-subtle)",
      borderRadius: "8px", fontSize: "10px", color: "var(--text-secondary)", padding: "6px 10px",
    }}>
      {EMA_DISPLAY.map(({ key, label, color }) => {
        const val = vals[key];
        if (val === undefined) return null;
        return (
          <div key={key} style={{ display: "flex", gap: "8px", padding: "1px 0" }}>
            <span style={{ color, fontWeight: 600, minWidth: "52px" }}>{label}</span>
            <span>{val.toFixed(4)}</span>
          </div>
        );
      })}
    </div>
  );
}

const BADGE_COLOR: Record<Status, string> = {
  bullish: "#60a5fa",
  bearish: "#f87171",
  neutral: "#7a8fa8",
};

// ── Expanded modal ────────────────────────────────────────────────────────────
function ExpandedModal({ card, onClose }: { card: EvidenceCard; onClose: () => void }) {
  const badgeColor = BADGE_COLOR[card.bias];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 100, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="rounded-[18px] overflow-hidden"
        style={{
          width:      "1020px",
          maxHeight:  "80vh",
          overflowY:  "auto",
          background: "var(--bg-panel-alt)",
          border:     `1px solid ${badgeColor}30`,
          boxShadow:  `0 24px 60px rgba(0,0,0,0.6), 0 0 40px ${badgeColor}12`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center gap-3">
            <span className="text-[15px] font-black uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
              {card.label}
            </span>
            <span
              className="text-[10px] px-2 py-0.5 rounded-md font-semibold uppercase tracking-wide"
              style={{
                background: `${badgeColor}15`,
                color:       badgeColor,
                border:      `1px solid ${badgeColor}35`,
                boxShadow:   card.bias !== "neutral" ? `0 0 8px ${badgeColor}55` : undefined,
              }}
            >
              {card.bias}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-full transition-all"
            style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}
          >
            <X size={13} />
          </button>
        </div>

        {/* Values */}
        <div className="flex flex-col gap-0 px-5 py-4">
          {card.values.map((v) => {
            const valColor = BADGE_COLOR[v.status];
            return (
              <div
                key={v.label}
                className="flex items-center justify-between py-3"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <span className="text-[12px]" style={{ color: "var(--text-primary)" }}>
                  {v.label}
                </span>
                <span
                  className="text-[13px] font-bold tabular-nums"
                  style={{ color: "#ffffff" }}
                >
                  {v.value}
                </span>
              </div>
            );
          })}
        </div>

        {/* Directional chart — Directional card only */}
        {card.id === "directional" && (
          <div className="px-5 pt-4 pb-2">
            <div style={{ height: "420px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={directionalChartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <YAxis domain={[0, 50]} hide />
                  <ReferenceLine y={25} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                  <Tooltip
                    position={{ x: 8, y: 8 }}
                    contentStyle={{
                      background:    "var(--bg-panel)",
                      border:        "1px solid var(--border-subtle)",
                      borderRadius:  "8px",
                      fontSize:      "10px",
                      color:         "var(--text-secondary)",
                      pointerEvents: "none",
                    }}
                    formatter={(val: number) => val.toFixed(1)}
                    labelFormatter={() => ""}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="plainline"
                    iconSize={18}
                    wrapperStyle={{ fontSize: "13px", paddingTop: "4px", color: "var(--text-secondary)" }}
                  />
                  <Line dataKey="diPlus"  dot={false} strokeWidth={1.5} stroke="#60a5fa" />
                  <Line dataKey="diMinus" dot={false} strokeWidth={1.5} stroke="#a78bfa" />
                  <Line dataKey="adx"     dot={false} strokeWidth={1.5} stroke="#6366f1" strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ borderBottom: "1px solid var(--border-subtle)" }} />
          </div>
        )}

        {/* Volatility chart — Volatility card only */}
        {card.id === "volatility" && (
          <div className="px-5 pt-4 pb-2">
            <div style={{ height: "420px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={volatilityChartData}
              margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <YAxis domain={[Math.min(...volatilityChartData.map(d => d.bbLower)) - 0.001, Math.max(...volatilityChartData.map(d => d.bbUpper)) + 0.001]} hide />
                  <Tooltip content={<VolatilityTooltip />} position={{ x: 8, y: 8 }} />
                  <Legend
                    verticalAlign="bottom"
                    iconType="plainline"
                    iconSize={18}
                    wrapperStyle={{ fontSize: "13px", paddingTop: "4px", color: "var(--text-secondary)" }}
                  />
                  <Area dataKey="bbUpper" stroke="none" fill="rgba(96,165,250,0.13)" dot={false} legendType="none" isAnimationActive={false} />
                  <Area dataKey="bbLower" stroke="none" fill="#0d1219"              dot={false} legendType="none" isAnimationActive={false} fillOpacity={1} />
                  <Line dataKey="bbUpper"  dot={false} strokeWidth={1}    stroke="#60a5fa" strokeDasharray="3 3" />
                  <Line dataKey="bbMiddle" dot={false} strokeWidth={1}    stroke="#a78bfa" />
                  <Line dataKey="bbLower"  dot={false} strokeWidth={1}    stroke="#60a5fa" strokeDasharray="3 3" />
                  <Line dataKey="price"    dot={false} strokeWidth={0.75} stroke="#e2e8f0" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div style={{ borderBottom: "1px solid var(--border-subtle)" }} />
          </div>
        )}

        {/* Momentum chart — Momentum card only */}
        {card.id === "momentum" && (
          <div className="px-5 pt-4 pb-2">
            <div style={{ height: "420px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={momentumChartData.map(d => ({ ...d, ob: 70, os: 30 }))} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <YAxis domain={[0, 100]} hide />
                  <Area dataKey="ob" stroke="none" fill="rgba(96,165,250,0.10)" dot={false} legendType="none" isAnimationActive={false} />
                  <Area dataKey="os" stroke="none" fill="#0d1219"               dot={false} legendType="none" isAnimationActive={false} fillOpacity={1} />
                  <ReferenceLine y={70} stroke="rgba(255,255,255,0.30)" strokeDasharray="3 3" />
                  <ReferenceLine y={50} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                  <ReferenceLine y={30} stroke="rgba(255,255,255,0.30)" strokeDasharray="3 3" />
                  <Tooltip content={<MomentumTooltip />} position={{ x: 8, y: 8 }} />
                  <Legend
                    verticalAlign="bottom"
                    iconType="plainline"
                    iconSize={18}
                    wrapperStyle={{ fontSize: "13px", paddingTop: "4px", color: "var(--text-secondary)" }}
                  />
                  <Line dataKey="rsi"      dot={false} strokeWidth={1.5} stroke="#60a5fa" />
                  <Line dataKey="stochRsi" dot={false} strokeWidth={1.5} stroke="#a78bfa" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div style={{ borderBottom: "1px solid var(--border-subtle)" }} />
          </div>
        )}

        {/* MACD chart — MACD card only */}
        {card.id === "macd" && (
          <div className="px-5 pt-4 pb-2">
            <div style={{ height: "420px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={macdChartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <YAxis domain={["auto", "auto"]} hide />
                  <Tooltip
                    position={{ x: 8, y: 8 }}
                    contentStyle={{
                      background:    "var(--bg-panel)",
                      border:        "1px solid var(--border-subtle)",
                      borderRadius:  "8px",
                      fontSize:      "10px",
                      color:         "var(--text-secondary)",
                      pointerEvents: "none",
                    }}
                    formatter={(val: number) => val.toFixed(5)}
                    labelFormatter={() => ""}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="plainline"
                    iconSize={18}
                    wrapperStyle={{ fontSize: "13px", paddingTop: "4px", color: "var(--text-secondary)" }}
                  />
                      <Bar dataKey="histogram" fill="#7a8fa8" opacity={0.5} radius={[2, 2, 0, 0]} />
                  <Line dataKey="macd"   dot={false} strokeWidth={1.5} stroke="#60a5fa" />
                  <Line dataKey="signal" dot={false} strokeWidth={1.5} stroke="#a78bfa" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div style={{ borderBottom: "1px solid var(--border-subtle)" }} />
          </div>
        )}

        {/* EMA Stack chart — Trend card only */}
        {card.id === "trend" && (
          <div className="px-5 pt-4 pb-2">
            <div className="flex items-center gap-4 mb-2">
              {[
                { key: "price",  label: "Price",   color: "#e2e8f0" },
                { key: "ema9",   label: "EMA 9",   color: "#60a5fa" },
                { key: "ema20",  label: "EMA 20",  color: "#818cf8" },
                { key: "ema50",  label: "EMA 50",  color: "#a78bfa" },
                { key: "ema200", label: "EMA 200", color: "#6366f1" },
              ].map((s) => (
                <span key={s.key} className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  <span className="inline-block w-8 h-[2px] rounded" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
            <div style={{ height: "420px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={emaStackData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <YAxis domain={["auto", "auto"]} hide />
                  <Tooltip content={<EmaTooltip />} position={{ x: 8, y: 8 }} />
                  <Line dataKey="price"  dot={false} strokeWidth={0.75} stroke="#e2e8f0" />
                  <Line dataKey="ema9"   dot={false} strokeWidth={1.5}  stroke="#60a5fa" />
                  <Line dataKey="ema20"  dot={false} strokeWidth={1.5}  stroke="#818cf8" />
                  <Line dataKey="ema50"  dot={false} strokeWidth={1.5}  stroke="#a78bfa" />
                  <Line dataKey="ema200" dot={false} strokeWidth={1.5}  stroke="#6366f1" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ borderBottom: "1px solid var(--border-subtle)", marginBottom: "0" }} />
          </div>
        )}

        {/* Footer hint */}
        <div
          className="px-5 pb-4 text-[10px] uppercase tracking-widest text-center"
          style={{ color: "var(--text-muted)", opacity: 0.4 }}
        >
          Press Esc or click outside to close
        </div>
      </div>
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────
function Card({ card, onClick }: { card: EvidenceCard; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const badgeColor = BADGE_COLOR[card.bias];

  return (
    <div
      className="flex-1 flex flex-col h-full rounded-[14px] overflow-hidden cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        background: "var(--bg-panel)",
        border:     `1px solid ${hovered ? "var(--border-medium)" : "var(--border-subtle)"}`,
        boxShadow:  "0 4px 24px rgba(0,0,0,0.45)",
        transition: "border-color 0.15s",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3.5 py-2.5 shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <span
          className="text-[11px] font-black uppercase tracking-widest"
          style={{ color: "var(--text-secondary)" }}
        >
          {card.label}
        </span>
        <span
          className="text-[9px] px-1.5 py-0.5 rounded-md font-semibold uppercase tracking-wide"
          style={{
            background: `${badgeColor}15`,
            color:       badgeColor,
            border:      `1px solid ${badgeColor}35`,
            boxShadow:   card.bias !== "neutral" ? `0 0 8px ${badgeColor}55` : undefined,
          }}
        >
          {card.bias}
        </span>
      </div>

      {/* Values */}
      <div className={`flex flex-col justify-center px-3.5 gap-1.5 ${card.id === "trend" || card.id === "macd" || card.id === "momentum" || card.id === "volatility" || card.id === "directional" ? "py-1.5" : "flex-1 py-2"}`}>
        {card.values.map((v) => (
          <div key={v.label} className="flex items-center justify-between gap-2">
            <span className="text-[10px] shrink-0" style={{ color: "var(--text-secondary)" }}>
              {v.label}
            </span>
            <span
              className="text-[11px] font-semibold tabular-nums text-right"
              style={{ color: "var(--text-primary)" }}
            >
              {v.value}
            </span>
          </div>
        ))}
      </div>

      {/* Volatility chart subpanel — Volatility card only */}
      {card.id === "volatility" && (
        <div
          className="flex-1 min-h-0 mx-4 mt-2 mb-3 rounded-[10px] overflow-hidden"
          style={{
            maxHeight:  "75%",
            background: "rgba(255,255,255,0.03)",
            border:     "1px solid var(--border-subtle)",
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={volatilityChartData}
              margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
              <YAxis domain={[Math.min(...volatilityChartData.map(d => d.bbLower)) - 0.001, Math.max(...volatilityChartData.map(d => d.bbUpper)) + 0.001]} hide />
              <Tooltip
                position={{ x: 8, y: 8 }}
                contentStyle={{
                  background:    "var(--bg-panel)",
                  border:        "1px solid var(--border-subtle)",
                  borderRadius:  "8px",
                  fontSize:      "10px",
                  color:         "var(--text-secondary)",
                  pointerEvents: "none",
                }}
                formatter={(val: number) => val.toFixed(4)}
                labelFormatter={() => ""}
              />
              <Legend
                verticalAlign="bottom"
                iconType="plainline"
                iconSize={12}
                wrapperStyle={{ fontSize: "9px", paddingTop: "2px", color: "var(--text-muted)" }}
              />
              {/* Stacked areas: transparent base at bbLower, blue fill for band width */}
              <Area dataKey="bbUpper" stroke="none" fill="rgba(96,165,250,0.13)" dot={false} legendType="none" isAnimationActive={false} />
              <Area dataKey="bbLower" stroke="none" fill="#0d1219"              dot={false} legendType="none" isAnimationActive={false} fillOpacity={1} />
              <Line dataKey="bbUpper"  dot={false} strokeWidth={1}    stroke="#60a5fa" strokeDasharray="3 3" />
              <Line dataKey="bbMiddle" dot={false} strokeWidth={1}    stroke="#a78bfa" />
              <Line dataKey="bbLower"  dot={false} strokeWidth={1}    stroke="#60a5fa" strokeDasharray="3 3" />
              <Line dataKey="price"    dot={false} strokeWidth={0.75} stroke="#e2e8f0" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Momentum chart subpanel — Momentum card only */}
      {card.id === "momentum" && (
        <div
          className="flex-1 min-h-0 mx-4 mt-2 mb-3 rounded-[10px] overflow-hidden"
          style={{
            maxHeight:  "75%",
            background: "rgba(255,255,255,0.03)",
            border:     "1px solid var(--border-subtle)",
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={momentumChartData.map(d => ({ ...d, ob: 70, os: 30 }))} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
              <YAxis domain={[0, 100]} hide />
              <Area dataKey="ob" stroke="none" fill="rgba(96,165,250,0.10)" dot={false} legendType="none" isAnimationActive={false} />
              <Area dataKey="os" stroke="none" fill="#0d1219"               dot={false} legendType="none" isAnimationActive={false} fillOpacity={1} />
              <ReferenceLine y={70} stroke="rgba(255,255,255,0.30)" strokeDasharray="3 3" />
              <ReferenceLine y={50} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
              <ReferenceLine y={30} stroke="rgba(255,255,255,0.30)" strokeDasharray="3 3" />
              <Tooltip content={<MomentumTooltip />} position={{ x: 8, y: 8 }} />
              <Legend
                verticalAlign="bottom"
                iconType="plainline"
                iconSize={12}
                wrapperStyle={{ fontSize: "9px", paddingTop: "2px", color: "var(--text-muted)" }}
              />
              <Line dataKey="rsi14"    dot={false} strokeWidth={1.5} stroke="#60a5fa" />
              <Line dataKey="rsi9"     dot={false} strokeWidth={1.5} stroke="#818cf8" />
              <Line dataKey="stochRsi" dot={false} strokeWidth={1.5} stroke="#a78bfa" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* MACD chart subpanel — MACD card only */}
      {card.id === "macd" && (
        <div
          className="flex-1 min-h-0 mx-4 mt-2 mb-3 rounded-[10px] overflow-hidden"
          style={{
            maxHeight:  "75%",
            background: "rgba(255,255,255,0.03)",
            border:     "1px solid var(--border-subtle)",
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={macdChartData} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
              <YAxis domain={["auto", "auto"]} hide />
              <Tooltip
                position={{ x: 8, y: 8 }}
                contentStyle={{
                  background:    "var(--bg-panel)",
                  border:        "1px solid var(--border-subtle)",
                  borderRadius:  "8px",
                  fontSize:      "10px",
                  color:         "var(--text-secondary)",
                  pointerEvents: "none",
                }}
                formatter={(val: number) => (val * 10000).toFixed(2)}
                labelFormatter={() => ""}
              />
              <Legend
                verticalAlign="bottom"
                iconType="plainline"
                iconSize={12}
                wrapperStyle={{ fontSize: "9px", paddingTop: "2px", color: "var(--text-muted)" }}
              />
              <Bar
                dataKey="histogram"
                fill="#7a8fa8"
                opacity={0.5}
                radius={[2, 2, 0, 0]}
                // color bars by sign
                label={false}
              />
              <Line dataKey="macd"   dot={false} strokeWidth={1.5} stroke="#60a5fa" />
              <Line dataKey="signal" dot={false} strokeWidth={1.5} stroke="#a78bfa" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Directional chart subpanel — Directional card only */}
      {card.id === "directional" && (
        <div
          className="flex-1 min-h-0 mx-4 mt-2 mb-3 rounded-[10px] overflow-hidden"
          style={{
            maxHeight:  "75%",
            background: "rgba(255,255,255,0.03)",
            border:     "1px solid var(--border-subtle)",
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={directionalChartData} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
              <YAxis domain={[0, 50]} hide />
              <ReferenceLine y={25} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
              <Tooltip
                position={{ x: 8, y: 8 }}
                contentStyle={{
                  background:    "var(--bg-panel)",
                  border:        "1px solid var(--border-subtle)",
                  borderRadius:  "8px",
                  fontSize:      "10px",
                  color:         "var(--text-secondary)",
                  pointerEvents: "none",
                }}
                formatter={(val: number) => val.toFixed(1)}
                labelFormatter={() => ""}
              />
              <Legend
                verticalAlign="bottom"
                iconType="plainline"
                iconSize={12}
                wrapperStyle={{ fontSize: "9px", paddingTop: "2px", color: "var(--text-muted)" }}
              />
              <Line dataKey="diPlus"  dot={false} strokeWidth={1.5} stroke="#60a5fa" />
              <Line dataKey="diMinus" dot={false} strokeWidth={1.5} stroke="#a78bfa" />
              <Line dataKey="adx"     dot={false} strokeWidth={1.5} stroke="#6366f1" strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* EMA chart subpanel — Trend card only */}
      {card.id === "trend" && (
        <div
          className="flex-1 min-h-0 mx-4 mt-2 mb-3 rounded-[10px] overflow-hidden"
          style={{
            maxHeight:  "75%",
            background: "rgba(255,255,255,0.03)",
            border:     "1px solid var(--border-subtle)",
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={emaStackData} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
              <YAxis domain={["auto", "auto"]} hide />
              <Tooltip content={<EmaTooltip />} position={{ x: 8, y: 8 }} />
              <Legend
                verticalAlign="bottom"
                iconType="plainline"
                iconSize={12}
                wrapperStyle={{ fontSize: "9px", paddingTop: "2px", color: "var(--text-muted)" }}
              />
              <Line dataKey="price"  dot={false} strokeWidth={0.75} stroke="#e2e8f0" />
              <Line dataKey="ema9"   dot={false} strokeWidth={1.5} stroke="#60a5fa" />
              <Line dataKey="ema20"  dot={false} strokeWidth={1.5} stroke="#818cf8" />
              <Line dataKey="ema50"  dot={false} strokeWidth={1.5} stroke="#a78bfa" />
              <Line dataKey="ema200" dot={false} strokeWidth={1.5} stroke="#6366f1" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

    </div>
  );
}

// ── EvidenceCards ─────────────────────────────────────────────────────────────
export function EvidenceCards() {
  const [expanded, setExpanded] = useState<EvidenceCard | null>(null);

  return (
    <>
      <div className="flex gap-3 h-full">
        {evidenceCards.map((card) => (
          <Card key={card.id} card={card} onClick={() => setExpanded(card)} />
        ))}
      </div>

      {expanded && (
        <ExpandedModal card={expanded} onClose={() => setExpanded(null)} />
      )}
    </>
  );
}
