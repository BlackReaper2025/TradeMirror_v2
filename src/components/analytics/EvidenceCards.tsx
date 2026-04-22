import { useState, useEffect } from "react";
import { X, Maximize2 } from "lucide-react";
import { ResponsiveContainer, LineChart, ComposedChart, Area, Line, Bar, Tooltip, XAxis, YAxis, Legend, ReferenceLine } from "recharts";
import { useAnalytics } from "../../data/analyticsData";
import type { EvidenceCard, Status } from "../../data/analyticsData";


const MOMENTUM_DISPLAY = [
  { key: "rsi14",    label: "RSI 14",   color: "#60a5fa" },
  { key: "rsi9",     label: "RSI 9",    color: "#818cf8" },
  { key: "stochRsi", label: "StochRSI", color: "#e2e8f0" },
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
  { key: "bbMiddle", label: "BB Mid",   color: "#7a8fa8" },
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
  { key: "ema50",  label: "EMA 50",  color: "#7a8fa8" },
  { key: "ema200", label: "EMA 200", color: "#c4b5fd" },
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
  const { emaStackData, macdChartData, momentumChartData, volatilityChartData, directionalChartData } = useAnalytics();
  const badgeColor = BADGE_COLOR[card.bias];

  const validEmaData = emaStackData
    .filter(d => d.price > 0)
    .map(d => ({
      ...d,
      ema9:   d.ema9   > 0 ? d.ema9   : null,
      ema20:  d.ema20  > 0 ? d.ema20  : null,
      ema50:  d.ema50  > 0 ? d.ema50  : null,
      ema200: d.ema200 > 0 ? d.ema200 : null,
    }));
  const emaVals  = emaStackData.flatMap(d =>
    [d.price, d.ema9, d.ema20, d.ema50, d.ema200].filter(v => v > 0)
  );
  const emaLo    = emaVals.length ? Math.min(...emaVals) : 0;
  const emaHi    = emaVals.length ? Math.max(...emaVals) : 1;
  const emaPad   = (emaHi - emaLo) * 0.25;
  const emaDomain: [number, number] = [emaLo - emaPad, emaHi + emaPad];

  const macdVals   = macdChartData.flatMap(d => [d.macd, d.signal, d.histogram]);
  const macdLo     = macdVals.length ? Math.min(...macdVals) : -0.001;
  const macdHi     = macdVals.length ? Math.max(...macdVals) :  0.001;
  const macdPad    = (macdHi - macdLo) * 0.25;
  const macdDomain: [number, number] = [macdLo - macdPad, macdHi + macdPad];

  const bbVals     = volatilityChartData.flatMap(d => [d.price, d.bbUpper, d.bbMiddle, d.bbLower]).filter(v => v > 0);
  const bbLo       = bbVals.length ? Math.min(...bbVals) : 0;
  const bbHi       = bbVals.length ? Math.max(...bbVals) : 1;
  const bbPad      = (bbHi - bbLo) * 0.25;
  const bbDomain: [number, number] = [bbLo - bbPad, bbHi + bbPad];

  const [momentumZoom, setMomentumZoom] = useState<{ start: number; end: number } | null>(null);
  const [mShowRsi14,    setMShowRsi14]    = useState(true);
  const [mShowRsi9,     setMShowRsi9]     = useState(true);
  const [mShowStochRsi, setMShowStochRsi] = useState(true);
  const [emaZoomM, setEmaZoomM] = useState<{ start: number; end: number } | null>(null);
  const [mShowPrice,  setMShowPrice]  = useState(true);
  const [macdZoomM, setMacdZoomM] = useState<{ start: number; end: number } | null>(null);
  const [mShowMacd,      setMShowMacd]      = useState(true);
  const [mShowSignal,    setMShowSignal]    = useState(true);
  const [mShowHistogram, setMShowHistogram] = useState(true);
  const [volZoomM, setVolZoomM] = useState<{ start: number; end: number } | null>(null);
  const [mShowVolPrice,  setMShowVolPrice]  = useState(true);
  const [mShowBbUpper,   setMShowBbUpper]   = useState(true);
  const [mShowBbMiddle,  setMShowBbMiddle]  = useState(true);
  const [mShowBbLower,   setMShowBbLower]   = useState(true);
  const [dirZoomM, setDirZoomM] = useState<{ start: number; end: number } | null>(null);
  const [mShowDiPlus,  setMShowDiPlus]  = useState(true);
  const [mShowDiMinus, setMShowDiMinus] = useState(true);
  const [mShowAdx,     setMShowAdx]     = useState(true);
  const [mShowEma9,   setMShowEma9]   = useState(true);
  const [mShowEma20,  setMShowEma20]  = useState(true);
  const [mShowEma50,  setMShowEma50]  = useState(true);
  const [mShowEma200, setMShowEma200] = useState(true);
  const mModalLen = momentumChartData.length;
  const mModalWin = momentumZoom ?? { start: Math.max(0, mModalLen - 30), end: mModalLen - 1 };
  const visibleMomentumData = momentumChartData.slice(mModalWin.start, mModalWin.end + 1);
  const mModalWindowSize = mModalWin.end - mModalWin.start;
  const mModalScrollMax  = Math.max(0, mModalLen - 1 - mModalWindowSize);

  function onMomentumWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    setMomentumZoom(prev => {
      const cur = prev ?? { start: 0, end: mModalLen - 1 };
      const range = cur.end - cur.start;
      const step  = Math.max(1, Math.ceil(range * 0.15));
      const newRange  = e.deltaY < 0 ? Math.max(4, range - step) : Math.min(mModalLen - 1, range + step);
      const center    = (cur.start + cur.end) / 2;
      const newStart  = Math.max(0, Math.round(center - newRange / 2));
      const newEnd    = Math.min(mModalLen - 1, newStart + newRange);
      return { start: newStart, end: newEnd };
    });
  }
  function onModalMomentumScroll(v: number) {
    setMomentumZoom({ start: v, end: Math.min(mModalLen - 1, v + mModalWindowSize) });
  }

  const eMLen = validEmaData.length;
  const eMWin = emaZoomM ?? { start: Math.max(0, eMLen - 30), end: eMLen - 1 };
  const visibleEmaModalData = validEmaData.slice(eMWin.start, eMWin.end + 1);
  const eMWindowSize = eMWin.end - eMWin.start;
  const eMScrollMax  = Math.max(0, eMLen - 1 - eMWindowSize);
  const eMViewVals   = visibleEmaModalData.flatMap(d =>
    [d.price, d.ema9, d.ema20, d.ema50, d.ema200].filter((v): v is number => !!v && v > 0)
  );
  const eMViewLo  = eMViewVals.length ? Math.min(...eMViewVals) : emaLo;
  const eMViewHi  = eMViewVals.length ? Math.max(...eMViewVals) : emaHi;
  const eMViewPad = (eMViewHi - eMViewLo) * 0.25;
  const eMViewDomain: [number, number] = [eMViewLo - eMViewPad, eMViewHi + eMViewPad];

  function onEmaWheelM(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    setEmaZoomM(prev => {
      const cur = prev ?? { start: 0, end: eMLen - 1 };
      const range = cur.end - cur.start;
      const step  = Math.max(1, Math.ceil(range * 0.15));
      const newRange = e.deltaY < 0 ? Math.max(4, range - step) : Math.min(eMLen - 1, range + step);
      const center   = (cur.start + cur.end) / 2;
      const newStart = Math.max(0, Math.round(center - newRange / 2));
      const newEnd   = Math.min(eMLen - 1, newStart + newRange);
      return { start: newStart, end: newEnd };
    });
  }
  function onEmaScrollM(v: number) {
    setEmaZoomM({ start: v, end: Math.min(eMLen - 1, v + eMWindowSize) });
  }

  const macdLen = macdChartData.length;
  const macdWinM = macdZoomM ?? { start: Math.max(0, macdLen - 30), end: macdLen - 1 };
  const visibleMacdModalData = macdChartData.slice(macdWinM.start, macdWinM.end + 1);
  const macdMWindowSize = macdWinM.end - macdWinM.start;
  const macdMScrollMax  = Math.max(0, macdLen - 1 - macdMWindowSize);
  const macdMViewVals   = visibleMacdModalData.flatMap(d => [d.macd, d.signal, d.histogram]);
  const macdMLo  = macdMViewVals.length ? Math.min(...macdMViewVals) : -0.001;
  const macdMHi  = macdMViewVals.length ? Math.max(...macdMViewVals) :  0.001;
  const macdMPad = (macdMHi - macdMLo) * 0.25;
  const macdMViewDomain: [number, number] = [macdMLo - macdMPad, macdMHi + macdMPad];

  function onMacdWheelM(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    setMacdZoomM(prev => {
      const cur = prev ?? { start: 0, end: macdLen - 1 };
      const range = cur.end - cur.start;
      const step  = Math.max(1, Math.ceil(range * 0.15));
      const newRange = e.deltaY < 0 ? Math.max(4, range - step) : Math.min(macdLen - 1, range + step);
      const center   = (cur.start + cur.end) / 2;
      const newStart = Math.max(0, Math.round(center - newRange / 2));
      const newEnd   = Math.min(macdLen - 1, newStart + newRange);
      return { start: newStart, end: newEnd };
    });
  }
  function onMacdScrollM(v: number) {
    setMacdZoomM({ start: v, end: Math.min(macdLen - 1, v + macdMWindowSize) });
  }

  const volLen = volatilityChartData.length;
  const volWinM = volZoomM ?? { start: Math.max(0, volLen - 30), end: volLen - 1 };
  const visibleVolModalData = volatilityChartData.slice(volWinM.start, volWinM.end + 1);
  const volMWindowSize = volWinM.end - volWinM.start;
  const volMScrollMax  = Math.max(0, volLen - 1 - volMWindowSize);
  const volMViewVals   = visibleVolModalData.flatMap(d => [d.price, d.bbUpper, d.bbMiddle, d.bbLower]).filter(v => v > 0);
  const volMLo  = volMViewVals.length ? Math.min(...volMViewVals) : bbLo;
  const volMHi  = volMViewVals.length ? Math.max(...volMViewVals) : bbHi;
  const volMPad = (volMHi - volMLo) * 0.25;
  const volMViewDomain: [number, number] = [volMLo - volMPad, volMHi + volMPad];

  function onVolWheelM(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    setVolZoomM(prev => {
      const cur = prev ?? { start: 0, end: volLen - 1 };
      const range = cur.end - cur.start;
      const step  = Math.max(1, Math.ceil(range * 0.15));
      const newRange = e.deltaY < 0 ? Math.max(4, range - step) : Math.min(volLen - 1, range + step);
      const center   = (cur.start + cur.end) / 2;
      const newStart = Math.max(0, Math.round(center - newRange / 2));
      const newEnd   = Math.min(volLen - 1, newStart + newRange);
      return { start: newStart, end: newEnd };
    });
  }
  function onVolScrollM(v: number) {
    setVolZoomM({ start: v, end: Math.min(volLen - 1, v + volMWindowSize) });
  }

  const dirLen = directionalChartData.length;
  const dirWinM = dirZoomM ?? { start: Math.max(0, dirLen - 30), end: dirLen - 1 };
  const visibleDirModalData = directionalChartData.slice(dirWinM.start, dirWinM.end + 1);
  const dirMWindowSize = dirWinM.end - dirWinM.start;
  const dirMScrollMax  = Math.max(0, dirLen - 1 - dirMWindowSize);

  function onDirWheelM(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    setDirZoomM(prev => {
      const cur = prev ?? { start: 0, end: dirLen - 1 };
      const range = cur.end - cur.start;
      const step  = Math.max(1, Math.ceil(range * 0.15));
      const newRange = e.deltaY < 0 ? Math.max(4, range - step) : Math.min(dirLen - 1, range + step);
      const center   = (cur.start + cur.end) / 2;
      const newStart = Math.max(0, Math.round(center - newRange / 2));
      const newEnd   = Math.min(dirLen - 1, newStart + newRange);
      return { start: newStart, end: newEnd };
    });
  }
  function onDirScrollM(v: number) {
    setDirZoomM({ start: v, end: Math.min(dirLen - 1, v + dirMWindowSize) });
  }

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
            {/* Line toggles */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {([
                { label: "+DI", color: "#60a5fa", show: mShowDiPlus,  set: setMShowDiPlus  },
                { label: "-DI", color: "#a78bfa", show: mShowDiMinus, set: setMShowDiMinus },
                { label: "ADX", color: "#6366f1", show: mShowAdx,     set: setMShowAdx     },
              ] as const).map(({ label, color, show, set }) => (
                <button key={label} onClick={() => set(s => !s)} style={{
                  fontSize: 11, padding: "2px 9px", borderRadius: 6, cursor: "pointer",
                  border:     `1px solid ${show ? color + "55" : "rgba(255,255,255,0.10)"}`,
                  background: show ? color + "18" : "transparent",
                  color:      show ? color : "var(--text-muted)",
                  transition: "all 0.15s",
                }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ height: "360px" }} onWheel={onDirWheelM}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={visibleDirModalData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <YAxis domain={[0, 50]} hide />
                  <ReferenceLine y={25} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                  <Tooltip
                    position={{ x: 8, y: 8 }}
                    contentStyle={{
                      background: "var(--bg-panel)", border: "1px solid var(--border-subtle)",
                      borderRadius: "8px", fontSize: "10px", color: "var(--text-secondary)", pointerEvents: "none",
                    }}
                    formatter={(val: number) => val.toFixed(1)}
                    labelFormatter={() => ""}
                  />
                  {mShowDiPlus  && <Line dataKey="diPlus"  dot={false} activeDot={false} strokeWidth={1.5} stroke="#60a5fa" />}
                  {mShowDiMinus && <Line dataKey="diMinus" dot={false} activeDot={false} strokeWidth={1.5} stroke="#a78bfa" />}
                  {mShowAdx     && <Line dataKey="adx"     dot={false} activeDot={false} strokeWidth={1.5} stroke="#6366f1" strokeDasharray="4 2" />}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* Scrollbar */}
            <input
              type="range"
              className="momentum-scroll"
              min={0}
              max={dirMScrollMax * 100}
              value={dirWinM.start * 100}
              onChange={e => onDirScrollM(Math.round(Number(e.target.value) / 100))}
            />
            {/* Date labels */}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 8px 4px", fontSize: 11, color: "var(--text-muted)" }}>
              {[0,1,2].map(i => {
                const idx = Math.round(i * (visibleDirModalData.length - 1) / 2);
                const raw = visibleDirModalData[idx]?.date;
                if (!raw) return <span key={i} />;
                const d = new Date(raw);
                return <span key={i}>{isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>;
              })}
            </div>
            <div style={{ borderBottom: "1px solid var(--border-subtle)" }} />
          </div>
        )}

        {/* Volatility chart — Volatility card only */}
        {card.id === "volatility" && (
          <div className="px-5 pt-4 pb-2">
            {/* Line toggles */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {([
                { label: "Price",    color: "#e2e8f0", show: mShowVolPrice, set: setMShowVolPrice },
                { label: "BB Upper", color: "#60a5fa", show: mShowBbUpper,  set: setMShowBbUpper  },
                { label: "BB Mid",   color: "#a78bfa", show: mShowBbMiddle, set: setMShowBbMiddle },
                { label: "BB Lower", color: "#60a5fa", show: mShowBbLower,  set: setMShowBbLower  },
              ] as const).map(({ label, color, show, set }) => (
                <button key={label} onClick={() => set(s => !s)} style={{
                  fontSize: 11, padding: "2px 9px", borderRadius: 6, cursor: "pointer",
                  border:     `1px solid ${show ? color + "55" : "rgba(255,255,255,0.10)"}`,
                  background: show ? color + "18" : "transparent",
                  color:      show ? color : "var(--text-muted)",
                  transition: "all 0.15s",
                }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ height: "360px" }} onWheel={onVolWheelM}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={visibleVolModalData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <YAxis domain={volMViewDomain} hide />
                  <Tooltip content={<VolatilityTooltip />} position={{ x: 8, y: 8 }} />
                  {mShowBbUpper && <Area dataKey="bbUpper" stroke="none" fill="rgba(96,165,250,0.13)" dot={false} activeDot={false} legendType="none" isAnimationActive={false} />}
                  {mShowBbLower && <Area dataKey="bbLower" stroke="none" fill="#0d1219" dot={false} activeDot={false} legendType="none" isAnimationActive={false} fillOpacity={1} />}
                  {mShowBbUpper  && <Line dataKey="bbUpper"  dot={false} activeDot={false} strokeWidth={1}    stroke="#60a5fa" strokeDasharray="3 3" />}
                  {mShowBbMiddle && <Line dataKey="bbMiddle" dot={false} activeDot={false} strokeWidth={1}    stroke="#a78bfa" />}
                  {mShowBbLower  && <Line dataKey="bbLower"  dot={false} activeDot={false} strokeWidth={1}    stroke="#60a5fa" strokeDasharray="3 3" />}
                  {mShowVolPrice && <Line dataKey="price"    dot={false} activeDot={false} strokeWidth={0.75} stroke="#e2e8f0" />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {/* Scrollbar */}
            <input
              type="range"
              className="momentum-scroll"
              min={0}
              max={volMScrollMax * 100}
              value={volWinM.start * 100}
              onChange={e => onVolScrollM(Math.round(Number(e.target.value) / 100))}
            />
            {/* Date labels */}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 8px 4px", fontSize: 11, color: "var(--text-muted)" }}>
              {[0,1,2].map(i => {
                const idx = Math.round(i * (visibleVolModalData.length - 1) / 2);
                const raw = visibleVolModalData[idx]?.date;
                if (!raw) return <span key={i} />;
                const d = new Date(raw);
                return <span key={i}>{isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>;
              })}
            </div>
            <div style={{ borderBottom: "1px solid var(--border-subtle)" }} />
          </div>
        )}

        {/* Momentum chart — Momentum card only */}
        {card.id === "momentum" && (
          <div className="px-5 pt-4 pb-2">
            {/* Line toggles */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {([
                { label: "RSI 14",   color: "#60a5fa", show: mShowRsi14,    set: setMShowRsi14 },
                { label: "RSI 9",    color: "#818cf8", show: mShowRsi9,     set: setMShowRsi9 },
                { label: "StochRSI", color: "#e2e8f0", show: mShowStochRsi, set: setMShowStochRsi },
              ] as const).map(({ label, color, show, set }) => (
                <button key={label} onClick={() => set(s => !s)} style={{
                  fontSize: 11, padding: "2px 9px", borderRadius: 6, cursor: "pointer",
                  border:     `1px solid ${show ? color + "55" : "rgba(255,255,255,0.10)"}`,
                  background: show ? color + "18" : "transparent",
                  color:      show ? color : "var(--text-muted)",
                  transition: "all 0.15s",
                }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ height: "360px" }} onWheel={onMomentumWheel}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={visibleMomentumData.map(d => ({ ...d, ob: 70, os: 30 }))} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <YAxis domain={[0, 100]} hide />
                  <Area dataKey="ob" stroke="none" fill="rgba(96,165,250,0.10)" dot={false} activeDot={false} legendType="none" isAnimationActive={false} />
                  <Area dataKey="os" stroke="none" fill="#0d1219"               dot={false} activeDot={false} legendType="none" isAnimationActive={false} fillOpacity={1} />
                  <ReferenceLine y={70} stroke="rgba(255,255,255,0.30)" strokeDasharray="3 3" />
                  <ReferenceLine y={50} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                  <ReferenceLine y={30} stroke="rgba(255,255,255,0.30)" strokeDasharray="3 3" />
                  <Tooltip content={<MomentumTooltip />} position={{ x: 8, y: 8 }} />
                  {mShowRsi14    && <Line dataKey="rsi14"    dot={false} activeDot={false} strokeWidth={1.5}  stroke="#60a5fa" />}
                  {mShowRsi9     && <Line dataKey="rsi9"     dot={false} activeDot={false} strokeWidth={1.5}  stroke="#818cf8" />}
                  {mShowStochRsi && <Line dataKey="stochRsi" dot={false} activeDot={false} strokeWidth={0.75} stroke="#e2e8f0" />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {/* Scrollbar */}
            <input
              type="range"
              className="momentum-scroll"
              min={0}
              max={mModalScrollMax * 100}
              value={mModalWin.start * 100}
              onChange={e => onModalMomentumScroll(Math.round(Number(e.target.value) / 100))}
            />
            {/* Date labels */}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 8px 4px", fontSize: 11, color: "var(--text-muted)" }}>
              {[0,1,2].map(i => {
                const idx = Math.round(i * (visibleMomentumData.length - 1) / 2);
                const raw = visibleMomentumData[idx]?.date;
                if (!raw) return <span key={i} />;
                const d = new Date(raw);
                return <span key={i}>{isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>;
              })}
            </div>
            <div style={{ borderBottom: "1px solid var(--border-subtle)" }} />
          </div>
        )}

        {/* MACD chart — MACD card only */}
        {card.id === "macd" && (
          <div className="px-5 pt-4 pb-2">
            {/* Line toggles */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {([
                { label: "MACD",      color: "#60a5fa", show: mShowMacd,      set: setMShowMacd      },
                { label: "Signal",    color: "#a78bfa", show: mShowSignal,    set: setMShowSignal    },
                { label: "Histogram", color: "#7a8fa8", show: mShowHistogram, set: setMShowHistogram },
              ] as const).map(({ label, color, show, set }) => (
                <button key={label} onClick={() => set(s => !s)} style={{
                  fontSize: 11, padding: "2px 9px", borderRadius: 6, cursor: "pointer",
                  border:     `1px solid ${show ? color + "55" : "rgba(255,255,255,0.10)"}`,
                  background: show ? color + "18" : "transparent",
                  color:      show ? color : "var(--text-muted)",
                  transition: "all 0.15s",
                }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ height: "360px" }} onWheel={onMacdWheelM}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={visibleMacdModalData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <YAxis domain={macdMViewDomain} hide />
                  <Tooltip
                    position={{ x: 8, y: 8 }}
                    contentStyle={{
                      background: "var(--bg-panel)", border: "1px solid var(--border-subtle)",
                      borderRadius: "8px", fontSize: "10px", color: "var(--text-secondary)", pointerEvents: "none",
                    }}
                    formatter={(val: number) => val.toFixed(5)}
                    labelFormatter={() => ""}
                  />
                  {mShowHistogram && <Bar dataKey="histogram" fill="#7a8fa8" opacity={0.5} radius={[2, 2, 0, 0]} />}
                  {mShowMacd      && <Line dataKey="macd"   dot={false} activeDot={false} strokeWidth={1.5} stroke="#60a5fa" />}
                  {mShowSignal    && <Line dataKey="signal" dot={false} activeDot={false} strokeWidth={1.5} stroke="#a78bfa" />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {/* Scrollbar */}
            <input
              type="range"
              className="momentum-scroll"
              min={0}
              max={macdMScrollMax * 100}
              value={macdWinM.start * 100}
              onChange={e => onMacdScrollM(Math.round(Number(e.target.value) / 100))}
            />
            {/* Date labels */}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 8px 4px", fontSize: 11, color: "var(--text-muted)" }}>
              {[0,1,2].map(i => {
                const idx = Math.round(i * (visibleMacdModalData.length - 1) / 2);
                const raw = visibleMacdModalData[idx]?.date;
                if (!raw) return <span key={i} />;
                const d = new Date(raw);
                return <span key={i}>{isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>;
              })}
            </div>
            <div style={{ borderBottom: "1px solid var(--border-subtle)" }} />
          </div>
        )}

        {/* EMA Stack chart — Trend card only */}
        {card.id === "trend" && (
          <div className="px-5 pt-4 pb-2">
            {/* Line toggles */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {([
                { label: "Price",   color: "#e2e8f0", show: mShowPrice,  set: setMShowPrice  },
                { label: "EMA 9",   color: "#60a5fa", show: mShowEma9,   set: setMShowEma9   },
                { label: "EMA 20",  color: "#818cf8", show: mShowEma20,  set: setMShowEma20  },
                { label: "EMA 50",  color: "#a78bfa", show: mShowEma50,  set: setMShowEma50  },
                { label: "EMA 200", color: "#c4b5fd", show: mShowEma200, set: setMShowEma200 },
              ] as const).map(({ label, color, show, set }) => (
                <button key={label} onClick={() => set(s => !s)} style={{
                  fontSize: 11, padding: "2px 9px", borderRadius: 6, cursor: "pointer",
                  border:     `1px solid ${show ? color + "55" : "rgba(255,255,255,0.10)"}`,
                  background: show ? color + "18" : "transparent",
                  color:      show ? color : "var(--text-muted)",
                  transition: "all 0.15s",
                }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ height: "360px" }} onWheel={onEmaWheelM}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={visibleEmaModalData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <YAxis domain={eMViewDomain} hide />
                  <Tooltip content={<EmaTooltip />} position={{ x: 8, y: 8 }} />
                  {mShowPrice  && <Line dataKey="price"  dot={false} activeDot={false} strokeWidth={0.75} stroke="#e2e8f0" connectNulls />}
                  {mShowEma9   && <Line dataKey="ema9"   dot={false} activeDot={false} strokeWidth={1.5}  stroke="#60a5fa" connectNulls />}
                  {mShowEma20  && <Line dataKey="ema20"  dot={false} activeDot={false} strokeWidth={1.5}  stroke="#818cf8" connectNulls />}
                  {mShowEma50  && <Line dataKey="ema50"  dot={false} activeDot={false} strokeWidth={1.5}  stroke="#a78bfa" connectNulls />}
                  {mShowEma200 && <Line dataKey="ema200" dot={false} activeDot={false} strokeWidth={1.5}  stroke="#c4b5fd" connectNulls />}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* Scrollbar */}
            <input
              type="range"
              className="momentum-scroll"
              min={0}
              max={eMScrollMax * 100}
              value={eMWin.start * 100}
              onChange={e => onEmaScrollM(Math.round(Number(e.target.value) / 100))}
            />
            {/* Date labels */}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 8px 4px", fontSize: 11, color: "var(--text-muted)" }}>
              {[0,1,2].map(i => {
                const idx = Math.round(i * (visibleEmaModalData.length - 1) / 2);
                const raw = visibleEmaModalData[idx]?.date;
                if (!raw) return <span key={i} />;
                const d = new Date(raw);
                return <span key={i}>{isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>;
              })}
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
  const { emaStackData, macdChartData, momentumChartData, volatilityChartData, directionalChartData } = useAnalytics();
  const [hovered, setHovered] = useState(false);
  const [momentumZoom, setMomentumZoom] = useState<{ start: number; end: number } | null>(null);
  const [showRsi14,    setShowRsi14]    = useState(true);
  const [showRsi9,     setShowRsi9]     = useState(true);
  const [showStochRsi, setShowStochRsi] = useState(true);
  const [emaZoom, setEmaZoom] = useState<{ start: number; end: number } | null>(null);
  const [showPrice,  setShowPrice]  = useState(true);
  const [macdZoom, setMacdZoom] = useState<{ start: number; end: number } | null>(null);
  const [showMacd,      setShowMacd]      = useState(true);
  const [showSignal,    setShowSignal]    = useState(true);
  const [showHistogram, setShowHistogram] = useState(true);
  const [volZoom, setVolZoom] = useState<{ start: number; end: number } | null>(null);
  const [showVolPrice,  setShowVolPrice]  = useState(true);
  const [showBbUpper,   setShowBbUpper]   = useState(true);
  const [showBbMiddle,  setShowBbMiddle]  = useState(true);
  const [showBbLower,   setShowBbLower]   = useState(true);
  const [dirZoom, setDirZoom] = useState<{ start: number; end: number } | null>(null);
  const [showDiPlus,  setShowDiPlus]  = useState(true);
  const [showDiMinus, setShowDiMinus] = useState(true);
  const [showAdx,     setShowAdx]     = useState(true);
  const [showEma9,   setShowEma9]   = useState(true);
  const [showEma20,  setShowEma20]  = useState(true);
  const [showEma50,  setShowEma50]  = useState(true);
  const [showEma200, setShowEma200] = useState(true);
  const badgeColor = BADGE_COLOR[card.bias];

  // Replace zero EMA values with null so Recharts draws a gap instead of
  // connecting to 0, which causes a massive spike on the chart.
  const validEmaData = emaStackData
    .filter(d => d.price > 0)
    .map(d => ({
      ...d,
      ema9:   d.ema9   > 0 ? d.ema9   : null,
      ema20:  d.ema20  > 0 ? d.ema20  : null,
      ema50:  d.ema50  > 0 ? d.ema50  : null,
      ema200: d.ema200 > 0 ? d.ema200 : null,
    }));
  const emaVals  = emaStackData.flatMap(d =>
    [d.price, d.ema9, d.ema20, d.ema50, d.ema200].filter(v => v > 0)
  );
  const emaLo    = emaVals.length ? Math.min(...emaVals) : 0;
  const emaHi    = emaVals.length ? Math.max(...emaVals) : 1;
  const emaPad   = (emaHi - emaLo) * 0.25;
  const emaDomain: [number, number] = [emaLo - emaPad, emaHi + emaPad];

  const macdVals   = macdChartData.flatMap(d => [d.macd, d.signal, d.histogram]);
  const macdLo     = macdVals.length ? Math.min(...macdVals) : -0.001;
  const macdHi     = macdVals.length ? Math.max(...macdVals) :  0.001;
  const macdPad    = (macdHi - macdLo) * 0.25;
  const macdDomain: [number, number] = [macdLo - macdPad, macdHi + macdPad];

  const bbVals     = volatilityChartData.flatMap(d => [d.price, d.bbUpper, d.bbMiddle, d.bbLower]).filter(v => v > 0);
  const bbLo       = bbVals.length ? Math.min(...bbVals) : 0;
  const bbHi       = bbVals.length ? Math.max(...bbVals) : 1;
  const bbPad      = (bbHi - bbLo) * 0.25;
  const bbDomain: [number, number] = [bbLo - bbPad, bbHi + bbPad];

  const mLen = momentumChartData.length;
  const mWin = momentumZoom ?? { start: Math.max(0, mLen - 30), end: mLen - 1 };
  const visibleMomentumData = momentumChartData.slice(mWin.start, mWin.end + 1);
  const mWindowSize = mWin.end - mWin.start;
  const mScrollMax  = Math.max(0, mLen - 1 - mWindowSize);

  function onMomentumWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    setMomentumZoom(prev => {
      const cur = prev ?? { start: 0, end: mLen - 1 };
      const range = cur.end - cur.start;
      const step  = Math.max(1, Math.ceil(range * 0.15));
      const newRange  = e.deltaY < 0 ? Math.max(4, range - step) : Math.min(mLen - 1, range + step);
      const center    = (cur.start + cur.end) / 2;
      const newStart  = Math.max(0, Math.round(center - newRange / 2));
      const newEnd    = Math.min(mLen - 1, newStart + newRange);
      return { start: newStart, end: newEnd };
    });
  }
  function onMomentumScroll(v: number) {
    setMomentumZoom({ start: v, end: Math.min(mLen - 1, v + mWindowSize) });
  }

  const eLen = validEmaData.length;
  const eWin = emaZoom ?? { start: Math.max(0, eLen - 30), end: eLen - 1 };
  const visibleEmaData = validEmaData.slice(eWin.start, eWin.end + 1);
  const eWindowSize = eWin.end - eWin.start;
  const eScrollMax  = Math.max(0, eLen - 1 - eWindowSize);
  const eViewVals   = visibleEmaData.flatMap(d =>
    [d.price, d.ema9, d.ema20, d.ema50, d.ema200].filter((v): v is number => !!v && v > 0)
  );
  const eViewLo  = eViewVals.length ? Math.min(...eViewVals) : emaLo;
  const eViewHi  = eViewVals.length ? Math.max(...eViewVals) : emaHi;
  const eViewPad = (eViewHi - eViewLo) * 0.25;
  const eViewDomain: [number, number] = [eViewLo - eViewPad, eViewHi + eViewPad];

  function onEmaWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    setEmaZoom(prev => {
      const cur = prev ?? { start: 0, end: eLen - 1 };
      const range = cur.end - cur.start;
      const step  = Math.max(1, Math.ceil(range * 0.15));
      const newRange = e.deltaY < 0 ? Math.max(4, range - step) : Math.min(eLen - 1, range + step);
      const center   = (cur.start + cur.end) / 2;
      const newStart = Math.max(0, Math.round(center - newRange / 2));
      const newEnd   = Math.min(eLen - 1, newStart + newRange);
      return { start: newStart, end: newEnd };
    });
  }
  function onEmaScroll(v: number) {
    setEmaZoom({ start: v, end: Math.min(eLen - 1, v + eWindowSize) });
  }

  const macdCLen = macdChartData.length;
  const macdCWin = macdZoom ?? { start: Math.max(0, macdCLen - 30), end: macdCLen - 1 };
  const visibleMacdData = macdChartData.slice(macdCWin.start, macdCWin.end + 1);
  const macdCWindowSize = macdCWin.end - macdCWin.start;
  const macdCScrollMax  = Math.max(0, macdCLen - 1 - macdCWindowSize);
  const macdCViewVals   = visibleMacdData.flatMap(d => [d.macd, d.signal, d.histogram]);
  const macdCLo  = macdCViewVals.length ? Math.min(...macdCViewVals) : -0.001;
  const macdCHi  = macdCViewVals.length ? Math.max(...macdCViewVals) :  0.001;
  const macdCPad = (macdCHi - macdCLo) * 0.25;
  const macdCViewDomain: [number, number] = [macdCLo - macdCPad, macdCHi + macdCPad];

  function onMacdWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    setMacdZoom(prev => {
      const cur = prev ?? { start: 0, end: macdCLen - 1 };
      const range = cur.end - cur.start;
      const step  = Math.max(1, Math.ceil(range * 0.15));
      const newRange = e.deltaY < 0 ? Math.max(4, range - step) : Math.min(macdCLen - 1, range + step);
      const center   = (cur.start + cur.end) / 2;
      const newStart = Math.max(0, Math.round(center - newRange / 2));
      const newEnd   = Math.min(macdCLen - 1, newStart + newRange);
      return { start: newStart, end: newEnd };
    });
  }
  function onMacdScroll(v: number) {
    setMacdZoom({ start: v, end: Math.min(macdCLen - 1, v + macdCWindowSize) });
  }

  const volCLen = volatilityChartData.length;
  const volCWin = volZoom ?? { start: Math.max(0, volCLen - 30), end: volCLen - 1 };
  const visibleVolData = volatilityChartData.slice(volCWin.start, volCWin.end + 1);
  const volCWindowSize = volCWin.end - volCWin.start;
  const volCScrollMax  = Math.max(0, volCLen - 1 - volCWindowSize);
  const volCViewVals   = visibleVolData.flatMap(d => [d.price, d.bbUpper, d.bbMiddle, d.bbLower]).filter(v => v > 0);
  const volCLo  = volCViewVals.length ? Math.min(...volCViewVals) : bbLo;
  const volCHi  = volCViewVals.length ? Math.max(...volCViewVals) : bbHi;
  const volCPad = (volCHi - volCLo) * 0.25;
  const volCViewDomain: [number, number] = [volCLo - volCPad, volCHi + volCPad];

  function onVolWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    setVolZoom(prev => {
      const cur = prev ?? { start: 0, end: volCLen - 1 };
      const range = cur.end - cur.start;
      const step  = Math.max(1, Math.ceil(range * 0.15));
      const newRange = e.deltaY < 0 ? Math.max(4, range - step) : Math.min(volCLen - 1, range + step);
      const center   = (cur.start + cur.end) / 2;
      const newStart = Math.max(0, Math.round(center - newRange / 2));
      const newEnd   = Math.min(volCLen - 1, newStart + newRange);
      return { start: newStart, end: newEnd };
    });
  }
  function onVolScroll(v: number) {
    setVolZoom({ start: v, end: Math.min(volCLen - 1, v + volCWindowSize) });
  }

  const dirCLen = directionalChartData.length;
  const dirCWin = dirZoom ?? { start: Math.max(0, dirCLen - 30), end: dirCLen - 1 };
  const visibleDirData = directionalChartData.slice(dirCWin.start, dirCWin.end + 1);
  const dirCWindowSize = dirCWin.end - dirCWin.start;
  const dirCScrollMax  = Math.max(0, dirCLen - 1 - dirCWindowSize);

  function onDirWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    setDirZoom(prev => {
      const cur = prev ?? { start: 0, end: dirCLen - 1 };
      const range = cur.end - cur.start;
      const step  = Math.max(1, Math.ceil(range * 0.15));
      const newRange = e.deltaY < 0 ? Math.max(4, range - step) : Math.min(dirCLen - 1, range + step);
      const center   = (cur.start + cur.end) / 2;
      const newStart = Math.max(0, Math.round(center - newRange / 2));
      const newEnd   = Math.min(dirCLen - 1, newStart + newRange);
      return { start: newStart, end: newEnd };
    });
  }
  function onDirScroll(v: number) {
    setDirZoom({ start: v, end: Math.min(dirCLen - 1, v + dirCWindowSize) });
  }

  return (
    <div
      className="flex-1 flex flex-col h-full rounded-[14px] overflow-hidden relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
          className="flex-1 min-h-0 mx-4 mt-2 mb-3 rounded-[10px] overflow-hidden flex flex-col"
          style={{
            maxHeight:  "75%",
            background: "rgba(255,255,255,0.03)",
            border:     "1px solid var(--border-subtle)",
          }}
        >
          {/* Line toggles */}
          <div style={{ display: "flex", gap: 4, padding: "4px 8px 2px", flexShrink: 0 }}>
            {([
              { label: "Price",    color: "#e2e8f0", show: showVolPrice, set: setShowVolPrice },
              { label: "BB Upper", color: "#60a5fa", show: showBbUpper,  set: setShowBbUpper  },
              { label: "BB Mid",   color: "#a78bfa", show: showBbMiddle, set: setShowBbMiddle },
              { label: "BB Lower", color: "#60a5fa", show: showBbLower,  set: setShowBbLower  },
            ] as const).map(({ label, color, show, set }) => (
              <button key={label} onClick={() => set(s => !s)} style={{
                fontSize: 8, padding: "1px 6px", borderRadius: 4, cursor: "pointer",
                border:     `1px solid ${show ? color + "55" : "rgba(255,255,255,0.10)"}`,
                background: show ? color + "18" : "transparent",
                color:      show ? color : "var(--text-muted)",
                transition: "all 0.15s",
              }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0 }} onWheel={onVolWheel}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={visibleVolData} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                <YAxis domain={volCViewDomain} hide />
                {showBbUpper && <Area dataKey="bbUpper" stroke="none" fill="rgba(96,165,250,0.13)" dot={false} activeDot={false} legendType="none" isAnimationActive={false} />}
                {showBbLower && <Area dataKey="bbLower" stroke="none" fill="#0d1219" dot={false} activeDot={false} legendType="none" isAnimationActive={false} fillOpacity={1} />}
                {showBbUpper  && <Line dataKey="bbUpper"  dot={false} activeDot={false} strokeWidth={1}    stroke="#60a5fa" strokeDasharray="3 3" />}
                {showBbMiddle && <Line dataKey="bbMiddle" dot={false} activeDot={false} strokeWidth={1}    stroke="#a78bfa" />}
                {showBbLower  && <Line dataKey="bbLower"  dot={false} activeDot={false} strokeWidth={1}    stroke="#60a5fa" strokeDasharray="3 3" />}
                {showVolPrice && <Line dataKey="price"    dot={false} activeDot={false} strokeWidth={0.75} stroke="#e2e8f0" />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {/* Scrollbar */}
          <input
            type="range"
            className="momentum-scroll"
            min={0}
            max={volCScrollMax * 100}
            value={volCWin.start * 100}
            onChange={e => onVolScroll(Math.round(Number(e.target.value) / 100))}
          />
          {/* Date labels */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 8px 4px", fontSize: 8, color: "var(--text-muted)" }}>
            {[0,1,2].map(i => {
              const idx = Math.round(i * (visibleVolData.length - 1) / 2);
              const raw = visibleVolData[idx]?.date;
              if (!raw) return <span key={i} />;
              const d = new Date(raw);
              return <span key={i}>{isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>;
            })}
          </div>
        </div>
      )}

      {/* Momentum chart subpanel — Momentum card only */}
      {card.id === "momentum" && (
        <div
          className="flex-1 min-h-0 mx-4 mt-2 mb-3 rounded-[10px] overflow-hidden flex flex-col"
          style={{
            maxHeight:  "75%",
            background: "rgba(255,255,255,0.03)",
            border:     "1px solid var(--border-subtle)",
          }}
        >
          {/* Line toggles */}
          <div style={{ display: "flex", gap: 4, padding: "4px 8px 2px", flexShrink: 0 }}>
            {([
              { label: "RSI 14",   color: "#60a5fa", show: showRsi14,    set: setShowRsi14 },
              { label: "RSI 9",    color: "#818cf8", show: showRsi9,     set: setShowRsi9 },
              { label: "StochRSI", color: "#e2e8f0", show: showStochRsi, set: setShowStochRsi },
            ] as const).map(({ label, color, show, set }) => (
              <button key={label} onClick={() => set(s => !s)} style={{
                fontSize: 8, padding: "1px 6px", borderRadius: 4, cursor: "pointer",
                border:     `1px solid ${show ? color + "55" : "rgba(255,255,255,0.10)"}`,
                background: show ? color + "18" : "transparent",
                color:      show ? color : "var(--text-muted)",
                transition: "all 0.15s",
              }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0 }} onWheel={onMomentumWheel}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={visibleMomentumData.map(d => ({ ...d, ob: 70, os: 30 }))} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                <YAxis domain={[0, 100]} hide />
                <Area dataKey="ob" stroke="none" fill="rgba(96,165,250,0.10)" dot={false} activeDot={false} legendType="none" isAnimationActive={false} />
                <Area dataKey="os" stroke="none" fill="#0d1219"               dot={false} activeDot={false} legendType="none" isAnimationActive={false} fillOpacity={1} />
                <ReferenceLine y={70} stroke="rgba(255,255,255,0.30)" strokeDasharray="3 3" />
                <ReferenceLine y={50} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                <ReferenceLine y={30} stroke="rgba(255,255,255,0.30)" strokeDasharray="3 3" />
                {showRsi14    && <Line dataKey="rsi14"    dot={false} activeDot={false} strokeWidth={1.5}  stroke="#60a5fa" />}
                {showRsi9     && <Line dataKey="rsi9"     dot={false} activeDot={false} strokeWidth={1.5}  stroke="#818cf8" />}
                {showStochRsi && <Line dataKey="stochRsi" dot={false} activeDot={false} strokeWidth={0.75} stroke="#e2e8f0" />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {/* Scrollbar */}
          <input
            type="range"
            className="momentum-scroll"
            min={0}
            max={mScrollMax * 100}
            value={mWin.start * 100}
            onChange={e => onMomentumScroll(Math.round(Number(e.target.value) / 100))}
          />
          {/* Date labels */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 8px 4px", fontSize: 8, color: "var(--text-muted)" }}>
            {[0,1,2].map(i => {
              const idx = Math.round(i * (visibleMomentumData.length - 1) / 2);
              const raw = visibleMomentumData[idx]?.date;
              if (!raw) return <span key={i} />;
              const d = new Date(raw);
              return <span key={i}>{isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>;
            })}
          </div>
        </div>
      )}

      {/* MACD chart subpanel — MACD card only */}
      {card.id === "macd" && (
        <div
          className="flex-1 min-h-0 mx-4 mt-2 mb-3 rounded-[10px] overflow-hidden flex flex-col"
          style={{
            maxHeight:  "75%",
            background: "rgba(255,255,255,0.03)",
            border:     "1px solid var(--border-subtle)",
          }}
        >
          {/* Line toggles */}
          <div style={{ display: "flex", gap: 4, padding: "4px 8px 2px", flexShrink: 0 }}>
            {([
              { label: "MACD",      color: "#60a5fa", show: showMacd,      set: setShowMacd      },
              { label: "Signal",    color: "#a78bfa", show: showSignal,    set: setShowSignal    },
              { label: "Histogram", color: "#7a8fa8", show: showHistogram, set: setShowHistogram },
            ] as const).map(({ label, color, show, set }) => (
              <button key={label} onClick={() => set(s => !s)} style={{
                fontSize: 8, padding: "1px 6px", borderRadius: 4, cursor: "pointer",
                border:     `1px solid ${show ? color + "55" : "rgba(255,255,255,0.10)"}`,
                background: show ? color + "18" : "transparent",
                color:      show ? color : "var(--text-muted)",
                transition: "all 0.15s",
              }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0 }} onWheel={onMacdWheel}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={visibleMacdData} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                <YAxis domain={macdCViewDomain} hide />
                {showHistogram && <Bar dataKey="histogram" fill="#7a8fa8" opacity={0.5} radius={[2, 2, 0, 0]} label={false} />}
                {showMacd      && <Line dataKey="macd"   dot={false} activeDot={false} strokeWidth={1.5} stroke="#60a5fa" />}
                {showSignal    && <Line dataKey="signal" dot={false} activeDot={false} strokeWidth={1.5} stroke="#a78bfa" />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {/* Scrollbar */}
          <input
            type="range"
            className="momentum-scroll"
            min={0}
            max={macdCScrollMax * 100}
            value={macdCWin.start * 100}
            onChange={e => onMacdScroll(Math.round(Number(e.target.value) / 100))}
          />
          {/* Date labels */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 8px 4px", fontSize: 8, color: "var(--text-muted)" }}>
            {[0,1,2].map(i => {
              const idx = Math.round(i * (visibleMacdData.length - 1) / 2);
              const raw = visibleMacdData[idx]?.date;
              if (!raw) return <span key={i} />;
              const d = new Date(raw);
              return <span key={i}>{isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>;
            })}
          </div>
        </div>
      )}

      {/* Directional chart subpanel — Directional card only */}
      {card.id === "directional" && (
        <div
          className="flex-1 min-h-0 mx-4 mt-2 mb-3 rounded-[10px] overflow-hidden flex flex-col"
          style={{
            maxHeight:  "75%",
            background: "rgba(255,255,255,0.03)",
            border:     "1px solid var(--border-subtle)",
          }}
        >
          {/* Line toggles */}
          <div style={{ display: "flex", gap: 4, padding: "4px 8px 2px", flexShrink: 0 }}>
            {([
              { label: "+DI", color: "#60a5fa", show: showDiPlus,  set: setShowDiPlus  },
              { label: "-DI", color: "#a78bfa", show: showDiMinus, set: setShowDiMinus },
              { label: "ADX", color: "#6366f1", show: showAdx,     set: setShowAdx     },
            ] as const).map(({ label, color, show, set }) => (
              <button key={label} onClick={() => set(s => !s)} style={{
                fontSize: 8, padding: "1px 6px", borderRadius: 4, cursor: "pointer",
                border:     `1px solid ${show ? color + "55" : "rgba(255,255,255,0.10)"}`,
                background: show ? color + "18" : "transparent",
                color:      show ? color : "var(--text-muted)",
                transition: "all 0.15s",
              }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0 }} onWheel={onDirWheel}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={visibleDirData} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                <YAxis domain={[0, 50]} hide />
                <ReferenceLine y={25} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                {showDiPlus  && <Line dataKey="diPlus"  dot={false} activeDot={false} strokeWidth={1.5} stroke="#60a5fa" />}
                {showDiMinus && <Line dataKey="diMinus" dot={false} activeDot={false} strokeWidth={1.5} stroke="#a78bfa" />}
                {showAdx     && <Line dataKey="adx"     dot={false} activeDot={false} strokeWidth={1.5} stroke="#6366f1" strokeDasharray="4 2" />}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Scrollbar */}
          <input
            type="range"
            className="momentum-scroll"
            min={0}
            max={dirCScrollMax * 100}
            value={dirCWin.start * 100}
            onChange={e => onDirScroll(Math.round(Number(e.target.value) / 100))}
          />
          {/* Date labels */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 8px 4px", fontSize: 8, color: "var(--text-muted)" }}>
            {[0,1,2].map(i => {
              const idx = Math.round(i * (visibleDirData.length - 1) / 2);
              const raw = visibleDirData[idx]?.date;
              if (!raw) return <span key={i} />;
              const d = new Date(raw);
              return <span key={i}>{isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>;
            })}
          </div>
        </div>
      )}

      {/* EMA chart subpanel — Trend card only */}
      {card.id === "trend" && (
        <div
          className="flex-1 min-h-0 mx-4 mt-2 mb-3 rounded-[10px] overflow-hidden flex flex-col"
          style={{
            maxHeight:  "75%",
            background: "rgba(255,255,255,0.03)",
            border:     "1px solid var(--border-subtle)",
          }}
        >
          {/* Line toggles */}
          <div style={{ display: "flex", gap: 4, padding: "4px 8px 2px", flexShrink: 0 }}>
            {([
              { label: "Price",   color: "#e2e8f0", show: showPrice,  set: setShowPrice  },
              { label: "EMA 9",   color: "#60a5fa", show: showEma9,   set: setShowEma9   },
              { label: "EMA 20",  color: "#818cf8", show: showEma20,  set: setShowEma20  },
              { label: "EMA 50",  color: "#a78bfa", show: showEma50,  set: setShowEma50  },
              { label: "EMA 200", color: "#c4b5fd", show: showEma200, set: setShowEma200 },
            ] as const).map(({ label, color, show, set }) => (
              <button key={label} onClick={() => set(s => !s)} style={{
                fontSize: 8, padding: "1px 6px", borderRadius: 4, cursor: "pointer",
                border:     `1px solid ${show ? color + "55" : "rgba(255,255,255,0.10)"}`,
                background: show ? color + "18" : "transparent",
                color:      show ? color : "var(--text-muted)",
                transition: "all 0.15s",
              }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0 }} onWheel={onEmaWheel}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={visibleEmaData} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                <YAxis domain={eViewDomain} hide />
                {showPrice  && <Line dataKey="price"  dot={false} activeDot={false} strokeWidth={0.75} stroke="#e2e8f0" connectNulls />}
                {showEma9   && <Line dataKey="ema9"   dot={false} activeDot={false} strokeWidth={1.5}  stroke="#60a5fa" connectNulls />}
                {showEma20  && <Line dataKey="ema20"  dot={false} activeDot={false} strokeWidth={1.5}  stroke="#818cf8" connectNulls />}
                {showEma50  && <Line dataKey="ema50"  dot={false} activeDot={false} strokeWidth={1.5}  stroke="#a78bfa" connectNulls />}
                {showEma200 && <Line dataKey="ema200" dot={false} activeDot={false} strokeWidth={1.5}  stroke="#c4b5fd" connectNulls />}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Scrollbar */}
          <input
            type="range"
            className="momentum-scroll"
            min={0}
            max={eScrollMax * 100}
            value={eWin.start * 100}
            onChange={e => onEmaScroll(Math.round(Number(e.target.value) / 100))}
          />
          {/* Date labels */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 8px 4px", fontSize: 8, color: "var(--text-muted)" }}>
            {[0,1,2].map(i => {
              const idx = Math.round(i * (visibleEmaData.length - 1) / 2);
              const raw = visibleEmaData[idx]?.date;
              if (!raw) return <span key={i} />;
              const d = new Date(raw);
              return <span key={i}>{isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>;
            })}
          </div>
        </div>
      )}

      {/* Expand button */}
      <button
        onClick={onClick}
        className="absolute bottom-2 right-2 flex items-center justify-center w-6 h-6 rounded-md transition-all"
        style={{
          background: "rgba(255,255,255,0.06)",
          color:      "var(--text-muted)",
          border:     "1px solid var(--border-subtle)",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
      >
        <Maximize2 size={11} />
      </button>
    </div>
  );
}

// ── EvidenceCards ─────────────────────────────────────────────────────────────
export function EvidenceCards() {
  const { evidenceCards } = useAnalytics();
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
