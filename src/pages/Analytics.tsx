// ─── Analytics — 3-row layout + pair selector ─────────────────────────────────
//
//  PairSelector  — top strip, EUR/USD active, others placeholder
//  Row 1         — Verdict:  direction · confidence bar · signal tags · history %
//  Row 2         — Evidence: 5 equal group cards (Trend, MACD, Momentum, Volatility, Directional)
//  Row 3         — Detail:   Entry/Exit plan | Signal history dots | Live indicator bars
//
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, ReferenceLine, ReferenceArea,
  ResponsiveContainer, Cell, Tooltip,
} from "recharts";
import { Maximize2, X, GripVertical } from "lucide-react";
import { VerdictPanel }          from "../components/analytics/VerdictPanel";
import { EvidenceCards }         from "../components/analytics/EvidenceCards";
import { EntryExitPanel }        from "../components/analytics/EntryExitPanel";
import { HistoryDotsPanel }      from "../components/analytics/HistoryDotsPanel";
import { PairSelector }          from "../components/analytics/PairSelector";
import { useAnalytics, setLiveAnalytics, hasLiveAnalytics, signalHistory, historicalAccuracy } from "../data/analyticsData";
import type { AnalysisResult } from "../data/analyticsData";
import { fetchSheetRows }        from "../lib/googleSheets";
import type { SheetRow }         from "../lib/googleSheets";
import { analyze }               from "../lib/brain/analyzer";
import { getAnalyticsPanelOrder, setAnalyticsPanelOrder } from "../lib/preferences";
import { invoke }                from "@tauri-apps/api/core";

function formatDataDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year:    "numeric",
    month:   "long",
    day:     "numeric",
    timeZone: "America/New_York",
  });
}

// ── Verdict-driven color palette ─────────────────────────────────────────────
// Overrides CSS accent vars at the container level so every child component
// that uses var(--accent-text / --accent-dim / --accent-border) inherits the
// correct verdict color without any per-component changes.
interface VerdictPalette {
  vars:     React.CSSProperties;
  gradient: string;
}

const VERDICT_COLORS: Record<"long" | "short" | "neutral", VerdictPalette> = {
  long: {
    vars: {
      "--accent-text":   "#60a5fa",
      "--accent-dim":    "rgba(96, 165, 250, 0.11)",
      "--accent-border": "rgba(96, 165, 250, 0.25)",
    } as React.CSSProperties,
    gradient: "var(--bg-base)",
  },
  short: {
    vars: {
      "--accent-text":   "#a78bfa",
      "--accent-dim":    "rgba(167, 139, 250, 0.10)",
      "--accent-border": "rgba(167, 139, 250, 0.24)",
    } as React.CSSProperties,
    gradient: "var(--bg-base)",
  },
  neutral: {
    vars: {
      "--accent-text":   "#94a3b8",
      "--accent-dim":    "rgba(148, 163, 184, 0.10)",
      "--accent-border": "rgba(148, 163, 184, 0.20)",
    } as React.CSSProperties,
    gradient: "var(--bg-base)",
  },
};

// ── Layout
// 4-col grid, 5 rows. Row heights sized to data density:
//   Row 1 (130px): AI Synthesis (2col) · Trend Score · AI Positioning
//   Row 2 (104px): Price (2col) · Session Context · Volume
//   Row 3 (104px): Avg Price & ROC · Volatility (2col) · MACD
//   Row 4 (120px): Moving Averages (2col) · Pivot Points · Keltner
//   Row 5 (120px): RSI-9 · RSI-14 · Momentum · ADX+Ichimoku (right col, 2 stacked)
//
// Note: ADX and Ichimoku each get half of col 4 in row 5 via a nested flex column.

const PANELS: { id: string; area: string; span?: number; label: string; sub: string }[] = [
  { id: "ai-synthesis",    area: "ais",   span: 3, label: "AI Synthesis",      sub: "Signal convergence verdict" },
  { id: "price",           area: "price", label: "Price",                      sub: "Group 1 — OHLC · Body · Wicks" },
  { id: "session",         area: "sess",  label: "Session Context",            sub: "Group 2 — Gap · Inside Bar · % Change" },
  { id: "volume",          area: "vol",   label: "Volume",                     sub: "Group 3 — Volume · OBV · Vol SMA" },
  { id: "avg-price",       area: "avgp",  label: "AVG Price\n& ROC",            sub: "Group 5 — Avg Price · Avg Delta · ROC(5)" },
  { id: "volatility",      area: "vola",  label: "BB",                         sub: "Group 4 — Hist Vol · Bollinger Bands · BB %B" },
  { id: "atr",             area: "atr",   label: "ATR",                        sub: "Group 15 — ATR(14) · ATR SMA(20)" },
  { id: "macd",            area: "macd",  label: "MACD",                       sub: "Group 7 — MACD · Signal · Histogram" },
  { id: "moving-averages", area: "ma",    label: "MOVING\nAVERAGES",           sub: "Group 6 — SMA(20/50/200) · EMA(9/12/20/26/50/200)" },
  { id: "pivots",          area: "pvt",   label: "Pivot Points",               sub: "Group 8 — R3/R2/R1 · S1/S2/S3" },
  { id: "keltner",         area: "kelt",  label: "KELTNER\nCHANNELS",          sub: "Group 9 — Kelt Upper · Mid · Lower" },
  { id: "rsi9",            area: "rsi9",  label: "RSI (9)",                    sub: "Group 10 — RSI(9) · StochRSI %K/%D" },
  { id: "rsi14",           area: "rsi14", label: "RSI (14)",                   sub: "Group 11 — RSI(14) · RSI Trend" },
  { id: "momentum",        area: "mom",   label: "MOMENTUM\nOSCILLATORS",      sub: "Group 12 — Williams %R · CCI · Momentum(10)" },
  { id: "adx",             area: "adx",   label: "ADX",                        sub: "Group 13 — +DI · −DI · DX · ADX" },
  { id: "ichimoku",        area: "ichi",  label: "Ichimoku",                   sub: "Group 14 — Tenkan · Kijun · Senkou · Chikou" },
  { id: "failure-swing",   area: "fsw",   label: "FAILURE\nSWING",             sub: "RSI top/bottom failure swing pattern" },
  { id: "ai-chat",         area: "aic",   label: "AI\nCHAT",                   sub: "Ask Claude about the current setup" },
  { id: "candle-context",  area: "cctx",  label: "CANDLE\nCONTEXT",            sub: "Last 5 candles · Pattern recognition" },
];


// First PINNED_SLOT_COUNT slots are fixed; the rest are in the scrollable section.
const PINNED_SLOT_COUNT = 2;

// Grid slot areas in row-major order.
// Slots 0-1 are pinned (top row). Slots 2+ are scrollable (bottom rows).
const SLOT_AREAS = [
  // ── Pinned top row ────────────────────────────────────────────────────────
  "ais", "aic",
  // ── Scrollable bottom rows ────────────────────────────────────────────────
  "sess","vol","avgp","price", // row 1
  "vola","macd","pvt","kelt",  // row 2
  "ma","rsi9","rsi14","mom",   // row 3
  "adx","ichi","atr","fsw",    // row 4
  "cctx",                      // row 5 (full-width)
] as const;

const INITIAL_PANEL_ORDER: string[] = SLOT_AREAS.map(area =>
  PANELS.find(p => p.area === area)?.id ?? "__empty__"
);

interface PanelMeta { id: string; label: string; sub: string }

function HoverTooltip({ tip, children }: { tip: string; children: React.ReactNode }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className="inline-flex"
      onMouseEnter={() => setRect(ref.current?.getBoundingClientRect() ?? null)}
      onMouseLeave={() => setRect(null)}
    >
      {children}
      {rect && (
        <div
          className="z-50 text-left"
          style={{
            position:  "fixed",
            bottom:    window.innerHeight - rect.top + 6,
            left:      rect.left + rect.width / 2 - 110,
            background:   "var(--bg-panel-alt)",
            border:       "1px solid var(--border-medium)",
            borderRadius: 8,
            padding:      "7px 10px",
            width:        220,
            fontSize:     10,
            lineHeight:   1.5,
            color:        "var(--text-secondary)",
            boxShadow:    "0 8px 24px rgba(0,0,0,0.5)",
            pointerEvents: "none",
          }}
        >
          {tip}
        </div>
      )}
    </div>
  );
}

const NO_SUB_IDS = new Set(["ai-synthesis", "price", "macd", "rsi9", "rsi14", "moving-averages", "keltner", "adx", "ichimoku", "session", "volume", "pivots", "momentum", "volatility", "avg-price", "atr", "candle-context"]);

function PanelModal({ panel, onClose, badge, subtitle, children }: { panel: PanelMeta; onClose: () => void; badge?: React.ReactNode; subtitle?: string; children?: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
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
        className="rounded-[18px] overflow-hidden flex flex-col"
        style={{
          width:      "1200px",
          height:     "800px",
          background: "var(--bg-panel-alt)",
          border:     "1px solid var(--border-medium)",
          boxShadow:  "0 24px 60px rgba(0,0,0,0.6)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`relative flex items-center shrink-0 ${panel.id === "price" ? "px-5 py-2" : "px-4 py-2"}`}
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-black uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
              {panel.label}
            </span>
            {!NO_SUB_IDS.has(panel.id) && (
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {panel.sub}
              </span>
            )}
          </div>
          {subtitle && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                {subtitle}
              </span>
            </div>
          )}
          <div className="flex items-center gap-3 ml-auto">
            {badge}
            <button
              onClick={onClose}
              className="flex items-center justify-center w-7 h-7 rounded-full"
              style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.10)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {children}
        </div>

      </div>
    </div>
  );
}


function fmtDate(d: string) {
  const [, m, day] = d.split("-");
  return `${parseInt(m)}/${parseInt(day)}`;
}

const PRICE_GRID = "1.1fr 1px 1.4fr 1.4fr 1.4fr 1.4fr 1px 1.1fr 1px 1.0fr 0.9fr 0.9fr";

function VLine() {
  return <div style={{ background: "var(--border-medium)", width: "1px", alignSelf: "stretch" }} />;
}

function PriceRow({ children, bg, padRight }: { children: React.ReactNode; bg?: string; padRight?: number }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: PRICE_GRID,
      background: bg,
      borderBottom: "1px solid var(--border-subtle)",
      padding: `0 ${padRight ?? 4}px 0 4px`,
    }}>
      {children}
    </div>
  );
}

function buildPriceAnalysis(rows: SheetRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 5) return { headline: "Insufficient data", bullets: [], description: "" };

  const cur  = rows[rows.length - 1];
  const prev = rows[rows.length - 2];

  const chgPct    = (cur.close - cur.open) / cur.open * 100;
  const body      = Math.abs(cur.close - cur.open) * 10000;
  const uw        = (cur.high - Math.max(cur.open, cur.close)) * 10000;
  const lw        = (Math.min(cur.open, cur.close) - cur.low) * 10000;
  const isBullish = cur.close > cur.open;
  const isInsideBar = cur.high < prev.high && cur.low > prev.low;

  const aboveEma20  = cur.close > cur.ema20;
  const aboveSma50  = cur.close > cur.sma50;
  const aboveSma200 = cur.close > cur.sma200;

  const recent5  = rows.slice(-5);
  const avgBody5 = recent5.reduce((s, r) => s + Math.abs(r.close - r.open), 0) / 5 * 10000;
  const isLargeBody = body > avgBody5 * 1.4;
  const isSmallBody = body < avgBody5 * 0.5;

  const trendUp   = aboveEma20 && aboveSma50;
  const trendDown = !aboveEma20 && !aboveSma50;

  let headline: string;
  let bullets: string[];
  let description: string;

  if (isInsideBar) {
    headline = "Inside Bar — Compression";
    bullets = [
      `Range: ${((cur.high - cur.low) * 10000).toFixed(1)} pips (inside prior bar)`,
      `Body: ${body.toFixed(1)} pips | UW: ${uw.toFixed(1)} | LW: ${lw.toFixed(1)}`,
      `Trend: ${trendUp ? "Up (above EMA20 & SMA50)" : trendDown ? "Down (below EMA20 & SMA50)" : "Mixed"}`,
    ];
    description = `An inside bar signals a pause in volatility — the market is coiling within the prior session's range. Watch for a breakout of today's high or low as a directional cue. In a ${trendUp ? "rising" : "falling"} trend, these patterns often resolve in the direction of the prior move.`;
  } else if (isBullish && isLargeBody && chgPct > 0) {
    headline = "Strong Bullish Candle";
    bullets = [
      `Gained ${chgPct.toFixed(2)}% | Body: ${body.toFixed(1)} pips (${Math.round(body / avgBody5 * 100)}% of avg)`,
      `Upper wick: ${uw.toFixed(1)} pips | Lower wick: ${lw.toFixed(1)} pips`,
      `Price ${aboveSma200 ? "above" : "below"} SMA200 — ${aboveSma200 ? "long-term uptrend intact" : "below long-term average"}`,
    ];
    description = `A large bullish candle with a dominant body and minimal wicks indicates strong buying conviction through the session. The close near the high suggests buyers held control. ${aboveSma50 ? "With price above the SMA50, the trend remains supportive — consider joining on a measured pullback." : "Price is below SMA50, so this could be a counter-trend bounce — manage risk tightly."}`;
  } else if (!isBullish && isLargeBody && chgPct < 0) {
    headline = "Strong Bearish Candle";
    bullets = [
      `Dropped ${Math.abs(chgPct).toFixed(2)}% | Body: ${body.toFixed(1)} pips (${Math.round(body / avgBody5 * 100)}% of avg)`,
      `Upper wick: ${uw.toFixed(1)} pips | Lower wick: ${lw.toFixed(1)} pips`,
      `Price ${aboveSma200 ? "above SMA200 — potential pullback in uptrend" : "below SMA200 — downtrend reinforced"}`,
    ];
    description = `A large bearish candle closing near its lows signals sustained selling pressure. Buyers made little headway during the session. ${!aboveSma50 ? "With price below SMA50, the path of least resistance remains lower — look for rallies as short opportunities." : "Price is still above SMA50, so this may be a temporary pullback — wait for stabilisation before fading."}`;
  } else if (isBullish && isSmallBody) {
    headline = "Indecisive — Small Bullish Body";
    bullets = [
      `Chg: +${chgPct.toFixed(2)}% | Body: ${body.toFixed(1)} pips (weak vs ${avgBody5.toFixed(1)} avg)`,
      `Upper wick: ${uw.toFixed(1)} pips | Lower wick: ${lw.toFixed(1)} pips`,
      `Context: ${trendUp ? "Trend up — possible consolidation" : "No clear trend — wait for direction"}`,
    ];
    description = `A small-bodied doji-like candle reflects indecision — neither buyers nor sellers dominated. In an uptrend this is often a brief pause before continuation, but the lack of follow-through also warns that buying pressure may be waning. Wait for the next session's open to confirm direction before acting.`;
  } else if (!isBullish && isSmallBody) {
    headline = "Indecisive — Small Bearish Body";
    bullets = [
      `Chg: ${chgPct.toFixed(2)}% | Body: ${body.toFixed(1)} pips (weak vs ${avgBody5.toFixed(1)} avg)`,
      `Upper wick: ${uw.toFixed(1)} pips | Lower wick: ${lw.toFixed(1)} pips`,
      `Context: ${trendDown ? "Trend down — possible consolidation" : "No clear trend — wait for direction"}`,
    ];
    description = `The small body indicates the market closed near where it opened, reflecting a balance of supply and demand. In a downtrend this can signal exhaustion of sellers, but confirmation is needed. Avoid new shorts at current levels until the next candle shows follow-through.`;
  } else if (isBullish) {
    headline = "Moderate Bullish Session";
    bullets = [
      `Gained ${chgPct.toFixed(2)}% | Body: ${body.toFixed(1)} pips`,
      `Upper wick: ${uw.toFixed(1)} pips | Lower wick: ${lw.toFixed(1)} pips`,
      `Trend: ${trendUp ? "Aligned bullish" : trendDown ? "Counter-trend bounce" : "Mixed signals"}`,
    ];
    description = `A moderate gain with a healthy candle body. ${trendUp ? "Trend conditions are supportive — the move is directionally consistent. Look to hold existing longs or buy a shallow retracement." : "Price is moving counter to the prevailing structure — be cautious about chasing. A pullback that holds above short-term support would be a cleaner entry."}`;
  } else {
    headline = "Moderate Bearish Session";
    bullets = [
      `Dropped ${Math.abs(chgPct).toFixed(2)}% | Body: ${body.toFixed(1)} pips`,
      `Upper wick: ${uw.toFixed(1)} pips | Lower wick: ${lw.toFixed(1)} pips`,
      `Trend: ${trendDown ? "Aligned bearish" : trendUp ? "Pullback in uptrend" : "Mixed signals"}`,
    ];
    description = `A moderate decline on the session. ${trendDown ? "The trend remains down — sellers are in control. Look for weak rallies as opportunities to add short exposure." : "Price is pulling back within a longer-term uptrend. Watch for support near EMA20 or SMA50 as potential turning points before re-entering long."}`;
  }

  return { headline, bullets, description };
}

function PricePanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [rows]);

  const hdr  = `${expanded ? "text-[10px]" : "text-[7px]"} font-black uppercase tracking-widest py-1 text-center`;
  const cell = `${expanded ? "text-[13px]" : "text-[10px]"} tabular-nums py-[3px] text-center`;
  const grey = "var(--text-secondary)";

  const analysis = useMemo(() => expanded ? buildPriceAnalysis(rows) : null, [rows, expanded]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* AI Analysis block — expanded only */}
      {expanded && analysis && (
        <div className="shrink-0 flex" style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
          {/* Left: bullets */}
          <div className="flex flex-col items-center justify-center px-5 py-2.5" style={{ flex: "0 0 50%", minWidth: 0, maxWidth: "50%" }}>
            <ul className="flex flex-col gap-0.5 text-center">
              {analysis.bullets.map((b, i) => (
                <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{b}</li>
              ))}
            </ul>
          </div>
          {/* Divider */}
          <div style={{ width: 1, background: "var(--border-medium)", alignSelf: "stretch", margin: "8px 0" }} />
          {/* Right: description */}
          <div className="flex-1 flex items-center justify-center px-5 py-2.5">
            <p className="text-[11px] leading-relaxed text-center" style={{ color: "var(--text-secondary)" }}>
              {analysis.description}
            </p>
          </div>
        </div>
      )}
      {/* Header outside scroll container — overflow-y: scroll keeps widths in sync */}
      <PriceRow bg="rgba(255,255,255,0.04)" padRight={8}>
        <div className={hdr} style={{ color: "var(--text-muted)" }}>Date</div>
        <VLine />
        <div className={hdr} style={{ color: "var(--text-muted)" }}>O</div>
        <div className={hdr} style={{ color: "var(--text-muted)" }}>H</div>
        <div className={hdr} style={{ color: "var(--text-muted)" }}>L</div>
        <div className={hdr} style={{ color: "var(--text-muted)" }}>C</div>
        <VLine />
        <div className={hdr} style={{ color: "var(--text-muted)" }}>Chg%</div>
        <VLine />
        <div className={hdr} style={{ color: "var(--text-muted)" }}>Bd</div>
        <div className={hdr} style={{ color: "var(--text-muted)" }}>UW</div>
        <div className={hdr} style={{ color: "var(--text-muted)" }}>LW</div>
      </PriceRow>
      <div ref={bodyRef} className="flex-1 min-h-0 overflow-x-hidden" style={{ overflowY: "scroll" }}>

      {rows.map((r, i) => {
        const body = (r.close - r.open) * 10000;
        const uw   = (r.high - Math.max(r.open, r.close)) * 10000;
        const lw   = (Math.min(r.open, r.close) - r.low) * 10000;
        return (
          <PriceRow key={r.date + i} bg={i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.03)"}>
            <div className={cell} style={{ color: grey }}>{fmtDate(r.date)}</div>
            <VLine />
            <div className={cell} style={{ color: grey }}>{r.open.toFixed(4)}</div>
            <div className={cell} style={{ color: grey }}>{r.high.toFixed(4)}</div>
            <div className={cell} style={{ color: grey }}>{r.low.toFixed(4)}</div>
            <div className={cell} style={{ color: i === 0 ? grey : r.close > rows[i-1].close ? "#60a5fa" : r.close < rows[i-1].close ? "#a78bfa" : grey }}>{r.close.toFixed(4)}</div>
            <VLine />
            {(() => { const chg = (r.close - r.open) / r.open * 100; return (
              <div className={cell} style={{ color: chg >= 0 ? "#60a5fa" : "#a78bfa" }}>{chg.toFixed(2)}%</div>
            ); })()}
            <VLine />
            <div className={cell} style={{ color: grey }}>{body.toFixed(1)}</div>
            <div className={cell} style={{ color: grey }}>{uw.toFixed(1)}</div>
            <div className={cell} style={{ color: grey }}>{lw.toFixed(1)}</div>
          </PriceRow>
        );
      })}
      </div>
    </div>
  );
}

function MacdTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--bg-panel-alt)", border: "1px solid var(--border-medium)", borderRadius: 8, padding: "6px 10px", fontSize: 10 }}>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color }}>{p.name}: {p.value.toFixed(1)}</div>
      ))}
    </div>
  );
}

function MaTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--bg-panel-alt)", border: "1px solid var(--border-medium)", borderRadius: 8, padding: "6px 10px", fontSize: 10 }}>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color }}>{p.name}: {p.value.toFixed(5)}</div>
      ))}
    </div>
  );
}

const MACD_WINDOW = 20;

function buildMacdAnalysis(rows: SheetRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 2) return { headline: "Insufficient data", bullets: [], description: "" };

  const cur  = rows[rows.length - 1];
  const prev = rows[rows.length - 2];

  const hist     = cur.macdHistogram  * 10000;
  const prevHist = prev.macdHistogram * 10000;
  const macd     = cur.macd           * 10000;
  const signal   = cur.macdSignal     * 10000;
  const crossed  = (cur.macd > cur.macdSignal) !== (prev.macd > prev.macdSignal);

  let streak = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (Math.sign(rows[i].macdHistogram) === Math.sign(cur.macdHistogram)) streak++;
    else break;
  }

  const bullish    = cur.macd > cur.macdSignal;
  const expanding  = Math.abs(hist) > Math.abs(prevHist);
  const aboveZero  = cur.macd > 0;

  const headline = crossed
    ? bullish ? "Bullish crossover — MACD crossed above Signal" : "Bearish crossover — MACD crossed below Signal"
    : bullish
      ? expanding ? "Bullish momentum building" : "Bullish but momentum fading"
      : expanding ? "Bearish momentum building" : "Bearish but momentum fading";

  const bullets: string[] = [
    `MACD ${macd >= 0 ? "+" : ""}${macd.toFixed(1)} | Signal ${signal >= 0 ? "+" : ""}${signal.toFixed(1)} | Histogram ${hist >= 0 ? "+" : ""}${hist.toFixed(1)}`,
    `Histogram ${expanding ? "expanding" : "contracting"} — ${streak} consecutive ${hist >= 0 ? "bullish" : "bearish"} bar${streak !== 1 ? "s" : ""}`,
    `MACD is ${aboveZero ? "above" : "below"} the zero line, indicating ${aboveZero ? "positive" : "negative"} medium-term momentum`,
    crossed ? `Fresh ${bullish ? "bullish" : "bearish"} crossover on latest bar — watch for follow-through` : `No crossover on latest bar`,
  ];

  let description = "";
  if (crossed && bullish) {
    description = "A bullish MACD crossover has just occurred. This is a classic entry signal — MACD crossing above Signal suggests upside momentum is taking hold. Look for long opportunities on intraday pullbacks. Confirm with price action above key EMAs before committing.";
  } else if (crossed && !bullish) {
    description = "A bearish MACD crossover has just occurred. MACD has dropped below Signal, signalling that downside momentum is building. Exercise caution with open long positions. Consider waiting for a retest of resistance before entering short.";
  } else if (bullish && expanding && aboveZero) {
    description = "MACD is above zero and the histogram is expanding bullishly — this is the strongest configuration for longs. Momentum is accelerating. Favour buying dips rather than chasing breakouts. Stay long while the histogram continues to grow.";
  } else if (bullish && !expanding && aboveZero) {
    description = "Bullish but histogram is shrinking. Upside momentum is decelerating. This is not a signal to sell immediately, but it warrants caution — watch for a potential crossover in the coming bars. Tighten stops on existing long positions.";
  } else if (bullish && expanding && !aboveZero) {
    description = "MACD is still below zero but crossing above Signal and histogram expanding. An early recovery signal — momentum is shifting but has not yet confirmed a full bullish turn. Wait for MACD to cross zero before treating this as a high-conviction long.";
  } else if (!bullish && expanding && !aboveZero) {
    description = "MACD is below zero with a growing bearish histogram. This is the strongest configuration for shorts. Momentum is accelerating to the downside. Favour short entries on bounces. Avoid longs until the histogram begins to contract.";
  } else if (!bullish && !expanding && !aboveZero) {
    description = "Bearish momentum is fading — the histogram is contracting. While still bearish overall, the downside pressure is weakening. This could be an early warning of a reversal or consolidation. Reduce short exposure and watch for a crossover signal.";
  } else {
    description = "Mixed MACD signals. No strong directional conviction at this time. It is advisable to wait for a clear crossover or histogram expansion before taking a new position. Focus on price action and other confirmation signals.";
  }

  return { headline, bullets, description };
}

function MacdPanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize = expanded ? 40 : MACD_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset]       = useState(0);
  const [showHist,   setShowHist]   = useState(true);
  const [showMacd,   setShowMacd]   = useState(true);
  const [showSignal, setShowSignal] = useState(true);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const data = useMemo(() => {
    const start  = rows.length - windowSize - offset;
    const end    = rows.length - offset;
    const slice  = rows.slice(Math.max(0, start), end);
    return slice.map((r, i) => {
      const parts   = r.date.split("-");
      const monthIdx = parseInt(parts[1]) - 1;
      const prevMonth = i > 0 ? parseInt(slice[i-1].date.split("-")[1]) - 1 : -1;
      return {
        date:      parseInt(parts[2]).toString(),
        month:     monthIdx !== prevMonth ? MONTHS[monthIdx] : "",
        macd:      r.macd           * 10000,
        signal:    r.macdSignal     * 10000,
        histogram: r.macdHistogram  * 10000,
      };
    });
  }, [rows, offset, windowSize]);

  const tickStyle = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };

  const yAxisWidth = expanded ? 52 : 36;

  const analysis = useMemo(() => expanded ? buildMacdAnalysis(rows) : null, [rows, expanded]);

  return (
    <div className="flex flex-col h-full">
      {/* AI Analysis block — expanded only */}
      {expanded && analysis && (
        <div className="shrink-0 flex" style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
          {/* Left: bullets */}
          <div className="flex flex-col items-center justify-center px-5 py-2.5" style={{ flex: "0 0 50%", minWidth: 0, maxWidth: "50%" }}>
            <ul className="flex flex-col gap-0.5 text-center">
              {analysis.bullets.map((b, i) => (
                <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  {b}
                </li>
              ))}
            </ul>
          </div>
          {/* Divider */}
          <div style={{ width: 1, background: "var(--border-medium)", alignSelf: "stretch", margin: "8px 0" }} />
          {/* Right: description */}
          <div className="flex-1 flex items-center justify-center px-5 py-2.5">
            <p className="text-[11px] leading-relaxed text-center" style={{ color: "var(--text-secondary)" }}>
              {analysis.description}
            </p>
          </div>
        </div>
      )}

      {/* Toggle badges */}
      <div className="shrink-0 flex items-center gap-1.5 px-2 pt-1" style={{ paddingLeft: yAxisWidth }}>
        {([
          { key: "hist",   label: "Histogram", color: "#60a5fa", on: showHist,   set: setShowHist   },
          { key: "macd",   label: "MACD",       color: "#60a5fa", on: showMacd,   set: setShowMacd   },
          { key: "signal", label: "Signal",     color: "#f59e0b", on: showSignal, set: setShowSignal },
        ] as const).map(({ key, label, color, on, set }) => (
          <button
            key={key}
            onClick={() => set(v => !v)}
            className="flex items-center gap-1 rounded-full cursor-pointer"
            style={{
              fontSize: expanded ? 10 : 8,
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: expanded ? "2px 8px" : "1px 6px",
              border: `1px solid ${on ? color + "66" : "rgba(255,255,255,0.10)"}`,
              background: on ? color + "18" : "transparent",
              color: on ? color : "var(--text-muted)",
              transition: "all 0.15s",
            }}
          >
            <span style={{ width: expanded ? 6 : 5, height: expanded ? 6 : 5, borderRadius: "50%", background: on ? color : "var(--text-muted)", flexShrink: 0 }} />
            {label}
          </button>
        ))}
      </div>

      {/* Chart — no XAxis so we can insert slider before date labels */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }} barCategoryGap={expanded ? 1 : 0}>
            <XAxis dataKey="date" hide />
            <YAxis
              tick={tickStyle}
              tickLine={false}
              axisLine={false}
              width={yAxisWidth}
              tickFormatter={v => v.toFixed(1)}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
            <Tooltip content={<MacdTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} position={{ x: 10, y: 10 }} />
            {showHist && (
              <Bar dataKey="histogram" name="Histogram" isAnimationActive={false}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.histogram >= 0 ? "rgba(96,165,250,0.7)" : "rgba(167,139,250,0.7)"} />
                ))}
              </Bar>
            )}
            {showMacd   && <Line dataKey="macd"   name="MACD"   type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#60a5fa" isAnimationActive={false} />}
            {showSignal && <Line dataKey="signal" name="Signal" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#f59e0b" isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Slider — sits between chart and date labels */}
      {maxOffset > 0 && (
        <input
          type="range"
          className="momentum-scroll"
          min={0}
          max={maxOffset}
          value={offset}
          onChange={e => setOffset(Number(e.target.value))}
          style={{ direction: "rtl" }}
        />
      )}

      {/* Date labels rows — days on top, month name below at first day of each month */}
      <div className="flex flex-col shrink-0 pb-1" style={{ paddingLeft: yAxisWidth, paddingRight: 6 }}>
        <div className="flex justify-between">
          {data.map((d, i) => (
            <span key={i} style={{ fontSize: tickStyle.fontSize, color: "var(--text-muted)" }}>{d.date}</span>
          ))}
        </div>
        {/* Month labels: group by month, flex proportional to count so label centers over its dates */}
        <div className="flex">
          {data.reduce<{ month: string; count: number }[]>((acc, d) => {
            if (d.month) acc.push({ month: d.month, count: 1 });
            else if (acc.length) acc[acc.length - 1].count++;
            return acc;
          }, []).map((g, i) => (
            <div key={i} className="text-center" style={{ flex: g.count, fontSize: tickStyle.fontSize, color: "var(--text-muted)", fontWeight: 700 }}>
              {g.month}
            </div>
          ))}
        </div>
      </div>

      {/* Indicator glossary — expanded only */}
      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#60a5fa", name: "Histogram", body: "The difference between the MACD line and the Signal line, plotted as bars. Green bars mean MACD is above Signal (bullish momentum); red bars mean MACD is below Signal (bearish momentum). Growing bars signal accelerating momentum; shrinking bars warn of a slowdown or reversal. The histogram turns before the lines cross, making it a leading indicator of momentum shifts." },
            { color: "#60a5fa", name: "MACD Line", body: "Calculated as EMA(12) minus EMA(26). It measures the difference between two exponential moving averages of price. When MACD is positive, the short-term average is above the long-term — a bullish condition. When negative, bearish. Crossovers of the zero line are used as trend-change signals, though they lag price action." },
            { color: "#f59e0b", name: "Signal Line", body: "A 9-period EMA of the MACD line itself. It acts as a trigger: when MACD crosses above the Signal line, it generates a buy signal; when it crosses below, a sell signal. The Signal line smooths the MACD and reduces noise. Crossovers in extreme territory (far from zero) are considered more reliable than those near zero." },
          ].map((item, i, arr) => (
            <div key={item.name} className="flex-1 flex flex-col gap-1 px-4 py-2.5" style={{ borderRight: i < arr.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
              <div className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <span className="text-[10px] font-bold" style={{ color: item.color }}>{item.name}</span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function buildRsiAnalysis(rows: SheetRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 3) return { headline: "Insufficient data", bullets: [], description: "" };

  const cur  = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const prev2 = rows[rows.length - 3];

  const rsi   = cur.rsi9;
  const kNow  = cur.stochRsiK;
  const dNow  = cur.stochRsiD;
  const kPrev = prev.stochRsiK;
  const dPrev = prev.stochRsiD;

  const rsiRising  = rsi > prev.rsi9;
  const kCrossUp   = kPrev < dPrev && kNow > dNow;
  const kCrossDown = kPrev > dPrev && kNow < dNow;
  const rsiTrend   = rsi > prev.rsi9 && prev.rsi9 > prev2.rsi9 ? "rising" : rsi < prev.rsi9 && prev.rsi9 < prev2.rsi9 ? "falling" : "flat";

  let headline: string;
  let bullets: string[];
  let description: string;

  if (rsi >= 70 && kNow >= 80) {
    headline = "Overbought — Dual Confirmation";
    bullets = [
      `RSI(9): ${rsi.toFixed(1)} — above 70 overbought threshold`,
      `StochRSI %K: ${kNow.toFixed(1)} / %D: ${dNow.toFixed(1)} — both elevated`,
      `RSI trend: ${rsiTrend}${kCrossDown ? " | StochRSI bearish cross" : ""}`,
    ];
    description = `Both RSI(9) and StochRSI are deep in overbought territory, a dual warning that upside momentum may be exhausting. Existing long positions should consider tightening stops or reducing size. Avoid initiating new longs here — wait for RSI to pull back below 65 and StochRSI to roll over before re-entry.`;
  } else if (rsi <= 30 && kNow <= 20) {
    headline = "Oversold — Dual Confirmation";
    bullets = [
      `RSI(9): ${rsi.toFixed(1)} — below 30 oversold threshold`,
      `StochRSI %K: ${kNow.toFixed(1)} / %D: ${dNow.toFixed(1)} — both depressed`,
      `RSI trend: ${rsiTrend}${kCrossUp ? " | StochRSI bullish cross" : ""}`,
    ];
    description = `RSI(9) and StochRSI are both in oversold territory, signalling selling exhaustion and a potential reversal setup. This is a high-probability zone for a mean-reversion bounce. Watch for a StochRSI %K cross above %D as a trigger. Risk-reward for longs improves significantly at these levels.`;
  } else if (rsi >= 70) {
    headline = "RSI Overbought";
    bullets = [
      `RSI(9): ${rsi.toFixed(1)} — in overbought zone`,
      `StochRSI %K: ${kNow.toFixed(1)} / %D: ${dNow.toFixed(1)} — ${kNow > dNow ? "K above D" : "K below D"}`,
      `RSI trend: ${rsiTrend}`,
    ];
    description = `RSI(9) has entered overbought territory, though StochRSI has not yet confirmed. In trending markets price can remain overbought for extended periods. Watch StochRSI for a bearish %K/%D cross as a more actionable exit or short signal. Do not short RSI alone in a strong uptrend.`;
  } else if (rsi <= 30) {
    headline = "RSI Oversold";
    bullets = [
      `RSI(9): ${rsi.toFixed(1)} — in oversold zone`,
      `StochRSI %K: ${kNow.toFixed(1)} / %D: ${dNow.toFixed(1)} — ${kNow > dNow ? "K above D" : "K below D"}`,
      `RSI trend: ${rsiTrend}`,
    ];
    description = `RSI(9) is in oversold territory but StochRSI hasn't fully confirmed. Oversold readings in a strong downtrend can persist — avoid blindly buying. Wait for RSI to form a higher low or for StochRSI %K to cross above %D before committing to a long position.`;
  } else if (kCrossUp && rsi > 50) {
    headline = "StochRSI Bullish Cross — Momentum Rising";
    bullets = [
      `RSI(9): ${rsi.toFixed(1)} — above midline, trend ${rsiTrend}`,
      `StochRSI: %K crossed above %D (${kNow.toFixed(1)} vs ${dNow.toFixed(1)})`,
      `Bias: bullish momentum building`,
    ];
    description = `A StochRSI %K cross above %D with RSI above 50 is a short-term bullish momentum signal. It suggests buyers are taking control in the current session. This is a constructive setup for adding to or initiating longs, particularly if confirmed by price action above key moving averages.`;
  } else if (kCrossDown && rsi < 50) {
    headline = "StochRSI Bearish Cross — Momentum Fading";
    bullets = [
      `RSI(9): ${rsi.toFixed(1)} — below midline, trend ${rsiTrend}`,
      `StochRSI: %K crossed below %D (${kNow.toFixed(1)} vs ${dNow.toFixed(1)})`,
      `Bias: bearish momentum building`,
    ];
    description = `A StochRSI %K cross below %D with RSI below 50 warns of fading momentum. This combination favours short-side setups or reducing long exposure. Watch for price to break below short-term support to confirm.`;
  } else if (rsi > 50 && rsiRising) {
    headline = "RSI Bullish — Momentum Building";
    bullets = [
      `RSI(9): ${rsi.toFixed(1)} — above 50 and rising`,
      `StochRSI %K: ${kNow.toFixed(1)} / %D: ${dNow.toFixed(1)}`,
      `Trend alignment: ${rsiTrend}`,
    ];
    description = `RSI(9) is above the 50 midline and trending higher — a positive momentum backdrop. Combined with StochRSI, the overall picture favours bulls. Look for pullbacks to the 50-55 RSI zone as lower-risk re-entry points rather than chasing strength.`;
  } else {
    headline = "RSI Neutral — No Clear Signal";
    bullets = [
      `RSI(9): ${rsi.toFixed(1)} — near midline`,
      `StochRSI %K: ${kNow.toFixed(1)} / %D: ${dNow.toFixed(1)}`,
      `Trend: ${rsiTrend} — consolidating`,
    ];
    description = `RSI(9) is hovering near the 50 midline with no strong directional bias, and StochRSI is in a neutral zone. This suggests a period of consolidation or indecision. Avoid overtrading in this environment — wait for RSI to break clearly above 55 or below 45 before committing to a directional trade.`;
  }

  return { headline, bullets, description };
}

const RSI_WINDOW = 20;

function RsiTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--bg-panel-alt)", border: "1px solid var(--border-medium)", borderRadius: 8, padding: "6px 10px", fontSize: 10 }}>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color }}>{p.name}: {p.value.toFixed(1)}</div>
      ))}
    </div>
  );
}

function RsiPanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize = expanded ? 40 : RSI_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);
  const [showRsi, setShowRsi]   = useState(true);
  const [showK,   setShowK]     = useState(true);
  const [showD,   setShowD]     = useState(true);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const data = useMemo(() => {
    const start = rows.length - windowSize - offset;
    const end   = rows.length - offset;
    const slice = rows.slice(Math.max(0, start), end);
    return slice.map((r, i) => {
      const parts    = r.date.split("-");
      const monthIdx = parseInt(parts[1]) - 1;
      const prevMonth = i > 0 ? parseInt(slice[i-1].date.split("-")[1]) - 1 : -1;
      return {
        date:  parseInt(parts[2]).toString(),
        month: monthIdx !== prevMonth ? MONTHS[monthIdx] : "",
        rsi9:  r.rsi9,
        k:     r.stochRsiK,
        d:     r.stochRsiD,
      };
    });
  }, [rows, offset, windowSize]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 36 : 28;
  const analysis   = useMemo(() => expanded ? buildRsiAnalysis(rows) : null, [rows, expanded]);

  return (
    <div className="flex flex-col h-full">
      {expanded && analysis && (
        <div className="shrink-0 flex" style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex flex-col items-center justify-center px-5 py-2.5" style={{ flex: "0 0 50%", minWidth: 0, maxWidth: "50%" }}>
            <ul className="flex flex-col gap-0.5 text-center">
              {analysis.bullets.map((b, i) => (
                <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{b}</li>
              ))}
            </ul>
          </div>
          <div style={{ width: 1, background: "var(--border-medium)", alignSelf: "stretch", margin: "8px 0" }} />
          <div className="flex-1 flex items-center justify-center px-5 py-2.5">
            <p className="text-[11px] leading-relaxed text-center" style={{ color: "var(--text-secondary)" }}>{analysis.description}</p>
          </div>
        </div>
      )}

      {/* Toggle badges */}
      <div className="shrink-0 flex items-center gap-1.5 px-2 pt-1" style={{ paddingLeft: yAxisWidth }}>
        {([
          { key: "rsi",  label: "RSI(9)",      color: "#60a5fa", on: showRsi, set: setShowRsi },
          { key: "k",    label: "StochRSI %K", color: "#f59e0b", on: showK,   set: setShowK   },
          { key: "d",    label: "StochRSI %D", color: "#c084fc", on: showD,   set: setShowD   },
        ] as const).map(({ key, label, color, on, set }) => (
          <button
            key={key}
            onClick={() => set(v => !v)}
            className="flex items-center gap-1 rounded-full cursor-pointer"
            style={{
              fontSize: expanded ? 10 : 8,
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: expanded ? "2px 8px" : "1px 6px",
              border: `1px solid ${on ? color + "66" : "rgba(255,255,255,0.10)"}`,
              background: on ? color + "18" : "transparent",
              color: on ? color : "var(--text-muted)",
              transition: "all 0.15s",
            }}
          >
            <span style={{ width: expanded ? 6 : 5, height: expanded ? 6 : 5, borderRadius: "50%", background: on ? color : "var(--text-muted)", flexShrink: 0 }} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" hide />
            <YAxis
              tick={tickStyle}
              tickLine={false}
              axisLine={false}
              width={yAxisWidth}
              domain={[0, 100]}
              ticks={[20, 30, 50, 70, 80]}
              tickFormatter={v => v.toFixed(0)}
            />
            <ReferenceArea y1={30} y2={70} fill="rgba(255,255,255,0.045)" ifOverflow="hidden" />
            <ReferenceLine y={80} stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="2 4" />
            <ReferenceLine y={70} stroke="rgba(255,255,255,0.20)" strokeWidth={1} />
            <ReferenceLine y={50} stroke="rgba(255,255,255,0.13)" strokeWidth={1} strokeDasharray="3 3" />
            <ReferenceLine y={30} stroke="rgba(255,255,255,0.20)" strokeWidth={1} />
            <ReferenceLine y={20} stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="2 4" />
            <Tooltip content={<RsiTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} position={{ x: 10, y: 10 }} />
            {showRsi && <Line dataKey="rsi9" name="RSI(9)"      type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#60a5fa" isAnimationActive={false} />}
            {showK   && <Line dataKey="k"    name="StochRSI %K" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#f59e0b" isAnimationActive={false} />}
            {showD   && <Line dataKey="d"    name="StochRSI %D" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#c084fc" strokeDasharray="3 3" isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {maxOffset > 0 && (
        <input
          type="range"
          className="momentum-scroll"
          min={0}
          max={maxOffset}
          value={offset}
          onChange={e => setOffset(Number(e.target.value))}
          style={{ direction: "rtl" }}
        />
      )}

      <div className="flex flex-col shrink-0 pb-1" style={{ paddingLeft: yAxisWidth, paddingRight: 6 }}>
        <div className="flex justify-between">
          {data.map((d, i) => (
            <span key={i} style={{ fontSize: tickStyle.fontSize, color: "var(--text-muted)" }}>{d.date}</span>
          ))}
        </div>
        <div className="flex">
          {data.reduce<{ month: string; count: number }[]>((acc, d) => {
            if (d.month) acc.push({ month: d.month, count: 1 });
            else if (acc.length) acc[acc.length - 1].count++;
            return acc;
          }, []).map((g, i) => (
            <div key={i} className="text-center" style={{ flex: g.count, fontSize: tickStyle.fontSize, color: "var(--text-muted)", fontWeight: 700 }}>
              {g.month}
            </div>
          ))}
        </div>
      </div>

      {/* Indicator glossary — expanded only */}
      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#60a5fa", name: "RSI (9)", body: "Relative Strength Index over 9 periods. Measures the speed and magnitude of recent price moves on a 0–100 scale. Readings above 70 signal overbought conditions; below 30 signal oversold. The short 9-period lookback makes it highly responsive — useful for spotting short-term exhaustion quickly, but prone to false signals in trending markets." },
            { color: "#f59e0b", name: "StochRSI %K", body: "The Stochastic applied to RSI values rather than price. %K is the raw line: it shows where the current RSI sits within its own high-low range over the lookback period, scaled 0–100. It oscillates far more aggressively than raw RSI and is sensitive to short-term momentum shifts. Values above 80 = overbought; below 20 = oversold." },
            { color: "#c084fc", name: "StochRSI %D", body: "A smoothed 3-period moving average of %K. Because %D lags %K slightly, crossovers between the two are used as signals: %K crossing above %D is a buy signal; crossing below is a sell signal. %D filters out some of the noise in the raw %K line, making crossovers more reliable when both lines are in extreme territory." },
          ].map((item, i, arr) => (
            <div key={item.name} className="flex-1 flex flex-col gap-1 px-4 py-2.5" style={{ borderRight: i < arr.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
              <div className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <span className="text-[10px] font-bold" style={{ color: item.color }}>{item.name}</span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function buildRsi14Analysis(rows: SheetRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 6) return { headline: "Insufficient data", bullets: [], description: "" };

  const cur   = rows[rows.length - 1];
  const prev  = rows[rows.length - 2];
  const prev2 = rows[rows.length - 3];

  const rsi  = cur.rsi14;
  const rsiRising = rsi > prev.rsi14;
  const rsiTrend  = rsi > prev.rsi14 && prev.rsi14 > prev2.rsi14 ? "rising"
    : rsi < prev.rsi14 && prev.rsi14 < prev2.rsi14 ? "falling" : "flat";

  const recent5   = rows.slice(-5);
  const trendSma  = recent5.reduce((s, r) => s + r.rsi14, 0) / 5;
  const aboveTrend = rsi > trendSma;

  const aboveSma50  = cur.close > cur.sma50;
  const aboveSma200 = cur.close > cur.sma200;

  let headline: string;
  let bullets: string[];
  let description: string;

  if (rsi >= 70) {
    headline = "RSI(14) Overbought";
    bullets = [
      `RSI(14): ${rsi.toFixed(1)} — above 70 threshold`,
      `5-bar trend SMA: ${trendSma.toFixed(1)} — RSI ${aboveTrend ? "above" : "below"} trend`,
      `Price vs SMA200: ${aboveSma200 ? "above — uptrend intact" : "below — caution"}`,
    ];
    description = `RSI(14) has entered overbought territory. Unlike the faster RSI(9), a reading above 70 on the 14-period carries more weight — sustained overbought readings often precede corrections. In strong uptrends price can remain overbought for extended periods, so avoid shorting purely on this signal. Wait for RSI to roll back below 65 and confirm with price action.`;
  } else if (rsi <= 30) {
    headline = "RSI(14) Oversold";
    bullets = [
      `RSI(14): ${rsi.toFixed(1)} — below 30 threshold`,
      `5-bar trend SMA: ${trendSma.toFixed(1)} — RSI ${aboveTrend ? "above" : "below"} trend`,
      `Price vs SMA200: ${aboveSma200 ? "above — structural support likely" : "below — downtrend context"}`,
    ];
    description = `RSI(14) is in oversold territory, signalling that selling pressure may be reaching exhaustion. This is a more reliable oversold signal than RSI(9) due to the longer lookback. ${aboveSma50 ? "With price above SMA50 the broader trend remains supportive — look for a reversal candle as an entry trigger." : "Price is below SMA50, so treat this as a potential counter-trend bounce rather than a trend reversal. Manage size accordingly."}`;
  } else if (rsi > 55 && aboveTrend && rsiRising) {
    headline = "Bullish Momentum — RSI Rising";
    bullets = [
      `RSI(14): ${rsi.toFixed(1)} — above midline and rising`,
      `5-bar trend SMA: ${trendSma.toFixed(1)} — RSI above trend`,
      `Trend alignment: ${aboveSma50 ? "bullish (above SMA50)" : "mixed — below SMA50"}`,
    ];
    description = `RSI(14) is above 55 and trending higher, with the current reading above its short-term average. This is a constructive momentum environment for longs. The 14-period RSI holding above 50 historically correlates with sustained upside moves. Look for dips toward the 50–55 zone as lower-risk re-entry points.`;
  } else if (rsi < 45 && !aboveTrend && !rsiRising) {
    headline = "Bearish Momentum — RSI Declining";
    bullets = [
      `RSI(14): ${rsi.toFixed(1)} — below midline and falling`,
      `5-bar trend SMA: ${trendSma.toFixed(1)} — RSI below trend`,
      `Trend alignment: ${!aboveSma50 ? "bearish (below SMA50)" : "mixed — above SMA50"}`,
    ];
    description = `RSI(14) is below 45 and declining, sitting under its short-term average. Bearish momentum is building. ${!aboveSma50 ? "With price below SMA50, the path of least resistance remains lower. Look for weak bounces as potential short entries." : "Price remains above SMA50 which provides some structural support — wait for that level to break before committing to shorts."}`;
  } else if (Math.abs(rsi - 50) < 5) {
    headline = "RSI(14) Neutral — Near Midline";
    bullets = [
      `RSI(14): ${rsi.toFixed(1)} — hovering near 50`,
      `5-bar trend SMA: ${trendSma.toFixed(1)} — trend: ${rsiTrend}`,
      `No strong directional bias from momentum`,
    ];
    description = `RSI(14) is oscillating near the 50 midline, indicating a balance between buyers and sellers. This is the least actionable RSI zone — avoid directional bias until RSI breaks clearly above 55 (bullish) or below 45 (bearish). In ranging markets, 50 crossovers are common noise rather than meaningful signals.`;
  } else if (rsi > 50 && !rsiRising) {
    headline = "Bullish but Momentum Fading";
    bullets = [
      `RSI(14): ${rsi.toFixed(1)} — above 50 but turning lower`,
      `5-bar trend SMA: ${trendSma.toFixed(1)} — RSI ${aboveTrend ? "still above" : "below"} trend`,
      `Watch for a 50 cross as a confirmed momentum shift`,
    ];
    description = `RSI(14) remains above 50 but is losing upward momentum, a warning that the bullish phase may be winding down. This is not yet a sell signal, but it warrants caution for longs — tighten stops and avoid adding new long exposure until momentum stabilises or RSI recovers above 55.`;
  } else {
    headline = "Bearish but Momentum Stabilising";
    bullets = [
      `RSI(14): ${rsi.toFixed(1)} — below 50 but flattening`,
      `5-bar trend SMA: ${trendSma.toFixed(1)} — trend: ${rsiTrend}`,
      `Watch for a 50 reclaim as early bullish signal`,
    ];
    description = `RSI(14) is below 50 but the pace of decline appears to be slowing. This can precede a base and recovery, particularly if price finds support at a key level. Do not initiate new shorts here — wait for confirmation that RSI is resuming lower before pressing the trade.`;
  }

  return { headline, bullets, description };
}

function Rsi14Tooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--bg-panel-alt)", border: "1px solid var(--border-medium)", borderRadius: 8, padding: "6px 10px", fontSize: 10 }}>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color }}>{p.name}: {p.value.toFixed(1)}</div>
      ))}
    </div>
  );
}

function Rsi14PanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize = expanded ? 40 : RSI_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset]     = useState(0);
  const [showRsi14, setShowRsi14] = useState(true);
  const [showTrend, setShowTrend] = useState(true);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const data = useMemo(() => {
    const start = rows.length - windowSize - offset;
    const end   = rows.length - offset;
    const slice = rows.slice(Math.max(0, start), end);
    return slice.map((r, i, arr) => {
      const parts     = r.date.split("-");
      const monthIdx  = parseInt(parts[1]) - 1;
      const prevMonth = i > 0 ? parseInt(arr[i-1].date.split("-")[1]) - 1 : -1;
      const smaStart  = Math.max(0, i - 4);
      const trend     = arr.slice(smaStart, i + 1).reduce((s, x) => s + x.rsi14, 0) / (i - smaStart + 1);
      return {
        date:  parseInt(parts[2]).toString(),
        month: monthIdx !== prevMonth ? MONTHS[monthIdx] : "",
        rsi14: r.rsi14,
        trend,
      };
    });
  }, [rows, offset, windowSize]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 36 : 28;
  const analysis   = useMemo(() => expanded ? buildRsi14Analysis(rows) : null, [rows, expanded]);

  const yDomain = useMemo(() => {
    const vals: number[] = [];
    data.forEach(d => {
      if (showRsi14) vals.push(d.rsi14);
      if (showTrend) vals.push(d.trend);
    });
    if (!vals.length) return [0, 100] as const;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.25;
    return [Math.max(0, min - pad), Math.min(100, max + pad)] as const;
  }, [data, showRsi14, showTrend]);

  return (
    <div className="flex flex-col h-full">
      {/* AI analysis — expanded only */}
      {expanded && analysis && (
        <div className="shrink-0 flex" style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex flex-col items-center justify-center px-5 py-2.5" style={{ flex: "0 0 50%", minWidth: 0, maxWidth: "50%" }}>
            <ul className="flex flex-col gap-0.5 text-center">
              {analysis.bullets.map((b, i) => (
                <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{b}</li>
              ))}
            </ul>
          </div>
          <div style={{ width: 1, background: "var(--border-medium)", alignSelf: "stretch", margin: "8px 0" }} />
          <div className="flex-1 flex items-center justify-center px-5 py-2.5">
            <p className="text-[11px] leading-relaxed text-center" style={{ color: "var(--text-secondary)" }}>{analysis.description}</p>
          </div>
        </div>
      )}

      {/* Toggle badges */}
      <div className="shrink-0 flex items-center gap-1.5 px-2 pt-1" style={{ paddingLeft: yAxisWidth }}>
        {([
          { key: "rsi14", label: "RSI(14)", color: "#38bdf8", on: showRsi14, set: setShowRsi14 },
          { key: "trend", label: "Trend",   color: "#fbbf24", on: showTrend, set: setShowTrend },
        ] as const).map(({ key, label, color, on, set }) => (
          <button
            key={key}
            onClick={() => set(v => !v)}
            className="flex items-center gap-1 rounded-full cursor-pointer"
            style={{
              fontSize: expanded ? 10 : 8,
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: expanded ? "2px 8px" : "1px 6px",
              border: `1px solid ${on ? color + "66" : "rgba(255,255,255,0.10)"}`,
              background: on ? color + "18" : "transparent",
              color: on ? color : "var(--text-muted)",
              transition: "all 0.15s",
            }}
          >
            <span style={{ width: expanded ? 6 : 5, height: expanded ? 6 : 5, borderRadius: "50%", background: on ? color : "var(--text-muted)", flexShrink: 0 }} />
            {label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" hide />
            <YAxis
              tick={tickStyle}
              tickLine={false}
              axisLine={false}
              width={yAxisWidth}
              domain={yDomain}
              ticks={[30, 50, 70]}
              tickFormatter={v => v.toFixed(0)}
            />
            <ReferenceArea y1={30} y2={70} fill="rgba(255,255,255,0.045)" ifOverflow="hidden" />
            <ReferenceLine y={70} stroke="rgba(255,255,255,0.20)" strokeWidth={1} />
            <ReferenceLine y={50} stroke="rgba(255,255,255,0.13)" strokeWidth={1} strokeDasharray="3 3" />
            <ReferenceLine y={30} stroke="rgba(255,255,255,0.20)" strokeWidth={1} />
            <Tooltip content={<Rsi14Tooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} position={{ x: 10, y: 10 }} />
            {showRsi14 && <Line dataKey="rsi14" name="RSI(14)" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#38bdf8" isAnimationActive={false} />}
            {showTrend && <Line dataKey="trend" name="Trend"   type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#fbbf24" strokeDasharray="4 2" isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Slider */}
      {maxOffset > 0 && (
        <input
          type="range"
          className="momentum-scroll"
          min={0}
          max={maxOffset}
          value={offset}
          onChange={e => setOffset(Number(e.target.value))}
          style={{ direction: "rtl" }}
        />
      )}

      {/* Date labels */}
      <div className="flex flex-col shrink-0 pb-1" style={{ paddingLeft: yAxisWidth, paddingRight: 6 }}>
        <div className="flex justify-between">
          {data.map((d, i) => (
            <span key={i} style={{ fontSize: tickStyle.fontSize, color: "var(--text-muted)" }}>{d.date}</span>
          ))}
        </div>
        <div className="flex">
          {data.reduce<{ month: string; count: number }[]>((acc, d) => {
            if (d.month) acc.push({ month: d.month, count: 1 });
            else if (acc.length) acc[acc.length - 1].count++;
            return acc;
          }, []).map((g, i) => (
            <div key={i} className="text-center" style={{ flex: g.count, fontSize: tickStyle.fontSize, color: "var(--text-muted)", fontWeight: 700 }}>
              {g.month}
            </div>
          ))}
        </div>
      </div>

      {/* Indicator glossary — expanded only */}
      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#38bdf8", name: "RSI (14)", body: "Relative Strength Index over 14 periods — the standard setting. Smoother and more reliable than RSI(9), it filters out short-term noise and gives fewer but higher-quality signals. Above 70 = overbought; below 30 = oversold. Because it uses a longer lookback, overbought/oversold readings here carry more weight than on the 9-period." },
            { color: "#fbbf24", name: "Trend (5-bar SMA of RSI)", body: "A 5-period simple moving average applied to RSI(14) itself. When RSI(14) is above the Trend line, momentum is accelerating upward; when below, momentum is fading. The crossover between RSI(14) and its Trend line is an early signal of a momentum shift — useful for timing entries and exits within the broader RSI context." },
          ].map((item, i, arr) => (
            <div key={item.name} className="flex-1 flex flex-col gap-1 px-4 py-2.5" style={{ borderRight: i < arr.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
              <div className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <span className="text-[10px] font-bold" style={{ color: item.color }}>{item.name}</span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function buildMaAnalysis(rows: SheetRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 3) return { headline: "Insufficient data", bullets: [], description: "" };

  const cur  = rows[rows.length - 1];
  const prev = rows[rows.length - 2];

  const price       = cur.close;
  const aboveEma9   = price > cur.ema9;
  const aboveEma20  = price > cur.ema20;
  const aboveEma50  = price > cur.ema50;
  const aboveEma200 = price > cur.ema200;

  const ema9Rising  = cur.ema9  > prev.ema9;
  const ema20Rising = cur.ema20 > prev.ema20;
  const ema50Rising = cur.ema50 > prev.ema50;

  const crossProximity   = Math.abs(cur.ema50 - cur.ema200) / cur.ema200 * 100;
  const ema50AboveEma200 = cur.ema50 > cur.ema200;

  const bullStack = aboveEma9 && aboveEma20 && aboveEma50 && aboveEma200;
  const bearStack = !aboveEma9 && !aboveEma20 && !aboveEma50 && !aboveEma200;

  let headline: string;
  let bullets: string[];
  let description: string;

  if (bullStack && ema50AboveEma200) {
    headline = "Full Bullish Stack — All EMAs Aligned";
    bullets = [
      `Price above EMA9, EMA20, EMA50 & EMA200`,
      `EMA50 above EMA200 — golden cross in effect`,
      `EMA9 ${ema9Rising ? "rising" : "flattening"} · EMA20 ${ema20Rising ? "rising" : "flattening"}`,
    ];
    description = `Price is trading above all key EMAs and EMA50 is above EMA200 — the textbook bullish EMA alignment. This is a structurally strong environment for longs. Pullbacks to EMA9 or EMA20 are buying opportunities as long as the stack remains intact. Avoid shorts against this structure.`;
  } else if (bearStack && !ema50AboveEma200) {
    headline = "Full Bearish Stack — All EMAs Aligned";
    bullets = [
      `Price below EMA9, EMA20, EMA50 & EMA200`,
      `EMA50 below EMA200 — death cross in effect`,
      `EMA9 ${ema9Rising ? "recovering" : "declining"} · EMA20 ${ema20Rising ? "recovering" : "declining"}`,
    ];
    description = `Price is below all key EMAs with EMA50 under EMA200 — a full bearish structure. Because EMAs react faster than SMAs, this alignment confirms sustained selling pressure. Rallies toward EMA20 or EMA50 are selling opportunities. Do not fight the trend with longs until a meaningful reclaim occurs.`;
  } else if (aboveEma200 && aboveEma50 && !aboveEma9) {
    headline = "Bullish Trend — Short-Term Pullback";
    bullets = [
      `Price above EMA50 & EMA200 — trend intact`,
      `Price below EMA9 — short-term weakness`,
      `EMA50 ${ema50Rising ? "rising" : "flattening"} — watch for dynamic support`,
    ];
    description = `The longer-term trend remains bullish (above EMA50 and EMA200), but price has pulled below EMA9, signalling short-term weakness. Watch for price to stabilise near EMA20 and reclaim EMA9 as a re-entry trigger. The broader bull structure is not broken.`;
  } else if (!aboveEma200 && !aboveEma50 && aboveEma9) {
    headline = "Bearish Trend — Short-Term Bounce";
    bullets = [
      `Price below EMA50 & EMA200 — trend bearish`,
      `Price above EMA9 — short-term bounce underway`,
      `Watch EMA20 as first overhead resistance`,
    ];
    description = `A counter-trend bounce is underway — price has recovered above EMA9 — but the broader structure remains bearish (below EMA50 and EMA200). These bounces typically stall at EMA20 or EMA50. Wait for a meaningful close above EMA50 before shifting bias bullish.`;
  } else if (crossProximity < 1.5 && !ema50AboveEma200) {
    headline = "Potential Golden Cross Approaching";
    bullets = [
      `EMA50 within ${crossProximity.toFixed(2)}% of EMA200`,
      `Price ${aboveEma50 ? "above" : "below"} EMA50`,
      `A cross above EMA200 by EMA50 would confirm`,
    ];
    description = `The EMA50 is approaching the EMA200 from below — a golden cross may be imminent. EMA-based crosses react faster than SMA crosses, making this an earlier signal. If confirmed, it would shift the long-term EMA structure bullish. Watch for price to hold above EMA50 as supporting evidence.`;
  } else if (crossProximity < 1.5 && ema50AboveEma200) {
    headline = "Potential Death Cross Approaching";
    bullets = [
      `EMA50 within ${crossProximity.toFixed(2)}% of EMA200`,
      `Price ${aboveEma50 ? "above" : "below"} EMA50`,
      `A cross below EMA200 by EMA50 would confirm`,
    ];
    description = `The EMA50 is converging on the EMA200 from above — a death cross may be forming. EMA crosses occur earlier than SMA crosses, so this is an advance warning. Reduce long exposure and tighten stops if price also trades below EMA50.`;
  } else if (aboveEma50 && !aboveEma200) {
    headline = "Mixed — Above EMA50, Below EMA200";
    bullets = [
      `Price above EMA50 — medium-term bias positive`,
      `Price below EMA200 — long-term headwind`,
      `EMA50 ${ema50AboveEma200 ? "above" : "below"} EMA200`,
    ];
    description = `A mixed picture: medium-term momentum is positive (above EMA50) but the long-term EMA200 remains overhead as resistance. Bulls need a clean close above EMA200 to shift the structure fully bullish. Until then, treat rallies toward EMA200 as potential supply zones.`;
  } else {
    headline = "Neutral — Mixed EMA Alignment";
    bullets = [
      `Price: ${aboveEma9 ? "above" : "below"} EMA9 · ${aboveEma20 ? "above" : "below"} EMA20`,
      `EMA50: ${aboveEma50 ? "above" : "below"} · EMA200: ${aboveEma200 ? "above" : "below"}`,
      `No clear directional conviction in EMA stack`,
    ];
    description = `EMAs are not in clear alignment — price is threading between different timeframe averages. This typically reflects a range-bound or transitional market. Wait for price to clearly stack above EMA9, EMA20 and EMA50 (bullish) or break decisively below them (bearish) before committing to a directional trade.`;
  }

  return { headline, bullets, description };
}

function buildAdxAnalysis(rows: SheetRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 3) return { headline: "Insufficient data", bullets: [], description: "" };

  const cur  = rows[rows.length - 1];
  const prev = rows[rows.length - 2];

  const { diPlus, diMinus, adx } = cur;
  const adxRising    = adx > prev.adx;
  const diCrossUp    = diPlus > diMinus && prev.diPlus <= prev.diMinus;
  const diCrossDown  = diMinus > diPlus && prev.diMinus <= prev.diPlus;
  const bullish      = diPlus > diMinus;
  const diSep        = Math.abs(diPlus - diMinus);

  let headline: string;
  let bullets: string[];
  let description: string;

  if (adx >= 40) {
    if (bullish) {
      headline = "Strong Bullish Trend — ADX Elevated";
      bullets = [
        `ADX at ${adx.toFixed(1)} — strong trend`,
        `+DI ${diPlus.toFixed(1)} > −DI ${diMinus.toFixed(1)} — bullish control`,
        `ADX ${adxRising ? "still rising — trend accelerating" : "flattening — watch for exhaustion"}`,
      ];
      description = `ADX above 40 with +DI dominating confirms a powerful bullish trend. This is a high-conviction directional environment — trend-following strategies are favoured. ${adxRising ? "ADX is still climbing, suggesting the move has further to run." : "ADX is beginning to flatten which can signal trend exhaustion — consider tightening stops on long positions."}`;
    } else {
      headline = "Strong Bearish Trend — ADX Elevated";
      bullets = [
        `ADX at ${adx.toFixed(1)} — strong trend`,
        `−DI ${diMinus.toFixed(1)} > +DI ${diPlus.toFixed(1)} — bearish control`,
        `ADX ${adxRising ? "still rising — trend accelerating" : "flattening — watch for exhaustion"}`,
      ];
      description = `ADX above 40 with −DI dominant confirms strong downside momentum. The market is in a sustained bearish trend — counter-trend longs are high-risk. ${adxRising ? "Trend momentum is still building." : "ADX flattening near elevated levels is an early warning of exhaustion — reduce short exposure and watch for a DI cross."} `;
    }
  } else if (adx >= 25) {
    if (diCrossUp) {
      headline = "Bullish DI Cross — Trend Emerging";
      bullets = [
        `+DI crossed above −DI — fresh bullish signal`,
        `ADX at ${adx.toFixed(1)} — trend strength ${adxRising ? "building" : "moderate"}`,
        `DI separation: ${diSep.toFixed(1)} — ${diSep > 5 ? "meaningful" : "narrow — confirm with price"}`,
      ];
      description = `A +DI crossover above −DI with ADX above 25 is a classic directional buy signal. The market is shifting from bearish to bullish control. Enter long on a pullback or breakout confirmation. ADX ${adxRising ? "is rising, adding conviction to the signal." : "is not yet accelerating — wait for follow-through before committing full size."}`;
    } else if (diCrossDown) {
      headline = "Bearish DI Cross — Trend Emerging";
      bullets = [
        `−DI crossed above +DI — fresh bearish signal`,
        `ADX at ${adx.toFixed(1)} — trend strength ${adxRising ? "building" : "moderate"}`,
        `DI separation: ${diSep.toFixed(1)} — ${diSep > 5 ? "meaningful" : "narrow — confirm with price"}`,
      ];
      description = `A −DI crossover above +DI with ADX above 25 signals a shift to bearish directional control. This is a sell or short-entry trigger. ADX ${adxRising ? "is rising, confirming the bearish trend is gaining strength." : "is not yet rising — watch for ADX to confirm before adding exposure."}`;
    } else if (bullish) {
      headline = "Trending — Bullish DI Alignment";
      bullets = [
        `ADX at ${adx.toFixed(1)} — confirmed trend`,
        `+DI ${diPlus.toFixed(1)} leads −DI ${diMinus.toFixed(1)}`,
        `ADX ${adxRising ? "rising — momentum building" : "declining — trend may be softening"}`,
      ];
      description = `ADX is above 25 with +DI above −DI — the market is in a confirmed bullish directional trend. Pullbacks are buying opportunities while this alignment holds. ${adxRising ? "Rising ADX confirms expanding momentum." : "Declining ADX warns that trend momentum is fading — be selective with new entries."}`;
    } else {
      headline = "Trending — Bearish DI Alignment";
      bullets = [
        `ADX at ${adx.toFixed(1)} — confirmed trend`,
        `−DI ${diMinus.toFixed(1)} leads +DI ${diPlus.toFixed(1)}`,
        `ADX ${adxRising ? "rising — selling accelerating" : "declining — trend may be softening"}`,
      ];
      description = `ADX above 25 with −DI leading confirms a bearish directional trend. Rallies are selling opportunities until a DI cross or ADX collapse occurs. ${adxRising ? "Rising ADX confirms the downtrend is strengthening." : "Declining ADX suggests bearish momentum is easing — tighten short stops."}`;
    }
  } else {
    headline = "Ranging — No Directional Trend";
    bullets = [
      `ADX at ${adx.toFixed(1)} — below trend threshold`,
      `${bullish ? "+DI" : "−DI"} leads marginally — no conviction`,
      `Avoid trend-following signals until ADX > 25`,
    ];
    description = `ADX below 25 signals a non-trending, range-bound market. DI crossovers in this environment produce many false signals — trend-following strategies underperform. Prefer mean-reversion or range-trading approaches. Watch for ADX to rise above 25 as the trigger for a new directional trade.`;
  }

  return { headline, bullets, description };
}

function buildIchiAnalysis(rows: SheetRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 3) return { headline: "Insufficient data", bullets: [], description: "" };

  const cur  = rows[rows.length - 1];
  const prev = rows[rows.length - 2];

  const { close, tenkan, kijun, senkouA, senkouB } = cur;
  const cloudTop         = Math.max(senkouA, senkouB);
  const cloudBottom      = Math.min(senkouA, senkouB);
  const aboveCloud       = close > cloudTop;
  const belowCloud       = close < cloudBottom;
  const inCloud          = !aboveCloud && !belowCloud;
  const bullishCloud     = senkouA > senkouB;   // green cloud: A above B
  const bearishCloud     = senkouB > senkouA;   // red cloud: B above A
  const tenkanAboveKijun = tenkan > kijun;
  const tkCrossUp        = tenkan > kijun && prev.tenkan <= prev.kijun;
  const tkCrossDown      = tenkan < kijun && prev.tenkan >= prev.kijun;
  const cloudThickPips   = Math.round(Math.abs(senkouA - senkouB) * 10000);
  // How deep into the cloud is price (0 = at bottom, 100 = at top)
  const cloudDepthPct    = cloudTop > cloudBottom
    ? Math.round(((close - cloudBottom) / (cloudTop - cloudBottom)) * 100)
    : 50;
  // Chikou proxy: close 26 bars ago
  const chikouRow        = rows.length > 26 ? rows[rows.length - 27] : null;
  const chikouBullish    = chikouRow ? cur.close > chikouRow.close : null;

  let headline: string;
  let bullets: string[];
  let description: string;

  if (aboveCloud && tenkanAboveKijun && bullishCloud) {
    headline = "Full Bullish Structure — All Signals Aligned";
    bullets = [
      `Price above bullish cloud (Senkou A ${senkouA.toFixed(4)} > B ${senkouB.toFixed(4)})`,
      `Tenkan ${tenkan.toFixed(4)} > Kijun ${kijun.toFixed(4)} — ${tkCrossUp ? "fresh TK cross up" : "bullish alignment sustained"}`,
      `Cloud base support: ${cloudBottom.toFixed(4)} (${Math.round((close - cloudTop) * 10000)} pips above cloud top)`,
      chikouBullish != null ? `Chikou proxy: ${chikouBullish ? "above" : "below"} close 26 bars ago — ${chikouBullish ? "confirms bullish" : "mild divergence"}` : `Cloud thickness: ${cloudThickPips} pips`,
    ];
    description = `The strongest bullish Ichimoku reading: price is above a bullish cloud (Senkou A > B), Tenkan is above Kijun, and all three trend filters align. This is a high-conviction long environment. Pullbacks toward the Tenkan (${tenkan.toFixed(4)}) and Kijun (${kijun.toFixed(4)}) are buying opportunities while this structure holds. The cloud top at ${cloudTop.toFixed(4)} is the first support on any deeper pullback.`;

  } else if (belowCloud && !tenkanAboveKijun && bearishCloud) {
    headline = "Full Bearish Structure — All Signals Aligned";
    bullets = [
      `Price below bearish cloud (Senkou B ${senkouB.toFixed(4)} > A ${senkouA.toFixed(4)})`,
      `Tenkan ${tenkan.toFixed(4)} < Kijun ${kijun.toFixed(4)} — ${tkCrossDown ? "fresh TK cross down" : "bearish alignment sustained"}`,
      `Cloud base resistance: ${cloudBottom.toFixed(4)} (${Math.round((cloudBottom - close) * 10000)} pips below cloud bottom)`,
      chikouBullish != null ? `Chikou proxy: ${chikouBullish ? "above" : "below"} close 26 bars ago — ${!chikouBullish ? "confirms bearish" : "mild divergence"}` : `Cloud thickness: ${cloudThickPips} pips`,
    ];
    description = `The strongest bearish Ichimoku reading: price is below a bearish cloud (Senkou B > A), Tenkan is below Kijun, and all three filters confirm downside bias. Rallies toward the Tenkan (${tenkan.toFixed(4)}) and Kijun (${kijun.toFixed(4)}) are shorting opportunities. The cloud bottom at ${cloudBottom.toFixed(4)} acts as the first overhead resistance — a close above it would begin to erode the bearish case.`;

  } else if (tkCrossUp && aboveCloud) {
    headline = "Bullish TK Cross Above Cloud";
    bullets = [
      `Tenkan crossed above Kijun — fresh bullish momentum signal`,
      `Price above cloud — trend filter confirmed`,
      `Cloud: ${bullishCloud ? `bullish (A ${senkouA.toFixed(4)} > B ${senkouB.toFixed(4)})` : "bearish — partial conflict with cloud type"}`,
      `Cloud top at ${cloudTop.toFixed(4)}, ${Math.round((close - cloudTop) * 10000)} pips below current close`,
    ];
    description = `A Tenkan-Kijun crossover above the cloud is one of the highest-quality Ichimoku buy signals. With price already clear of the cloud, the trend filter is confirmed. Enter long or add to longs. The cloud top at ${cloudTop.toFixed(4)} now acts as structural support — a close back below Kijun (${kijun.toFixed(4)}) would be the first warning to reduce exposure.`;

  } else if (tkCrossDown && belowCloud) {
    headline = "Bearish TK Cross Below Cloud";
    bullets = [
      `Tenkan crossed below Kijun — fresh bearish momentum signal`,
      `Price below cloud — trend filter confirmed`,
      `Cloud: ${bearishCloud ? `bearish (B ${senkouB.toFixed(4)} > A ${senkouA.toFixed(4)})` : "bullish — partial conflict with cloud type"}`,
      `Cloud bottom at ${cloudBottom.toFixed(4)}, ${Math.round((cloudBottom - close) * 10000)} pips above current close`,
    ];
    description = `A Tenkan-Kijun crossover below the cloud is a high-conviction sell signal. Price below the cloud confirms the directional filter. Consider shorts or reducing long exposure. The cloud bottom at ${cloudBottom.toFixed(4)} is the first resistance overhead — a reclaim of Kijun (${kijun.toFixed(4)}) would be the first sign the bearish setup is failing.`;

  } else if (inCloud && bearishCloud) {
    headline = "Inside Bearish Cloud — Resistance Zone";
    bullets = [
      `Price at ${close.toFixed(4)} — ${cloudDepthPct}% through a bearish cloud (B ${senkouB.toFixed(4)} > A ${senkouA.toFixed(4)})`,
      `Cloud ceiling: ${cloudTop.toFixed(4)} (+${Math.round((cloudTop - close) * 10000)} pips) · Cloud floor: ${cloudBottom.toFixed(4)} (−${Math.round((close - cloudBottom) * 10000)} pips)`,
      `Tenkan ${tenkan.toFixed(4)} ${tenkanAboveKijun ? ">" : "<"} Kijun ${kijun.toFixed(4)} — ${tenkanAboveKijun ? "short-term recovery attempt inside cloud" : "bearish TK confirms downside pressure"}`,
      `Cloud thickness: ${cloudThickPips} pips — ${cloudThickPips > 50 ? "thick resistance, breakout requires conviction" : "thin cloud, potential for quicker resolution"}`,
    ];
    description = `Price is trapped inside a bearish Ichimoku cloud (Senkou B above Senkou A). This is an unfavourable location — the cloud represents a zone of overhead supply and equilibrium resistance rather than support. The bearish cloud colour confirms the medium-term directional bias is downward. ${tenkanAboveKijun ? `The Tenkan crossing above Kijun (${tenkan.toFixed(4)} vs ${kijun.toFixed(4)}) represents only a short-term counter-thrust within the broader bearish structure — not a reliable buy signal while price remains inside the cloud.` : `With Tenkan below Kijun (${tenkan.toFixed(4)} vs ${kijun.toFixed(4)}), momentum is also bearish, adding pressure.`} A close above the cloud top (${cloudTop.toFixed(4)}) would be required to shift to a neutral-to-bullish bias; failing that, a close below the cloud floor (${cloudBottom.toFixed(4)}) resumes the full bearish structure and opens the next leg lower.`;

  } else if (inCloud && bullishCloud) {
    headline = "Inside Bullish Cloud — Support Zone";
    bullets = [
      `Price at ${close.toFixed(4)} — ${cloudDepthPct}% through a bullish cloud (A ${senkouA.toFixed(4)} > B ${senkouB.toFixed(4)})`,
      `Cloud ceiling: ${cloudTop.toFixed(4)} (+${Math.round((cloudTop - close) * 10000)} pips) · Cloud floor: ${cloudBottom.toFixed(4)} (−${Math.round((close - cloudBottom) * 10000)} pips)`,
      `Tenkan ${tenkan.toFixed(4)} ${tenkanAboveKijun ? ">" : "<"} Kijun ${kijun.toFixed(4)} — ${tenkanAboveKijun ? "bullish TK supports recovery" : "TK bearish — momentum weakening"}`,
      `Cloud thickness: ${cloudThickPips} pips — ${cloudThickPips > 50 ? "thick support zone, strong floor" : "thin cloud, watch for a break"}`,
    ];
    description = `Price has pulled back into a bullish Ichimoku cloud (Senkou A above Senkou B). The cloud is acting as a support zone — this is a normal retracement in an uptrend rather than a structural breakdown. ${tenkanAboveKijun ? `Tenkan above Kijun (${tenkan.toFixed(4)} vs ${kijun.toFixed(4)}) suggests the pullback is shallow and buyers may reassert.` : `However, Tenkan has crossed below Kijun (${tenkan.toFixed(4)} vs ${kijun.toFixed(4)}), flagging short-term momentum deterioration.`} A bounce and close back above the cloud top (${cloudTop.toFixed(4)}) would restore the bullish structure. A close below the cloud floor (${cloudBottom.toFixed(4)}) on a bearish cloud would signal a more significant trend reversal.`;

  } else if (aboveCloud) {
    headline = `Bullish — Above Cloud${!tenkanAboveKijun ? ", TK Caution" : ""}`;
    bullets = [
      `Price ${Math.round((close - cloudTop) * 10000)} pips above cloud top (${cloudTop.toFixed(4)})`,
      `Tenkan ${tenkan.toFixed(4)} ${tenkanAboveKijun ? ">" : "<"} Kijun ${kijun.toFixed(4)} — ${tenkanAboveKijun ? "momentum confirming" : "short-term weakness, watch for resolution"}`,
      `Cloud: ${bullishCloud ? `bullish (A ${senkouA.toFixed(4)} > B ${senkouB.toFixed(4)})` : "bearish — structural lag, monitor cloud flip"}`,
      `Cloud top support at ${cloudTop.toFixed(4)} · Thickness: ${cloudThickPips} pips`,
    ];
    description = `Price is above the cloud, maintaining a bullish structural context. ${!tenkanAboveKijun ? `Tenkan has crossed below Kijun (${tenkan.toFixed(4)} vs ${kijun.toFixed(4)}) — a short-term momentum warning. This may be a temporary pullback; watch for Tenkan to recross above Kijun before adding long exposure. The cloud top at ${cloudTop.toFixed(4)} is the first meaningful support.` : `Tenkan above Kijun (${tenkan.toFixed(4)} vs ${kijun.toFixed(4)}) confirms near-term momentum. Use pullbacks to Tenkan or the cloud top (${cloudTop.toFixed(4)}) as buying opportunities.`}`;

  } else {
    // belowCloud
    headline = `Bearish — Below Cloud${tenkanAboveKijun ? ", Counter-Trend Bounce" : ""}`;
    bullets = [
      `Price ${Math.round((cloudBottom - close) * 10000)} pips below cloud bottom (${cloudBottom.toFixed(4)})`,
      `Tenkan ${tenkan.toFixed(4)} ${tenkanAboveKijun ? ">" : "<"} Kijun ${kijun.toFixed(4)} — ${tenkanAboveKijun ? "short-term recovery, not a trend reversal" : "momentum confirming bearish bias"}`,
      `Cloud: ${bearishCloud ? `bearish (B ${senkouB.toFixed(4)} > A ${senkouA.toFixed(4)})` : "bullish — lag conflict, monitor cloud type"}`,
      `Cloud bottom resistance at ${cloudBottom.toFixed(4)} · Thickness: ${cloudThickPips} pips`,
    ];
    description = `Price is below the cloud, maintaining a bearish structural context. ${tenkanAboveKijun ? `Tenkan has crossed above Kijun (${tenkan.toFixed(4)} vs ${kijun.toFixed(4)}) — a short-term counter-trend recovery signal. Treat this as a potential bear-flag bounce rather than a reversal. The cloud bottom at ${cloudBottom.toFixed(4)} and the Kijun are the key resistance levels to watch — a close above both would begin to erode the bearish case.` : `Tenkan below Kijun (${tenkan.toFixed(4)} vs ${kijun.toFixed(4)}) confirms bearish momentum alignment. Rallies toward the Tenkan or cloud bottom at ${cloudBottom.toFixed(4)} are shorting opportunities while price remains below the cloud.`}`;
  }

  return { headline, bullets, description };
}

function buildKeltAnalysis(rows: SheetRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 3) return { headline: "Insufficient data", bullets: [], description: "" };

  const cur  = rows[rows.length - 1];
  const prev = rows[rows.length - 2];

  const { close, keltnerUpper: upper, keltnerMiddle: mid, keltnerLower: lower } = cur;
  const bandwidth   = upper - lower;
  const halfBand    = bandwidth / 2;
  const aboveUpper  = close > upper;
  const belowLower  = close < lower;
  const aboveMid    = close >= mid;
  const midRising   = cur.keltnerMiddle > prev.keltnerMiddle;
  const bandWidening = (cur.keltnerUpper - cur.keltnerLower) > (prev.keltnerUpper - prev.keltnerLower);

  let headline: string;
  let bullets: string[];
  let description: string;

  if (aboveUpper) {
    headline = "Breakout Above Upper Band";
    bullets = [
      `Close ${(((close - upper) / halfBand) * 100).toFixed(1)}% above upper band`,
      `Channel ${bandWidening ? "widening — momentum expanding" : "tightening — watch for reversal"}`,
      `Mid ${midRising ? "rising — trend supportive" : "flat — momentum may stall"}`,
    ];
    description = `Price has broken above the Keltner upper band, signalling strong bullish momentum. In trending markets this can persist as price "rides" the band. However, in range-bound conditions it often precedes a snap back to the middle. Monitor for a close back inside the band as an early reversal warning.`;
  } else if (belowLower) {
    headline = "Breakdown Below Lower Band";
    bullets = [
      `Close ${(((lower - close) / halfBand) * 100).toFixed(1)}% below lower band`,
      `Channel ${bandWidening ? "widening — selling accelerating" : "tightening — watch for bounce"}`,
      `Mid ${midRising ? "still rising — trend lag" : "declining — bearish structure"}`,
    ];
    description = `Price has broken below the Keltner lower band, indicating bearish momentum or an oversold extreme. In downtrends this can continue as price trails the lower band. In range conditions, watch for a reclaim of the lower band as a potential long setup. A close back inside the channel is required before shifting bias.`;
  } else if (aboveMid) {
    headline = "Bullish — Price in Upper Half of Channel";
    bullets = [
      `Close in upper half — ${(((close - mid) / halfBand) * 100).toFixed(1)}% above midline`,
      `Upper band at ${upper.toFixed(5)} — ${(((upper - close) / upper) * 100).toFixed(2)}% above close`,
      `Channel ${bandWidening ? "expanding" : "contracting"} · Mid ${midRising ? "rising" : "flat"}`,
    ];
    description = `Price is holding in the upper half of the Keltner channel, indicating mild bullish momentum. The midline is acting as dynamic support. A sustained hold here points to continuation toward the upper band. A break back below the midline would neutralise the short-term bias.`;
  } else {
    headline = "Bearish — Price in Lower Half of Channel";
    bullets = [
      `Close in lower half — ${(((mid - close) / halfBand) * 100).toFixed(1)}% below midline`,
      `Lower band at ${lower.toFixed(5)} — ${(((close - lower) / lower) * 100).toFixed(2)}% above close`,
      `Channel ${bandWidening ? "expanding" : "contracting"} · Mid ${midRising ? "rising — lag" : "declining"}`,
    ];
    description = `Price is holding in the lower half of the Keltner channel, indicating mild bearish pressure. The midline is acting as resistance. Watch for either a bounce and reclaim of the mid, or a continuation breakdown through the lower band. Until the midline is cleared, the near-term bias remains to the downside.`;
  }

  return { headline, bullets, description };
}

const MA_WINDOW = 20;

function MaPanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize = expanded ? 40 : MA_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset]         = useState(0);
  const [showClose,   setShowClose]  = useState(true);
  const [showEma9,    setShowEma9]   = useState(true);
  const [showEma20,   setShowEma20]  = useState(true);
  const [showEma50,   setShowEma50]  = useState(true);
  const [showEma200,  setShowEma200] = useState(true);
  const [showCandles, setShowCandles] = useState(false);
  const chartRef  = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState<{ w: number; h: number } | null>(null);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const data = useMemo(() => {
    const start = rows.length - windowSize - offset;
    const end   = rows.length - offset;
    const slice = rows.slice(Math.max(0, start), end);
    return slice.map((r, i) => {
      const parts    = r.date.split("-");
      const monthIdx = parseInt(parts[1]) - 1;
      const prevMonth = i > 0 ? parseInt(slice[i-1].date.split("-")[1]) - 1 : -1;
      return {
        idx:    i,
        date:   parseInt(parts[2]).toString(),
        month:  monthIdx !== prevMonth ? MONTHS[monthIdx] : "",
        open:   r.open,
        high:   r.high,
        low:    r.low,
        close:  r.close,
        ema9:   r.ema9,
        ema20:  r.ema20,
        ema50:  r.ema50,
        ema200: r.ema200,
        sma20:  r.sma20,
        sma50:  r.sma50,
        sma200: r.sma200,
      };
    });
  }, [rows, offset, windowSize]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 60 : 44;
  const analysis   = useMemo(() => expanded ? buildMaAnalysis(rows) : null, [rows, expanded]);

  const TOGGLES = [
    { key: "close",  label: "Close",  color: "rgba(255,255,255,0.7)", on: showClose,  set: setShowClose  },
    { key: "ema9",   label: "EMA9",   color: "#f472b6",               on: showEma9,   set: setShowEma9   },
    { key: "ema20",  label: "EMA20",  color: "#60a5fa",               on: showEma20,  set: setShowEma20  },
    { key: "ema50",  label: "EMA50",  color: "#f59e0b",               on: showEma50,  set: setShowEma50  },
    { key: "ema200", label: "EMA200", color: "#60a5fa",               on: showEma200, set: setShowEma200 },
  ] as const;

  const yDomain = useMemo(() => {
    const vals: number[] = [];
    data.forEach(d => {
      if (showClose) { vals.push(d.high); vals.push(d.low); }
      if (showEma9)   vals.push(d.ema9);
      if (showEma20)  vals.push(d.ema20);
      if (showEma50)  vals.push(d.ema50);
      if (showEma200) vals.push(d.ema200);
    });
    if (!vals.length) return ["auto", "auto"] as const;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.15;
    return [min - pad, max + pad] as const;
  }, [data, showClose, showEma9, showEma20, showEma50, showEma200]);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setChartSize({ w: r.width, h: r.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* AI analysis — expanded only */}
      {expanded && analysis && (
        <div className="shrink-0 flex" style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex flex-col items-center justify-center px-5 py-2.5" style={{ flex: "0 0 50%", minWidth: 0, maxWidth: "50%" }}>
            <ul className="flex flex-col gap-0.5 text-center">
              {analysis.bullets.map((b, i) => (
                <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{b}</li>
              ))}
            </ul>
          </div>
          <div style={{ width: 1, background: "var(--border-medium)", alignSelf: "stretch", margin: "8px 0" }} />
          <div className="flex-1 flex items-center justify-center px-5 py-2.5">
            <p className="text-[11px] leading-relaxed text-center" style={{ color: "var(--text-secondary)" }}>{analysis.description}</p>
          </div>
        </div>
      )}

      {/* Toggle badges */}
      <div className="shrink-0 flex items-center gap-1.5 px-2 pt-1" style={{ paddingLeft: yAxisWidth }}>
        {TOGGLES.map(({ key, label, color, on, set }) => (
          <button
            key={key}
            onClick={() => set(v => !v)}
            className="flex items-center gap-1 rounded-full cursor-pointer"
            style={{
              fontSize: expanded ? 10 : 8,
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: expanded ? "2px 8px" : "1px 6px",
              border: `1px solid ${on ? color + "66" : "rgba(255,255,255,0.10)"}`,
              background: on ? color + "18" : "transparent",
              color: on ? color : "var(--text-muted)",
              transition: "all 0.15s",
            }}
          >
            <span style={{ width: expanded ? 6 : 5, height: expanded ? 6 : 5, borderRadius: "50%", background: on ? color : "var(--text-muted)", flexShrink: 0 }} />
            {label}
          </button>
        ))}
        {expanded && (
          <button
            onClick={() => setShowCandles(v => !v)}
            className="flex items-center gap-1 rounded-full cursor-pointer"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: "2px 8px",
              marginLeft: 6,
              border: `1px solid ${showCandles ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.10)"}`,
              background: showCandles ? "rgba(255,255,255,0.08)" : "transparent",
              color: showCandles ? "var(--text-primary)" : "var(--text-muted)",
              transition: "all 0.15s",
            }}
          >
            {showCandles ? "Candles" : "Line"}
          </button>
        )}
      </div>

      {/* Chart */}
      <div ref={chartRef} className="flex-1 min-h-0" style={{ position: "relative" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <XAxis dataKey="idx" type="number" domain={[0, data.length - 1]} hide />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={yDomain} tickFormatter={v => v.toFixed(4)} />
            <Tooltip content={<MaTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} position={{ x: 10, y: 10 }} />
            {showClose && !showCandles && <Line dataKey="close"  name="Close"  type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="rgba(255,255,255,0.55)" isAnimationActive={false} />}
            {showEma9   && <Line dataKey="ema9"   name="EMA9"   type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#f472b6" isAnimationActive={false} />}
            {showEma20  && <Line dataKey="ema20"  name="EMA20"  type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#60a5fa" isAnimationActive={false} />}
            {showEma50  && <Line dataKey="ema50"  name="EMA50"  type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#f59e0b" isAnimationActive={false} />}
            {showEma200 && <Line dataKey="ema200" name="EMA200" type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5} stroke="#60a5fa" isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>

        {/* Candle overlay — absolutely positioned SVG */}
        {showClose && showCandles && chartSize && (() => {
          const plotLeft   = yAxisWidth;
          const plotTop    = 4;
          const plotWidth  = chartSize.w - yAxisWidth - 6;
          const plotHeight = chartSize.h - plotTop;
          const [yMin, yMax] = yDomain as [number, number];
          if (typeof yMin !== "number" || typeof yMax !== "number" || yMax === yMin) return null;
          const totalPoints = data.length;
          const xPx = (idx: number) => plotLeft + (idx / Math.max(totalPoints - 1, 1)) * plotWidth;
          const yPx = (val: number) => plotTop + ((yMax - val) / (yMax - yMin)) * plotHeight;
          const candleW = Math.max(2, Math.floor((plotWidth / Math.max(totalPoints - 1, 1)) * 0.6));
          return (
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
              {data.map(d => {
                const bull  = d.close >= d.open;
                const color = bull ? "#60a5fa" : "#a78bfa";
                const cx    = xPx(d.idx);
                const oY    = yPx(d.open);
                const cY    = yPx(d.close);
                const hY    = yPx(d.high);
                const lY    = yPx(d.low);
                const bodyTop = Math.min(oY, cY);
                const bodyH   = Math.max(1, Math.abs(cY - oY));
                return (
                  <g key={d.idx}>
                    <line x1={cx} y1={hY} x2={cx} y2={lY} stroke={color} strokeWidth={1} />
                    <rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} stroke={color} strokeWidth={1} />
                  </g>
                );
              })}
            </svg>
          );
        })()}
      </div>

      {/* Slider */}
      {maxOffset > 0 && (
        <input
          type="range"
          className="momentum-scroll"
          min={0}
          max={maxOffset}
          value={offset}
          onChange={e => setOffset(Number(e.target.value))}
          style={{ direction: "rtl" }}
        />
      )}

      {/* Date labels */}
      <div className="flex flex-col shrink-0 pb-1" style={{ paddingLeft: yAxisWidth, paddingRight: 6 }}>
        <div className="flex justify-between">
          {data.map((d, i) => (
            <span key={i} style={{ fontSize: tickStyle.fontSize, color: "var(--text-muted)" }}>{d.date}</span>
          ))}
        </div>
        <div className="flex">
          {data.reduce<{ month: string; count: number }[]>((acc, d) => {
            if (d.month) acc.push({ month: d.month, count: 1 });
            else if (acc.length) acc[acc.length - 1].count++;
            return acc;
          }, []).map((g, i) => (
            <div key={i} className="text-center" style={{ flex: g.count, fontSize: tickStyle.fontSize, color: "var(--text-muted)", fontWeight: 700 }}>
              {g.month}
            </div>
          ))}
        </div>
      </div>

      {/* Indicator glossary — expanded only */}
      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#f472b6",               name: "EMA9",   body: "9-period Exponential Moving Average. The fastest line, highly responsive to recent price action. Acts as dynamic short-term support in uptrends and resistance in downtrends. A close below EMA9 in an uptrend is often the first warning of weakness." },
            { color: "#60a5fa",               name: "EMA20",  body: "20-period Exponential Moving Average. A responsive short-to-medium-term trend filter. Because EMAs weight recent prices more heavily than SMAs, EMA20 reacts faster to price changes. Price holding above EMA20 in an uptrend confirms short-term bullish structure; a sustained break below is an early warning of trend weakness." },
            { color: "#f59e0b",               name: "EMA50",  body: "50-period Exponential Moving Average. The primary medium-term trend reference. Faster-reacting than SMA50, it gives earlier signals on trend changes. Institutional traders watch EMA50 closely — a price cross above or below this level often triggers significant order flow. Uptrends require price above EMA50." },
            { color: "#60a5fa",               name: "EMA200", body: "200-period Exponential Moving Average. The long-term trend anchor. Price above EMA200 = bull market context; below = bear market. The EMA200 golden cross (EMA50 crossing above EMA200) and death cross (EMA50 crossing below) are widely followed structural signals — EMA versions react faster than their SMA equivalents." },
          ].map((item, i, arr) => (
            <div key={item.name} className="flex-1 flex flex-col gap-1 px-3 py-2.5" style={{ borderRight: i < arr.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
              <div className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <span className="text-[10px] font-bold" style={{ color: item.color }}>{item.name}</span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ADX_WINDOW = 20;

function AdxPanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize = expanded ? 40 : ADX_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset]         = useState(0);
  const [showDiPlus,  setShowDiPlus]  = useState(true);
  const [showDiMinus, setShowDiMinus] = useState(true);
  const [showAdx,     setShowAdx]     = useState(true);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const data = useMemo(() => {
    const start = rows.length - windowSize - offset;
    const end   = rows.length - offset;
    const slice = rows.slice(Math.max(0, start), end);
    return slice.map((r, i) => {
      const parts     = r.date.split("-");
      const monthIdx  = parseInt(parts[1]) - 1;
      const prevMonth = i > 0 ? parseInt(slice[i-1].date.split("-")[1]) - 1 : -1;
      return {
        idx:     i,
        date:    parseInt(parts[2]).toString(),
        month:   monthIdx !== prevMonth ? MONTHS[monthIdx] : "",
        diPlus:  r.diPlus,
        diMinus: r.diMinus,
        adx:     r.adx,
      };
    });
  }, [rows, offset, windowSize]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 44 : 32;
  const analysis   = useMemo(() => expanded ? buildAdxAnalysis(rows) : null, [rows, expanded]);

  const TOGGLES = [
    { key: "diPlus",  label: "+DI",  color: "#60a5fa", on: showDiPlus,  set: setShowDiPlus  },
    { key: "diMinus", label: "−DI",  color: "#a78bfa", on: showDiMinus, set: setShowDiMinus },
    { key: "adx",     label: "ADX",  color: "#a78bfa", on: showAdx,     set: setShowAdx     },
  ] as const;

  const yDomain = useMemo(() => {
    const vals: number[] = [];
    data.forEach(d => {
      if (showDiPlus)  vals.push(d.diPlus);
      if (showDiMinus) vals.push(d.diMinus);
      if (showAdx)     vals.push(d.adx);
    });
    if (!vals.length) return [0, 60] as const;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.15;
    return [Math.max(0, min - pad), max + pad] as const;
  }, [data, showDiPlus, showDiMinus, showAdx]);

  return (
    <div className="flex flex-col h-full">
      {/* AI analysis — expanded only */}
      {expanded && analysis && (
        <div className="shrink-0 flex" style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex flex-col items-center justify-center px-5 py-2.5" style={{ flex: "0 0 50%", minWidth: 0, maxWidth: "50%" }}>
            <ul className="flex flex-col gap-0.5 text-center">
              {analysis.bullets.map((b, i) => (
                <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{b}</li>
              ))}
            </ul>
          </div>
          <div style={{ width: 1, background: "var(--border-medium)", alignSelf: "stretch", margin: "8px 0" }} />
          <div className="flex-1 flex items-center justify-center px-5 py-2.5">
            <p className="text-[11px] leading-relaxed text-center" style={{ color: "var(--text-secondary)" }}>{analysis.description}</p>
          </div>
        </div>
      )}

      {/* Toggle badges */}
      <div className="shrink-0 flex items-center gap-1.5 px-2 pt-1" style={{ paddingLeft: yAxisWidth }}>
        {TOGGLES.map(({ key, label, color, on, set }) => (
          <button
            key={key}
            onClick={() => set(v => !v)}
            className="flex items-center gap-1 rounded-full cursor-pointer"
            style={{
              fontSize: expanded ? 10 : 8,
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: expanded ? "2px 8px" : "1px 6px",
              border: `1px solid ${on ? color + "66" : "rgba(255,255,255,0.10)"}`,
              background: on ? color + "18" : "transparent",
              color: on ? color : "var(--text-muted)",
              transition: "all 0.15s",
            }}
          >
            <span style={{ width: expanded ? 6 : 5, height: expanded ? 6 : 5, borderRadius: "50%", background: on ? color : "var(--text-muted)", flexShrink: 0 }} />
            {label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <XAxis dataKey="idx" type="number" domain={[0, data.length - 1]} hide />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={yDomain} tickFormatter={v => v.toFixed(1)} />
            <Tooltip content={<MaTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} position={{ x: 10, y: 10 }} />
            <ReferenceLine y={25} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="3 3" />
            <ReferenceLine y={40} stroke="rgba(255,255,255,0.10)" strokeWidth={1} strokeDasharray="2 4" />
            {showDiPlus  && <Line dataKey="diPlus"  name="+DI" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#60a5fa" isAnimationActive={false} />}
            {showDiMinus && <Line dataKey="diMinus" name="−DI" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#a78bfa" isAnimationActive={false} />}
            {showAdx     && <Line dataKey="adx"     name="ADX" type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5} stroke="#a78bfa" isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Slider */}
      {maxOffset > 0 && (
        <input
          type="range"
          className="momentum-scroll"
          min={0}
          max={maxOffset}
          value={offset}
          onChange={e => setOffset(Number(e.target.value))}
          style={{ direction: "rtl" }}
        />
      )}

      {/* Date labels */}
      <div className="flex flex-col shrink-0 pb-1" style={{ paddingLeft: yAxisWidth, paddingRight: 6 }}>
        <div className="flex justify-between">
          {data.map((d, i) => (
            <span key={i} style={{ fontSize: tickStyle.fontSize, color: "var(--text-muted)" }}>{d.date}</span>
          ))}
        </div>
        <div className="flex">
          {data.reduce<{ month: string; count: number }[]>((acc, d) => {
            if (d.month) acc.push({ month: d.month, count: 1 });
            else if (acc.length) acc[acc.length - 1].count++;
            return acc;
          }, []).map((g, i) => (
            <div key={i} className="text-center" style={{ flex: g.count, fontSize: tickStyle.fontSize, color: "var(--text-muted)", fontWeight: 700 }}>
              {g.month}
            </div>
          ))}
        </div>
      </div>

      {/* Indicator glossary — expanded only */}
      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#60a5fa", name: "+DI (14)", body: "The Positive Directional Indicator measures the strength of upward price movement over 14 periods. When +DI is above −DI, bulls are in control of directional movement. A rising +DI confirms strengthening upside pressure; a falling +DI warns that bullish momentum is fading." },
            { color: "#a78bfa", name: "−DI (14)", body: "The Negative Directional Indicator measures the strength of downward price movement. When −DI is above +DI, bears dominate. A rising −DI signals increasing selling pressure. A crossover of −DI above +DI with ADX above 25 is a classic bearish trend entry signal." },
            { color: "#a78bfa", name: "ADX",      body: "The Average Directional Index measures trend strength, not direction — it rises in both up and downtrends. ADX below 20 = ranging market (avoid trend signals). ADX above 25 = trending. ADX above 40 = strong trend. A rising ADX confirms a trend is developing; a falling ADX signals the trend is fading regardless of direction." },
          ].map((item, i, arr) => (
            <div key={item.name} className="flex-1 flex flex-col gap-1 px-3 py-2.5" style={{ borderRight: i < arr.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
              <div className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <span className="text-[10px] font-bold" style={{ color: item.color }}>{item.name}</span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ICHI_WINDOW = 20;
const ICHI_SHIFT  = 26; // Senkou spans plotted 26 bars forward; Chikou plotted 26 bars back

function IchiPanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize  = expanded ? 40 : ICHI_WINDOW;
  const totalPoints = windowSize + ICHI_SHIFT; // price window + cloud projection zone
  const maxOffset   = Math.max(0, rows.length - windowSize);
  const [offset, setOffset]           = useState(0);
  const [showClose,   setShowClose]   = useState(true);
  const [showTenkan,  setShowTenkan]  = useState(true);
  const [showKijun,   setShowKijun]   = useState(true);
  const [showSenkouA, setShowSenkouA] = useState(true);
  const [showSenkouB, setShowSenkouB] = useState(true);
  const [showChikou,  setShowChikou]  = useState(true);
  const [showCandles, setShowCandles] = useState(false);
  const chartRef  = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState<{ w: number; h: number } | null>(null);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const data = useMemo(() => {
    const end   = rows.length - offset;
    const start = Math.max(0, end - windowSize);

    const built = Array.from({ length: totalPoints }, (_, i) => {
      // Price row — only for the first windowSize positions
      const priceIdx = start + i;
      const priceRow = (i < windowSize && priceIdx < rows.length) ? rows[priceIdx] : null;

      // Cloud row — Senkou A/B are computed at cloudIdx but displayed here (26 bars forward)
      const cloudIdx = start - ICHI_SHIFT + i;
      const cloudRow = (cloudIdx >= 0 && cloudIdx < rows.length) ? rows[cloudIdx] : null;

      // Chikou — current close plotted 26 bars back: at position i we show close from priceIdx+26
      const chikouIdx = priceIdx + ICHI_SHIFT;
      const chikouRow = (i < windowSize && chikouIdx < rows.length) ? rows[chikouIdx] : null;

      const refRow   = priceRow ?? cloudRow;
      const parts    = refRow ? refRow.date.split("-") : null;
      const monthIdx = (priceRow && parts) ? parseInt(parts[1]) - 1 : -1;

      return {
        idx:            i,
        date:           (priceRow && parts) ? parseInt(parts[2]).toString() : "",
        monthIdx,
        open:           priceRow  ? priceRow.open    : undefined,
        high:           priceRow  ? priceRow.high    : undefined,
        low:            priceRow  ? priceRow.low     : undefined,
        close:          priceRow  ? priceRow.close   : undefined,
        tenkan:         priceRow  ? priceRow.tenkan  : undefined,
        kijun:          priceRow  ? priceRow.kijun   : undefined,
        senkouA:        cloudRow && cloudRow.senkouA > 0 ? cloudRow.senkouA : undefined,
        senkouB:        cloudRow && cloudRow.senkouB > 0 ? cloudRow.senkouB : undefined,
        senkouExtended: false,
        chikou:         chikouRow ? chikouRow.close  : undefined,
      };
    }).map((d, i, arr) => ({
      ...d,
      month: d.monthIdx >= 0 && (i === 0 || d.monthIdx !== arr[i - 1].monthIdx)
        ? MONTHS[d.monthIdx] : "",
    }));

    // Extend Senkou A/B leftward so lines reach the first visible date (marked as extended — excluded from cloud fill)
    for (let i = built.length - 2; i >= 0; i--) {
      if (built[i].senkouA == null && built[i + 1].senkouA != null) {
        built[i] = { ...built[i], senkouA: built[i + 1].senkouA, senkouB: built[i + 1].senkouB, senkouExtended: true };
      }
    }
    return built;
  }, [rows, offset, windowSize, totalPoints]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 60 : 44;
  const analysis   = useMemo(() => expanded ? buildIchiAnalysis(rows) : null, [rows, expanded]);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setChartSize({ w: r.width, h: r.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const TOGGLES = [
    { key: "close",   label: "Close",    color: "rgba(255,255,255,0.7)", on: showClose,   set: setShowClose   },
    { key: "tenkan",  label: "Tenkan",   color: "#60a5fa",               on: showTenkan,  set: setShowTenkan  },
    { key: "kijun",   label: "Kijun",    color: "#f472b6",               on: showKijun,   set: setShowKijun   },
    { key: "senkouA", label: "Senkou A", color: "#60a5fa",               on: showSenkouA, set: setShowSenkouA },
    { key: "senkouB", label: "Senkou B", color: "#a78bfa",               on: showSenkouB, set: setShowSenkouB },
    { key: "chikou",  label: "Chikou",   color: "#a78bfa",               on: showChikou,  set: setShowChikou  },
  ] as const;

  const yDomain = useMemo(() => {
    const vals: number[] = [];
    data.forEach(d => {
      if (showClose && showCandles) {
        if (d.high != null) vals.push(d.high);
        if (d.low  != null) vals.push(d.low);
      } else if (showClose && d.close != null) {
        vals.push(d.close);
      }
      if (showTenkan  && d.tenkan  != null) vals.push(d.tenkan);
      if (showKijun   && d.kijun   != null) vals.push(d.kijun);
      if (showSenkouA && d.senkouA != null) vals.push(d.senkouA);
      if (showSenkouB && d.senkouB != null) vals.push(d.senkouB);
      if (showChikou  && d.chikou  != null) vals.push(d.chikou);
    });
    if (!vals.length) return ["auto", "auto"] as const;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.15;
    return [min - pad, max + pad] as const;
  }, [data, showClose, showCandles, showTenkan, showKijun, showSenkouA, showSenkouB, showChikou]);

  return (
    <div className="flex flex-col h-full">
      {/* AI analysis — expanded only */}
      {expanded && analysis && (
        <div className="shrink-0 flex" style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex flex-col items-center justify-center px-5 py-2.5" style={{ flex: "0 0 50%", minWidth: 0, maxWidth: "50%" }}>
            <ul className="flex flex-col gap-0.5 text-center">
              {analysis.bullets.map((b, i) => (
                <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{b}</li>
              ))}
            </ul>
          </div>
          <div style={{ width: 1, background: "var(--border-medium)", alignSelf: "stretch", margin: "8px 0" }} />
          <div className="flex-1 flex items-center justify-center px-5 py-2.5">
            <p className="text-[11px] leading-relaxed text-center" style={{ color: "var(--text-secondary)" }}>{analysis.description}</p>
          </div>
        </div>
      )}

      {/* Toggle badges */}
      <div className="shrink-0 flex items-center gap-1.5 px-2 pt-1" style={{ paddingLeft: yAxisWidth }}>
        {TOGGLES.map(({ key, label, color, on, set }) => (
          <button
            key={key}
            onClick={() => set(v => !v)}
            className="flex items-center gap-1 rounded-full cursor-pointer"
            style={{
              fontSize: expanded ? 10 : 8,
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: expanded ? "2px 8px" : "1px 6px",
              border: `1px solid ${on ? color + "66" : "rgba(255,255,255,0.10)"}`,
              background: on ? color + "18" : "transparent",
              color: on ? color : "var(--text-muted)",
              transition: "all 0.15s",
            }}
          >
            <span style={{ width: expanded ? 6 : 5, height: expanded ? 6 : 5, borderRadius: "50%", background: on ? color : "var(--text-muted)", flexShrink: 0 }} />
            {label}
          </button>
        ))}
        {expanded && (
          <button
            onClick={() => setShowCandles(v => !v)}
            className="flex items-center gap-1 rounded-full cursor-pointer"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: "2px 8px",
              marginLeft: 6,
              border: `1px solid ${showCandles ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.10)"}`,
              background: showCandles ? "rgba(255,255,255,0.08)" : "transparent",
              color: showCandles ? "var(--text-primary)" : "var(--text-muted)",
              transition: "all 0.15s",
            }}
          >
            {showCandles ? "Candles" : "Line"}
          </button>
        )}
      </div>

      {/* Chart */}
      <div ref={chartRef} className="flex-1 min-h-0" style={{ position: "relative" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <XAxis dataKey="idx" type="number" domain={[0, totalPoints - 1]} hide />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={yDomain} tickFormatter={v => v.toFixed(4)} />
            <Tooltip content={<MaTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} position={{ x: 10, y: 10 }} />
            {/* Senkou spans — dashed */}
            {showSenkouB && <Line dataKey="senkouB" name="Senkou B" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#a78bfa" strokeDasharray="3 2" isAnimationActive={false} connectNulls={false} />}
            {showSenkouA && <Line dataKey="senkouA" name="Senkou A" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#60a5fa" strokeDasharray="3 2" isAnimationActive={false} connectNulls={false} />}
            {/* Chikou — close plotted 26 bars back */}
            {showChikou  && <Line dataKey="chikou"  name="Chikou"  type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#a78bfa" strokeDasharray="2 3" isAnimationActive={false} connectNulls={false} />}
            {/* Current-bar lines */}
            {showKijun   && <Line dataKey="kijun"   name="Kijun"   type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#f472b6" isAnimationActive={false} connectNulls={false} />}
            {showTenkan  && <Line dataKey="tenkan"  name="Tenkan"  type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#60a5fa" isAnimationActive={false} connectNulls={false} />}
            {showClose && !showCandles && <Line dataKey="close" name="Close" type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5} stroke="rgba(255,255,255,0.75)" isAnimationActive={false} connectNulls={false} />}
          </ComposedChart>
        </ResponsiveContainer>

        {/* Cloud fill + candle overlay — absolutely positioned SVG, no Recharts internals needed */}
        {chartSize && (() => {
          const plotLeft   = yAxisWidth;
          const plotTop    = 4;
          const plotWidth  = chartSize.w - yAxisWidth - 6;
          const plotHeight = chartSize.h - plotTop;
          const [yMin, yMax] = yDomain as [number, number];
          if (typeof yMin !== 'number' || typeof yMax !== 'number' || yMax === yMin) return null;
          const xPx = (idx: number) => plotLeft + (idx / (totalPoints - 1)) * plotWidth;
          const yPx = (val: number) => plotTop + ((yMax - val) / (yMax - yMin)) * plotHeight;

          type Pt = { idx: number; top: number; bot: number };
          const bullSegs: Pt[][] = [];
          const bearSegs: Pt[][] = [];
          let curBull: Pt[] = [];
          let curBear: Pt[] = [];
          if (showSenkouA || showSenkouB) {
            data.forEach(d => {
              if (d.senkouA == null || d.senkouB == null || d.senkouExtended) {
                if (curBull.length) { bullSegs.push(curBull); curBull = []; }
                if (curBear.length) { bearSegs.push(curBear); curBear = []; }
                return;
              }
              const top = Math.max(d.senkouA, d.senkouB);
              const bot = Math.min(d.senkouA, d.senkouB);
              if (d.senkouA >= d.senkouB) {
                if (curBear.length) { bearSegs.push(curBear); curBear = []; }
                curBull.push({ idx: d.idx, top, bot });
              } else {
                if (curBull.length) { bullSegs.push(curBull); curBull = []; }
                curBear.push({ idx: d.idx, top, bot });
              }
            });
            if (curBull.length) bullSegs.push(curBull);
            if (curBear.length) bearSegs.push(curBear);
          }
          const makePath = (seg: Pt[]) => {
            if (seg.length < 1) return "";
            const top = seg.map(p => `${xPx(p.idx).toFixed(1)},${yPx(p.top).toFixed(1)}`).join(" L ");
            const bot = [...seg].reverse().map(p => `${xPx(p.idx).toFixed(1)},${yPx(p.bot).toFixed(1)}`).join(" L ");
            return `M ${top} L ${bot} Z`;
          };

          const candleW = Math.max(2, Math.floor((plotWidth / (totalPoints - 1)) * 0.6));

          return (
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "hidden" }}>
              {bullSegs.map((seg, i) => <path key={`bull${i}`} d={makePath(seg)} fill="rgba(96,165,250,0.22)"  stroke="none" />)}
              {bearSegs.map((seg, i) => <path key={`bear${i}`} d={makePath(seg)} fill="rgba(167,139,250,0.22)" stroke="none" />)}
              {showClose && showCandles && expanded && data.map(d => {
                if (d.open == null || d.high == null || d.low == null || d.close == null) return null;
                const bull    = d.close >= d.open;
                const color   = bull ? "#60a5fa" : "#a78bfa";
                const cx      = xPx(d.idx);
                const bodyTop = yPx(Math.max(d.open, d.close));
                const bodyBot = yPx(Math.min(d.open, d.close));
                const bodyH   = Math.max(1, bodyBot - bodyTop);
                return (
                  <g key={`c${d.idx}`}>
                    <line x1={cx} x2={cx} y1={yPx(d.high)} y2={yPx(d.low)} stroke={color} strokeWidth={1} opacity={0.7} />
                    <rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={bull ? "#60a5fa" : "#a78bfa"} stroke={color} strokeWidth={1} />
                  </g>
                );
              })}
            </svg>
          );
        })()}
      </div>

      {/* Slider */}
      {maxOffset > 0 && (
        <input
          type="range"
          className="momentum-scroll"
          min={0}
          max={maxOffset}
          value={offset}
          onChange={e => setOffset(Number(e.target.value))}
          style={{ direction: "rtl" }}
        />
      )}

      {/* Date labels — only for price positions (0..windowSize-1); last 26 slots are the cloud projection zone */}
      <div className="flex flex-col shrink-0 pb-1" style={{ paddingLeft: yAxisWidth, paddingRight: 6 }}>
        <div className="flex justify-between">
          {data.map((d, i) => (
            <span key={i} style={{ fontSize: tickStyle.fontSize, color: i < windowSize ? "var(--text-muted)" : "transparent" }}>{d.date || " "}</span>
          ))}
        </div>
        <div className="flex">
          {data.reduce<{ month: string; count: number }[]>((acc, d) => {
            if (d.month) acc.push({ month: d.month, count: 1 });
            else if (acc.length) acc[acc.length - 1].count++;
            return acc;
          }, []).map((g, i) => (
            <div key={i} className="text-center" style={{ flex: g.count, fontSize: tickStyle.fontSize, color: "var(--text-muted)", fontWeight: 700 }}>
              {g.month}
            </div>
          ))}
        </div>
      </div>

      {/* Indicator glossary — expanded only */}
      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#60a5fa",               name: "Tenkan",   body: "Conversion Line: (9-period high + low) ÷ 2. Plotted at the current bar. Short-term momentum — a TK cross above Kijun is a bullish entry signal. Acts as near-term support in uptrends." },
            { color: "#f472b6",               name: "Kijun",    body: "Base Line: (26-period high + low) ÷ 2. Plotted at the current bar. Medium-term trend anchor and the most important Ichimoku S/R level. Price above Kijun = bullish; below = bearish." },
            { color: "#60a5fa",               name: "Senkou A", body: "Leading Span A: (Tenkan + Kijun) ÷ 2, plotted 26 bars FORWARD. Forms the faster cloud boundary. When A > B the cloud is bullish. The projected cloud ahead shows anticipated support and resistance." },
            { color: "#a78bfa",               name: "Senkou B", body: "Leading Span B: (52-period high + low) ÷ 2, plotted 26 bars FORWARD. The slower, stronger cloud boundary. When B > A the cloud is bearish. Thicker cloud = stronger S/R zone. Projected cloud gives a look 26 bars ahead." },
            { color: "#a78bfa",               name: "Chikou",   body: "Lagging Span: today's close plotted 26 bars BACK. Confirms trend by comparing current close to historical price. Chikou above price from 26 bars ago = bullish; below = bearish. It stops 26 bars before the current bar since future data is unavailable." },
          ].map((item, i, arr) => (
            <div key={item.name} className="flex-1 flex flex-col gap-1 px-3 py-2.5" style={{ borderRight: i < arr.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
              <div className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <span className="text-[10px] font-bold" style={{ color: item.color }}>{item.name}</span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SESSION_WINDOW = 20;

function buildSessionAnalysis(rows: SheetRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 2) return { headline: "—", bullets: [], description: "—" };
  const cur  = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const pctChange = ((cur.close - prev.close) / prev.close) * 100;
  const gap       = ((cur.open  - prev.close) / prev.close) * 100;
  const bodyPct   = cur.high !== cur.low ? Math.abs(cur.close - cur.open) / (cur.high - cur.low) * 100 : 0;
  const rangePips = Math.round((cur.high - cur.low) * 10000);
  const bullish   = cur.close >= cur.open;
  let streak = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if ((rows[i].close >= rows[i].open) === bullish) streak++; else break;
  }
  const sign = pctChange >= 0 ? "+" : "";
  const bullets = [
    `${sign}${pctChange.toFixed(3)}% session change · prev close ${prev.close.toFixed(4)}`,
    Math.abs(gap) > 0.003
      ? `${gap > 0 ? "Gap up" : "Gap down"} ${Math.abs(gap).toFixed(3)}% from prior close`
      : `Near-flat open — ${Math.abs(gap).toFixed(3)}% gap from prior close`,
    `${rangePips} pip range · ${bodyPct.toFixed(0)}% body fill`,
    cur.insideBar
      ? "Inside bar — contained within prior session's range"
      : `${streak} consecutive ${bullish ? "bullish" : "bearish"} session${streak !== 1 ? "s" : ""}`,
  ];
  let headline: string, description: string;
  if (cur.insideBar) {
    headline    = "Inside Bar — Volatility Contraction";
    description = `Today's session formed an inside bar, printing entirely within the prior day's high–low range. This signals a pause in directional momentum as the market consolidates. Inside bars often resolve sharply in the direction of the prevailing trend — watch for a breakout above ${cur.high.toFixed(4)} or below ${cur.low.toFixed(4)} as a trigger. The ${bodyPct.toFixed(0)}% body fill suggests ${bodyPct > 50 ? "moderate conviction within the contraction" : "indecision — neither side committed"}.`;
  } else if (Math.abs(pctChange) > 0.5) {
    if (bullish) {
      headline    = "Strong Bullish Session";
      description = `A decisive ${pctChange.toFixed(3)}% advance with a ${bodyPct.toFixed(0)}% body fill reflects strong buying conviction. Buyers controlled the full ${rangePips}-pip range.${gap > 0.01 ? ` A ${gap.toFixed(3)}% gap up opened the session with immediate bullish intent.` : ""} The session open at ${cur.open.toFixed(4)} now acts as near-term support — pullbacks toward that level are likely to attract buyers.`;
    } else {
      headline    = "Strong Bearish Session";
      description = `A ${Math.abs(pctChange).toFixed(3)}% decline with a ${bodyPct.toFixed(0)}% body fill signals dominant selling pressure. Bears held control across the ${rangePips}-pip session range.${gap < -0.01 ? ` A ${Math.abs(gap).toFixed(3)}% gap down deepened the bearish tone.` : ""} The session open at ${cur.open.toFixed(4)} now acts as near-term resistance — intraday rallies toward that level are likely to find sellers.`;
    }
  } else if (Math.abs(pctChange) > 0.10) {
    headline    = bullish ? "Moderate Bullish Session" : "Moderate Bearish Session";
    description = `A moderate ${sign}${pctChange.toFixed(3)}% session across a ${rangePips}-pip range. The ${bodyPct.toFixed(0)}% body fill reflects ${bodyPct > 60 ? "solid" : "mixed"} directional follow-through. ${streak > 2 ? `This extends a ${streak}-session ${bullish ? "rally" : "decline"} — watch for exhaustion signals near key levels.` : "No strong streak in play — the session adds modest weight to the current directional bias."}`;
  } else {
    headline    = "Indecision — Narrow Session";
    description = `A tight ${sign}${pctChange.toFixed(3)}% move with a ${bodyPct.toFixed(0)}% body fill reflects market indecision. The compressed ${rangePips}-pip range signals low conviction from both sides. Await a directional close outside today's range (above ${cur.high.toFixed(4)} or below ${cur.low.toFixed(4)}) before committing to a bias.`;
  }
  return { headline, bullets, description };
}

function SessionPanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize = expanded ? 40 : SESSION_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize - 1);
  const [offset, setOffset] = useState(0);
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const data = useMemo(() => {
    const end   = rows.length - offset;
    const start = Math.max(1, end - windowSize);
    return rows.slice(start, end).map((r, i) => {
      const prevClose = rows[start + i - 1].close;
      const pctChange = ((r.close - prevClose) / prevClose) * 100;
      const gap       = ((r.open  - prevClose) / prevClose) * 100;
      const bodyPct   = r.high !== r.low ? Math.abs(r.close - r.open) / (r.high - r.low) * 100 : 0;
      const rangePips = Math.round((r.high - r.low) * 10000);
      const parts     = r.date.split("-");
      const monthIdx  = parseInt(parts[1]) - 1;
      return { pctChange, gap, bodyPct, rangePips, insideBar: r.insideBar, bullish: r.close >= r.open, date: parseInt(parts[2]).toString(), monthIdx };
    }).map((d, i, arr) => ({
      ...d,
      month: d.monthIdx >= 0 && (i === 0 || d.monthIdx !== arr[i - 1].monthIdx) ? MONTHS[d.monthIdx] : "",
    }));
  }, [rows, offset, windowSize]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 52 : 38;
  const analysis   = useMemo(() => expanded ? buildSessionAnalysis(rows) : null, [rows, expanded]);

  const yDomain = useMemo(() => {
    const vals = data.map(d => d.pctChange);
    if (!vals.length) return ["auto", "auto"] as const;
    const abs = Math.max(...vals.map(Math.abs));
    const pad = abs * 0.25;
    return [-(abs + pad), abs + pad] as const;
  }, [data]);

  const latest = data[data.length - 1];

  return (
    <div className="flex flex-col h-full">
      {expanded && analysis && (
        <div className="shrink-0 flex" style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex flex-col items-center justify-center px-5 py-2.5" style={{ flex: "0 0 50%", minWidth: 0, maxWidth: "50%" }}>
            <ul className="flex flex-col gap-0.5 text-center">
              {analysis.bullets.map((b, i) => (
                <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{b}</li>
              ))}
            </ul>
          </div>
          <div style={{ width: 1, background: "var(--border-medium)", alignSelf: "stretch", margin: "8px 0" }} />
          <div className="flex-1 flex items-center justify-center px-5 py-2.5">
            <p className="text-[11px] leading-relaxed text-center" style={{ color: "var(--text-secondary)" }}>{analysis.description}</p>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" hide />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={yDomain} tickFormatter={v => v.toFixed(2) + "%"} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              position={{ x: 10, y: 10 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as typeof data[0];
                return (
                  <div className="rounded-lg px-3 py-2 text-[10px]" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-medium)", color: "var(--text-secondary)" }}>
                    <div className="font-bold mb-1" style={{ color: d.bullish ? "#60a5fa" : "#a78bfa" }}>
                      {d.pctChange >= 0 ? "+" : ""}{d.pctChange.toFixed(3)}%
                    </div>
                    <div>Gap: {d.gap >= 0 ? "+" : ""}{d.gap.toFixed(3)}%</div>
                    <div>Range: {d.rangePips} pips</div>
                    <div>Body: {d.bodyPct.toFixed(0)}%</div>
                    {d.insideBar && <div style={{ color: "#f59e0b" }}>Inside Bar</div>}
                  </div>
                );
              }}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
            <Bar dataKey="pctChange" isAnimationActive={false} radius={[2, 2, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i}
                  fill={d.bullish ? "rgba(96,165,250,0.80)" : "rgba(167,139,250,0.80)"}
                  stroke={d.insideBar ? "#f59e0b" : "none"}
                  strokeWidth={d.insideBar ? 1.5 : 0}
                />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {latest && expanded && (
        <div className="shrink-0 flex items-center pb-0.5" style={{ paddingLeft: yAxisWidth, paddingRight: 6, gap: 2 }}>
          {[
            { label: "Change", value: `${latest.pctChange >= 0 ? "+" : ""}${latest.pctChange.toFixed(3)}%`, color: latest.bullish ? "#60a5fa" : "#a78bfa" },
            { label: "Gap",    value: `${latest.gap >= 0 ? "+" : ""}${latest.gap.toFixed(3)}%`,             color: latest.gap > 0.003 ? "#60a5fa" : latest.gap < -0.003 ? "#a78bfa" : "var(--text-muted)" },
            { label: "Range",  value: `${latest.rangePips}p`,                                               color: "var(--text-secondary)" },
            { label: "Body",   value: `${latest.bodyPct.toFixed(0)}%`,                                      color: "var(--text-secondary)" },
            ...(latest.insideBar ? [{ label: "IB", value: "●", color: "#f59e0b" }] : []),
          ].map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center" style={{ minWidth: 0 }}>
              <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>{m.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: m.color }}>{m.value}</span>
            </div>
          ))}
        </div>
      )}

      {maxOffset > 0 && (
        <input type="range" className="momentum-scroll" min={0} max={maxOffset} value={offset}
          onChange={e => setOffset(Number(e.target.value))} style={{ direction: "rtl" }} />
      )}

      <div className="flex flex-col shrink-0 pb-1" style={{ paddingLeft: yAxisWidth, paddingRight: 6 }}>
        <div className="flex justify-between">
          {data.map((d, i) => (
            <span key={i} style={{ fontSize: tickStyle.fontSize, color: "var(--text-muted)" }}>{d.date}</span>
          ))}
        </div>
        <div className="flex">
          {data.reduce<{ month: string; count: number }[]>((acc, d) => {
            if (d.month) acc.push({ month: d.month, count: 1 });
            else if (acc.length) acc[acc.length - 1].count++;
            return acc;
          }, []).map((g, i) => (
            <div key={i} className="text-center" style={{ flex: g.count, fontSize: tickStyle.fontSize, color: "var(--text-muted)", fontWeight: 700 }}>
              {g.month}
            </div>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#60a5fa",               name: "% Change",    body: "Session return from prior close to current close. Captures both the overnight gap and the intraday move. Positive = bullish session; negative = bearish." },
            { color: "#f59e0b",               name: "Gap %",       body: "Difference between today's open and yesterday's close, as a percentage. A positive gap signals overnight bullish sentiment; negative signals bearish. Gaps above 0.05% are meaningful for daily FX." },
            { color: "#60a5fa",               name: "Range (pips)",body: "(High − Low) × 10,000. Total session volatility in pips. A wide range vs recent average indicates a high-conviction session; a narrow range signals consolidation or indecision." },
            { color: "rgba(255,255,255,0.7)", name: "Body Fill %", body: "|Close − Open| ÷ (High − Low) × 100. What fraction of the total range was captured by the candle body. High fill = directional conviction; low fill = wick-dominated indecision." },
            { color: "#f59e0b",               name: "Inside Bar",  body: "Today's high is below yesterday's high AND today's low is above yesterday's low — the full session is 'inside' the prior bar. Signals volatility contraction. Breakouts above the high or below the low are common entry triggers. Highlighted in amber on the chart." },
          ].map((item, i, arr) => (
            <div key={item.name} className="flex-1 flex flex-col gap-1 px-3 py-2.5" style={{ borderRight: i < arr.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
              <div className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <span className="text-[10px] font-bold" style={{ color: item.color }}>{item.name}</span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function computeWR(rows: SheetRow[], idx: number, period = 14): number {
  const start = Math.max(0, idx - period + 1);
  const slice = rows.slice(start, idx + 1);
  const hh = Math.max(...slice.map(r => r.high));
  const ll = Math.min(...slice.map(r => r.low));
  return hh === ll ? -50 : ((hh - rows[idx].close) / (hh - ll)) * -100;
}

function computeMom10(rows: SheetRow[], idx: number): number {
  if (idx < 10) return 0;
  const base = rows[idx - 10].close;
  return base > 0 ? ((rows[idx].close - base) / base) * 100 : 0;
}

function buildAvgPriceAnalysis(rows: SheetRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 6) return { headline: "—", bullets: [], description: "—" };
  const idx  = rows.length - 1;
  const cur  = rows[idx];

  const typical = (r: SheetRow) => (r.high + r.low + r.close) / 3;
  const avgPrice5 = rows.slice(-5).reduce((s, r) => s + typical(r), 0) / 5;
  const roc5      = idx >= 5 ? ((cur.close - rows[idx - 5].close) / rows[idx - 5].close) * 100 : 0;
  const deltas    = rows.slice(-5).map((r, i, a) => i === 0 ? 0 : (r.close - a[i - 1].close) * 10000);
  const avgDelta  = deltas.slice(1).reduce((s, d) => s + d, 0) / 4;
  const aboveAvg  = cur.close > avgPrice5;
  const rocSign   = roc5 >= 0 ? "+" : "";
  const deltaPips = avgDelta.toFixed(1);

  const recent20  = rows.slice(-20);
  const maxRoc    = Math.max(...recent20.map((r, i, a) => i < 5 ? 0 : Math.abs((r.close - a[i - 5].close) / a[i - 5].close * 100)));
  const rocRatio  = maxRoc > 0 ? Math.abs(roc5) / maxRoc : 0;

  const bullets = [
    `Close: ${cur.close.toFixed(4)} · Avg Price (HLC/3 SMA5): ${avgPrice5.toFixed(4)}`,
    `Close is ${aboveAvg ? "above" : "below"} the 5-bar avg price by ${Math.round(Math.abs(cur.close - avgPrice5) * 10000)} pips`,
    `ROC(5): ${rocSign}${roc5.toFixed(3)}% — ${(rocRatio * 100).toFixed(0)}% of 20-bar peak rate`,
    `Avg Delta (5-bar): ${avgDelta >= 0 ? "+" : ""}${deltaPips} pips/session`,
  ];

  let headline: string, description: string;
  if (roc5 > 0.5 && aboveAvg) {
    headline    = "Strong Bullish Rate of Change";
    description = `Price has gained ${rocSign}${roc5.toFixed(3)}% over the past 5 sessions, placing close ${Math.round((cur.close - avgPrice5) * 10000)} pips above its 5-bar average price (${avgPrice5.toFixed(4)}). The average daily delta of ${deltaPips} pips confirms consistent net buying pressure. At ${(rocRatio * 100).toFixed(0)}% of the 20-session peak rate, the current move has ${rocRatio > 0.7 ? "significant momentum that is hard to fade" : "room to extend before reaching a historic extreme"}.`;
  } else if (roc5 < -0.5 && !aboveAvg) {
    headline    = "Strong Bearish Rate of Change";
    description = `Price has declined ${roc5.toFixed(3)}% over the past 5 sessions, with close ${Math.round((avgPrice5 - cur.close) * 10000)} pips below its 5-bar average price (${avgPrice5.toFixed(4)}). The average daily delta of ${deltaPips} pips confirms persistent selling pressure. At ${(rocRatio * 100).toFixed(0)}% of the 20-session peak rate, the pace of decline is ${rocRatio > 0.7 ? "elevated — watch for exhaustion and potential bounce" : "moderate with room for further extension"}.`;
  } else if (roc5 > 0.1) {
    headline    = "Moderate Bullish Rate of Change";
    description = `A moderate ${rocSign}${roc5.toFixed(3)}% rate of change over 5 sessions. Close is ${aboveAvg ? `${Math.round((cur.close - avgPrice5) * 10000)} pips above` : `${Math.round((avgPrice5 - cur.close) * 10000)} pips below`} the 5-bar average price (${avgPrice5.toFixed(4)}). Average daily delta of ${deltaPips} pips indicates ${Number(deltaPips) > 0 ? "net upward" : "net downward"} drift. The current ROC is at ${(rocRatio * 100).toFixed(0)}% of recent peak rate — a constructive but not extreme bullish reading.`;
  } else if (roc5 < -0.1) {
    headline    = "Moderate Bearish Rate of Change";
    description = `A moderate ${roc5.toFixed(3)}% rate of change over 5 sessions. Close is ${!aboveAvg ? `${Math.round((avgPrice5 - cur.close) * 10000)} pips below` : `${Math.round((cur.close - avgPrice5) * 10000)} pips above`} the 5-bar average price (${avgPrice5.toFixed(4)}). Average daily delta of ${deltaPips} pips. The ROC at ${(rocRatio * 100).toFixed(0)}% of recent peak points to moderate but not exhausted bearish momentum.`;
  } else {
    headline    = "Rate of Change Flat — No Directional Bias";
    description = `ROC(5) at ${rocSign}${roc5.toFixed(3)}% indicates a nearly flat 5-session net change. Close sits ${aboveAvg ? "slightly above" : "slightly below"} the 5-bar average price (${avgPrice5.toFixed(4)}) by ${Math.round(Math.abs(cur.close - avgPrice5) * 10000)} pips. The average daily delta of ${deltaPips} pips confirms minimal directional follow-through. This is a low-momentum environment — wait for ROC to build conviction before positioning.`;
  }
  return { headline, bullets, description };
}

const AVGP_WINDOW = 20;

function AvgPricePanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize = expanded ? 40 : AVGP_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset]       = useState(0);
  const [showClose,    setShowClose]    = useState(true);
  const [showAvgPrice, setShowAvgPrice] = useState(true);
  const [showRoc,      setShowRoc]      = useState(true);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const data = useMemo(() => {
    const start = rows.length - windowSize - offset;
    const end   = rows.length - offset;
    const slice = rows.slice(Math.max(0, start), end);
    const startIdx = Math.max(0, start);
    return slice.map((r, i) => {
      const rowIdx    = startIdx + i;
      const parts     = r.date.split("-");
      const monthIdx  = parseInt(parts[1]) - 1;
      const prevMonth = i > 0 ? parseInt(slice[i-1].date.split("-")[1]) - 1 : -1;
      const typical5  = rows.slice(Math.max(0, rowIdx - 4), rowIdx + 1);
      const avgPrice  = typical5.reduce((s, rr) => s + (rr.high + rr.low + rr.close) / 3, 0) / typical5.length;
      const roc5      = rowIdx >= 5 ? ((r.close - rows[rowIdx - 5].close) / rows[rowIdx - 5].close) * 100 : 0;
      const deltas    = rows.slice(Math.max(0, rowIdx - 4), rowIdx + 1);
      const avgDelta  = deltas.length > 1
        ? deltas.slice(1).reduce((s, rr, j) => s + (rr.close - deltas[j].close) * 10000, 0) / (deltas.length - 1)
        : 0;
      return {
        idx: i,
        date: parseInt(parts[2]).toString(),
        month: monthIdx !== prevMonth ? MONTHS[monthIdx] : "",
        close: r.close,
        avgPrice,
        roc5,
        avgDelta,
      };
    });
  }, [rows, offset, windowSize]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 60 : 44;
  const rocWidth   = expanded ? 44 : 32;
  const analysis   = useMemo(() => expanded ? buildAvgPriceAnalysis(rows) : null, [rows, expanded]);

  const priceDomain = useMemo(() => {
    const vals: number[] = [];
    data.forEach(d => {
      if (showClose)    vals.push(d.close);
      if (showAvgPrice) vals.push(d.avgPrice);
    });
    if (!vals.length) return ["auto", "auto"] as const;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.25;
    return [min - pad, max + pad] as const;
  }, [data, showClose, showAvgPrice]);

  const rocDomain = useMemo(() => {
    if (!showRoc || !data.length) return [-1, 1] as const;
    const abs = Math.max(0.2, ...data.map(d => Math.abs(d.roc5)));
    return [-(abs * 1.2), abs * 1.2] as const;
  }, [data, showRoc]);

  const latest = data[data.length - 1];

  const TOGGLES = [
    { key: "close",    label: "Close",     color: "rgba(255,255,255,0.75)", on: showClose,    set: setShowClose    },
    { key: "avgPrice", label: "Avg Price", color: "#f59e0b",                on: showAvgPrice, set: setShowAvgPrice },
    { key: "roc",      label: "ROC(5)",    color: "#a78bfa",                on: showRoc,      set: setShowRoc      },
  ] as const;

  return (
    <div className="flex flex-col h-full">
      {expanded && analysis && (
        <div className="shrink-0 flex" style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex flex-col items-center justify-center px-5 py-2.5" style={{ flex: "0 0 50%", minWidth: 0, maxWidth: "50%" }}>
            <ul className="flex flex-col gap-0.5 text-center">
              {analysis.bullets.map((b, i) => (
                <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{b}</li>
              ))}
            </ul>
          </div>
          <div style={{ width: 1, background: "var(--border-medium)", alignSelf: "stretch", margin: "8px 0" }} />
          <div className="flex-1 flex items-center justify-center px-5 py-2.5">
            <p className="text-[11px] leading-relaxed text-center" style={{ color: "var(--text-secondary)" }}>{analysis.description}</p>
          </div>
        </div>
      )}

      <div className="shrink-0 flex items-center gap-1.5 px-2 pt-1" style={{ paddingLeft: yAxisWidth }}>
        {TOGGLES.map(({ key, label, color, on, set }) => (
          <button
            key={key}
            onClick={() => set(v => !v)}
            className="flex items-center gap-1 rounded-full cursor-pointer"
            style={{
              fontSize:      expanded ? 10 : 8,
              fontWeight:    700,
              letterSpacing: "0.06em",
              padding:       expanded ? "2px 8px" : "1px 6px",
              border:        `1px solid ${on ? color + "66" : "rgba(255,255,255,0.10)"}`,
              background:    on ? color + "18" : "transparent",
              color:         on ? color : "var(--text-muted)",
              transition:    "all 0.15s",
            }}
          >
            <span style={{ width: expanded ? 6 : 5, height: expanded ? 6 : 5, borderRadius: "50%", background: on ? color : "var(--text-muted)", flexShrink: 0 }} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: showRoc ? rocWidth : 6, bottom: 0, left: 0 }}>
            <XAxis dataKey="idx" type="number" domain={[0, data.length - 1]} hide />
            <YAxis yAxisId="price" tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={priceDomain} tickFormatter={v => v.toFixed(4)} />
            {showRoc && (
              <YAxis yAxisId="roc" orientation="right" tick={tickStyle} tickLine={false} axisLine={false} width={rocWidth} domain={rocDomain} tickFormatter={v => v.toFixed(2) + "%"} />
            )}
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              position={{ x: 10, y: 10 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as typeof data[0];
                return (
                  <div className="rounded-lg px-3 py-2 text-[10px]" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-medium)", color: "var(--text-secondary)" }}>
                    <div className="font-bold mb-1" style={{ color: "rgba(255,255,255,0.85)" }}>{d.close.toFixed(4)}</div>
                    <div style={{ color: "#f59e0b" }}>Avg Price: {d.avgPrice.toFixed(4)}</div>
                    <div style={{ color: d.roc5 >= 0 ? "#60a5fa" : "#a78bfa" }}>
                      ROC(5): {d.roc5 >= 0 ? "+" : ""}{d.roc5.toFixed(3)}%
                    </div>
                    <div style={{ color: d.avgDelta >= 0 ? "#60a5fa" : "#a78bfa" }}>
                      Avg Δ: {d.avgDelta >= 0 ? "+" : ""}{d.avgDelta.toFixed(1)} pips/day
                    </div>
                  </div>
                );
              }}
            />
            {showRoc && <ReferenceLine yAxisId="roc" y={0} stroke="rgba(255,255,255,0.10)" strokeWidth={1} />}
            {showAvgPrice && <Line yAxisId="price" dataKey="avgPrice" name="Avg Price" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#f59e0b" strokeDasharray="4 2" isAnimationActive={false} />}
            {showClose    && <Line yAxisId="price" dataKey="close"    name="Close"     type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5}   stroke="rgba(255,255,255,0.75)" isAnimationActive={false} />}
            {showRoc      && <Line yAxisId="roc"   dataKey="roc5"     name="ROC(5)"    type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#a78bfa" isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {latest && expanded && (
        <div className="shrink-0 flex items-center" style={{ paddingLeft: yAxisWidth + 6, paddingRight: showRoc ? rocWidth + 6 : 6, borderTop: "1px solid var(--border-subtle)", paddingTop: 3, paddingBottom: 3 }}>
          {[
            { label: "Avg Δ/day", value: (latest.avgDelta >= 0 ? "+" : "") + latest.avgDelta.toFixed(1) + " pips", color: latest.avgDelta >= 0 ? "#60a5fa" : "#a78bfa" },
            { label: "vs Avg Price", value: (latest.close >= latest.avgPrice ? "+" : "") + Math.round((latest.close - latest.avgPrice) * 10000) + " pips", color: latest.close >= latest.avgPrice ? "#60a5fa" : "#a78bfa" },
          ].map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center">
              <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>{m.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: m.color }}>{m.value}</span>
            </div>
          ))}
        </div>
      )}

      {maxOffset > 0 && (
        <input type="range" className="momentum-scroll" min={0} max={maxOffset} value={offset}
          onChange={e => setOffset(Number(e.target.value))} style={{ direction: "rtl" }} />
      )}

      <div className="flex flex-col shrink-0 pb-1" style={{ paddingLeft: yAxisWidth, paddingRight: showRoc ? rocWidth : 6 }}>
        <div className="flex justify-between">
          {data.map((d, i) => (
            <span key={i} style={{ fontSize: tickStyle.fontSize, color: "var(--text-muted)" }}>{d.date}</span>
          ))}
        </div>
        <div className="flex">
          {data.reduce<{ month: string; count: number }[]>((acc, d) => {
            if (d.month) acc.push({ month: d.month, count: 1 });
            else if (acc.length) acc[acc.length - 1].count++;
            return acc;
          }, []).map((g, i) => (
            <div key={i} className="text-center" style={{ flex: g.count, fontSize: tickStyle.fontSize, color: "var(--text-muted)", fontWeight: 700 }}>
              {g.month}
            </div>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#f59e0b", name: "Avg Price (HLC/3 SMA5)", body: "The 5-session simple moving average of the typical price — (High + Low + Close) ÷ 3. Unlike a close-only moving average, it weights the full session range, giving a more balanced representation of where price has traded. When close is above avg price, buyers have dominated recent sessions; when below, sellers hold the edge." },
            { color: "#a78bfa", name: "ROC(5)",                 body: "Rate of Change over 5 sessions: (Close − Close[5]) ÷ Close[5] × 100. Measures the percentage gain or loss over exactly one trading week. Positive = net bullish week; negative = net bearish. Accelerating ROC in the direction of the trend confirms momentum; decelerating ROC warns of fatigue. Extreme readings signal overextension." },
            { color: "#60a5fa", name: "Avg Delta (5-bar)",      body: "The average pip change per session over the past 5 bars: mean of (Close[i] − Close[i−1]) × 10,000. Positive avg delta = net buying drift; negative = net selling drift. A small avg delta with a large ROC means one or two sessions drove the move. A large avg delta means the directional pressure has been consistent across all five sessions." },
          ].map((item, i, arr) => (
            <div key={item.name} className="flex-1 flex flex-col gap-1 px-3 py-2.5" style={{ borderRight: i < arr.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
              <div className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <span className="text-[10px] font-bold" style={{ color: item.color }}>{item.name}</span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function buildVolatilityAnalysis(rows: SheetRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 2) return { headline: "—", bullets: [], description: "—" };
  const cur  = rows[rows.length - 1];
  const { close, bbUpper, bbMiddle, bbLower, histVol } = cur;

  const bandwidth  = bbUpper - bbLower;
  const halfBand   = bandwidth / 2;
  const bbPct      = bandwidth > 0 ? ((close - bbLower) / bandwidth) * 100 : 50;
  const bwPips     = Math.round(bandwidth * 10000);

  const recent20   = rows.slice(-20);
  const avgBw      = recent20.reduce((s, r) => s + (r.bbUpper - r.bbLower), 0) / recent20.length;
  const bwRatio    = avgBw > 0 ? bandwidth / avgBw : 1;

  const aboveUpper = close > bbUpper;
  const belowLower = close < bbLower;
  const inUpper    = !aboveUpper && close > bbMiddle;
  const squeeze    = bwRatio < 0.80;
  const expansion  = bwRatio > 1.30;

  const position   = aboveUpper ? "above upper band" : belowLower ? "below lower band"
    : inUpper ? "upper half of band" : "lower half of band";

  const bullets = [
    `Close: ${close.toFixed(4)} — ${position}`,
    `BB %B: ${bbPct.toFixed(1)}% · Bandwidth: ${bwPips} pips (${bwRatio >= 1 ? "+" : ""}${((bwRatio - 1) * 100).toFixed(0)}% vs 20-bar avg)`,
    `Hist Vol: ${(histVol * 100).toFixed(2)}%${squeeze ? " · Bollinger Squeeze — breakout watch" : expansion ? " · Bands expanding — volatility elevated" : ""}`,
  ];

  let headline: string, description: string;
  if (aboveUpper && expansion) {
    headline    = "Bullish Breakout with Band Expansion";
    description = `Price has closed above the upper Bollinger Band (${bbUpper.toFixed(4)}) with the bands expanding — a sign of a high-conviction bullish move backed by rising volatility. The ${bwPips}-pip bandwidth is ${((bwRatio - 1) * 100).toFixed(0)}% wider than the 20-session average, confirming the breakout is not a false alarm. In strong trends, price can ride the upper band — the midline (${bbMiddle.toFixed(4)}) becomes first support on any pullback.`;
  } else if (belowLower && expansion) {
    headline    = "Bearish Breakdown with Band Expansion";
    description = `Price has closed below the lower Bollinger Band (${bbLower.toFixed(4)}) while bands are expanding — a high-conviction bearish move with volatility rising. The ${bwPips}-pip bandwidth is ${((bwRatio - 1) * 100).toFixed(0)}% above the 20-session average. In sustained downtrends price can trail the lower band; watch the midline (${bbMiddle.toFixed(4)}) as key resistance on any recovery.`;
  } else if (aboveUpper) {
    headline    = "Price Above Upper Band — Overbought Signal";
    description = `Close at ${close.toFixed(4)} has pierced the upper Bollinger Band (${bbUpper.toFixed(4)}). In ranging markets this is an overbought warning and a mean-reversion setup back toward the midline (${bbMiddle.toFixed(4)}). However, the bands are not expanding significantly — confirm with momentum indicators before fading. A close back inside the band would signal the overbought condition is resolving.`;
  } else if (belowLower) {
    headline    = "Price Below Lower Band — Oversold Signal";
    description = `Close at ${close.toFixed(4)} has pierced the lower Bollinger Band (${bbLower.toFixed(4)}). In ranging markets this is an oversold warning and a potential mean-reversion long back toward the midline (${bbMiddle.toFixed(4)}). Bands are not in strong expansion mode — the move may be overextended. A close back inside the band would signal the oversold condition is easing.`;
  } else if (squeeze) {
    headline    = "Bollinger Squeeze — Breakout Imminent";
    description = `The Bollinger Bands have contracted to ${bwPips} pips — ${((1 - bwRatio) * 100).toFixed(0)}% below the 20-session average bandwidth. This volatility squeeze signals that the market is coiling energy ahead of a directional move. The direction of the breakout is not yet clear — watch for a close outside the bands (above ${bbUpper.toFixed(4)} or below ${bbLower.toFixed(4)}) as the trigger.`;
  } else if (inUpper) {
    headline    = "Upper Band — Mild Bullish Bias";
    description = `Price is in the upper half of the Bollinger Band channel, between the midline (${bbMiddle.toFixed(4)}) and upper band (${bbUpper.toFixed(4)}). This is a mildly bullish regime — buyers are in control but the move is not yet at an extreme. The midline serves as dynamic support; a pullback and hold there would be a constructive long re-entry.`;
  } else {
    headline    = "Lower Band — Mild Bearish Bias";
    description = `Price is in the lower half of the Bollinger Band channel, between the lower band (${bbLower.toFixed(4)}) and midline (${bbMiddle.toFixed(4)}). This is a mildly bearish regime — sellers have the edge but conditions are not at an extreme. The midline (${bbMiddle.toFixed(4)}) acts as dynamic resistance; a rally that stalls there would reinforce the bearish bias.`;
  }
  return { headline, bullets, description };
}

function buildAtrAnalysis(rows: SheetRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 3) return { headline: "Insufficient data", bullets: [], description: "" };
  const cur  = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const atrPips     = Math.round(cur.atr14);
  const prevAtrPips = Math.round(prev.atr14);
  const atrRising   = cur.atr14 > prev.atr14;
  const delta5      = rows.length >= 6 ? Math.round(cur.atr14 - rows[rows.length - 6].atr14) : 0;
  const recent20    = rows.slice(-20);
  const avgAtr20    = recent20.reduce((s, r) => s + r.atr14, 0) / recent20.length;
  const avgPips     = Math.round(avgAtr20);
  const atrRatio    = avgAtr20 > 0 ? cur.atr14 / avgAtr20 : 1;
  const high20      = Math.round(Math.max(...recent20.map(r => r.atr14)));
  const low20       = Math.round(Math.min(...recent20.map(r => r.atr14)));
  const elevated    = atrRatio > 1.25;
  const compressed  = atrRatio < 0.75;
  let headline: string, bullets: string[], description: string;
  const baseBullets = [
    `ATR(14): ${atrPips} pips — ${atrRatio >= 1 ? "+" : ""}${((atrRatio - 1) * 100).toFixed(0)}% vs 20-bar average (${avgPips} pips)`,
    `${atrRising ? "Rising" : "Falling"} vs prior bar (${prevAtrPips}→${atrPips} pips)`,
    `5-session change: ${delta5 >= 0 ? "+" : ""}${delta5} pips`,
    `20-bar range: ${low20}–${high20} pips`,
  ];
  if (elevated && atrRising) {
    headline    = "Volatility Elevated and Expanding";
    bullets     = baseBullets;
    description = `ATR(14) at ${atrPips} pips is significantly elevated versus its 20-session average of ${avgPips} pips, and the range is still expanding. This reflects an actively trending or event-driven market where daily swings are well above normal. Wider stops are required — a 1.5–2× ATR multiplier is appropriate. Reduce position size proportionally. Monitor for ATR to peak and turn down as the first sign the volatility impulse is exhausting.`;
  } else if (elevated && !atrRising) {
    headline    = "Volatility Elevated — First Signs of Contraction";
    bullets     = baseBullets;
    description = `ATR(14) at ${atrPips} pips remains above its 20-session average of ${avgPips} pips, but today's range is narrower than the prior session. This is a tentative early signal that the volatility impulse may be peaking. If contraction continues over the next 2–3 sessions, it would signal a return to normal conditions. Hold wider stops for now and re-tighten only after sustained ATR decline.`;
  } else if (compressed && !atrRising) {
    headline    = "Volatility Compressed — Breakout Watch";
    bullets     = baseBullets;
    description = `ATR(14) at ${atrPips} pips is significantly below its 20-session average of ${avgPips} pips — the market is in a low-volatility squeeze. Compressed ATR often precedes a sharp directional breakout as accumulated energy is released. Stops can be set tighter given the narrow daily range, but place them outside the current compression zone. Watch for ATR to spike above ${avgPips} pips as confirmation a new directional move is underway.`;
  } else if (compressed && atrRising) {
    headline    = "Low Volatility — Early Expansion Signals";
    bullets     = baseBullets;
    description = `ATR(14) at ${atrPips} pips is still below its 20-session average of ${avgPips} pips, but the range is starting to expand. This is an early signal that the low-volatility squeeze may be resolving. If expansion continues, expect wider daily ranges and the potential for a directional breakout. Begin adjusting stops outward as volatility returns to normal levels.`;
  } else if (atrRising) {
    headline    = "Normal Range — Volatility Increasing";
    bullets     = baseBullets;
    description = `ATR(14) is within the normal range at ${atrPips} pips but is trending upward. Volatility is gently expanding, which can support directional moves. Maintain stops at 1–1.5× ATR to buffer against intraday noise. If ATR continues to rise above the 20-bar average by more than 25%, widen stops accordingly.`;
  } else {
    headline    = "Normal Range — Volatility Stable";
    bullets     = baseBullets;
    description = `ATR(14) at ${atrPips} pips is within normal range relative to its 20-session average of ${avgPips} pips and is holding steady. This is a routine volatility environment — daily ranges are predictable and stops can be set at the standard 1–1.5× ATR level. No volatility-specific warnings are present; focus on directional indicators for trade timing.`;
  }
  return { headline, bullets, description };
}

const ATR_WINDOW = 20;

function AtrPanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize = expanded ? 40 : ATR_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset]       = useState(0);
  const [showAtr,    setShowAtr]    = useState(true);
  const [showAtrSma, setShowAtrSma] = useState(true);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const data = useMemo(() => {
    const start = rows.length - windowSize - offset;
    const end   = rows.length - offset;
    const slice = rows.slice(Math.max(0, start), end);
    return slice.map((r, i) => {
      const parts     = r.date.split("-");
      const monthIdx  = parseInt(parts[1]) - 1;
      const prevMonth = i > 0 ? parseInt(slice[i-1].date.split("-")[1]) - 1 : -1;
      const absIdx    = Math.max(0, start) + i;
      const smaSlice  = rows.slice(Math.max(0, absIdx - 19), absIdx + 1);
      const atrSma    = smaSlice.reduce((s, rr) => s + rr.atr14, 0) / smaSlice.length;
      return {
        idx:    i,
        date:   parseInt(parts[2]).toString(),
        month:  monthIdx !== prevMonth ? MONTHS[monthIdx] : "",
        atr:    Math.round(r.atr14),
        atrSma: Math.round(atrSma),
        rising: i > 0 ? r.atr14 >= slice[i - 1].atr14 : true,
      };
    });
  }, [rows, offset, windowSize]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 44 : 32;
  const analysis   = useMemo(() => expanded ? buildAtrAnalysis(rows) : null, [rows, expanded]);

  const yDomain = useMemo(() => {
    const vals: number[] = [];
    data.forEach(d => {
      if (showAtr)    vals.push(d.atr);
      if (showAtrSma) vals.push(d.atrSma);
    });
    if (!vals.length) return ["auto", "auto"] as const;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.25;
    return [min - pad, max + pad] as const;
  }, [data, showAtr, showAtrSma]);

  const TOGGLES = [
    { key: "atr",    label: "ATR(14)",   color: "#a78bfa", on: showAtr,    set: setShowAtr    },
    { key: "atrSma", label: "ATR SMA20", color: "#f59e0b", on: showAtrSma, set: setShowAtrSma },
  ] as const;

  const latest = data[data.length - 1];

  return (
    <div className="flex flex-col h-full">
      {expanded && analysis && (
        <div className="shrink-0 flex" style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex flex-col items-center justify-center px-5 py-2.5" style={{ flex: "0 0 50%", minWidth: 0, maxWidth: "50%" }}>
            <ul className="flex flex-col gap-0.5 text-center">
              {analysis.bullets.map((b, i) => (
                <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{b}</li>
              ))}
            </ul>
          </div>
          <div style={{ width: 1, background: "var(--border-medium)", alignSelf: "stretch", margin: "8px 0" }} />
          <div className="flex-1 flex items-center justify-center px-5 py-2.5">
            <p className="text-[11px] leading-relaxed text-center" style={{ color: "var(--text-secondary)" }}>{analysis.description}</p>
          </div>
        </div>
      )}

      <div className="shrink-0 flex items-center gap-1.5 px-2 pt-1" style={{ paddingLeft: yAxisWidth }}>
        {TOGGLES.map(({ key, label, color, on, set }) => (
          <button key={key} onClick={() => set(v => !v)} className="flex items-center gap-1 rounded-full cursor-pointer"
            style={{
              fontSize: expanded ? 10 : 8, fontWeight: 700, letterSpacing: "0.06em",
              padding: expanded ? "2px 8px" : "1px 6px",
              border: `1px solid ${on ? color + "66" : "rgba(255,255,255,0.10)"}`,
              background: on ? color + "18" : "transparent",
              color: on ? color : "var(--text-muted)", transition: "all 0.15s",
            }}>
            <span style={{ width: expanded ? 6 : 5, height: expanded ? 6 : 5, borderRadius: "50%", background: on ? color : "var(--text-muted)", flexShrink: 0 }} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <XAxis dataKey="idx" type="number" domain={[0, data.length - 1]} hide />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={yDomain} tickFormatter={v => v.toFixed(0)} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              position={{ x: 10, y: 10 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as typeof data[0];
                const diff = d.atr - d.atrSma;
                return (
                  <div className="rounded-lg px-3 py-2 text-[10px]" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-medium)", color: "var(--text-secondary)" }}>
                    <div style={{ color: "#a78bfa", fontWeight: 700 }}>ATR: {d.atr} pips</div>
                    <div>SMA20: {d.atrSma} pips</div>
                    <div style={{ color: diff >= 0 ? "#60a5fa" : "#a78bfa" }}>{diff >= 0 ? "+" : ""}{diff} vs avg</div>
                  </div>
                );
              }}
            />
            {showAtrSma && <ReferenceLine y={latest?.atrSma} stroke="rgba(245,158,11,0.15)" strokeDasharray="3 3" />}
            {showAtr && <Line dataKey="atr" name="ATR(14)" type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5} stroke="#a78bfa" isAnimationActive={false} />}
            {showAtrSma && <Line dataKey="atrSma" name="ATR SMA20" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#f59e0b" isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {latest && expanded && (
        <div className="shrink-0 flex items-center" style={{ paddingLeft: yAxisWidth + 6, paddingRight: 6, borderTop: "1px solid var(--border-subtle)", paddingTop: 3, paddingBottom: 3 }}>
          {[
            { label: "ATR pips",  value: String(latest.atr),                                                                          color: "#a78bfa" },
            { label: "vs SMA20",  value: `${latest.atr >= latest.atrSma ? "+" : ""}${latest.atr - latest.atrSma} pips`,               color: latest.atr >= latest.atrSma ? "#60a5fa" : "#a78bfa" },
            { label: "SMA20",     value: `${latest.atrSma} pips`,                                                                     color: "var(--text-secondary)" },
          ].map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center">
              <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>{m.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: m.color }}>{m.value}</span>
            </div>
          ))}
        </div>
      )}

      {maxOffset > 0 && (
        <input type="range" className="momentum-scroll" min={0} max={maxOffset} value={offset}
          onChange={e => setOffset(Number(e.target.value))} style={{ direction: "rtl" }} />
      )}

      <div className="flex flex-col shrink-0 pb-1" style={{ paddingLeft: yAxisWidth, paddingRight: 6 }}>
        <div className="flex justify-between">
          {data.map((d, i) => (
            <span key={i} style={{ fontSize: tickStyle.fontSize, color: "var(--text-muted)" }}>{d.date}</span>
          ))}
        </div>
        <div className="flex">
          {data.reduce<{ month: string; count: number }[]>((acc, d) => {
            if (d.month) acc.push({ month: d.month, count: 1 });
            else if (acc.length) acc[acc.length - 1].count++;
            return acc;
          }, []).map((g, i) => (
            <div key={i} className="text-center" style={{ flex: g.count, fontSize: tickStyle.fontSize, color: "var(--text-muted)", fontWeight: 700 }}>
              {g.month}
            </div>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#a78bfa", name: "ATR(14)", body: "Average True Range over 14 periods. True Range is the greatest of: current High−Low, |High−Prior Close|, |Low−Prior Close|. ATR averages these over 14 bars, expressed in pips for forex. Rising ATR = expanding daily ranges, active market, wider stops required. Falling ATR = compression, quieter conditions, tighter stops viable. Use a 1–1.5× ATR multiplier to set stops outside the noise of normal daily movement." },
            { color: "#f59e0b", name: "ATR SMA(20)", body: "A 20-bar simple moving average of ATR(14). Serves as the benchmark for 'normal' volatility. When ATR is significantly above its SMA20 (>25%), the market is in an elevated-volatility regime — size down. When ATR is significantly below its SMA20 (<75%), the market is compressing — a precursor to a volatility breakout and sharp directional move. The SMA20 is the reference line that contextualises whether today's ATR is a warning or routine." },
          ].map((item, i, arr) => (
            <div key={item.name} className="flex-1 flex flex-col gap-1 px-3 py-2.5" style={{ borderRight: i < arr.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
              <div className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <span className="text-[10px] font-bold" style={{ color: item.color }}>{item.name}</span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AI Chat ─────────────────────────────────────────────────────────────────
const CLAUDE_API_KEY_PATH = 'C:\\Users\\Geoff\\.trademirror\\claude-api-key.txt';

interface ChatMsg { role: 'user' | 'assistant'; content: string; }

function AiChatPanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const { analysisResult: ar } = useAnalytics();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const latestRow = rows[rows.length - 1];

  const systemPrompt = useMemo(() => {
    if (!latestRow) return "You are a concise forex trading assistant for EUR/USD. Answer in 2-4 sentences unless asked for more detail.";
    return `You are a concise forex trading assistant analyzing EUR/USD. Answer in 2-4 sentences unless asked for more detail. Current market data as of ${latestRow.date}: Close ${latestRow.close.toFixed(4)}, Open ${latestRow.open.toFixed(4)}, High ${latestRow.high.toFixed(4)}, Low ${latestRow.low.toFixed(4)}. ATR(14) ${Math.round(latestRow.atr14)} pips. RSI(14) ${latestRow.rsi14.toFixed(1)}, RSI(9) ${latestRow.rsi9.toFixed(1)}. MACD ${latestRow.macd.toFixed(5)}, Signal ${latestRow.macdSignal.toFixed(5)}, Histogram ${latestRow.macdHistogram.toFixed(5)}. ADX ${latestRow.adx.toFixed(1)}, +DI ${latestRow.diPlus.toFixed(1)}, −DI ${latestRow.diMinus.toFixed(1)}. BB Upper ${latestRow.bbUpper.toFixed(4)}, Mid ${latestRow.bbMiddle.toFixed(4)}, Lower ${latestRow.bbLower.toFixed(4)}. EMA9 ${latestRow.ema9.toFixed(4)}, EMA20 ${latestRow.ema20.toFixed(4)}, EMA50 ${latestRow.ema50.toFixed(4)}, EMA200 ${latestRow.ema200.toFixed(4)}. Pivots R1 ${latestRow.r1.toFixed(4)}, S1 ${latestRow.s1.toFixed(4)}. AI analysis: ${ar.direction} with ${ar.confidence}% confidence.`;
  }, [latestRow, ar]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setError(null);
    const next: ChatMsg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setLoading(true);
    try {
      const apiKey = await invoke<string>('read_credentials_file', { path: CLAUDE_API_KEY_PATH })
        .then(s => s.trim())
        .catch(() => { throw new Error('No API key found. Create C:\\Users\\Geoff\\.trademirror\\claude-api-key.txt with your Anthropic API key.'); });

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 512,
          system:     systemPrompt,
          messages:   next.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(JSON.stringify(e)); }
      const data = await res.json() as { content: { type: string; text: string }[] };
      const reply = data.content.find(c => c.type === 'text')?.text ?? '';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const fs = expanded ? 12 : 11;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col gap-2">
        {messages.length === 0 && !loading && (
          <div className="flex-1 flex items-center justify-center">
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Ask anything about the current EUR/USD setup</span>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              style={{
                fontSize:   fs,
                lineHeight: 1.5,
                maxWidth:   "85%",
                padding:    "6px 10px",
                borderRadius: 10,
                background: m.role === 'user' ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.05)",
                border:     `1px solid ${m.role === 'user' ? "rgba(96,165,250,0.30)" : "var(--border-subtle)"}`,
                color:      "var(--text-primary)",
                whiteSpace: "pre-wrap",
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div style={{ fontSize: fs, padding: "6px 10px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
              ···
            </div>
          </div>
        )}
        {error && (
          <div style={{ fontSize: 10, padding: "4px 8px", borderRadius: 6, background: "rgba(167,139,250,0.10)", border: "1px solid rgba(167,139,250,0.25)", color: "#a78bfa" }}>
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 flex gap-2 px-3 py-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <input
          style={{
            flex: 1, fontSize: fs, padding: "5px 10px", borderRadius: 8, outline: "none",
            background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)",
          }}
          placeholder="Ask about the current setup…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          style={{
            fontSize: fs, padding: "5px 12px", borderRadius: 8, fontWeight: 600, flexShrink: 0,
            background: input.trim() && !loading ? "rgba(96,165,250,0.20)" : "rgba(255,255,255,0.04)",
            border:     `1px solid ${input.trim() && !loading ? "rgba(96,165,250,0.40)" : "var(--border-subtle)"}`,
            color:      input.trim() && !loading ? "#60a5fa" : "var(--text-muted)",
            cursor:     input.trim() && !loading ? "pointer" : "not-allowed",
            transition: "all 0.15s",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ─── Failure Swing ────────────────────────────────────────────────────────────
function computeFsWick(r: SheetRow): number | null {
  if (r.close > r.open) {
    const v = Math.round((r.open - r.low) * 10000);
    return v >= 0 ? v : null;
  }
  if (r.close < r.open) {
    const v = Math.round((r.high - r.open) * 10000);
    return v >= 0 ? v : null;
  }
  return null;
}

function buildFsCdf(values: number[]): { pip: number; pct: number }[] {
  if (!values.length) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const n      = sorted.length;
  const maxPip = sorted[n - 1];
  const result: { pip: number; pct: number }[] = [];
  let idx = 0;
  for (let pip = 0; pip <= maxPip; pip++) {
    while (idx < n && sorted[idx] <= pip) idx++;
    result.push({ pip, pct: parseFloat(((idx / n) * 100).toFixed(1)) });
  }
  return result;
}

function fsPipAtPercentile(sorted: number[], pct: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * pct / 100));
  return sorted[idx] ?? 0;
}

function fsPercentileRank(sorted: number[], value: number): number {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= value) lo = mid + 1; else hi = mid; }
  return parseFloat(((lo / sorted.length) * 100).toFixed(1));
}

function FailureSwingPanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const [showCdf,   setShowCdf]   = useState(true);
  const [showToday, setShowToday] = useState(true);
  const [showPercs, setShowPercs] = useState(true);

  const stats = useMemo(() => {
    const all: number[] = [];
    let nUp = 0, nDown = 0;
    for (const r of rows) {
      const v = computeFsWick(r);
      if (v !== null) { all.push(v); if (r.close > r.open) nUp++; else nDown++; }
    }
    const sorted = [...all].sort((a, b) => a - b);
    const n = sorted.length;
    if (!n) return null;
    const cur       = rows[rows.length - 1];
    const todayFs   = cur ? computeFsWick(cur) : null;
    const todayRank = todayFs !== null ? fsPercentileRank(sorted, todayFs) : null;
    return {
      cdfData: buildFsCdf(all),
      todayFs, todayRank,
      p25: fsPipAtPercentile(sorted, 25),
      p50: fsPipAtPercentile(sorted, 50),
      p75: fsPipAtPercentile(sorted, 75),
      p90: fsPipAtPercentile(sorted, 90),
      n, nUp, nDown,
    };
  }, [rows]);

  if (!stats || !stats.cdfData.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>No Data</span>
      </div>
    );
  }

  const { cdfData, todayFs, todayRank, p50, p75, p90, n, nUp, nDown } = stats;
  const maxPip     = cdfData[cdfData.length - 1].pip;
  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 11 : 9 } as const;
  const yAxisWidth = expanded ? 40 : 30;

  const TOGGLES = [
    { key: "cdf",   label: "Distribution", color: "#60a5fa", on: showCdf,   set: setShowCdf   },
    { key: "today", label: "Today",         color: "#fbbf24", on: showToday, set: setShowToday },
    { key: "percs", label: "Percentiles",   color: "#94a3b8", on: showPercs, set: setShowPercs },
  ] as const;

  return (
    <div className="flex flex-col h-full">
      {expanded && (
        <div className="shrink-0 flex" style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex flex-col items-center justify-center px-5 py-2.5" style={{ flex: "0 0 50%", minWidth: 0, maxWidth: "50%" }}>
            <ul className="flex flex-col gap-0.5 text-center">
              {[
                `${n} qualifying candles — ${nUp} up-days, ${nDown} down-days`,
                `Median failure swing: ${p50} pips`,
                `75th percentile: ${p75} pips`,
                `90th percentile: ${p90} pips`,
                todayFs !== null ? `Today: ${todayFs} pips (${todayRank}th pct)` : "Today: doji — no failure swing",
              ].map((b, i) => (
                <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{b}</li>
              ))}
            </ul>
          </div>
          <div style={{ width: 1, background: "var(--border-medium)", alignSelf: "stretch", margin: "8px 0" }} />
          <div className="flex-1 flex items-center justify-center px-5 py-2.5">
            <p className="text-[11px] leading-relaxed text-center" style={{ color: "var(--text-secondary)" }}>
              Failure swing measures intra-candle rejection. On up-days it is the lower wick — how far price dipped below the open before closing higher. On down-days it is the upper wick — how far price pushed above the open before closing lower. Large failure swings signal strong directional rejection and add conviction to the prevailing move. The CDF curve shows how today's failure swing ranks against all qualifying historical sessions.
            </p>
          </div>
        </div>
      )}

      <div className="shrink-0 flex items-center gap-1.5 px-2 pt-1" style={{ paddingLeft: yAxisWidth }}>
        {TOGGLES.map(({ key, label, color, on, set }) => (
          <button key={key} onClick={() => set(v => !v)} className="flex items-center gap-1 rounded-full cursor-pointer"
            style={{
              fontSize: expanded ? 10 : 8, fontWeight: 700, letterSpacing: "0.06em",
              padding: expanded ? "2px 8px" : "1px 6px",
              border: `1px solid ${on ? color + "66" : "rgba(255,255,255,0.10)"}`,
              background: on ? color + "18" : "transparent",
              color: on ? color : "var(--text-muted)", transition: "all 0.15s",
            }}>
            <span style={{ width: expanded ? 6 : 5, height: expanded ? 6 : 5, borderRadius: "50%", background: on ? color : "var(--text-muted)", flexShrink: 0 }} />
            {label}
          </button>
        ))}
        {!expanded && todayFs !== null && (
          <span className="ml-auto text-[8px] tabular-nums pr-1" style={{ color: "var(--text-muted)" }}>
            Today: <span style={{ color: "#fbbf24", fontWeight: 700 }}>{todayFs}p</span>
            {todayRank !== null && <> · {todayRank}th pct</>}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={cdfData} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="pip"
              type="number"
              domain={[0, maxPip]}
              tick={tickStyle}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `${v}p`}
              interval={Math.max(0, Math.floor(maxPip / (expanded ? 12 : 6)) - 1)}
            />
            <YAxis
              domain={[0, 100]}
              tick={tickStyle}
              tickLine={false}
              axisLine={false}
              width={yAxisWidth}
              tickFormatter={v => `${v}%`}
              ticks={[0, 25, 50, 75, 90, 100]}
            />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1, strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as { pip: number; pct: number };
                return (
                  <div className="rounded-lg px-3 py-2 text-[10px]" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-medium)", color: "var(--text-secondary)" }}>
                    <div style={{ color: "#60a5fa", fontWeight: 700 }}>{d.pip} pips</div>
                    <div>{d.pct.toFixed(1)}% of days ≤ this</div>
                    <div style={{ color: "var(--text-muted)" }}>{(100 - d.pct).toFixed(1)}% exceed this</div>
                  </div>
                );
              }}
            />
            {showPercs && <>
              <ReferenceLine y={25} stroke="rgba(148,163,184,0.18)" strokeDasharray="3 3" label={{ value: "p25", position: "insideRight", fontSize: expanded ? 9 : 7, fill: "rgba(148,163,184,0.45)" }} />
              <ReferenceLine y={50} stroke="rgba(148,163,184,0.28)" strokeDasharray="3 3" label={{ value: "p50", position: "insideRight", fontSize: expanded ? 9 : 7, fill: "rgba(148,163,184,0.55)" }} />
              <ReferenceLine y={75} stroke="rgba(148,163,184,0.22)" strokeDasharray="3 3" label={{ value: "p75", position: "insideRight", fontSize: expanded ? 9 : 7, fill: "rgba(148,163,184,0.50)" }} />
              <ReferenceLine y={90} stroke="rgba(148,163,184,0.18)" strokeDasharray="3 3" label={{ value: "p90", position: "insideRight", fontSize: expanded ? 9 : 7, fill: "rgba(148,163,184,0.45)" }} />
            </>}
            {showToday && todayFs !== null && (
              <ReferenceLine
                x={todayFs}
                stroke="#fbbf24"
                strokeWidth={expanded ? 2 : 1.5}
                strokeOpacity={0.75}
                label={{ value: `${todayFs}p`, position: "insideTopRight", fontSize: expanded ? 10 : 8, fill: "#fbbf24" }}
              />
            )}
            {showCdf && (
              <Area
                dataKey="pct"
                name="CDF"
                type="monotone"
                dot={false}
                strokeWidth={expanded ? 2 : 1.5}
                stroke="#60a5fa"
                fill="rgba(96,165,250,0.07)"
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {expanded && (
        <div className="shrink-0 flex items-center" style={{ paddingLeft: yAxisWidth + 6, paddingRight: 6, borderTop: "1px solid var(--border-subtle)", paddingTop: 3, paddingBottom: 3 }}>
          {[
            { label: "n days", value: String(n),     color: "var(--text-secondary)" },
            { label: "p50",    value: `${p50} pips`, color: "#94a3b8" },
            { label: "p75",    value: `${p75} pips`, color: "#60a5fa" },
            { label: "p90",    value: `${p90} pips`, color: "#a78bfa" },
            ...(todayFs !== null ? [{ label: "Today", value: `${todayFs}p · ${todayRank}th`, color: "#fbbf24" }] : []),
          ].map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center">
              <span style={{ fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>{m.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: m.color }}>{m.value}</span>
            </div>
          ))}
        </div>
      )}

      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#60a5fa", name: "Failure Swing CDF", body: "The Cumulative Distribution Function plots the probability that a failure swing is ≤ a given pip value. Find any pip value on the x-axis, trace up to the blue line, then read the y-axis — that percentage of qualifying sessions had a failure swing at or below that level. A steep early rise means most failure swings are small and clustered near zero. A gradual slope indicates a wide distribution — price regularly makes large intra-day wicks before reversing." },
            { color: "#94a3b8", name: "Percentile Bands",  body: "Dashed lines mark the 25th, 50th (median), 75th, and 90th percentiles. The 75th percentile is the most actionable reference: it separates routine intra-day noise from meaningful rejection. When the yellow Today line sits above the 75th percentile the market is showing above-average intra-candle rejection. Above the 90th marks an extreme session. Below the 50th is a quiet, low-conviction day with little directional conviction inside the candle." },
          ].map((item, i, arr) => (
            <div key={item.name} className="flex-1 flex flex-col gap-1 px-3 py-2.5" style={{ borderRight: i < arr.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
              <div className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <span className="text-[10px] font-bold" style={{ color: item.color }}>{item.name}</span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const VOLA_WINDOW = 20;

function VolatilityPanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize = expanded ? 40 : VOLA_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset]           = useState(0);
  const [showClose,   setShowClose]   = useState(true);
  const [showUpper,   setShowUpper]   = useState(true);
  const [showMid,     setShowMid]     = useState(true);
  const [showLower,   setShowLower]   = useState(true);
  const [showCandles, setShowCandles] = useState(() => localStorage.getItem("tm_bb_show_candles") === "1");
  const chartRef  = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const handler = () => setShowCandles(localStorage.getItem("tm_bb_show_candles") === "1");
    window.addEventListener("tm:bb-candles-changed", handler);
    return () => window.removeEventListener("tm:bb-candles-changed", handler);
  }, []);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const data = useMemo(() => {
    const start = rows.length - windowSize - offset;
    const end   = rows.length - offset;
    const slice = rows.slice(Math.max(0, start), end);
    return slice.map((r, i) => {
      const parts     = r.date.split("-");
      const monthIdx  = parseInt(parts[1]) - 1;
      const prevMonth = i > 0 ? parseInt(slice[i-1].date.split("-")[1]) - 1 : -1;
      return {
        idx:     i,
        date:    parseInt(parts[2]).toString(),
        month:   monthIdx !== prevMonth ? MONTHS[monthIdx] : "",
        open:    r.open,
        high:    r.high,
        low:     r.low,
        close:   r.close,
        upper:   r.bbUpper,
        mid:     r.bbMiddle,
        lower:   r.bbLower,
        histVol: r.histVol * 100,
      };
    });
  }, [rows, offset, windowSize]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 60 : 44;
  const analysis   = useMemo(() => expanded ? buildVolatilityAnalysis(rows) : null, [rows, expanded]);

  const priceDomain = useMemo(() => {
    const vals: number[] = [];
    data.forEach(d => {
      if (showClose && showCandles) { vals.push(d.high); vals.push(d.low); }
      else if (showClose) vals.push(d.close);
      if (showUpper) vals.push(d.upper);
      if (showMid)   vals.push(d.mid);
      if (showLower) vals.push(d.lower);
    });
    if (!vals.length) return ["auto", "auto"] as const;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.15;
    return [min - pad, max + pad] as const;
  }, [data, showClose, showCandles, showUpper, showMid, showLower]);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setChartSize({ w: r.width, h: r.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const latest = data[data.length - 1];

  const TOGGLES = [
    { key: "close", label: "Close",    color: "rgba(255,255,255,0.75)", on: showClose, set: setShowClose },
    { key: "upper", label: "BB Upper", color: "#a78bfa",                on: showUpper, set: setShowUpper },
    { key: "mid",   label: "BB Mid",   color: "#94a3b8",                on: showMid,   set: setShowMid   },
    { key: "lower", label: "BB Lower", color: "#60a5fa",                on: showLower, set: setShowLower },
  ] as const;

  return (
    <div className="flex flex-col h-full">
      {expanded && analysis && (
        <div className="shrink-0 flex" style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex flex-col items-center justify-center px-5 py-2.5" style={{ flex: "0 0 50%", minWidth: 0, maxWidth: "50%" }}>
            <ul className="flex flex-col gap-0.5 text-center">
              {analysis.bullets.map((b, i) => (
                <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{b}</li>
              ))}
            </ul>
          </div>
          <div style={{ width: 1, background: "var(--border-medium)", alignSelf: "stretch", margin: "8px 0" }} />
          <div className="flex-1 flex items-center justify-center px-5 py-2.5">
            <p className="text-[11px] leading-relaxed text-center" style={{ color: "var(--text-secondary)" }}>{analysis.description}</p>
          </div>
        </div>
      )}

      {expanded && <div className="shrink-0 flex items-center gap-1.5 px-2 pt-1" style={{ paddingLeft: yAxisWidth }}>
        {TOGGLES.map(({ key, label, color, on, set }) => (
          <button
            key={key}
            onClick={() => set(v => !v)}
            className="flex items-center gap-1 rounded-full cursor-pointer"
            style={{
              fontSize:      10,
              fontWeight:    700,
              letterSpacing: "0.06em",
              padding:       "2px 8px",
              border:        `1px solid ${on ? color + "66" : "rgba(255,255,255,0.10)"}`,
              background:    on ? color + "18" : "transparent",
              color:         on ? color : "var(--text-muted)",
              transition:    "all 0.15s",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: on ? color : "var(--text-muted)", flexShrink: 0 }} />
            {label}
          </button>
        ))}
        {(
          <button
            onClick={() => {
              const next = !showCandles;
              localStorage.setItem("tm_bb_show_candles", next ? "1" : "0");
              setShowCandles(next);
              window.dispatchEvent(new Event("tm:bb-candles-changed"));
            }}
            className="flex items-center gap-1 rounded-full cursor-pointer"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: "2px 8px",
              marginLeft: 6,
              border: `1px solid ${showCandles ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.10)"}`,
              background: showCandles ? "rgba(255,255,255,0.08)" : "transparent",
              color: showCandles ? "var(--text-primary)" : "var(--text-muted)",
              transition: "all 0.15s",
            }}
          >
            {showCandles ? "Candles" : "Line"}
          </button>
        )}
      </div>}

      <div ref={chartRef} className="flex-1 min-h-0" style={{ position: "relative" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <XAxis dataKey="idx" type="number" domain={[0, data.length - 1]} hide />
            <YAxis yAxisId="price" tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={priceDomain} tickFormatter={v => v.toFixed(4)} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              position={{ x: 10, y: 10 }}
              wrapperStyle={{ zIndex: 10 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as typeof data[0];
                const bw    = Math.round((d.upper - d.lower) * 10000);
                const bbPct = d.upper > d.lower ? ((d.close - d.lower) / (d.upper - d.lower) * 100).toFixed(1) : "—";
                return (
                  <div style={{ background: "var(--bg-panel-alt)", border: "1px solid var(--border-medium)", borderRadius: 8, padding: "6px 10px", fontSize: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 2, color: d.close > d.upper ? "#a78bfa" : d.close < d.lower ? "#60a5fa" : "rgba(255,255,255,0.85)" }}>{d.close.toFixed(4)}</div>
                    <div style={{ color: "#a78bfa" }}>Upper: {d.upper.toFixed(4)}</div>
                    <div style={{ color: "#94a3b8" }}>Mid: {d.mid.toFixed(4)}</div>
                    <div style={{ color: "#60a5fa" }}>Lower: {d.lower.toFixed(4)}</div>
                    <div style={{ color: "var(--text-muted)" }}>BW: {bw} pips · %B: {bbPct}%</div>
                  </div>
                );
              }}
            />
            {showUpper && <Line yAxisId="price" dataKey="upper" name="BB Upper" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#a78bfa" strokeDasharray="3 2" isAnimationActive={false} />}
            {showMid   && <Line yAxisId="price" dataKey="mid"   name="BB Mid"   type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#94a3b8" isAnimationActive={false} />}
            {showLower && <Line yAxisId="price" dataKey="lower" name="BB Lower" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#60a5fa" strokeDasharray="3 2" isAnimationActive={false} />}
            {showClose && !showCandles && <Line yAxisId="price" dataKey="close" name="Close" type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5} stroke="rgba(255,255,255,0.75)" isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>

        {/* Candle overlay — absolutely positioned SVG */}
        {showClose && showCandles && chartSize && (() => {
          const plotLeft   = yAxisWidth;
          const plotTop    = 4;
          const plotRight  = 6;
          const plotWidth  = chartSize.w - plotLeft - plotRight;
          const plotHeight = chartSize.h - plotTop;
          const [yMin, yMax] = priceDomain as [number, number];
          if (typeof yMin !== "number" || typeof yMax !== "number" || yMax === yMin) return null;
          const totalPoints = data.length;
          const xPx = (idx: number) => plotLeft + (idx / Math.max(totalPoints - 1, 1)) * plotWidth;
          const yPx = (val: number) => plotTop + ((yMax - val) / (yMax - yMin)) * plotHeight;
          const candleW = Math.max(2, Math.floor((plotWidth / Math.max(totalPoints - 1, 1)) * 0.6));
          return (
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
              {data.map(d => {
                const bull  = d.close >= d.open;
                const color = bull ? "#60a5fa" : "#a78bfa";
                const cx    = xPx(d.idx);
                const oY    = yPx(d.open);
                const cY    = yPx(d.close);
                const hY    = yPx(d.high);
                const lY    = yPx(d.low);
                const bodyTop = Math.min(oY, cY);
                const bodyH   = Math.max(1, Math.abs(cY - oY));
                return (
                  <g key={d.idx}>
                    <line x1={cx} y1={hY} x2={cx} y2={lY} stroke={color} strokeWidth={1} />
                    <rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} stroke={color} strokeWidth={1} />
                  </g>
                );
              })}
            </svg>
          );
        })()}
      </div>

      {latest && expanded && (
        <div className="shrink-0 flex items-center" style={{ paddingLeft: yAxisWidth + 6, paddingRight: 6, borderTop: "1px solid var(--border-subtle)", paddingTop: 3, paddingBottom: 3 }}>
          {[
            { label: "Hist Vol", value: latest.histVol.toFixed(2) + "%", color: "#94a3b8" },
            { label: "BB %B",    value: (latest.upper > latest.lower ? ((latest.close - latest.lower) / (latest.upper - latest.lower) * 100).toFixed(1) : "—") + "%", color: latest.close > latest.upper ? "#a78bfa" : latest.close < latest.lower ? "#60a5fa" : "var(--text-secondary)" },
            { label: "BW pips",  value: String(Math.round((latest.upper - latest.lower) * 10000)), color: "var(--text-secondary)" },
          ].map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center">
              <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>{m.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: m.color }}>{m.value}</span>
            </div>
          ))}
        </div>
      )}

      {maxOffset > 0 && (
        <input type="range" className="momentum-scroll" min={0} max={maxOffset} value={offset}
          onChange={e => setOffset(Number(e.target.value))} style={{ direction: "rtl" }} />
      )}

      <div className="flex flex-col shrink-0 pb-1" style={{ paddingLeft: yAxisWidth, paddingRight: 6 }}>
        <div className="flex justify-between">
          {data.map((d, i) => (
            <span key={i} style={{ fontSize: tickStyle.fontSize, color: "var(--text-muted)" }}>{d.date}</span>
          ))}
        </div>
        <div className="flex">
          {data.reduce<{ month: string; count: number }[]>((acc, d) => {
            if (d.month) acc.push({ month: d.month, count: 1 });
            else if (acc.length) acc[acc.length - 1].count++;
            return acc;
          }, []).map((g, i) => (
            <div key={i} className="text-center" style={{ flex: g.count, fontSize: tickStyle.fontSize, color: "var(--text-muted)", fontWeight: 700 }}>
              {g.month}
            </div>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#a78bfa", name: "BB Upper / Lower", body: "Bollinger Bands are set 2 standard deviations above and below a 20-period moving average. Price touching or piercing the upper band signals overbought conditions in ranging markets, or breakout strength in trending markets. The lower band signals oversold or bearish momentum. Bands widen in high-volatility regimes and contract during squeezes." },
            { color: "#94a3b8", name: "BB Midline (SMA20)", body: "The Bollinger midline is a 20-period SMA and acts as the mean-reversion target in ranging markets. In trending environments it acts as dynamic support (uptrend) or resistance (downtrend). BB %B measures where the close sits within the band: 100% = at upper band, 50% = at midline, 0% = at lower band." },
            { color: "#94a3b8", name: "Historical Volatility", body: "Historical Volatility (Hist Vol) is the annualised standard deviation of log returns — a statistical measure of how much price has dispersed over recent sessions. Rising Hist Vol confirms an active, trending market. Falling Hist Vol signals consolidation. Use alongside Bollinger Bandwidth to cross-check whether volatility compression is genuine or a data artefact." },
          ].map((item, i, arr) => (
            <div key={item.name} className="flex-1 flex flex-col gap-1 px-3 py-2.5" style={{ borderRight: i < arr.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
              <div className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <span className="text-[10px] font-bold" style={{ color: item.color }}>{item.name}</span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function buildMomentumAnalysis(rows: SheetRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 2) return { headline: "—", bullets: [], description: "—" };
  const idx  = rows.length - 1;
  const cur  = rows[idx];
  const cci  = cur.cci;
  const wr   = computeWR(rows, idx);
  const mom  = computeMom10(rows, idx);

  const cciZone = cci > 200 ? "extreme overbought" : cci > 100 ? "overbought" : cci < -200 ? "extreme oversold" : cci < -100 ? "oversold" : cci > 0 ? "mildly bullish" : "mildly bearish";
  const wrZone  = wr > -20 ? "overbought" : wr < -80 ? "oversold" : "neutral";

  const bullets = [
    `CCI: ${cci.toFixed(1)} — ${cciZone}`,
    `Williams %R: ${wr.toFixed(1)} — ${wrZone}`,
    `Momentum(10): ${mom >= 0 ? "+" : ""}${mom.toFixed(3)}% vs 10-session prior close`,
    cci > 100 && wr > -20 ? "CCI + WR both confirm overbought — pullback risk elevated"
      : cci < -100 && wr < -80 ? "CCI + WR both confirm oversold — bounce potential elevated"
      : "Oscillators mixed — no strong consensus extreme",
  ];

  let headline: string, description: string;
  if (cci > 100 && wr > -20) {
    headline    = "Dual Overbought — Pullback Risk Elevated";
    description = `CCI at ${cci.toFixed(0)} and Williams %R at ${wr.toFixed(1)} are both signalling overbought conditions simultaneously. This dual confirmation raises the probability of a near-term pullback or consolidation. Momentum(10) at ${mom >= 0 ? "+" : ""}${mom.toFixed(3)}% ${mom > 0 ? "confirms the prior trend but the pace is unsustainable." : "is already rolling over — weakening momentum supports the cautious read."} Avoid initiating new longs; watch for CCI to drop below +100 or %R to fall below −20 as early reversal signals.`;
  } else if (cci < -100 && wr < -80) {
    headline    = "Dual Oversold — Bounce Potential";
    description = `CCI at ${cci.toFixed(0)} and Williams %R at ${wr.toFixed(1)} are both deeply oversold. This dual signal suggests the current decline is overextended and a mean-reversion bounce is possible. Momentum(10) at ${mom >= 0 ? "+" : ""}${mom.toFixed(3)}%. A recovery of CCI above −100 combined with %R crossing above −80 would confirm the bounce is underway and offer a lower-risk long entry.`;
  } else if (cci > 100) {
    headline    = "CCI Overbought — Strong Bullish Momentum";
    description = `CCI at ${cci.toFixed(0)} has entered overbought territory above +100, confirming strong bullish momentum. Williams %R at ${wr.toFixed(1)} (${wrZone}) ${wr < -50 ? "has not yet reached overbought — the move may have further to run before exhausting" : "is also elevated, reinforcing mean-reversion caution"}. Momentum(10) at ${mom >= 0 ? "+" : ""}${mom.toFixed(3)}%. Monitor for a CCI rollover back below +100 as the first exit or tightening signal.`;
  } else if (cci < -100) {
    headline    = "CCI Oversold — Strong Bearish Momentum";
    description = `CCI at ${cci.toFixed(0)} is in oversold territory below −100, signalling dominant selling pressure. Williams %R at ${wr.toFixed(1)} (${wrZone}) ${wr > -50 ? "is not confirming oversold — further downside remains possible" : "reinforces the oversold picture"}. Momentum(10) at ${mom >= 0 ? "+" : ""}${mom.toFixed(3)}%. A CCI recovery above −100 alongside %R crossing above −80 would be the first indication of a base forming.`;
  } else {
    headline    = "Oscillators in Neutral Zone";
    description = `CCI at ${cci.toFixed(0)} sits in the neutral range (−100 to +100) with Williams %R at ${wr.toFixed(1)} (${wrZone}). No extreme momentum reading in either direction. Momentum(10) at ${mom >= 0 ? "+" : ""}${mom.toFixed(3)}%. In neutral oscillator environments, signals are weaker and mean-reversion trades carry lower edge. Wait for CCI to breach ±100 or %R to reach its extremes (above −20 or below −80) for a higher-conviction setup.`;
  }
  return { headline, bullets, description };
}

const MOM_WINDOW = 20;

function MomentumPanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize = expanded ? 40 : MOM_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset]   = useState(0);
  const [showCci, setShowCci] = useState(true);
  const [showWr,  setShowWr]  = useState(true);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const data = useMemo(() => {
    const startRow = Math.max(0, rows.length - windowSize - offset);
    const endRow   = rows.length - offset;
    const slice    = rows.slice(startRow, endRow);
    return slice.map((r, i) => {
      const rowIdx    = startRow + i;
      const parts     = r.date.split("-");
      const monthIdx  = parseInt(parts[1]) - 1;
      const prevMonth = i > 0 ? parseInt(slice[i-1].date.split("-")[1]) - 1 : -1;
      return {
        idx:   i,
        date:  parseInt(parts[2]).toString(),
        month: monthIdx !== prevMonth ? MONTHS[monthIdx] : "",
        cci:   r.cci,
        wr:    computeWR(rows, rowIdx),
        mom:   computeMom10(rows, rowIdx),
      };
    });
  }, [rows, offset, windowSize]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 44 : 32;
  const wrWidth    = expanded ? 44 : 32;
  const analysis   = useMemo(() => expanded ? buildMomentumAnalysis(rows) : null, [rows, expanded]);

  const cciDomain = useMemo(() => {
    if (!showCci || !data.length) return [-220, 220] as const;
    const abs = Math.max(110, ...data.map(d => Math.abs(d.cci)));
    return [-(abs * 1.12), abs * 1.12] as const;
  }, [data, showCci]);

  const latest = data[data.length - 1];

  const TOGGLES = [
    { key: "cci", label: "CCI",        color: "#f59e0b", on: showCci, set: setShowCci },
    { key: "wr",  label: "Williams %R", color: "#60a5fa", on: showWr,  set: setShowWr  },
  ] as const;

  return (
    <div className="flex flex-col h-full">
      {expanded && analysis && (
        <div className="shrink-0 flex" style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex flex-col items-center justify-center px-5 py-2.5" style={{ flex: "0 0 50%", minWidth: 0, maxWidth: "50%" }}>
            <ul className="flex flex-col gap-0.5 text-center">
              {analysis.bullets.map((b, i) => (
                <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{b}</li>
              ))}
            </ul>
          </div>
          <div style={{ width: 1, background: "var(--border-medium)", alignSelf: "stretch", margin: "8px 0" }} />
          <div className="flex-1 flex items-center justify-center px-5 py-2.5">
            <p className="text-[11px] leading-relaxed text-center" style={{ color: "var(--text-secondary)" }}>{analysis.description}</p>
          </div>
        </div>
      )}

      <div className="shrink-0 flex items-center gap-1.5 px-2 pt-1" style={{ paddingLeft: yAxisWidth }}>
        {TOGGLES.map(({ key, label, color, on, set }) => (
          <button
            key={key}
            onClick={() => set(v => !v)}
            className="flex items-center gap-1 rounded-full cursor-pointer"
            style={{
              fontSize:      expanded ? 10 : 8,
              fontWeight:    700,
              letterSpacing: "0.06em",
              padding:       expanded ? "2px 8px" : "1px 6px",
              border:        `1px solid ${on ? color + "66" : "rgba(255,255,255,0.10)"}`,
              background:    on ? color + "18" : "transparent",
              color:         on ? color : "var(--text-muted)",
              transition:    "all 0.15s",
            }}
          >
            <span style={{ width: expanded ? 6 : 5, height: expanded ? 6 : 5, borderRadius: "50%", background: on ? color : "var(--text-muted)", flexShrink: 0 }} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: showWr ? wrWidth : 6, bottom: 0, left: 0 }}>
            <XAxis dataKey="idx" type="number" domain={[0, data.length - 1]} hide />
            <YAxis yAxisId="cci" tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={cciDomain} tickFormatter={v => v.toFixed(0)} />
            {showWr && (
              <YAxis yAxisId="wr" orientation="right" tick={tickStyle} tickLine={false} axisLine={false} width={wrWidth} domain={[-105, 5]} tickFormatter={v => v.toFixed(0)} />
            )}
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              position={{ x: 10, y: 10 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as typeof data[0];
                return (
                  <div className="rounded-lg px-3 py-2 text-[10px]" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-medium)", color: "var(--text-secondary)" }}>
                    <div className="font-bold mb-1" style={{ color: d.cci > 100 ? "#a78bfa" : d.cci < -100 ? "#60a5fa" : "var(--text-primary)" }}>
                      CCI: {d.cci.toFixed(1)}
                    </div>
                    <div style={{ color: d.wr > -20 ? "#a78bfa" : d.wr < -80 ? "#60a5fa" : "var(--text-secondary)" }}>
                      %R: {d.wr.toFixed(1)}
                    </div>
                    <div style={{ color: d.mom >= 0 ? "#60a5fa" : "#a78bfa" }}>
                      Mom(10): {d.mom >= 0 ? "+" : ""}{d.mom.toFixed(3)}%
                    </div>
                  </div>
                );
              }}
            />
            <ReferenceLine yAxisId="cci" y={0}    stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
            <ReferenceLine yAxisId="cci" y={100}  stroke="rgba(167,139,250,0.28)" strokeWidth={1} strokeDasharray="3 3" />
            <ReferenceLine yAxisId="cci" y={-100} stroke="rgba(96,165,250,0.28)"  strokeWidth={1} strokeDasharray="3 3" />
            {showWr && <ReferenceLine yAxisId="wr" y={-20} stroke="rgba(167,139,250,0.22)" strokeWidth={1} strokeDasharray="2 4" />}
            {showWr && <ReferenceLine yAxisId="wr" y={-80} stroke="rgba(96,165,250,0.22)"  strokeWidth={1} strokeDasharray="2 4" />}
            {showCci && <Line yAxisId="cci" dataKey="cci" name="CCI"  type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#f59e0b" isAnimationActive={false} />}
            {showWr  && <Line yAxisId="wr"  dataKey="wr"  name="%R"   type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#60a5fa" isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {latest && expanded && (
        <div className="shrink-0 flex items-center" style={{ paddingLeft: yAxisWidth + 6, paddingRight: showWr ? wrWidth + 6 : 6, borderTop: "1px solid var(--border-subtle)", paddingTop: 3, paddingBottom: 3 }}>
          <div className="flex-1 flex flex-col items-center">
            <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Mom(10)</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: latest.mom >= 0 ? "#60a5fa" : "#a78bfa" }}>
              {latest.mom >= 0 ? "+" : ""}{latest.mom.toFixed(3)}%
            </span>
          </div>
        </div>
      )}

      {maxOffset > 0 && (
        <input type="range" className="momentum-scroll" min={0} max={maxOffset} value={offset}
          onChange={e => setOffset(Number(e.target.value))} style={{ direction: "rtl" }} />
      )}

      <div className="flex flex-col shrink-0 pb-1" style={{ paddingLeft: yAxisWidth, paddingRight: showWr ? wrWidth : 6 }}>
        <div className="flex justify-between">
          {data.map((d, i) => (
            <span key={i} style={{ fontSize: tickStyle.fontSize, color: "var(--text-muted)" }}>{d.date}</span>
          ))}
        </div>
        <div className="flex">
          {data.reduce<{ month: string; count: number }[]>((acc, d) => {
            if (d.month) acc.push({ month: d.month, count: 1 });
            else if (acc.length) acc[acc.length - 1].count++;
            return acc;
          }, []).map((g, i) => (
            <div key={i} className="text-center" style={{ flex: g.count, fontSize: tickStyle.fontSize, color: "var(--text-muted)", fontWeight: 700 }}>
              {g.month}
            </div>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#f59e0b", name: "CCI",          body: "The Commodity Channel Index measures how far price has deviated from its statistical mean. Above +100 = overbought; below −100 = oversold. Values between ±100 are neutral. CCI is a leading indicator — it turns before price and is particularly useful for spotting momentum extremes and divergences. Extreme readings above ±200 signal unsustainable moves." },
            { color: "#60a5fa", name: "Williams %R",  body: "Williams %R ranges from −100 (most oversold) to 0 (most overbought). Above −20 = overbought; below −80 = oversold. Like CCI, it measures where the close sits within the recent high-low range. When %R stays near 0 during a rally, it confirms bullish strength. When it fails to reach −20 on bounces in a downtrend, bearish momentum is dominant." },
            { color: "#60a5fa", name: "Momentum(10)", body: "Momentum(10) measures the percentage change in close price over the past 10 sessions. Positive values mean price is higher than 10 sessions ago (bullish); negative means lower (bearish). Unlike oscillators bounded by 0–100, Momentum is unbounded and captures the raw speed of the move. Accelerating positive Momentum in a rally confirms trend strength; decelerating Momentum warns of a slowdown." },
          ].map((item, i, arr) => (
            <div key={item.name} className="flex-1 flex flex-col gap-1 px-3 py-2.5" style={{ borderRight: i < arr.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
              <div className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <span className="text-[10px] font-bold" style={{ color: item.color }}>{item.name}</span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function buildPivotAnalysis(rows: SheetRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 1) return { headline: "—", bullets: [], description: "—" };
  const cur = rows[rows.length - 1];
  const { close, r1, r2, r3, s1, s2, s3 } = cur;

  const above = [{ name: "R1", v: r1 }, { name: "R2", v: r2 }, { name: "R3", v: r3 }]
    .filter(l => l.v > close).sort((a, b) => a.v - b.v);
  const below = [{ name: "S1", v: s1 }, { name: "S2", v: s2 }, { name: "S3", v: s3 }]
    .filter(l => l.v <= close).sort((a, b) => b.v - a.v);

  const nearRes = above[0];
  const nearSup = below[0];
  const distRes = nearRes ? Math.round((nearRes.v - close) * 10000) : null;
  const distSup = nearSup ? Math.round((close - nearSup.v) * 10000) : null;

  let zone: string;
  if      (close > r3) zone = "above R3";
  else if (close > r2) zone = "between R2–R3";
  else if (close > r1) zone = "between R1–R2";
  else if (close > s1) zone = "between S1–R1";
  else if (close > s2) zone = "between S1–S2";
  else if (close > s3) zone = "between S2–S3";
  else                 zone = "below S3";

  const bullets = [
    `Close: ${close.toFixed(4)} · Zone: ${zone}`,
    nearRes ? `Nearest resistance: ${nearRes.name} ${nearRes.v.toFixed(4)} — ${distRes} pips above` : "No resistance level above",
    nearSup ? `Nearest support: ${nearSup.name} ${nearSup.v.toFixed(4)} — ${distSup} pips below`   : "No support level below",
    `R1 ${r1.toFixed(4)} · S1 ${s1.toFixed(4)} · Core range ${Math.round((r1 - s1) * 10000)} pips`,
  ];

  let headline: string, description: string;
  if (close > r2) {
    headline    = "Breakout — Above Second Resistance";
    description = `Price has extended above R2 (${r2.toFixed(4)}) into the ${zone} zone. This signals significant bullish momentum. The next ceiling is ${nearRes ? `${nearRes.name} at ${nearRes.v.toFixed(4)}, ${distRes} pips away` : "beyond R3"}. R2 (${r2.toFixed(4)}) now flips to first pullback support — a hold above it keeps the bullish pivot structure intact.`;
  } else if (close > r1) {
    headline    = "Bullish — Trading Above R1";
    description = `Price has cleared R1 (${r1.toFixed(4)}) and is holding above first resistance — a bullish signal. The next target is R2 at ${r2.toFixed(4)}, ${Math.round((r2 - close) * 10000)} pips away. On any pullback, R1 (${r1.toFixed(4)}) flips to support; a bounce there is a high-probability continuation setup.`;
  } else if (close > s1) {
    headline    = "Neutral — Between S1 and R1";
    description = `Price is trading in the neutral pivot zone between S1 (${s1.toFixed(4)}) and R1 (${r1.toFixed(4)}) — a ${Math.round((r1 - s1) * 10000)}-pip balanced range. Neither bulls nor bears have conviction. A directional close outside this range is needed: above R1 (${r1.toFixed(4)}) for bullish bias, or below S1 (${s1.toFixed(4)}) for bearish.`;
  } else if (close > s2) {
    headline    = "Bearish — Below First Support";
    description = `Price has broken below S1 (${s1.toFixed(4)}) into bearish pivot territory. The next key support is S2 at ${s2.toFixed(4)}, ${Math.round((close - s2) * 10000)} pips below. To neutralize the bearish read, price must reclaim S1 (${s1.toFixed(4)}). Failure to hold S2 opens a test of S3 at ${s3.toFixed(4)}.`;
  } else {
    headline    = "Breakdown — Below Second Support";
    description = `Price is in deep bearish pivot territory, ${zone}. This signals broad selling pressure. ${nearSup ? `The nearest floor is ${nearSup.name} at ${nearSup.v.toFixed(4)}, ${distSup} pips away.` : ""} S2 (${s2.toFixed(4)}) is the key level to reclaim for any recovery. Sustained trade here confirms a bearish session bias.`;
  }
  return { headline, bullets, description };
}

const PVT_WINDOW = 20;

function PivotPanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize = expanded ? 40 : PVT_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset]       = useState(0);
  const [showClose, setShowClose]  = useState(true);
  const [showR1,    setShowR1]     = useState(true);
  const [showR2,    setShowR2]     = useState(true);
  const [showR3,    setShowR3]     = useState(false);
  const [showS1,    setShowS1]     = useState(true);
  const [showS2,    setShowS2]     = useState(true);
  const [showS3,    setShowS3]     = useState(false);
  const [showCandles, setShowCandles] = useState(false);
  const chartRef  = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = chartRef.current; if (!el) return;
    const obs = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setChartSize({ w: r.width, h: r.height });
    });
    obs.observe(el); return () => obs.disconnect();
  }, []);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const data = useMemo(() => {
    const start = rows.length - windowSize - offset;
    const end   = rows.length - offset;
    const slice = rows.slice(Math.max(0, start), end);
    return slice.map((r, i) => {
      const parts     = r.date.split("-");
      const monthIdx  = parseInt(parts[1]) - 1;
      const prevMonth = i > 0 ? parseInt(slice[i-1].date.split("-")[1]) - 1 : -1;
      return {
        idx:   i,
        date:  parseInt(parts[2]).toString(),
        month: monthIdx !== prevMonth ? MONTHS[monthIdx] : "",
        open:  r.open,
        high:  r.high,
        low:   r.low,
        close: r.close,
        r1: r.r1, r2: r.r2, r3: r.r3,
        s1: r.s1, s2: r.s2, s3: r.s3,
      };
    });
  }, [rows, offset, windowSize]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 60 : 44;
  const analysis   = useMemo(() => expanded ? buildPivotAnalysis(rows) : null, [rows, expanded]);

  const TOGGLES = [
    { key: "close", label: "Close", color: "rgba(255,255,255,0.75)", on: showClose, set: setShowClose },
    { key: "r1",    label: "R1",    color: "#fca5a5",                on: showR1,    set: setShowR1    },
    { key: "r2",    label: "R2",    color: "#a78bfa",                on: showR2,    set: setShowR2    },
    { key: "r3",    label: "R3",    color: "#ef4444",                on: showR3,    set: setShowR3    },
    { key: "s1",    label: "S1",    color: "#86efac",                on: showS1,    set: setShowS1    },
    { key: "s2",    label: "S2",    color: "#60a5fa",                on: showS2,    set: setShowS2    },
    { key: "s3",    label: "S3",    color: "#22c55e",                on: showS3,    set: setShowS3    },
  ] as const;

  const yDomain = useMemo(() => {
    const vals: number[] = [];
    data.forEach(d => {
      if (showClose) { vals.push(d.high); vals.push(d.low); }
      if (showR1)    vals.push(d.r1);
      if (showR2)    vals.push(d.r2);
      if (showR3)    vals.push(d.r3);
      if (showS1)    vals.push(d.s1);
      if (showS2)    vals.push(d.s2);
      if (showS3)    vals.push(d.s3);
    });
    if (!vals.length) return ["auto", "auto"] as const;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.12;
    return [min - pad, max + pad] as const;
  }, [data, showClose, showR1, showR2, showR3, showS1, showS2, showS3]);

  return (
    <div className="flex flex-col h-full">
      {expanded && analysis && (() => {
        const cur    = rows[rows.length - 1];
        const close  = cur.close;
        const levels = [
          { label: "R3", value: cur.r3, color: "#ef4444" },
          { label: "R2", value: cur.r2, color: "#a78bfa" },
          { label: "R1", value: cur.r1, color: "#fca5a5" },
          { label: "S1", value: cur.s1, color: "#86efac" },
          { label: "S2", value: cur.s2, color: "#60a5fa" },
          { label: "S3", value: cur.s3, color: "#22c55e" },
        ];
        const nearRes = levels.filter(l => l.value > close).sort((a, b) => a.value - b.value)[0];
        const nearSup = levels.filter(l => l.value <= close).sort((a, b) => b.value - a.value)[0];
        return (
          <div className="shrink-0 flex" style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
            <div className="flex flex-col items-center justify-center px-5 py-2.5" style={{ flex: "0 0 35%", minWidth: 0 }}>
              <ul className="flex flex-col gap-0.5 text-center">
                {analysis.bullets.map((b, i) => (
                  <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{b}</li>
                ))}
              </ul>
            </div>
            <div style={{ width: 1, background: "var(--border-medium)", alignSelf: "stretch", margin: "8px 0" }} />
            <div className="flex-1 flex items-center justify-center px-5 py-2.5">
              <p className="text-[11px] leading-relaxed text-center" style={{ color: "var(--text-secondary)" }}>{analysis.description}</p>
            </div>
            <div style={{ width: 1, background: "var(--border-medium)", alignSelf: "stretch", margin: "8px 0" }} />
            <div className="flex flex-col justify-center gap-1 px-5 py-2.5" style={{ flex: "0 0 160px", minWidth: 0 }}>
              {levels.map((l, i) => {
                const isNearest = l.label === nearRes?.label || l.label === nearSup?.label;
                return (
                  <div key={l.label}>
                    {i === 3 && (
                      <div className="flex items-center gap-2 my-0.5">
                        <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                        <span className="text-[8px] tabular-nums" style={{ color: "var(--text-muted)" }}>{close.toFixed(4)}</span>
                        <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[10px] font-black uppercase tracking-wide" style={{ color: l.color }}>{l.label}</span>
                      <span className="text-[11px] tabular-nums font-semibold" style={{ color: isNearest ? "var(--text-primary)" : "var(--text-secondary)" }}>
                        {l.value.toFixed(4)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div className="shrink-0 flex items-center gap-1.5 px-2 pt-1" style={{ paddingLeft: yAxisWidth }}>
        {TOGGLES.map(({ key, label, color, on, set }) => (
          <button
            key={key}
            onClick={() => set(v => !v)}
            className="flex items-center gap-1 rounded-full cursor-pointer"
            style={{
              fontSize:      expanded ? 10 : 8,
              fontWeight:    700,
              letterSpacing: "0.06em",
              padding:       expanded ? "2px 8px" : "1px 6px",
              border:        `1px solid ${on ? color + "66" : "rgba(255,255,255,0.10)"}`,
              background:    on ? color + "18" : "transparent",
              color:         on ? color : "var(--text-muted)",
              transition:    "all 0.15s",
            }}
          >
            <span style={{ width: expanded ? 6 : 5, height: expanded ? 6 : 5, borderRadius: "50%", background: on ? color : "var(--text-muted)", flexShrink: 0 }} />
            {label}
          </button>
        ))}
        {expanded && (
          <button
            onClick={() => setShowCandles(v => !v)}
            className="flex items-center gap-1 rounded-full cursor-pointer"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: "2px 8px",
              marginLeft: 6,
              border: `1px solid ${showCandles ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.10)"}`,
              background: showCandles ? "rgba(255,255,255,0.08)" : "transparent",
              color: showCandles ? "var(--text-primary)" : "var(--text-muted)",
              transition: "all 0.15s",
            }}
          >
            {showCandles ? "Candles" : "Line"}
          </button>
        )}
      </div>

      <div ref={chartRef} className="flex-1 min-h-0" style={{ position: "relative" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <XAxis dataKey="idx" type="number" domain={[0, data.length - 1]} hide />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={yDomain} tickFormatter={v => v.toFixed(4)} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              position={{ x: 10, y: 10 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as typeof data[0];
                const above = [{ n: "R3", v: d.r3 }, { n: "R2", v: d.r2 }, { n: "R1", v: d.r1 }].filter(l => l.v > d.close);
                const below = [{ n: "S1", v: d.s1 }, { n: "S2", v: d.s2 }, { n: "S3", v: d.s3 }].filter(l => l.v <= d.close);
                const nearRes = above.sort((a, b) => a.v - b.v)[0];
                const nearSup = below.sort((a, b) => b.v - a.v)[0];
                return (
                  <div className="rounded-lg px-3 py-2 text-[10px]" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-medium)", color: "var(--text-secondary)" }}>
                    <div className="font-bold mb-1" style={{ color: "rgba(255,255,255,0.85)" }}>{d.close.toFixed(4)}</div>
                    {nearRes && <div style={{ color: "#a78bfa" }}>↑ {nearRes.n}: {nearRes.v.toFixed(4)} ({Math.round((nearRes.v - d.close) * 10000)} pips)</div>}
                    {nearSup && <div style={{ color: "#60a5fa" }}>↓ {nearSup.n}: {nearSup.v.toFixed(4)} ({Math.round((d.close - nearSup.v) * 10000)} pips)</div>}
                  </div>
                );
              }}
            />
            {showR3    && <Line dataKey="r3"    name="R3"    type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#ef4444" strokeDasharray="3 2" isAnimationActive={false} />}
            {showR2    && <Line dataKey="r2"    name="R2"    type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#a78bfa" strokeDasharray="3 2" isAnimationActive={false} />}
            {showR1    && <Line dataKey="r1"    name="R1"    type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#fca5a5" strokeDasharray="3 2" isAnimationActive={false} />}
            {showS1    && <Line dataKey="s1"    name="S1"    type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#86efac" strokeDasharray="3 2" isAnimationActive={false} />}
            {showS2    && <Line dataKey="s2"    name="S2"    type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#60a5fa" strokeDasharray="3 2" isAnimationActive={false} />}
            {showS3    && <Line dataKey="s3"    name="S3"    type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#22c55e" strokeDasharray="3 2" isAnimationActive={false} />}
            {showClose && !showCandles && <Line dataKey="close" name="Close" type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5} stroke="rgba(255,255,255,0.75)" isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>

        {showClose && showCandles && chartSize && (() => {
          const plotLeft   = yAxisWidth;
          const plotTop    = 4;
          const plotWidth  = chartSize.w - yAxisWidth - 6;
          const plotHeight = chartSize.h - plotTop;
          const [yMin, yMax] = yDomain as [number, number];
          if (typeof yMin !== "number" || typeof yMax !== "number" || yMax === yMin) return null;
          const totalPoints = data.length;
          const xPx = (idx: number) => plotLeft + (idx / Math.max(totalPoints - 1, 1)) * plotWidth;
          const yPx = (val: number) => plotTop + ((yMax - val) / (yMax - yMin)) * plotHeight;
          const candleW = Math.max(2, Math.floor((plotWidth / Math.max(totalPoints - 1, 1)) * 0.6));
          return (
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
              {data.map(d => {
                const bull  = d.close >= d.open;
                const color = bull ? "#60a5fa" : "#a78bfa";
                const cx    = xPx(d.idx);
                const oY    = yPx(d.open);
                const cY    = yPx(d.close);
                const hY    = yPx(d.high);
                const lY    = yPx(d.low);
                const bodyTop = Math.min(oY, cY);
                const bodyH   = Math.max(1, Math.abs(cY - oY));
                return (
                  <g key={d.idx}>
                    <line x1={cx} y1={hY} x2={cx} y2={lY} stroke={color} strokeWidth={1} />
                    <rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} stroke={color} strokeWidth={1} />
                  </g>
                );
              })}
            </svg>
          );
        })()}
      </div>

      {maxOffset > 0 && (
        <input type="range" className="momentum-scroll" min={0} max={maxOffset} value={offset}
          onChange={e => setOffset(Number(e.target.value))} style={{ direction: "rtl" }} />
      )}

      <div className="flex flex-col shrink-0 pb-1" style={{ paddingLeft: yAxisWidth, paddingRight: 6 }}>
        <div className="flex justify-between">
          {data.map((d, i) => (
            <span key={i} style={{ fontSize: tickStyle.fontSize, color: "var(--text-muted)" }}>{d.date}</span>
          ))}
        </div>
        <div className="flex">
          {data.reduce<{ month: string; count: number }[]>((acc, d) => {
            if (d.month) acc.push({ month: d.month, count: 1 });
            else if (acc.length) acc[acc.length - 1].count++;
            return acc;
          }, []).map((g, i) => (
            <div key={i} className="text-center" style={{ flex: g.count, fontSize: tickStyle.fontSize, color: "var(--text-muted)", fontWeight: 700 }}>
              {g.month}
            </div>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#ef4444", name: "R1 / R2 / R3", body: "Resistance levels derived from the prior session's high, low, and close. R1 is the first target above the pivot; R2 and R3 mark progressively stronger resistance. A close above any resistance level turns it into new support. R3 is rarely tested in a single session — reaching it signals an exceptionally strong bullish move." },
            { color: "#60a5fa", name: "S1 / S2 / S3", body: "Support levels below the classic pivot point. S1 is the first demand zone; S2 and S3 are deeper levels that come into play on pronounced selling sessions. A close below any support level turns it into new resistance. S3 violations are typically associated with high-volatility, trend-driven sessions." },
          ].map((item, i, arr) => (
            <div key={item.name} className="flex-1 flex flex-col gap-1 px-3 py-2.5" style={{ borderRight: i < arr.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
              <div className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <span className="text-[10px] font-bold" style={{ color: item.color }}>{item.name}</span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function buildVolumeAnalysis(rows: SheetRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 2) return { headline: "—", bullets: [], description: "—" };
  const cur  = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const ratio    = cur.volumeSma20 > 0 ? cur.volume / cur.volumeSma20 : 1;
  const pctAbove = (ratio - 1) * 100;
  const bullish  = cur.close >= cur.open;
  const recent   = rows.slice(-20);
  const maxVol   = Math.max(...recent.map(r => r.volume));
  const isClimax = cur.volume >= maxVol * 0.95;
  const fmt = (v: number) => {
    if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(0) + "K";
    return v.toFixed(0);
  };
  const bullets = [
    `Volume: ${fmt(cur.volume)} · SMA(20): ${fmt(cur.volumeSma20)}`,
    `${pctAbove >= 0 ? "+" : ""}${pctAbove.toFixed(1)}% vs 20-session average`,
    `Session: ${bullish ? "bullish" : "bearish"} close · prev ${fmt(prev.volume)}`,
    isClimax
      ? "Climax-level volume — highest in the 20-session window"
      : `${(cur.volume / maxVol * 100).toFixed(0)}% of 20-session peak`,
  ];
  let headline: string, description: string;
  if (ratio >= 1.5 && bullish) {
    headline    = "High-Volume Bullish Surge";
    description = `Today's volume of ${fmt(cur.volume)} is ${pctAbove.toFixed(0)}% above the 20-session average — a high-participation advance. Heavy volume on an up session confirms institutional backing and raises the probability the move is sustainable. Pullbacks toward the session open (${cur.open.toFixed(4)}) are likely to attract buyers.`;
  } else if (ratio >= 1.5 && !bullish) {
    headline    = "High-Volume Bearish Selloff";
    description = `Today's volume of ${fmt(cur.volume)} is ${pctAbove.toFixed(0)}% above the 20-session average, signalling broad selling participation. High-volume down sessions indicate institutional distribution and can mark the onset of a sustained decline. The session open at ${cur.open.toFixed(4)} becomes key resistance on any recovery attempt.`;
  } else if (ratio >= 1.1 && bullish) {
    headline    = "Above-Average Volume — Bullish";
    description = `Volume is running ${pctAbove.toFixed(0)}% above its 20-session average on an advancing session. This confirms the move with above-average participation, though not at climax levels. Watch for a volume surge to confirm any breakout above recent highs.`;
  } else if (ratio >= 1.1 && !bullish) {
    headline    = "Above-Average Volume — Bearish";
    description = `Volume is ${pctAbove.toFixed(0)}% above its 20-session average on a declining session — sellers are showing up in numbers. The above-average participation adds weight to the bearish reading. A follow-through session on elevated volume would confirm downside momentum.`;
  } else if (ratio < 0.7) {
    headline    = "Low Volume — Consolidation Mode";
    description = `Volume at ${fmt(cur.volume)} is ${Math.abs(pctAbove).toFixed(0)}% below the 20-session average, signalling a low-participation session. Moves on thin volume are less meaningful and more prone to reversal. Await a high-volume directional session before committing to a position.`;
  } else {
    headline    = bullish ? "Average Volume — Moderate Bullish" : "Average Volume — Moderate Bearish";
    description = `Volume is near its 20-session average (${pctAbove >= 0 ? "+" : ""}${pctAbove.toFixed(0)}%), reflecting normal participation. The ${bullish ? "bullish" : "bearish"} session carries average conviction — neither a strong confirmation nor a warning sign. Look for volume expansion on the next directional session as a signal of larger-player commitment.`;
  }
  return { headline, bullets, description };
}

const VOL_WINDOW = 20;

function VolumePanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize = expanded ? 40 : VOL_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset]   = useState(0);
  const [showVol, setShowVol] = useState(true);
  const [showSma, setShowSma] = useState(true);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const fmt = (v: number) => {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(0) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(0) + "K";
    return v.toFixed(0);
  };

  const data = useMemo(() => {
    const start = rows.length - windowSize - offset;
    const end   = rows.length - offset;
    const slice = rows.slice(Math.max(0, start), end);
    return slice.map((r, i) => {
      const parts     = r.date.split("-");
      const monthIdx  = parseInt(parts[1]) - 1;
      const prevMonth = i > 0 ? parseInt(slice[i-1].date.split("-")[1]) - 1 : -1;
      return {
        idx:     i,
        date:    parseInt(parts[2]).toString(),
        month:   monthIdx !== prevMonth ? MONTHS[monthIdx] : "",
        volume:  r.volume,
        sma:     r.volumeSma20,
        bullish: r.close >= r.open,
      };
    });
  }, [rows, offset, windowSize]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 52 : 38;
  const analysis   = useMemo(() => expanded ? buildVolumeAnalysis(rows) : null, [rows, expanded]);

  const yDomain = useMemo(() => {
    const vals: number[] = [];
    data.forEach(d => {
      if (showVol) vals.push(d.volume);
      if (showSma) vals.push(d.sma);
    });
    if (!vals.length) return [0, "auto"] as const;
    return [0, Math.max(...vals) * 1.15] as const;
  }, [data, showVol, showSma]);

  const TOGGLES = [
    { key: "vol", label: "Volume",   color: "rgba(255,255,255,0.65)", on: showVol, set: setShowVol },
    { key: "sma", label: "Vol SMA",  color: "#f59e0b",                on: showSma, set: setShowSma },
  ] as const;

  return (
    <div className="flex flex-col h-full">
      {expanded && analysis && (
        <div className="shrink-0 flex" style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex flex-col items-center justify-center px-5 py-2.5" style={{ flex: "0 0 50%", minWidth: 0, maxWidth: "50%" }}>
            <ul className="flex flex-col gap-0.5 text-center">
              {analysis.bullets.map((b, i) => (
                <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{b}</li>
              ))}
            </ul>
          </div>
          <div style={{ width: 1, background: "var(--border-medium)", alignSelf: "stretch", margin: "8px 0" }} />
          <div className="flex-1 flex items-center justify-center px-5 py-2.5">
            <p className="text-[11px] leading-relaxed text-center" style={{ color: "var(--text-secondary)" }}>{analysis.description}</p>
          </div>
        </div>
      )}

      <div className="shrink-0 flex items-center gap-1.5 px-2 pt-1" style={{ paddingLeft: yAxisWidth }}>
        {TOGGLES.map(({ key, label, color, on, set }) => (
          <button
            key={key}
            onClick={() => set(v => !v)}
            className="flex items-center gap-1 rounded-full cursor-pointer"
            style={{
              fontSize:      expanded ? 10 : 8,
              fontWeight:    700,
              letterSpacing: "0.06em",
              padding:       expanded ? "2px 8px" : "1px 6px",
              border:        `1px solid ${on ? color + "66" : "rgba(255,255,255,0.10)"}`,
              background:    on ? color + "18" : "transparent",
              color:         on ? color : "var(--text-muted)",
              transition:    "all 0.15s",
            }}
          >
            <span style={{ width: expanded ? 6 : 5, height: expanded ? 6 : 5, borderRadius: "50%", background: on ? color : "var(--text-muted)", flexShrink: 0 }} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <XAxis dataKey="idx" type="number" domain={[0, data.length - 1]} hide />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={yDomain} tickFormatter={v => fmt(v)} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              position={{ x: 10, y: 10 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as typeof data[0];
                const ratio = d.sma > 0 ? d.volume / d.sma : 1;
                return (
                  <div className="rounded-lg px-3 py-2 text-[10px]" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-medium)", color: "var(--text-secondary)" }}>
                    <div className="font-bold mb-1" style={{ color: d.bullish ? "#60a5fa" : "#a78bfa" }}>{fmt(d.volume)}</div>
                    <div>SMA(20): {fmt(d.sma)}</div>
                    <div>Ratio: {ratio.toFixed(2)}×</div>
                  </div>
                );
              }}
            />
            {showVol && (
              <Bar dataKey="volume" isAnimationActive={false} radius={[2, 2, 0, 0]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.bullish ? "rgba(96,165,250,0.75)" : "rgba(167,139,250,0.75)"} />
                ))}
              </Bar>
            )}
            {showSma && <Line dataKey="sma" name="SMA(20)" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#f59e0b" isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {maxOffset > 0 && (
        <input type="range" className="momentum-scroll" min={0} max={maxOffset} value={offset}
          onChange={e => setOffset(Number(e.target.value))} style={{ direction: "rtl" }} />
      )}

      <div className="flex flex-col shrink-0 pb-1" style={{ paddingLeft: yAxisWidth, paddingRight: 6 }}>
        <div className="flex justify-between">
          {data.map((d, i) => (
            <span key={i} style={{ fontSize: tickStyle.fontSize, color: "var(--text-muted)" }}>{d.date}</span>
          ))}
        </div>
        <div className="flex">
          {data.reduce<{ month: string; count: number }[]>((acc, d) => {
            if (d.month) acc.push({ month: d.month, count: 1 });
            else if (acc.length) acc[acc.length - 1].count++;
            return acc;
          }, []).map((g, i) => (
            <div key={i} className="text-center" style={{ flex: g.count, fontSize: tickStyle.fontSize, color: "var(--text-muted)", fontWeight: 700 }}>
              {g.month}
            </div>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#60a5fa", name: "Volume (Bull)", body: "Volume on sessions where close ≥ open. Green bars signal buying-side participation. High bullish volume confirms upside moves and indicates institutional demand behind the advance." },
            { color: "#a78bfa", name: "Volume (Bear)", body: "Volume on sessions where close < open. Red bars signal selling-side participation. High bearish volume on declining sessions confirms distribution and downside conviction from larger players." },
            { color: "#f59e0b", name: "Vol SMA(20)",   body: "20-session simple moving average of volume — the baseline for measuring whether participation is elevated or suppressed. Volume significantly above this line amplifies the significance of the concurrent price move; volume below it suggests low-conviction conditions." },
          ].map((item, i, arr) => (
            <div key={item.name} className="flex-1 flex flex-col gap-1 px-3 py-2.5" style={{ borderRight: i < arr.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
              <div className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <span className="text-[10px] font-bold" style={{ color: item.color }}>{item.name}</span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const KELT_WINDOW = 20;

function KeltPanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize = expanded ? 40 : KELT_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset]           = useState(0);
  const [showClose,   setShowClose]   = useState(true);
  const [showUpper,   setShowUpper]   = useState(true);
  const [showMid,     setShowMid]     = useState(true);
  const [showLower,   setShowLower]   = useState(true);
  const [showCandles, setShowCandles] = useState(() => localStorage.getItem("tm_kelt_show_candles") === "1");
  const chartRef  = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const handler = () => setShowCandles(localStorage.getItem("tm_kelt_show_candles") === "1");
    window.addEventListener("tm:kelt-candles-changed", handler);
    return () => window.removeEventListener("tm:kelt-candles-changed", handler);
  }, []);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const data = useMemo(() => {
    const start = rows.length - windowSize - offset;
    const end   = rows.length - offset;
    const slice = rows.slice(Math.max(0, start), end);
    return slice.map((r, i) => {
      const parts     = r.date.split("-");
      const monthIdx  = parseInt(parts[1]) - 1;
      const prevMonth = i > 0 ? parseInt(slice[i-1].date.split("-")[1]) - 1 : -1;
      return {
        idx:   i,
        date:  parseInt(parts[2]).toString(),
        month: monthIdx !== prevMonth ? MONTHS[monthIdx] : "",
        open:  r.open,
        high:  r.high,
        low:   r.low,
        close: r.close,
        upper: r.keltnerUpper,
        mid:   r.keltnerMiddle,
        lower: r.keltnerLower,
      };
    });
  }, [rows, offset, windowSize]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 60 : 44;
  const analysis   = useMemo(() => expanded ? buildKeltAnalysis(rows) : null, [rows, expanded]);

  const TOGGLES = [
    { key: "close", label: "Close", color: "rgba(255,255,255,0.7)", on: showClose, set: setShowClose },
    { key: "upper", label: "Upper", color: "#a78bfa",               on: showUpper, set: setShowUpper },
    { key: "mid",   label: "Mid",   color: "#94a3b8",               on: showMid,   set: setShowMid   },
    { key: "lower", label: "Lower", color: "#60a5fa",               on: showLower, set: setShowLower },
  ] as const;

  const yDomain = useMemo(() => {
    const vals: number[] = [];
    data.forEach(d => {
      if (showClose && showCandles) { vals.push(d.high); vals.push(d.low); }
      else if (showClose) vals.push(d.close);
      if (showUpper) vals.push(d.upper);
      if (showMid)   vals.push(d.mid);
      if (showLower) vals.push(d.lower);
    });
    if (!vals.length) return ["auto", "auto"] as const;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.15;
    return [min - pad, max + pad] as const;
  }, [data, showClose, showCandles, showUpper, showMid, showLower]);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setChartSize({ w: r.width, h: r.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* AI analysis — expanded only */}
      {expanded && analysis && (
        <div className="shrink-0 flex" style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex flex-col items-center justify-center px-5 py-2.5" style={{ flex: "0 0 50%", minWidth: 0, maxWidth: "50%" }}>
            <ul className="flex flex-col gap-0.5 text-center">
              {analysis.bullets.map((b, i) => (
                <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{b}</li>
              ))}
            </ul>
          </div>
          <div style={{ width: 1, background: "var(--border-medium)", alignSelf: "stretch", margin: "8px 0" }} />
          <div className="flex-1 flex items-center justify-center px-5 py-2.5">
            <p className="text-[11px] leading-relaxed text-center" style={{ color: "var(--text-secondary)" }}>{analysis.description}</p>
          </div>
        </div>
      )}

      {/* Toggle badges */}
      <div className="shrink-0 flex items-center gap-1.5 px-2 pt-1" style={{ paddingLeft: yAxisWidth }}>
        {TOGGLES.map(({ key, label, color, on, set }) => (
          <button
            key={key}
            onClick={() => set(v => !v)}
            className="flex items-center gap-1 rounded-full cursor-pointer"
            style={{
              fontSize: expanded ? 10 : 8,
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: expanded ? "2px 8px" : "1px 6px",
              border: `1px solid ${on ? color + "66" : "rgba(255,255,255,0.10)"}`,
              background: on ? color + "18" : "transparent",
              color: on ? color : "var(--text-muted)",
              transition: "all 0.15s",
            }}
          >
            <span style={{ width: expanded ? 6 : 5, height: expanded ? 6 : 5, borderRadius: "50%", background: on ? color : "var(--text-muted)", flexShrink: 0 }} />
            {label}
          </button>
        ))}
        {expanded && (
          <button
            onClick={() => {
              const next = !showCandles;
              localStorage.setItem("tm_kelt_show_candles", next ? "1" : "0");
              setShowCandles(next);
              window.dispatchEvent(new Event("tm:kelt-candles-changed"));
            }}
            className="flex items-center gap-1 rounded-full cursor-pointer"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: "2px 8px",
              marginLeft: 6,
              border: `1px solid ${showCandles ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.10)"}`,
              background: showCandles ? "rgba(255,255,255,0.08)" : "transparent",
              color: showCandles ? "var(--text-primary)" : "var(--text-muted)",
              transition: "all 0.15s",
            }}
          >
            {showCandles ? "Candles" : "Line"}
          </button>
        )}
      </div>

      {/* Chart */}
      <div ref={chartRef} className="flex-1 min-h-0" style={{ position: "relative" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <XAxis dataKey="idx" type="number" domain={[0, data.length - 1]} hide />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={yDomain} tickFormatter={v => v.toFixed(4)} />
            <Tooltip content={<MaTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} position={{ x: 10, y: 10 }} wrapperStyle={{ zIndex: 10 }} />
            {showUpper && <Line dataKey="upper" name="Upper" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#a78bfa" strokeDasharray="3 2" isAnimationActive={false} />}
            {showMid   && <Line dataKey="mid"   name="Mid"   type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#94a3b8" isAnimationActive={false} />}
            {showLower && <Line dataKey="lower" name="Lower" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#60a5fa" strokeDasharray="3 2" isAnimationActive={false} />}
            {showClose && !showCandles && <Line dataKey="close" name="Close" type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5} stroke="rgba(255,255,255,0.75)" isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>

        {/* Candle overlay — absolutely positioned SVG */}
        {showClose && showCandles && chartSize && (() => {
          const plotLeft   = yAxisWidth;
          const plotTop    = 4;
          const plotWidth  = chartSize.w - yAxisWidth - 6;
          const plotHeight = chartSize.h - plotTop;
          const [yMin, yMax] = yDomain as [number, number];
          if (typeof yMin !== "number" || typeof yMax !== "number" || yMax === yMin) return null;
          const totalPoints = data.length;
          const xPx = (idx: number) => plotLeft + (idx / Math.max(totalPoints - 1, 1)) * plotWidth;
          const yPx = (val: number) => plotTop + ((yMax - val) / (yMax - yMin)) * plotHeight;
          const candleW = Math.max(2, Math.floor((plotWidth / Math.max(totalPoints - 1, 1)) * 0.6));
          return (
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
              {data.map(d => {
                const bull  = d.close >= d.open;
                const color = bull ? "#60a5fa" : "#a78bfa";
                const cx    = xPx(d.idx);
                const oY    = yPx(d.open);
                const cY    = yPx(d.close);
                const hY    = yPx(d.high);
                const lY    = yPx(d.low);
                const bodyTop = Math.min(oY, cY);
                const bodyH   = Math.max(1, Math.abs(cY - oY));
                return (
                  <g key={d.idx}>
                    <line x1={cx} y1={hY} x2={cx} y2={lY} stroke={color} strokeWidth={1} />
                    <rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} stroke={color} strokeWidth={1} />
                  </g>
                );
              })}
            </svg>
          );
        })()}
      </div>

      {/* Slider */}
      {maxOffset > 0 && (
        <input
          type="range"
          className="momentum-scroll"
          min={0}
          max={maxOffset}
          value={offset}
          onChange={e => setOffset(Number(e.target.value))}
          style={{ direction: "rtl" }}
        />
      )}

      {/* Date labels */}
      <div className="flex flex-col shrink-0 pb-1" style={{ paddingLeft: yAxisWidth, paddingRight: 6 }}>
        <div className="flex justify-between">
          {data.map((d, i) => (
            <span key={i} style={{ fontSize: tickStyle.fontSize, color: "var(--text-muted)" }}>{d.date}</span>
          ))}
        </div>
        <div className="flex">
          {data.reduce<{ month: string; count: number }[]>((acc, d) => {
            if (d.month) acc.push({ month: d.month, count: 1 });
            else if (acc.length) acc[acc.length - 1].count++;
            return acc;
          }, []).map((g, i) => (
            <div key={i} className="text-center" style={{ flex: g.count, fontSize: tickStyle.fontSize, color: "var(--text-muted)", fontWeight: 700 }}>
              {g.month}
            </div>
          ))}
        </div>
      </div>

      {/* Indicator glossary — expanded only */}
      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#a78bfa", name: "Upper Band", body: "The upper Keltner band = EMA(20) + 2× ATR(10). A close above this band signals a bullish breakout or overbought extreme depending on context. In a strong trend, price can ride the upper band. In a range, it marks a reversal zone." },
            { color: "#94a3b8", name: "Midline",    body: "The Keltner midline is an EMA(20) of price. It acts as a dynamic magnet — in ranges price gravitates back to it, and in trends it acts as first support (uptrend) or resistance (downtrend). The direction of the midline shows the current trend slope." },
            { color: "#60a5fa", name: "Lower Band", body: "The lower Keltner band = EMA(20) − 2× ATR(10). A close below signals bearish momentum or an oversold extreme. In downtrends, price can trail the lower band. In ranges, it marks a potential mean-reversion long zone back toward the midline." },
          ].map((item, i, arr) => (
            <div key={item.name} className="flex-1 flex flex-col gap-1 px-3 py-2.5" style={{ borderRight: i < arr.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
              <div className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <span className="text-[10px] font-bold" style={{ color: item.color }}>{item.name}</span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function buildSynthesisNarrative(result: AnalysisResult): {
  bullets: string[];
  summary: string;
  narrative: string;
  keyInsight: string;
} {
  const { direction, confidence, longScore, shortScore, riskReward, entry, stopLoss, tp1, signals } = result;
  const { trend, momentum, structure, volatility } = signals;
  const isLong = direction === "LONG";

  const alignedCount = [trend, momentum, structure, volatility].filter(g => g.bias === (isLong ? "bullish" : "bearish")).length;
  const opposedCount = [trend, momentum, structure, volatility].filter(g => g.bias === (isLong ? "bearish" : "bullish")).length;
  const neutralCount = [trend, momentum, structure, volatility].filter(g => g.bias === "neutral").length;

  const confLabel =
    confidence >= 80 ? "high-conviction" :
    confidence >= 65 ? "moderately strong" :
    confidence >= 50 ? "moderate"          : "tentative";

  const bullets = [
    `${alignedCount}/4 groups ${isLong ? "bullish" : "bearish"}${neutralCount > 0 ? ` · ${neutralCount} neutral` : ""}${opposedCount > 0 ? ` · ${opposedCount} opposed` : ""}`,
    `Long score ${longScore} vs Short score ${shortScore}`,
    `R/R ${riskReward.toFixed(1)}:1 · Entry ${entry.toFixed(4)} · SL ${stopLoss.toFixed(4)}`,
  ];

  // One-liner for compact panel — direction + primary driver
  const primaryCond = trend.bias === (isLong ? "bullish" : "bearish") && trend.conditions.length > 0
    ? trend.conditions[0]
    : momentum.conditions.length > 0 ? momentum.conditions[0]
    : structure.conditions.length > 0 ? structure.conditions[0]
    : "";
  const keyInsight =
    `${isLong ? "Bullish" : "Bearish"} bias · ${confidence}% confidence · ${alignedCount}/4 groups aligned` +
    (primaryCond ? ` — ${primaryCond.toLowerCase().replace(/\.$/, "")}.` : ".");

  // Short summary for expanded top bar
  const oppNote = opposedCount > 0
    ? ` ${opposedCount} group${opposedCount > 1 ? "s are" : " is"} opposed — watch for reversal risk.`
    : "";
  const summary =
    `${isLong ? "Bullish" : "Bearish"} bias, ${confLabel} at ${confidence}%. ` +
    `${alignedCount} of 4 signal groups agree` +
    (neutralCount > 0 ? `, ${neutralCount} neutral` : "") +
    `.${oppNote} ` +
    `Risk/reward ${riskReward.toFixed(1)}:1 — first target ${tp1.toFixed(4)}, stop ${stopLoss.toFixed(4)}.`;

  // Rich analytical narrative for the right column
  let narrative = isLong
    ? `EUR/USD is presenting a ${confLabel} long opportunity at ${confidence}% confidence. `
    : `EUR/USD is presenting a ${confLabel} short opportunity at ${confidence}% confidence. `;

  if (confidence >= 80) {
    narrative += `Signal alignment is broad and consistent — this is a well-supported, high-quality setup. `;
  } else if (confidence >= 65) {
    narrative += `The majority of indicators agree, though some conditions are mixed — size accordingly. `;
  } else if (confidence >= 50) {
    narrative += `The directional edge is real but not overwhelming — consider reduced exposure until more signals converge. `;
  } else {
    narrative += `The signal is weak and conflicted — treat as speculative until a clearer picture emerges. `;
  }

  if (trend.bias === (isLong ? "bullish" : "bearish") && trend.conditions.length > 0) {
    narrative += isLong
      ? `The trend backdrop is constructive: ${trend.conditions[0].toLowerCase()}. `
      : `The trend backdrop is deteriorating: ${trend.conditions[0].toLowerCase()}. `;
    if (trend.conditions.length > 1) narrative += `${trend.conditions[1]}. `;
  } else if (trend.bias !== "neutral") {
    narrative += `Note that trend indicators are not unanimously aligned — this is a mixed trend environment. `;
  }

  if (momentum.bias === (isLong ? "bullish" : "bearish") && momentum.conditions.length > 0) {
    narrative += `Momentum reinforces the case: ${momentum.conditions[0].toLowerCase()}. `;
    if (momentum.conditions.length > 1) narrative += `${momentum.conditions[1]}. `;
  } else if (momentum.bias === "neutral") {
    narrative += `Momentum is flat — the trade relies on trend and structure rather than oscillator confirmation. `;
  } else {
    narrative += `Momentum is diverging from price — wait for oscillators to confirm before committing full size. `;
  }

  if (structure.bias === (isLong ? "bullish" : "bearish") && structure.conditions.length > 0) {
    narrative += `Market structure supports the view: ${structure.conditions[0].toLowerCase()}. `;
    if (structure.conditions.length > 1) narrative += `${structure.conditions[1]}. `;
  } else if (structure.bias !== "neutral") {
    narrative += isLong
      ? `Market structure is not yet fully supportive — price has not cleared all key structural levels. `
      : `Market structure is providing resistance to the short thesis — watch key support closely. `;
  }

  if (volatility.bias === "neutral") {
    narrative += `Volatility is contained and conditions are orderly — the stop at ${stopLoss.toFixed(4)} is well-positioned relative to current ranges.`;
  } else {
    narrative += `Volatility is elevated, so widen expectations for intraday noise and reduce size accordingly. Stop is set at ${stopLoss.toFixed(4)}.`;
  }

  return { bullets, summary, narrative, keyInsight };
}

function AiSynthesisPanelBody({ result, expanded }: { result: AnalysisResult; expanded?: boolean }) {
  const { direction, confidence, longScore, shortScore, riskReward, entry, stopLoss, tp1, tp2, tp3, signals } = result;
  const { trend, momentum, structure, volatility } = signals;

  const isLong       = direction === "LONG";
  const verdictColor  = isLong ? "#60a5fa" : "#a78bfa";
  const verdictBg     = isLong ? "rgba(96,165,250,0.12)"  : "rgba(167,139,250,0.12)";
  const verdictBorder = isLong ? "rgba(96,165,250,0.30)"  : "rgba(167,139,250,0.30)";

  const biasDot   = (b: string) => b === "bullish" ? "#60a5fa" : b === "bearish" ? "#a78bfa" : "#94a3b8";
  const biasLabel = (b: string) => b === "bullish" ? "Bullish"  : b === "bearish" ? "Bearish"  : "Neutral";

  const groups = [
    { name: "Trend",      ...trend      },
    { name: "Momentum",   ...momentum   },
    { name: "Structure",  ...structure  },
    { name: "Volatility", ...volatility },
  ];

  const { bullets, summary, narrative } = buildSynthesisNarrative(result);

  if (!expanded) {
    return (
      <div className="h-full flex items-stretch overflow-hidden">
        {/* Left: verdict + score badges */}
        <div className="flex flex-col justify-center px-3 gap-1.5 overflow-hidden" style={{ flex: "0 0 27%", minWidth: 0 }}>
          <div className="flex items-center gap-2">
            <span className="text-[22px] font-black tracking-wider leading-none shrink-0" style={{ color: verdictColor }}>
              {direction}
            </span>
            <div className="flex items-center gap-1.5 min-w-0" style={{ flex: 1 }}>
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)" }}>
                <div style={{ width: `${confidence}%`, height: "100%", borderRadius: 2, background: verdictColor }} />
              </div>
              <span className="text-[11px] tabular-nums font-semibold shrink-0" style={{ color: verdictColor }}>{confidence}%</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-semibold">
            <span style={{ color: "#60a5fa" }}>LONG {longScore}</span>
            <span style={{ color: "var(--text-muted)" }}>/</span>
            <span style={{ color: "#a78bfa" }}>SHORT {shortScore}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {(result.longIndicators ?? []).map(label => (
              <span key={label} className="text-[8.5px] font-semibold px-1.5 py-0.5 rounded-full" style={{
                color:      "#60a5fa",
                background: "rgba(96,165,250,0.12)",
                border:     "1px solid rgba(96,165,250,0.25)",
              }}>{label}</span>
            ))}
            {(result.shortIndicators ?? []).map(label => (
              <span key={label} className="text-[8.5px] font-semibold px-1.5 py-0.5 rounded-full" style={{
                color:      "#a78bfa",
                background: "rgba(167,139,250,0.12)",
                border:     "1px solid rgba(167,139,250,0.25)",
              }}>{label}</span>
            ))}
          </div>
        </div>
        <div style={{ width: 1, background: "var(--border-subtle)", alignSelf: "stretch", margin: "8px 0", flexShrink: 0 }} />
        {/* Middle: signal groups */}
        <div className="flex flex-col justify-center gap-1.5 px-3" style={{ flex: "0 0 20%", minWidth: 0 }}>
          {groups.map(g => (
            <div key={g.name} className="flex items-center gap-1.5">
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: biasDot(g.bias), flexShrink: 0 }} />
              <span className="text-[11px]" style={{ color: "var(--text-muted)", minWidth: 56 }}>{g.name}</span>
              <span className="text-[11px] font-semibold" style={{ color: biasDot(g.bias) }}>{biasLabel(g.bias)}</span>
            </div>
          ))}
        </div>
        <div style={{ width: 1, background: "var(--border-subtle)", alignSelf: "stretch", margin: "8px 0", flexShrink: 0 }} />
        {/* Positioning */}
        <div className="flex flex-col justify-center gap-0.5 px-3 py-2" style={{ flex: "0 0 18%", minWidth: 0 }}>
          <span className="text-[9px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>Positioning</span>
          {[
            { label: "Entry", val: entry.toFixed(4),    color: "var(--text-primary)" },
            { label: "Stop",  val: stopLoss.toFixed(4), color: "#a78bfa" },
            { label: "TP 1",  val: tp1.toFixed(4),      color: "#60a5fa" },
            { label: "TP 2",  val: tp2.toFixed(4),      color: "#60a5fa" },
            { label: "TP 3",  val: tp3.toFixed(4),      color: "#60a5fa" },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between">
              <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>{row.label}</span>
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: row.color }}>{row.val}</span>
            </div>
          ))}
        </div>
        <div style={{ width: 1, background: "var(--border-subtle)", alignSelf: "stretch", margin: "8px 0", flexShrink: 0 }} />
        {/* Far right: synthesis text */}
        <div className="flex-1 flex items-center px-3 py-1 min-w-0">
          <p className="text-[11px]" style={{ color: "var(--text-secondary)", lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical" }}>{narrative}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* AI analysis block */}
      <div className="shrink-0 flex" style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
        <div className="flex flex-col items-center justify-center px-5 py-2.5" style={{ flex: "0 0 50%", minWidth: 0 }}>
          <ul className="flex flex-col gap-0.5 text-center">
            {bullets.map((b, i) => (
              <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{b}</li>
            ))}
          </ul>
        </div>
        <div style={{ width: 1, background: "var(--border-medium)", alignSelf: "stretch", margin: "8px 0" }} />
        <div className="flex-1 flex items-center justify-center px-5 py-2.5">
          <p className="text-[12px] leading-relaxed text-center" style={{ color: "var(--text-secondary)" }}>{summary}</p>
        </div>
      </div>
      {/* Main body — 3 columns */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left: verdict + entry plan */}
        <div className="flex flex-col items-center justify-center gap-4 px-6" style={{ flex: "0 0 26%", borderRight: "1px solid var(--border-subtle)" }}>
          <div className="flex flex-col items-center gap-2 w-full rounded-xl px-5 py-4" style={{ background: verdictBg, border: `1px solid ${verdictBorder}` }}>
            <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text-muted)" }}>Verdict</span>
            <span className="text-[30px] font-black tracking-wider leading-none" style={{ color: verdictColor }}>{direction}</span>
            <div className="flex items-center gap-2 w-full">
              <div style={{ flex: 1, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.08)" }}>
                <div style={{ width: `${confidence}%`, height: "100%", borderRadius: 3, background: verdictColor }} />
              </div>
              <span className="text-[12px] font-bold tabular-nums" style={{ color: verdictColor }}>{confidence}%</span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span style={{ color: "#60a5fa" }}>Long {longScore}</span>
              <span style={{ color: "var(--text-muted)" }}>vs</span>
              <span style={{ color: "#a78bfa" }}>Short {shortScore}</span>
            </div>
          </div>
          <div className="w-full flex flex-col gap-1.5">
            {[
              { label: "Entry",  val: entry.toFixed(4),            color: "var(--text-primary)" },
              { label: "Stop",   val: stopLoss.toFixed(4),         color: "#a78bfa" },
              { label: "TP 1",   val: tp1.toFixed(4),              color: "#60a5fa" },
              { label: "TP 2",   val: tp2.toFixed(4),              color: "#60a5fa" },
              { label: "TP 3",   val: tp3.toFixed(4),              color: "#60a5fa" },
              { label: "R/R",    val: `${riskReward.toFixed(1)}:1`, color: "var(--text-secondary)" },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{row.label}</span>
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: row.color }}>{row.val}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Middle: 4 signal groups */}
        <div className="flex flex-col flex-1 min-w-0" style={{ borderRight: "1px solid var(--border-subtle)" }}>
          {groups.map((g, i, arr) => (
            <div
              key={g.name}
              className="flex-1 flex flex-col px-4 py-3"
              style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--border-subtle)" : undefined }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: biasDot(g.bias), flexShrink: 0 }} />
                <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: biasDot(g.bias) }}>{g.name}</span>
                <span
                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full ml-auto"
                  style={{ color: biasDot(g.bias), background: `${biasDot(g.bias)}1a`, border: `1px solid ${biasDot(g.bias)}40` }}
                >
                  {biasLabel(g.bias)}
                </span>
              </div>
              <ul className="flex flex-col gap-0.5">
                {g.conditions.map((c, j) => (
                  <li key={j} className="text-[10px] flex items-start gap-1.5">
                    <span style={{ color: "var(--text-muted)", flexShrink: 0, lineHeight: "16px" }}>·</span>
                    <span style={{ color: "var(--text-secondary)" }}>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {/* Right: synthesis narrative */}
        <div className="flex flex-col px-6 py-5 gap-3" style={{ flex: "0 0 30%" }}>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Synthesis</span>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{narrative}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Candle pattern detection ─────────────────────────────────────────────────

interface CandlePattern {
  name:        string;
  bias:        "bullish" | "bearish";
  tier:        1 | 2 | 3;
  description: string;
}

const _bTop = (r: SheetRow) => Math.max(r.open, r.close);
const _bBot = (r: SheetRow) => Math.min(r.open, r.close);
const _bMid = (r: SheetRow) => (r.open + r.close) / 2;
const _bull = (r: SheetRow) => r.close >= r.open;
const _bear = (r: SheetRow) => r.close <  r.open;
const _isDojiBody  = (r: SheetRow) => { const b = Math.abs(r.close - r.open); const rng = r.high - r.low; return rng > 0 && b / rng < 0.10; };
const _isSmallBody = (r: SheetRow) => { const b = Math.abs(r.close - r.open); const rng = r.high - r.low; return rng > 0 && b / rng < 0.30; };

function detectCandlePatterns(candles: SheetRow[]): CandlePattern[] {
  if (candles.length < 2) return [];
  const out: CandlePattern[] = [];
  const c0 = candles[candles.length - 1];
  const c1 = candles[candles.length - 2];
  const c2 = candles.length >= 3 ? candles[candles.length - 3] : null;

  // ── Tier 1: multi-candle ──────────────────────────────────────────────────
  if (_bear(c1) && _bull(c0) && _bBot(c0) <= _bBot(c1) && _bTop(c0) >= _bTop(c1))
    out.push({ name: "Bullish Engulfing", bias: "bullish", tier: 1, description: "A large bullish candle fully engulfs the prior bearish body. Sellers lost control — buyers absorbed all selling pressure and closed near the high. Strong reversal signal at support." });

  if (_bull(c1) && _bear(c0) && _bBot(c0) <= _bBot(c1) && _bTop(c0) >= _bTop(c1))
    out.push({ name: "Bearish Engulfing", bias: "bearish", tier: 1, description: "A large bearish candle fully engulfs the prior bullish body. Buyers exhausted — sellers took complete control and closed the session near the low." });

  if (_bear(c1) && _bull(c0) && c0.low < c1.low && c0.close > c1.open && !(_bBot(c0) <= _bBot(c1) && _bTop(c0) >= _bTop(c1)))
    out.push({ name: "Bullish Engulfing Variant", bias: "bullish", tier: 1, description: "The market probed below the prior session's low then closed higher. Failed bearish pressure with bullish close — watch for follow-through confirmation." });

  if (_bull(c1) && _bear(c0) && c0.high > c1.high && c0.close < c1.open && !(_bBot(c0) <= _bBot(c1) && _bTop(c0) >= _bTop(c1)))
    out.push({ name: "Bearish Engulfing Variant", bias: "bearish", tier: 1, description: "The session spiked above the prior high but sellers drove price back below the prior open. Buyers were absorbed — sellers now in control." });

  if (_bear(c1) && _bull(c0) && c0.open < c1.low && c0.close > _bMid(c1) && c0.close < _bTop(c1))
    out.push({ name: "Piercing Line", bias: "bullish", tier: 1, description: "Price gapped below the prior low then rallied to close above the midpoint of the prior bearish candle. Strong demand below — potential bottom forming." });

  if (_bull(c1) && _bear(c0) && c0.open > c1.high && c0.close < _bMid(c1) && c0.close > _bBot(c1))
    out.push({ name: "Dark Cloud Cover", bias: "bearish", tier: 1, description: "Price gapped above the prior high then reversed to close below the midpoint of the prior bullish candle. Distribution at the top — potential decline ahead." });

  if (c2) {
    if (_bear(c2) && _isSmallBody(c1) && _bull(c0) && c1.open < c2.close && c0.open > c1.close && c0.close > _bMid(c2))
      out.push({ name: "Morning Star", bias: "bullish", tier: 1, description: "A three-candle reversal: bearish session, small-body pause gapping lower, then strong bullish recovery above the prior midpoint. Classic bottom formation." });

    if (_bear(c2) && _isDojiBody(c1) && _bull(c0) && c1.open < c2.close && c0.open > c1.close && c0.close > _bMid(c2))
      out.push({ name: "Doji Morning Star", bias: "bullish", tier: 1, description: "A doji-gapped-down followed by a bullish recovery. The doji's indecision is confirmed by buyers seizing control on the third candle — strong reversal signal." });

    if (_bull(c2) && _isSmallBody(c1) && _bear(c0) && c1.open > c2.close && c0.open < c1.close && c0.close < _bMid(c2))
      out.push({ name: "Evening Star", bias: "bearish", tier: 1, description: "A three-candle top: bullish session, small-body pause gapping higher, then strong bearish reversal below the prior midpoint. Buyers lost control." });

    if (_bull(c2) && _isDojiBody(c1) && _bear(c0) && c1.open > c2.close && c0.open < c1.close && c0.close < _bMid(c2))
      out.push({ name: "Doji Evening Star", bias: "bearish", tier: 1, description: "A doji-gapped-up followed by bearish follow-through. Failed upside and doji indecision confirmed by sellers — reliable top formation." });
  }

  // ── Tier 2: single-candle ─────────────────────────────────────────────────
  const c0Body = Math.abs(c0.close - c0.open);
  const c0UW   = c0.high - _bTop(c0);
  const c0LW   = _bBot(c0) - c0.low;

  if (c0Body > 0 && c0LW >= 2 * c0Body && c0UW <= c0Body) {
    if (_bear(c1))
      out.push({ name: "Hammer", bias: "bullish", tier: 2, description: "Long lower wick after a bearish session — sellers pushed price far down but buyers aggressively rejected lower levels. A bullish reversal signal awaiting confirmation." });
    else if (_bull(c1))
      out.push({ name: "Hanging Man", bias: "bearish", tier: 2, description: "Same shape as a hammer but after a bullish session. Sellers briefly overwhelmed buyers intraday — a warning the rally may be losing steam." });
  }

  if (c0Body > 0 && c0UW >= 2 * c0Body && c0LW <= c0Body) {
    if (_bear(c1))
      out.push({ name: "Inverted Hammer", bias: "bullish", tier: 2, description: "A spike above the open with a close near the low. Buyers made a push — if the next session confirms with a bullish open, a reversal may be developing." });
    else if (_bull(c1))
      out.push({ name: "Shooting Star", bias: "bearish", tier: 2, description: "Buyers drove price sharply higher intraday but sellers took control and closed near the low. A bearish reversal warning at the top of an advance." });
  }

  // ── Tier 3: needs confirmation ────────────────────────────────────────────
  const TOL      = 0.00020; // ~2 pips
  const prevBody = Math.abs(c1.close - c1.open);

  if (Math.abs(c0.low - c1.low) <= TOL)
    out.push({ name: "Tweezers Bottom", bias: "bullish", tier: 3, description: "Two sessions defending the same low — buyers absorbed selling pressure at this level twice. Strong support zone confirmed, but a bullish close on the next bar is needed." });

  if (Math.abs(c0.high - c1.high) <= TOL)
    out.push({ name: "Tweezers Top", bias: "bearish", tier: 3, description: "Two sessions rejecting the same high — sellers absorbed buying pressure twice. Strong resistance confirmed, but bearish follow-through on the next bar is required." });

  if (prevBody > 0 && c0Body < prevBody * 0.70 && _bTop(c0) < _bTop(c1) && _bBot(c0) > _bBot(c1)) {
    if (_bear(c1)) {
      if (_isDojiBody(c0))
        out.push({ name: "Bullish Harami Cross", bias: "bullish", tier: 3, description: "A doji nested inside a large bearish candle — perfect indecision after a down move. Buy pressure matching sell pressure. Needs a bullish close to confirm." });
      else
        out.push({ name: "Bullish Harami", bias: "bullish", tier: 3, description: "A small bullish candle inside a large bearish candle signals slowing downside momentum. Not yet a reversal — wait for a bullish close on the following session." });
    }
    if (_bull(c1)) {
      if (_isDojiBody(c0))
        out.push({ name: "Bearish Harami Cross", bias: "bearish", tier: 3, description: "A doji nested inside a large bullish candle — after an advance, sellers are matching buyers. Sign of exhaustion. Watch for bearish follow-through." });
      else
        out.push({ name: "Bearish Harami", bias: "bearish", tier: 3, description: "A small bearish candle inside a large bullish candle. Bullish momentum stalling — needs a bearish confirmation candle to complete the signal." });
    }
  }

  return out.sort((a, b) => a.tier - b.tier);
}

// ─── Candle Context Panel body ────────────────────────────────────────────────

function CandleContextPanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const candles = useMemo(() => rows.slice(-12), [rows]);
  const patterns = useMemo(() => detectCandlePatterns(candles), [candles]);

  const BULL = "#60a5fa";
  const BEAR = "#a78bfa";
  const biasColor = (b: string) => b === "bullish" ? BULL : BEAR;
  const tierColor = (t: number) => t === 1 ? "#fbbf24" : t === 2 ? "#60a5fa" : "#94a3b8";

  const yHigh  = useMemo(() => candles.length ? Math.max(...candles.map(c => c.high)) : 1,   [candles]);
  const yLow   = useMemo(() => candles.length ? Math.min(...candles.map(c => c.low))  : 0,   [candles]);
  const yRange = yHigh - yLow || 0.001;
  const yPad   = yRange * 0.14;

  const VB_W = 500;
  const VB_H = 160;
  const SLOT  = VB_W / Math.max(candles.length, 1);
  const CW    = SLOT * 0.48;

  function yPx(v: number) {
    return ((yHigh + yPad - v) / (yRange + yPad * 2)) * VB_H;
  }

  const candleSvg = (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none"
      style={{ display: "block", width: "100%", height: "100%" }}>
      {candles.map((c, i) => {
        const isBullC  = c.close >= c.open;
        const color    = isBullC ? BULL : BEAR;
        const fillRgba = isBullC ? "#60a5fa" : "#a78bfa";
        const cx       = SLOT * i + SLOT / 2;
        const oY = yPx(c.open);
        const cY = yPx(c.close);
        const hY = yPx(c.high);
        const lY = yPx(c.low);
        const bT = Math.min(oY, cY);
        const bH = Math.max(2, Math.abs(cY - oY));
        const isLast = i === candles.length - 1;
        return (
          <g key={i}>
            {isLast && <rect x={cx - SLOT / 2} y={0} width={SLOT} height={VB_H} fill={color} fillOpacity={0.05} />}
            <line x1={cx} y1={hY} x2={cx} y2={lY} stroke={color} strokeWidth={2} />
            <rect x={cx - CW / 2} y={bT} width={CW} height={bH} fill={fillRgba} stroke={color} strokeWidth={1.5} rx={2} />
          </g>
        );
      })}
    </svg>
  );

  if (!expanded) {
    return (
      <div className="h-full flex overflow-hidden">
        {/* Candles */}
        <div className="flex flex-col" style={{ flex: 1, minWidth: 0, position: "relative" }}>
          <div className="flex-1 min-h-0 px-1 py-1">{candleSvg}</div>
          <div style={{ position: "absolute", top: 6, right: 8, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
            {patterns.slice(0, 3).map((p, i) => {
              const bc = p.bias === "bullish"
                ? { color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.35)",  glow: "0 0 8px rgba(96,165,250,0.45)"  }
                : { color: "#a78bfa", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.35)", glow: "0 0 8px rgba(167,139,250,0.45)" };
              return (
                <span key={i} className="font-black uppercase rounded-full" style={{
                  fontSize: "8px", letterSpacing: "0.10em", padding: "2px 8px",
                  color: bc.color, background: bc.bg, border: `1px solid ${bc.border}`, boxShadow: bc.glow,
                }}>
                  <span style={{ color: tierColor(p.tier), marginRight: 4 }}>T{p.tier}</span>
                  {p.name}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Expanded ────────────────────────────────────────────────────────────────
  const [ohlcOpen, setOhlcOpen] = useState(false);
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top: candles + pattern list */}
      <div className="flex min-h-0" style={{ flex: "0 0 78%", borderBottom: "1px solid var(--border-subtle)" }}>
        {/* Candles + OHLC table */}
        <div className="flex flex-col" style={{ flex: "0 0 70%", borderRight: "1px solid var(--border-subtle)", padding: "10px 10px 6px 16px" }}>
          <div className="flex shrink-0 mb-1">
            {candles.map((c, i) => (
              <div key={i} className="flex-1 text-center text-[11px]" style={{ color: "var(--text-muted)" }}>
                {c.date.slice(5).replace("-", "/")}
              </div>
            ))}
          </div>
          <div className="flex-1 min-h-0">{candleSvg}</div>
          <div className="shrink-0" style={{ borderTop: "1px solid var(--border-subtle)", marginTop: 6 }}>
            <button
              onClick={() => setOhlcOpen(v => !v)}
              className="flex items-center gap-1.5 w-full px-0 py-1"
              style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
            >
              <span style={{ fontSize: 8 }}>{ohlcOpen ? "▾" : "▸"}</span>
              OHLC Data
            </button>
            {ohlcOpen && candles.map((c, i) => {
              const isBullC = c.close >= c.open;
              return (
                <div key={i} className="flex items-center gap-3 py-0.5" style={{ fontSize: 10, color: "var(--text-muted)", borderTop: "1px solid var(--border-subtle)" }}>
                  <span style={{ minWidth: 38 }}>{c.date.slice(5).replace("-", "/")}</span>
                  <span>O {c.open.toFixed(4)}</span>
                  <span>H {c.high.toFixed(4)}</span>
                  <span>L {c.low.toFixed(4)}</span>
                  <span style={{ color: isBullC ? BULL : BEAR }}>C {c.close.toFixed(4)}</span>
                  <span style={{ color: isBullC ? BULL : BEAR }}>{isBullC ? "▲" : "▼"} {((c.close - c.open) / c.open * 100).toFixed(3)}%</span>
                </div>
              );
            })}
          </div>
        </div>
        {/* Pattern list */}
        <div className="flex-1 flex flex-col gap-3 px-5 py-4 overflow-y-auto">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--text-muted)" }}>
            {patterns.length > 0 ? `${patterns.length} Pattern${patterns.length !== 1 ? "s" : ""} Detected` : "No Patterns Detected"}
          </div>
          {patterns.length === 0 && (
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              No recognizable reversal pattern on the last 2–3 candles. The market is in a continuation or consolidation phase — no high-probability setup signal from candle structure alone.
            </p>
          )}
          {patterns.map((p, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 8, fontWeight: 800, color: tierColor(p.tier), background: `${tierColor(p.tier)}18`, border: `1px solid ${tierColor(p.tier)}55`, borderRadius: 99, padding: "1px 8px", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Tier {p.tier}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: biasColor(p.bias) }}>{p.name}</span>
                <span style={{ fontSize: 8, fontWeight: 600, color: biasColor(p.bias), background: `${biasColor(p.bias)}15`, border: `1px solid ${biasColor(p.bias)}40`, borderRadius: 99, padding: "1px 8px", marginLeft: "auto", textTransform: "uppercase" as const }}>{p.bias}</span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{p.description}</p>
            </div>
          ))}
        </div>
      </div>
      {/* Bottom: tier reference */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {[
          { tier: 1, color: "#fbbf24", label: "Tier 1 — Multi-Candle Story", body: "These patterns require a prior directional move plus a pivot or pause candle, then a follow-through confirmation. They tell a complete story across 2–3 sessions: a direction, an exhaustion, and a reversal. Morning/Evening Star, Engulfing variants, Piercing Line, and Dark Cloud Cover all belong here. Highest reliability — the market is explicitly showing a change of control." },
          { tier: 2, color: "#60a5fa", label: "Tier 2 — Single-Candle Rejection", body: "Single candles with an extreme wick showing decisive intraday rejection of a price level. The key factor is context: a Hammer at the bottom of a decline is bullish, the same shape after a rally (Hanging Man) is bearish. Inverted Hammer needs a bullish confirmation candle; Shooting Star needs a bearish follow-through. The candle shape alone is not enough — location and next session matter." },
          { tier: 3, color: "#94a3b8", label: "Tier 3 — Needs Confirmation", body: "Solid structural signals that require the next candle to confirm. Tweezers show a level being defended twice in consecutive sessions — a tested support or resistance. Harami patterns show momentum stalling inside the prior candle's body, and the Harami Cross version uses a doji for maximum indecision. These are early alerts, not entry signals — always wait for the confirming session before acting." },
        ].map((item, i, arr) => (
          <div key={item.tier} className="flex-1 flex flex-col gap-1.5 px-5 py-3" style={{ borderRight: i < arr.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
            <div className="flex items-center gap-2">
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0, display: "inline-block" }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: item.color }}>{item.label}</span>
            </div>
            <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BlankPanel({ area, label, sub, style, onExpand, badge, subtitle, children,
  isDragging, isDragOver, containerRef, onHeaderMouseDown, pinned,
}: {
  area?: string;
  label: string;
  sub: string;
  style?: React.CSSProperties;
  onExpand: () => void;
  badge?: React.ReactNode;
  subtitle?: string;
  children?: React.ReactNode;
  isDragging?: boolean;
  isDragOver?: boolean;
  containerRef?: (el: HTMLDivElement | null) => void;
  onHeaderMouseDown?: (e: React.MouseEvent) => void;
  pinned?: boolean;
}) {
  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden flex flex-col"
      style={{
        gridArea:     area,
        borderRadius: "14px",
        border:       isDragOver ? "2px solid var(--accent)" : "2px solid transparent",
        background: [
          "linear-gradient(var(--bg-panel), var(--bg-panel)) padding-box",
          "radial-gradient(ellipse 80% 80% at 0% 0%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 100%) border-box",
        ].join(", "),
        opacity:    isDragging ? 0.45 : 1,
        transition: "opacity 0.15s, border-color 0.15s",
        ...style,
      }}
    >
      {/* Upper-left radial glow — matches dashboard panel treatment */}
      <div
        aria-hidden
        style={{
          position:        "absolute",
          inset:           0,
          pointerEvents:   "none",
          zIndex:          0,
          backgroundImage: "radial-gradient(ellipse 65% 45% at 10% 0%, rgba(255,255,255,0.045) 0%, transparent 70%)",
        }}
      />

      {/* Header */}
      <div
        className="flex items-center shrink-0 px-3 py-1.5"
        style={{ borderBottom: "1px solid var(--border-subtle)", zIndex: 1 }}
      >
        {/* Drag handle — hidden on pinned panels */}
        {!pinned && (
          <div
            className="shrink-0 flex items-center mr-1.5"
            style={{ cursor: "grab", color: "var(--text-muted)", opacity: 0.4 }}
            onMouseDown={onHeaderMouseDown}
          >
            <GripVertical size={11} />
          </div>
        )}
        <span
          className="shrink-0 text-[9px] font-black uppercase tracking-widest leading-tight whitespace-pre-line"
          style={{ color: "var(--text-secondary)" }}
        >
          {label}
        </span>
        <div className="flex-1 flex items-center justify-center px-2">
          {subtitle && (
            <span className="text-[11px] font-semibold leading-none" style={{ color: "var(--text-secondary)" }}>
              {subtitle}
            </span>
          )}
        </div>
        {badge && <div className="shrink-0 flex items-center mr-1">{badge}</div>}
        <button
          onClick={onExpand}
          className="flex items-center justify-center shrink-0 w-5 h-5 rounded-md ml-2"
          style={{
            background: "rgba(255,255,255,0.05)",
            border:     "1px solid var(--border-subtle)",
            color:      "var(--text-muted)",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.10)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
        >
          <Maximize2 size={9} />
        </button>
      </div>

      {/* Body */}
      <div className="relative flex-1 min-h-0" style={{ zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}

// Returns ms until the next 18:05 America/New_York (handles DST automatically).
function msUntilDailyRefresh(): number {
  const now   = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get   = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? '0');
  const etMin = get('hour') * 60 + get('minute');
  const target = 18 * 60 + 5; // 18:05 ET
  let ms = (target - etMin) * 60_000 - get('second') * 1000 - now.getMilliseconds();
  if (ms <= 0) ms += 24 * 60 * 60_000; // already past today's window — schedule for tomorrow
  return ms;
}

export function Analytics() {
  const { analysisResult, eurusdSnapshot, sheetRows } = useAnalytics();
  const [error, setError]       = useState<string | null>(null);
  const [expanded, setExpanded] = useState<PanelMeta | null>(null);
  const close = useCallback(() => setExpanded(null), []);

  // ── Panel drag-and-drop (mouse-event based — avoids HTML5 DnD cursor issues) ─
  const [panelOrder,    setPanelOrder]    = useState<string[]>(() => getAnalyticsPanelOrder(INITIAL_PANEL_ORDER));
  const [draggingSlot,  setDraggingSlot]  = useState<number | null>(null);
  const [dragOverSlot,  setDragOverSlot]  = useState<number | null>(null);
  const panelEls = useRef<Map<number, HTMLDivElement>>(new Map());

  const setPanelRef = useCallback((slotIdx: number) => (el: HTMLDivElement | null) => {
    if (el) panelEls.current.set(slotIdx, el);
    else    panelEls.current.delete(slotIdx);
  }, []);

  const startPanelDrag = useCallback((slotIdx: number, e: React.MouseEvent) => {
    if (slotIdx < PINNED_SLOT_COUNT) return;
    e.preventDefault();
    setDraggingSlot(slotIdx);
  }, []);

  useEffect(() => {
    if (draggingSlot === null) return;

    const slotAt = (x: number, y: number): number | null => {
      for (const [idx, el] of panelEls.current) {
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return idx;
      }
      return null;
    };

    const spanOf = (slotIdx: number) =>
      PANELS.find(p => p.id === panelOrder[slotIdx])?.span ?? 1;

    const canSwap = (a: number, b: number) =>
      a >= PINNED_SLOT_COUNT && b >= PINNED_SLOT_COUNT && spanOf(a) === spanOf(b);

    const onMove = (e: MouseEvent) => {
      const over = slotAt(e.clientX, e.clientY);
      setDragOverSlot(over !== null && over !== draggingSlot && canSwap(draggingSlot, over) ? over : null);
    };

    const onUp = (e: MouseEvent) => {
      const to = slotAt(e.clientX, e.clientY);
      if (to !== null && to !== draggingSlot && canSwap(draggingSlot, to)) {
        setPanelOrder(prev => {
          const next = [...prev];
          [next[draggingSlot], next[to]] = [next[to], next[draggingSlot]];
          setAnalyticsPanelOrder(next);
          return next;
        });
      }
      setDraggingSlot(null);
      setDragOverSlot(null);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
    };
  }, [draggingSlot]);

  useEffect(() => {
    if (hasLiveAnalytics()) return;
    fetchSheetRows(2000)
      .then(rows => {
        setLiveAnalytics({ ...analyze(rows), signalHistory, historicalAccuracy, sheetRows: rows });
      })
      .catch(err => setError(String(err)));
  }, []);

  // Auto-refresh at 18:05 ET each day (sheet updates at 18:00 ET).
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;
    function doRefresh() {
      fetchSheetRows(2000)
        .then(rows => {
          setLiveAnalytics({ ...analyze(rows), signalHistory, historicalAccuracy, sheetRows: rows });
        })
        .catch(err => setError(String(err)));
    }
    const timeoutId = setTimeout(() => {
      doRefresh();
      intervalId = setInterval(doRefresh, 24 * 60 * 60_000);
    }, msUntilDailyRefresh());
    return () => { clearTimeout(timeoutId); clearInterval(intervalId); };
  }, []);

  const verdict =
    analysisResult.direction === "LONG"  ? "long"    :
    analysisResult.direction === "SHORT" ? "short"   :
    "neutral";

  const latestRow   = sheetRows[sheetRows.length - 1];
  const macdBias    = !latestRow ? "neutral"
    : latestRow.macdHistogram > 0 ? "bullish"
    : latestRow.macdHistogram < 0 ? "bearish"
    : "neutral";
  const macdScore = useMemo(() => {
    if (!latestRow || sheetRows.length < 2) return 0;
    const recent = sheetRows.slice(-20);
    const maxHist = Math.max(...recent.map(r => Math.abs(r.macdHistogram)));
    return maxHist > 0 ? Math.round((Math.abs(latestRow.macdHistogram) / maxHist) * 100) : 0;
  }, [sheetRows, latestRow]);
  const BIAS_STYLE: Record<string, { color: string; bg: string; border: string; glow: string }> = {
    bullish: { color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.35)",  glow: "0 0 8px rgba(96,165,250,0.45)"  },
    bearish: { color: "#a78bfa", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.35)", glow: "0 0 8px rgba(167,139,250,0.45)" },
    neutral: { color: "#94a3b8", bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.25)", glow: "0 0 6px rgba(148,163,184,0.25)" },
  };
  const makeMacdBadge = (large?: boolean) => (
    <HoverTooltip tip={`Score ${macdScore}/100 — histogram magnitude relative to the 20-bar peak. Higher = stronger ${macdBias} momentum. 100 means the current bar has the largest histogram of the recent window.`}>
      <span
        className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
        style={{
          color:        BIAS_STYLE[macdBias].color,
          background:   BIAS_STYLE[macdBias].bg,
          border:       `1px solid ${BIAS_STYLE[macdBias].border}`,
          boxShadow:    large ? `${BIAS_STYLE[macdBias].glow}, 0 0 16px ${BIAS_STYLE[macdBias].border}` : BIAS_STYLE[macdBias].glow,
          letterSpacing: "0.10em",
          padding:       large ? "4px 12px" : "2px 8px",
          cursor:        "default",
        }}>
        {macdBias} {macdScore}
      </span>
    </HoverTooltip>
  );
  const macdBadge         = makeMacdBadge();
  const macdBadgeExpanded = makeMacdBadge(true);
  const macdHeadline      = sheetRows.length > 0 ? buildMacdAnalysis(sheetRows).headline : "";
  const priceHeadline     = sheetRows.length > 0 ? buildPriceAnalysis(sheetRows).headline : "";
  const rsiHeadline       = sheetRows.length > 0 ? buildRsiAnalysis(sheetRows).headline : "";
  const rsi14Headline     = sheetRows.length > 0 ? buildRsi14Analysis(sheetRows).headline : "";
  const maHeadline        = sheetRows.length > 0 ? buildMaAnalysis(sheetRows).headline : "";

  const maBias = !latestRow ? "neutral"
    : (latestRow.close > latestRow.ema50 && latestRow.close > latestRow.ema200) ? "bullish"
    : (latestRow.close < latestRow.ema50 && latestRow.close < latestRow.ema200) ? "bearish"
    : "neutral";
  const maScore = useMemo(() => {
    if (!latestRow) return 0;
    const distSma50  = Math.abs(latestRow.close - latestRow.ema50)  / latestRow.ema50  * 100;
    const distSma200 = Math.abs(latestRow.close - latestRow.ema200) / latestRow.ema200 * 100;
    return Math.min(100, Math.round((distSma50 + distSma200) / 2 * 10));
  }, [latestRow]);
  const makeMaBadge = (large?: boolean) => (
    <HoverTooltip tip={`Score ${maScore}/100 — average % distance of price from EMA50 and EMA200. Higher = stronger trend conviction away from the long-term averages.`}>
      <span
        className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
        style={{
          color:         BIAS_STYLE[maBias].color,
          background:    BIAS_STYLE[maBias].bg,
          border:        `1px solid ${BIAS_STYLE[maBias].border}`,
          boxShadow:     large ? `${BIAS_STYLE[maBias].glow}, 0 0 16px ${BIAS_STYLE[maBias].border}` : BIAS_STYLE[maBias].glow,
          letterSpacing: "0.10em",
          padding:       large ? "4px 12px" : "2px 8px",
          cursor:        "default",
        }}>
        {maBias} {maScore}
      </span>
    </HoverTooltip>
  );
  const maBadge         = makeMaBadge();
  const maBadgeExpanded = makeMaBadge(true);

  const keltHeadline = sheetRows.length > 0 ? buildKeltAnalysis(sheetRows).headline : "";
  const keltBias = !latestRow ? "neutral"
    : latestRow.close > latestRow.keltnerUpper ? "bullish"
    : latestRow.close < latestRow.keltnerLower ? "bearish"
    : latestRow.close >= latestRow.keltnerMiddle ? "bullish"
    : "bearish";
  const keltScore = useMemo(() => {
    if (!latestRow) return 0;
    const bandwidth = latestRow.keltnerUpper - latestRow.keltnerLower;
    if (bandwidth <= 0) return 0;
    const distFromMid = Math.abs(latestRow.close - latestRow.keltnerMiddle);
    return Math.min(100, Math.round((distFromMid / (bandwidth / 2)) * 100));
  }, [latestRow]);
  const makeKeltBadge = (large?: boolean) => (
    <HoverTooltip tip={`Score ${keltScore}/100 — distance of close from Keltner midline as % of half-bandwidth. Higher = price deeper into or beyond a band. ${latestRow ? `Close is ${latestRow.close > latestRow.keltnerUpper ? "above upper band" : latestRow.close < latestRow.keltnerLower ? "below lower band" : latestRow.close >= latestRow.keltnerMiddle ? "in upper half" : "in lower half"}.` : ""}`}>
      <span
        className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
        style={{
          color:         BIAS_STYLE[keltBias].color,
          background:    BIAS_STYLE[keltBias].bg,
          border:        `1px solid ${BIAS_STYLE[keltBias].border}`,
          boxShadow:     large ? `${BIAS_STYLE[keltBias].glow}, 0 0 16px ${BIAS_STYLE[keltBias].border}` : BIAS_STYLE[keltBias].glow,
          letterSpacing: "0.10em",
          padding:       large ? "4px 12px" : "2px 8px",
          cursor:        "default",
        }}>
        {keltBias} {keltScore}
      </span>
    </HoverTooltip>
  );
  const keltBadge         = makeKeltBadge();
  const keltBadgeExpanded = makeKeltBadge(true);

  const adxHeadline = sheetRows.length > 0 ? buildAdxAnalysis(sheetRows).headline : "";
  const adxBias = !latestRow ? "neutral"
    : latestRow.adx >= 25 && latestRow.diPlus > latestRow.diMinus ? "bullish"
    : latestRow.adx >= 25 && latestRow.diMinus > latestRow.diPlus ? "bearish"
    : "neutral";
  const adxScore = useMemo(() => {
    if (!latestRow) return 0;
    return Math.min(100, Math.round(latestRow.adx));
  }, [latestRow]);
  const makeAdxBadge = (large?: boolean) => (
    <HoverTooltip tip={`Score ${adxScore}/100 — ADX value directly (0–100). Higher = stronger trend. ${latestRow ? `ADX is at ${latestRow.adx.toFixed(1)}. ${latestRow.adx < 20 ? "Market is ranging." : latestRow.adx < 40 ? "Trend confirmed." : "Strong trend."}` : ""}`}>
      <span
        className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
        style={{
          color:         BIAS_STYLE[adxBias].color,
          background:    BIAS_STYLE[adxBias].bg,
          border:        `1px solid ${BIAS_STYLE[adxBias].border}`,
          boxShadow:     large ? `${BIAS_STYLE[adxBias].glow}, 0 0 16px ${BIAS_STYLE[adxBias].border}` : BIAS_STYLE[adxBias].glow,
          letterSpacing: "0.10em",
          padding:       large ? "4px 12px" : "2px 8px",
          cursor:        "default",
        }}>
        {adxBias} {adxScore}
      </span>
    </HoverTooltip>
  );
  const adxBadge         = makeAdxBadge();
  const adxBadgeExpanded = makeAdxBadge(true);

  const ichiHeadline = sheetRows.length > 0 ? buildIchiAnalysis(sheetRows).headline : "";
  const ichiBias = !latestRow ? "neutral"
    : latestRow.close > Math.max(latestRow.senkouA, latestRow.senkouB) ? "bullish"
    : latestRow.close < Math.min(latestRow.senkouA, latestRow.senkouB) ? "bearish"
    : "neutral";
  const ichiScore = useMemo(() => {
    if (!latestRow) return 0;
    const cloudTop    = Math.max(latestRow.senkouA, latestRow.senkouB);
    const cloudBottom = Math.min(latestRow.senkouA, latestRow.senkouB);
    const cloudMid    = (cloudTop + cloudBottom) / 2;
    const bandwidth   = cloudTop - cloudBottom;
    if (bandwidth <= 0) return 0;
    const dist = Math.abs(latestRow.close - cloudMid);
    return Math.min(100, Math.round((dist / (bandwidth / 2)) * 100));
  }, [latestRow]);
  const makeIchiBadge = (large?: boolean) => (
    <HoverTooltip tip={`Score ${ichiScore}/100 — distance of close from cloud midpoint as % of half cloud thickness. Higher = price further from the cloud (stronger conviction). ${latestRow ? `Price is ${latestRow.close > Math.max(latestRow.senkouA, latestRow.senkouB) ? "above cloud" : latestRow.close < Math.min(latestRow.senkouA, latestRow.senkouB) ? "below cloud" : "inside cloud"}.` : ""}`}>
      <span
        className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
        style={{
          color:         BIAS_STYLE[ichiBias].color,
          background:    BIAS_STYLE[ichiBias].bg,
          border:        `1px solid ${BIAS_STYLE[ichiBias].border}`,
          boxShadow:     large ? `${BIAS_STYLE[ichiBias].glow}, 0 0 16px ${BIAS_STYLE[ichiBias].border}` : BIAS_STYLE[ichiBias].glow,
          letterSpacing: "0.10em",
          padding:       large ? "4px 12px" : "2px 8px",
          cursor:        "default",
        }}>
        {ichiBias} {ichiScore}
      </span>
    </HoverTooltip>
  );
  const ichiBadge         = makeIchiBadge();
  const ichiBadgeExpanded = makeIchiBadge(true);

  const sessionHeadline = sheetRows.length > 0 ? buildSessionAnalysis(sheetRows).headline : "";
  const sessionBias = !latestRow || sheetRows.length < 2 ? "neutral"
    : (() => {
        const prev = sheetRows[sheetRows.length - 2];
        const pct  = ((latestRow.close - prev.close) / prev.close) * 100;
        return pct > 0.05 ? "bullish" : pct < -0.05 ? "bearish" : "neutral";
      })();
  const sessionScore = useMemo(() => {
    if (!latestRow || latestRow.high === latestRow.low) return 0;
    const bodyPct = Math.abs(latestRow.close - latestRow.open) / (latestRow.high - latestRow.low) * 100;
    return Math.min(100, Math.round(bodyPct));
  }, [latestRow]);
  const makeSessionBadge = (large?: boolean) => (
    <HoverTooltip tip={`Score ${sessionScore}/100 — candle body as % of full bar range. Higher = stronger directional conviction with little wick. ${latestRow?.insideBar ? "Inside bar detected." : ""}`}>
      <span
        className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
        style={{
          color:         BIAS_STYLE[sessionBias].color,
          background:    BIAS_STYLE[sessionBias].bg,
          border:        `1px solid ${BIAS_STYLE[sessionBias].border}`,
          boxShadow:     large ? `${BIAS_STYLE[sessionBias].glow}, 0 0 16px ${BIAS_STYLE[sessionBias].border}` : BIAS_STYLE[sessionBias].glow,
          letterSpacing: "0.10em",
          padding:       large ? "4px 12px" : "2px 8px",
          cursor:        "default",
        }}>
        {sessionBias} {sessionScore}
      </span>
    </HoverTooltip>
  );
  const sessionBadge         = makeSessionBadge();
  const sessionBadgeExpanded = makeSessionBadge(true);

  const volHeadline = sheetRows.length > 0 ? buildVolumeAnalysis(sheetRows).headline : "";
  const volBias = !latestRow ? "neutral"
    : (() => {
        const ratio = latestRow.volumeSma20 > 0 ? latestRow.volume / latestRow.volumeSma20 : 1;
        if (ratio >= 1.1 && latestRow.close >= latestRow.open) return "bullish";
        if (ratio >= 1.1 && latestRow.close <  latestRow.open) return "bearish";
        return "neutral";
      })();
  const volScore = useMemo(() => {
    if (!latestRow || latestRow.volumeSma20 <= 0) return 0;
    const ratio = latestRow.volume / latestRow.volumeSma20;
    return Math.min(100, Math.round(Math.abs(ratio - 1) * 200));
  }, [latestRow]);
  const makeVolBadge = (large?: boolean) => (
    <HoverTooltip tip={`Score ${volScore}/100 — volume deviation from the 20-session average. Higher = stronger participation relative to baseline. ${latestRow && latestRow.volumeSma20 > 0 ? `Current volume is ${((latestRow.volume / latestRow.volumeSma20 - 1) * 100).toFixed(0)}% vs SMA(20).` : ""}`}>
      <span
        className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
        style={{
          color:         BIAS_STYLE[volBias].color,
          background:    BIAS_STYLE[volBias].bg,
          border:        `1px solid ${BIAS_STYLE[volBias].border}`,
          boxShadow:     large ? `${BIAS_STYLE[volBias].glow}, 0 0 16px ${BIAS_STYLE[volBias].border}` : BIAS_STYLE[volBias].glow,
          letterSpacing: "0.10em",
          padding:       large ? "4px 12px" : "2px 8px",
          cursor:        "default",
        }}>
        {volBias} {volScore}
      </span>
    </HoverTooltip>
  );
  const volBadge         = makeVolBadge();
  const volBadgeExpanded = makeVolBadge(true);

  const pivotHeadline = sheetRows.length > 0 ? buildPivotAnalysis(sheetRows).headline : "";
  const pivotBias = !latestRow ? "neutral"
    : latestRow.close > latestRow.r1 ? "bullish"
    : latestRow.close < latestRow.s1 ? "bearish"
    : "neutral";
  const pivotScore = useMemo(() => {
    if (!latestRow) return 0;
    const { close, r1, s1 } = latestRow;
    const range = r1 - s1;
    if (range <= 0) return 0;
    if (close > r1) return Math.min(100, Math.round(((close - r1) / range) * 100 + 50));
    if (close < s1) return Math.min(100, Math.round(((s1 - close) / range) * 100 + 50));
    const mid = (r1 + s1) / 2;
    return Math.round(Math.abs(close - mid) / (range / 2) * 50);
  }, [latestRow]);
  const makePivotBadge = (large?: boolean) => (
    <HoverTooltip tip={`Score ${pivotScore}/100 — distance of close from the S1–R1 neutral zone, expressed as a fraction of that range. Higher = deeper into or beyond a pivot level. ${latestRow ? `Close is ${latestRow.close > latestRow.r1 ? "above R1" : latestRow.close < latestRow.s1 ? "below S1" : "in the neutral S1–R1 zone"}.` : ""}`}>
      <span
        className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
        style={{
          color:         BIAS_STYLE[pivotBias].color,
          background:    BIAS_STYLE[pivotBias].bg,
          border:        `1px solid ${BIAS_STYLE[pivotBias].border}`,
          boxShadow:     large ? `${BIAS_STYLE[pivotBias].glow}, 0 0 16px ${BIAS_STYLE[pivotBias].border}` : BIAS_STYLE[pivotBias].glow,
          letterSpacing: "0.10em",
          padding:       large ? "4px 12px" : "2px 8px",
          cursor:        "default",
        }}>
        {pivotBias} {pivotScore}
      </span>
    </HoverTooltip>
  );
  const pivotBadge         = makePivotBadge();
  const pivotBadgeExpanded = makePivotBadge(true);

  const momHeadline = sheetRows.length > 0 ? buildMomentumAnalysis(sheetRows).headline : "";
  const momBias = !latestRow ? "neutral"
    : latestRow.cci > 50 ? "bullish"
    : latestRow.cci < -50 ? "bearish"
    : "neutral";
  const momScore = useMemo(() => {
    if (!latestRow) return 0;
    return Math.min(100, Math.round(Math.abs(latestRow.cci) / 2));
  }, [latestRow]);
  const makeMomBadge = (large?: boolean) => (
    <HoverTooltip tip={`Score ${momScore}/100 — CCI magnitude halved (±200 CCI = 100 score). Higher = stronger momentum extreme. ${latestRow ? `CCI is at ${latestRow.cci.toFixed(1)}${Math.abs(latestRow.cci) > 100 ? " — overbought/oversold territory." : "."}` : ""}`}>
      <span
        className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
        style={{
          color:         BIAS_STYLE[momBias].color,
          background:    BIAS_STYLE[momBias].bg,
          border:        `1px solid ${BIAS_STYLE[momBias].border}`,
          boxShadow:     large ? `${BIAS_STYLE[momBias].glow}, 0 0 16px ${BIAS_STYLE[momBias].border}` : BIAS_STYLE[momBias].glow,
          letterSpacing: "0.10em",
          padding:       large ? "4px 12px" : "2px 8px",
          cursor:        "default",
        }}>
        {momBias} {momScore}
      </span>
    </HoverTooltip>
  );
  const momBadge         = makeMomBadge();
  const momBadgeExpanded = makeMomBadge(true);

  const atrHeadline = sheetRows.length > 0 ? buildAtrAnalysis(sheetRows).headline : "";
  const atrBias = useMemo(() => {
    if (!latestRow || sheetRows.length < 3) return "neutral";
    const recent20 = sheetRows.slice(-20);
    const avg      = recent20.reduce((s, r) => s + r.atr14, 0) / recent20.length;
    const ratio    = avg > 0 ? latestRow.atr14 / avg : 1;
    const rising   = latestRow.atr14 > sheetRows[sheetRows.length - 2].atr14;
    return ratio > 1.10 && rising ? "bullish" : ratio < 0.90 && !rising ? "bearish" : "neutral";
  }, [latestRow, sheetRows]);
  const atrScore = useMemo(() => {
    if (!latestRow || sheetRows.length < 3) return 0;
    const recent20 = sheetRows.slice(-20);
    const avg      = recent20.reduce((s, r) => s + r.atr14, 0) / recent20.length;
    const ratio    = avg > 0 ? latestRow.atr14 / avg : 1;
    return Math.min(100, Math.round(Math.abs(ratio - 1) * 200));
  }, [latestRow, sheetRows]);
  const makeAtrBadge = (large?: boolean) => (
    <HoverTooltip tip={`Score ${atrScore}/100 — ATR(14) deviation from 20-bar average, scaled ×2, capped at 100. Higher = further from normal volatility. ${latestRow ? `Current ATR: ${Math.round(latestRow.atr14)} pips.` : ""}`}>
      <span
        className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
        style={{
          color:         BIAS_STYLE[atrBias].color,
          background:    BIAS_STYLE[atrBias].bg,
          border:        `1px solid ${BIAS_STYLE[atrBias].border}`,
          boxShadow:     large ? `${BIAS_STYLE[atrBias].glow}, 0 0 16px ${BIAS_STYLE[atrBias].border}` : BIAS_STYLE[atrBias].glow,
          letterSpacing: "0.10em",
          padding:       large ? "4px 12px" : "2px 8px",
          cursor:        "default",
        }}>
        {atrBias} {atrScore}
      </span>
    </HoverTooltip>
  );
  const atrBadge         = makeAtrBadge();
  const atrBadgeExpanded = makeAtrBadge(true);

  const fswHeadline = "";

  const cctxPatterns   = useMemo(() => detectCandlePatterns(sheetRows.slice(-5)), [sheetRows]);
  const cctxTopPattern = cctxPatterns[0] ?? null;
  const cctxBias       = cctxTopPattern ? cctxTopPattern.bias : "neutral";
  const cctxHeadline   = cctxTopPattern ? `${cctxTopPattern.name} · Tier ${cctxTopPattern.tier}` : "No pattern detected";
  const makeCctxBadge  = (large?: boolean) => cctxTopPattern ? (
    <HoverTooltip tip={`${cctxTopPattern.name} — ${cctxTopPattern.description}`}>
      <span
        className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
        style={{
          color:         BIAS_STYLE[cctxBias].color,
          background:    BIAS_STYLE[cctxBias].bg,
          border:        `1px solid ${BIAS_STYLE[cctxBias].border}`,
          boxShadow:     large ? `${BIAS_STYLE[cctxBias].glow}, 0 0 16px ${BIAS_STYLE[cctxBias].border}` : BIAS_STYLE[cctxBias].glow,
          letterSpacing: "0.10em",
          padding:       large ? "4px 12px" : "2px 8px",
          cursor:        "default",
        }}
      >
        {cctxBias} · T{cctxTopPattern.tier}
      </span>
    </HoverTooltip>
  ) : undefined;
  const cctxBadge         = makeCctxBadge();
  const cctxBadgeExpanded = makeCctxBadge(true);

  const volaHeadline = sheetRows.length > 0 ? buildVolatilityAnalysis(sheetRows).headline : "";
  const volaBias = !latestRow ? "neutral"
    : latestRow.close > latestRow.bbUpper ? "bullish"
    : latestRow.close < latestRow.bbLower ? "bearish"
    : "neutral";
  const volaScore = useMemo(() => {
    if (!latestRow) return 0;
    const { close, bbUpper, bbMiddle, bbLower } = latestRow;
    const halfBand = bbUpper - bbMiddle;
    if (halfBand <= 0) return 0;
    return Math.min(100, Math.round(Math.abs(close - bbMiddle) / halfBand * 100));
  }, [latestRow]);
  const makeVolaBadge = (large?: boolean) => (
    <HoverTooltip tip={`Score ${volaScore}/100 — distance of close from BB midline as % of half-bandwidth. Higher = price deeper into or beyond a band. ${latestRow ? `Close is ${latestRow.close > latestRow.bbUpper ? "above upper band (breakout)" : latestRow.close < latestRow.bbLower ? "below lower band (breakdown)" : latestRow.close > latestRow.bbMiddle ? "in upper half of band" : "in lower half of band"}.` : ""}`}>
      <span
        className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
        style={{
          color:         BIAS_STYLE[volaBias].color,
          background:    BIAS_STYLE[volaBias].bg,
          border:        `1px solid ${BIAS_STYLE[volaBias].border}`,
          boxShadow:     large ? `${BIAS_STYLE[volaBias].glow}, 0 0 16px ${BIAS_STYLE[volaBias].border}` : BIAS_STYLE[volaBias].glow,
          letterSpacing: "0.10em",
          padding:       large ? "4px 12px" : "2px 8px",
          cursor:        "default",
        }}>
        {volaBias} {volaScore}
      </span>
    </HoverTooltip>
  );
  const volaBadge         = makeVolaBadge();
  const volaBadgeExpanded = makeVolaBadge(true);

  const avgpHeadline = sheetRows.length > 0 ? buildAvgPriceAnalysis(sheetRows).headline : "";
  const avgpBias = useMemo(() => {
    if (sheetRows.length < 6) return "neutral";
    const idx = sheetRows.length - 1;
    const roc5 = ((sheetRows[idx].close - sheetRows[idx - 5].close) / sheetRows[idx - 5].close) * 100;
    return roc5 > 0.05 ? "bullish" : roc5 < -0.05 ? "bearish" : "neutral";
  }, [sheetRows]);
  const avgpScore = useMemo(() => {
    if (sheetRows.length < 6) return 0;
    const idx  = sheetRows.length - 1;
    const roc5 = Math.abs(((sheetRows[idx].close - sheetRows[idx - 5].close) / sheetRows[idx - 5].close) * 100);
    return Math.min(100, Math.round(roc5 * 20));
  }, [sheetRows]);
  const makeAvgpBadge = (large?: boolean) => (
    <HoverTooltip tip={`Score ${avgpScore}/100 — ROC(5) magnitude × 20, capped at 100 (±5% ROC = score 100). Higher = stronger 5-session directional momentum. ${sheetRows.length >= 6 ? `ROC(5) is ${(((sheetRows[sheetRows.length - 1].close - sheetRows[sheetRows.length - 6].close) / sheetRows[sheetRows.length - 6].close) * 100).toFixed(3)}%.` : ""}`}>
      <span
        className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
        style={{
          color:         BIAS_STYLE[avgpBias].color,
          background:    BIAS_STYLE[avgpBias].bg,
          border:        `1px solid ${BIAS_STYLE[avgpBias].border}`,
          boxShadow:     large ? `${BIAS_STYLE[avgpBias].glow}, 0 0 16px ${BIAS_STYLE[avgpBias].border}` : BIAS_STYLE[avgpBias].glow,
          letterSpacing: "0.10em",
          padding:       large ? "4px 12px" : "2px 8px",
          cursor:        "default",
        }}>
        {avgpBias} {avgpScore}
      </span>
    </HoverTooltip>
  );
  const avgpBadge         = makeAvgpBadge();
  const avgpBadgeExpanded = makeAvgpBadge(true);

  const rsi14Bias = !latestRow ? "neutral"
    : latestRow.rsi14 >= 65 ? "bearish"
    : latestRow.rsi14 <= 35 ? "bullish"
    : "neutral";
  const rsi14Score = useMemo(() => {
    if (!latestRow) return 0;
    return Math.round(Math.abs(latestRow.rsi14 - 50) / 50 * 100);
  }, [latestRow]);
  const makeRsi14Badge = (large?: boolean) => (
    <HoverTooltip tip={`Score ${rsi14Score}/100 — RSI(14) distance from the 50 midline. Higher = stronger directional momentum. ${latestRow ? `RSI(14) is at ${latestRow.rsi14.toFixed(1)}.` : ""}`}>
      <span
        className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
        style={{
          color:         BIAS_STYLE[rsi14Bias].color,
          background:    BIAS_STYLE[rsi14Bias].bg,
          border:        `1px solid ${BIAS_STYLE[rsi14Bias].border}`,
          boxShadow:     large ? `${BIAS_STYLE[rsi14Bias].glow}, 0 0 16px ${BIAS_STYLE[rsi14Bias].border}` : BIAS_STYLE[rsi14Bias].glow,
          letterSpacing: "0.10em",
          padding:       large ? "4px 12px" : "2px 8px",
          cursor:        "default",
        }}>
        {rsi14Bias} {rsi14Score}
      </span>
    </HoverTooltip>
  );
  const rsi14Badge         = makeRsi14Badge();
  const rsi14BadgeExpanded = makeRsi14Badge(true);

  const rsiBias = !latestRow ? "neutral"
    : latestRow.rsi9 >= 65 ? "bearish"
    : latestRow.rsi9 <= 35 ? "bullish"
    : "neutral";
  const rsiScore = useMemo(() => {
    if (!latestRow) return 0;
    return Math.round(Math.abs(latestRow.rsi9 - 50) / 50 * 100);
  }, [latestRow]);
  const makeRsiBadge = (large?: boolean) => (
    <HoverTooltip tip={`Score ${rsiScore}/100 — RSI(9) distance from the 50 midline. Higher = stronger directional momentum. ${latestRow ? `RSI(9) is at ${latestRow.rsi9.toFixed(1)}.` : ""}`}>
      <span
        className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
        style={{
          color:         BIAS_STYLE[rsiBias].color,
          background:    BIAS_STYLE[rsiBias].bg,
          border:        `1px solid ${BIAS_STYLE[rsiBias].border}`,
          boxShadow:     large ? `${BIAS_STYLE[rsiBias].glow}, 0 0 16px ${BIAS_STYLE[rsiBias].border}` : BIAS_STYLE[rsiBias].glow,
          letterSpacing: "0.10em",
          padding:       large ? "4px 12px" : "2px 8px",
          cursor:        "default",
        }}>
        {rsiBias} {rsiScore}
      </span>
    </HoverTooltip>
  );
  const rsiBadge         = makeRsiBadge();
  const rsiBadgeExpanded = makeRsiBadge(true);

  const priceBias = !latestRow ? "neutral"
    : latestRow.close > latestRow.open ? "bullish"
    : latestRow.close < latestRow.open ? "bearish"
    : "neutral";
  const priceScore = useMemo(() => {
    if (!latestRow || sheetRows.length < 2) return 0;
    const recent = sheetRows.slice(-20);
    const maxBody = Math.max(...recent.map(r => Math.abs(r.close - r.open)));
    return maxBody > 0 ? Math.round((Math.abs(latestRow.close - latestRow.open) / maxBody) * 100) : 0;
  }, [sheetRows, latestRow]);
  const makePriceBadge = (large?: boolean) => (
    <HoverTooltip tip={`Score ${priceScore}/100 — candle body size relative to the 20-session peak. Higher = stronger conviction in the current direction. 100 means today has the largest body in the recent window.`}>
      <span
        className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
        style={{
          color:         BIAS_STYLE[priceBias].color,
          background:    BIAS_STYLE[priceBias].bg,
          border:        `1px solid ${BIAS_STYLE[priceBias].border}`,
          boxShadow:     large ? `${BIAS_STYLE[priceBias].glow}, 0 0 16px ${BIAS_STYLE[priceBias].border}` : BIAS_STYLE[priceBias].glow,
          letterSpacing: "0.10em",
          padding:       large ? "4px 12px" : "2px 8px",
          cursor:        "default",
        }}>
        {priceBias} {priceScore}
      </span>
    </HoverTooltip>
  );
  const priceBadge         = makePriceBadge();
  const priceBadgeExpanded = makePriceBadge(true);

  const aisHeadline    = `${analysisResult.direction} · ${analysisResult.confidence}% Confidence`;
  const aisVerdictColor = analysisResult.direction === "LONG" ? "#60a5fa" : "#a78bfa";
  const aisVerdictBg    = analysisResult.direction === "LONG" ? "rgba(96,165,250,0.12)"  : "rgba(167,139,250,0.12)";
  const aisVerdictBd    = analysisResult.direction === "LONG" ? "rgba(96,165,250,0.30)"  : "rgba(167,139,250,0.30)";
  const makeAisBadge = (large?: boolean) => (
    <HoverTooltip tip={`AI verdict: ${analysisResult.direction} with ${analysisResult.confidence}% confidence. Long score ${analysisResult.longScore} vs Short score ${analysisResult.shortScore}.`}>
      <span
        className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
        style={{
          color:         aisVerdictColor,
          background:    aisVerdictBg,
          border:        `1px solid ${aisVerdictBd}`,
          boxShadow:     large ? `0 0 8px ${aisVerdictBd}, 0 0 16px ${aisVerdictBd}` : `0 0 6px ${aisVerdictBd}`,
          letterSpacing: "0.10em",
          padding:       large ? "4px 12px" : "2px 8px",
          cursor:        "default",
        }}
      >
        {analysisResult.direction} {analysisResult.confidence}%
      </span>
    </HoverTooltip>
  );
  const aisBadge         = makeAisBadge();
  const aisBadgeExpanded = makeAisBadge(true);

  return (
    <div
      className="flex-1 overflow-hidden flex flex-col"
      style={{
        padding:    "12px 14px 14px",
        gap:        "12px",
        background: VERDICT_COLORS[verdict].gradient,
        ...VERDICT_COLORS[verdict].vars,
      }}
    >

      {/* ── Top bar: Pair Selector + Data date ────────────────────── */}
      <div className="flex items-center gap-3 shrink-0" style={{ height: "40px" }}>
        <PairSelector />
        <div className="flex items-center gap-4 px-4 h-full rounded-[14px]"
          style={{
            background: "var(--bg-panel)",
            border:     "1px solid var(--border-subtle)",
          }}
        >
          <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
            Data for
          </span>
          <span className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>
            {formatDataDate(eurusdSnapshot.timestamp)}
          </span>
        </div>
      </div>

      {/* ── Panels ────────────────────────────────────────────────── */}
      <div
        className="flex-1 min-h-0 flex flex-col"
        style={{
          gap:        "0",
          cursor:     draggingSlot !== null ? "grabbing" : undefined,
          userSelect: draggingSlot !== null ? "none"     : undefined,
        }}
      >
        {/* ── Pinned top row (AI Synthesis + Price) ── */}
        <div style={{
          display:             "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gridTemplateRows:    "160px",
          gridTemplateAreas:   '"ais ais ais aic"',
          gap:                 "10px",
          flexShrink:          0,
          paddingBottom:       "10px",
        }}>
          {panelOrder.slice(0, PINNED_SLOT_COUNT).map((panelId, i) => {
            const slotIdx  = i;
            const slotArea = SLOT_AREAS[slotIdx];
            if (panelId === "__empty__") return <div key={`ep${i}`} ref={setPanelRef(slotIdx)} style={{ gridArea: slotArea }} />;
            const p = PANELS.find(p => p.id === panelId)!;
            return (
              <BlankPanel key={p.id} area={slotArea} label={p.label} sub={p.sub} pinned
                containerRef={setPanelRef(slotIdx)}
                badge={p.id === "ai-synthesis" ? aisBadge : undefined}
                subtitle={p.id === "ai-synthesis" ? aisHeadline : undefined}
                onExpand={() => setExpanded({ id: p.id, label: p.label, sub: p.sub })}>
                {p.id === "ai-synthesis" && <AiSynthesisPanelBody result={analysisResult} />}
                {p.id === "ai-chat"      && <AiChatPanelBody       rows={sheetRows} />}
              </BlankPanel>
            );
          })}
        </div>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: "var(--border-medium)", flexShrink: 0 }} />

        {/* ── Scrollable bottom rows ── */}
        <div className="flex-1 min-h-0" style={{ overflowY: "auto", paddingTop: "10px" }}>
          <div style={{
            display:             "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gridTemplateAreas:   `
              "sess vol  avgp price"
              "vola macd pvt  kelt"
              "ma   rsi9 rsi14 mom"
              "adx  ichi atr  fsw"
              "cctx .    .    ."
            `,
            gridTemplateRows: "repeat(4, 200px) 220px",
            gap:              "10px",
          }}>
            {panelOrder.slice(PINNED_SLOT_COUNT).map((panelId, i) => {
              const slotIdx  = i + PINNED_SLOT_COUNT;
              const slotArea = SLOT_AREAS[slotIdx];
              if (panelId === "__empty__") return <div key={`eb${i}`} ref={setPanelRef(slotIdx)} style={{ gridArea: slotArea }} />;
              const p = PANELS.find(p => p.id === panelId)!;
              return (
                <BlankPanel key={p.id} area={slotArea} label={p.label} sub={p.sub}
                  isDragging={draggingSlot === slotIdx}
                  isDragOver={dragOverSlot === slotIdx}
                  containerRef={setPanelRef(slotIdx)}
                  onHeaderMouseDown={e => startPanelDrag(slotIdx, e)}
                  badge={p.id === "price" ? priceBadge : p.id === "macd" ? macdBadge : p.id === "rsi9" ? rsiBadge : p.id === "rsi14" ? rsi14Badge : p.id === "moving-averages" ? maBadge : p.id === "keltner" ? keltBadge : p.id === "adx" ? adxBadge : p.id === "ichimoku" ? ichiBadge : p.id === "session" ? sessionBadge : p.id === "volume" ? volBadge : p.id === "pivots" ? pivotBadge : p.id === "momentum" ? momBadge : p.id === "volatility" ? volaBadge : p.id === "avg-price" ? avgpBadge : p.id === "atr" ? atrBadge : p.id === "candle-context" ? cctxBadge : undefined}
                  subtitle={p.id === "price" ? priceHeadline : p.id === "macd" ? macdHeadline : p.id === "rsi9" ? rsiHeadline : p.id === "rsi14" ? rsi14Headline : p.id === "moving-averages" ? maHeadline : p.id === "keltner" ? keltHeadline : p.id === "adx" ? adxHeadline : p.id === "ichimoku" ? ichiHeadline : p.id === "session" ? sessionHeadline : p.id === "volume" ? volHeadline : p.id === "pivots" ? pivotHeadline : p.id === "momentum" ? momHeadline : p.id === "volatility" ? volaHeadline : p.id === "avg-price" ? avgpHeadline : p.id === "atr" ? atrHeadline : p.id === "failure-swing" ? fswHeadline : p.id === "candle-context" ? cctxHeadline : undefined}
                  onExpand={() => setExpanded({ id: p.id, label: p.label, sub: p.sub })}>
                  {p.id === "price"           && <PricePanelBody        rows={sheetRows} />}
                  {p.id === "macd"            && <MacdPanelBody         rows={sheetRows} />}
                  {p.id === "rsi9"            && <RsiPanelBody          rows={sheetRows} />}
                  {p.id === "rsi14"           && <Rsi14PanelBody        rows={sheetRows} />}
                  {p.id === "moving-averages" && <MaPanelBody           rows={sheetRows} />}
                  {p.id === "keltner"         && <KeltPanelBody         rows={sheetRows} />}
                  {p.id === "adx"             && <AdxPanelBody          rows={sheetRows} />}
                  {p.id === "ichimoku"        && <IchiPanelBody         rows={sheetRows} />}
                  {p.id === "session"         && <SessionPanelBody      rows={sheetRows} />}
                  {p.id === "volume"          && <VolumePanelBody       rows={sheetRows} />}
                  {p.id === "pivots"          && <PivotPanelBody        rows={sheetRows} />}
                  {p.id === "momentum"        && <MomentumPanelBody     rows={sheetRows} />}
                  {p.id === "volatility"      && <VolatilityPanelBody   rows={sheetRows} />}
                  {p.id === "avg-price"       && <AvgPricePanelBody     rows={sheetRows} />}
                  {p.id === "atr"             && <AtrPanelBody          rows={sheetRows} />}
                  {p.id === "failure-swing"   && <FailureSwingPanelBody  rows={sheetRows} />}
                  {p.id === "ai-chat"         && <AiChatPanelBody        rows={sheetRows} />}
                  {p.id === "candle-context"  && <CandleContextPanelBody rows={sheetRows} />}
                </BlankPanel>
              );
            })}
          </div>
        </div>
      </div>

      {expanded && (
        <PanelModal panel={expanded} onClose={close} badge={expanded.id === "ai-synthesis" ? aisBadgeExpanded : expanded.id === "macd" ? macdBadgeExpanded : expanded.id === "price" ? priceBadgeExpanded : expanded.id === "rsi9" ? rsiBadgeExpanded : expanded.id === "rsi14" ? rsi14BadgeExpanded : expanded.id === "moving-averages" ? maBadgeExpanded : expanded.id === "keltner" ? keltBadgeExpanded : expanded.id === "adx" ? adxBadgeExpanded : expanded.id === "ichimoku" ? ichiBadgeExpanded : expanded.id === "session" ? sessionBadgeExpanded : expanded.id === "volume" ? volBadgeExpanded : expanded.id === "pivots" ? pivotBadgeExpanded : expanded.id === "momentum" ? momBadgeExpanded : expanded.id === "volatility" ? volaBadgeExpanded : expanded.id === "avg-price" ? avgpBadgeExpanded : expanded.id === "atr" ? atrBadgeExpanded : expanded.id === "candle-context" ? cctxBadgeExpanded : undefined} subtitle={expanded.id === "ai-synthesis" ? aisHeadline : expanded.id === "macd" ? macdHeadline : expanded.id === "price" ? priceHeadline : expanded.id === "rsi9" ? rsiHeadline : expanded.id === "rsi14" ? rsi14Headline : expanded.id === "moving-averages" ? maHeadline : expanded.id === "keltner" ? keltHeadline : expanded.id === "adx" ? adxHeadline : expanded.id === "ichimoku" ? ichiHeadline : expanded.id === "session" ? sessionHeadline : expanded.id === "volume" ? volHeadline : expanded.id === "pivots" ? pivotHeadline : expanded.id === "momentum" ? momHeadline : expanded.id === "volatility" ? volaHeadline : expanded.id === "avg-price" ? avgpHeadline : expanded.id === "atr" ? atrHeadline : expanded.id === "failure-swing" ? fswHeadline : expanded.id === "candle-context" ? cctxHeadline : undefined}>
          {expanded.id === "ai-synthesis"    && <AiSynthesisPanelBody result={analysisResult} expanded />}
          {expanded.id === "price"           && <PricePanelBody      rows={sheetRows} expanded />}
          {expanded.id === "macd"            && <MacdPanelBody       rows={sheetRows} expanded />}
          {expanded.id === "rsi9"            && <RsiPanelBody        rows={sheetRows} expanded />}
          {expanded.id === "rsi14"           && <Rsi14PanelBody      rows={sheetRows} expanded />}
          {expanded.id === "moving-averages" && <MaPanelBody         rows={sheetRows} expanded />}
          {expanded.id === "keltner"         && <KeltPanelBody       rows={sheetRows} expanded />}
          {expanded.id === "adx"             && <AdxPanelBody        rows={sheetRows} expanded />}
          {expanded.id === "ichimoku"        && <IchiPanelBody       rows={sheetRows} expanded />}
          {expanded.id === "session"         && <SessionPanelBody    rows={sheetRows} expanded />}
          {expanded.id === "volume"          && <VolumePanelBody     rows={sheetRows} expanded />}
          {expanded.id === "pivots"          && <PivotPanelBody      rows={sheetRows} expanded />}
          {expanded.id === "momentum"        && <MomentumPanelBody   rows={sheetRows} expanded />}
          {expanded.id === "volatility"      && <VolatilityPanelBody rows={sheetRows} expanded />}
          {expanded.id === "avg-price"       && <AvgPricePanelBody   rows={sheetRows} expanded />}
          {expanded.id === "atr"             && <AtrPanelBody             rows={sheetRows} expanded />}
          {expanded.id === "failure-swing"   && <FailureSwingPanelBody   rows={sheetRows} expanded />}
          {expanded.id === "ai-chat"         && <AiChatPanelBody         rows={sheetRows} expanded />}
          {expanded.id === "candle-context"  && <CandleContextPanelBody  rows={sheetRows} expanded />}
        </PanelModal>
      )}

    </div>
  );
}
