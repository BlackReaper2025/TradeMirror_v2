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
import { Maximize2, X, GripVertical, ChevronDown } from "lucide-react";
import { VerdictPanel }          from "../components/analytics/VerdictPanel";
import { EvidenceCards }         from "../components/analytics/EvidenceCards";
import { EntryExitPanel }        from "../components/analytics/EntryExitPanel";
import { HistoryDotsPanel }      from "../components/analytics/HistoryDotsPanel";
import { PairSelector }          from "../components/analytics/PairSelector";
import { useAnalytics, setLiveAnalytics, hasLiveAnalytics, signalHistory, historicalAccuracy,
  analysisResult as defaultAnalysisResult, signalTags, evidenceCards,
  emaStackData, macdChartData, momentumChartData, volatilityChartData, directionalChartData,
} from "../data/analyticsDataV3";
import type { AnalysisResult } from "../data/analyticsDataV3";
import type { SheetRow }         from "../lib/googleSheets";
import { analyze }               from "../lib/brain/analyzer";
import { getAnalyticsPanelOrder, setAnalyticsPanelOrder } from "../lib/preferences";
import { playAlertSound } from "../lib/alertSound";
import type { AlertSound } from "../lib/alertSound";
import { AlertsPanel, type Alert } from "../components/panels/AlertsPanel";
import { invoke }                from "@tauri-apps/api/core";
import {
  createChart, CandlestickSeries, AreaSeries, LineSeries,
  ColorType, CrosshairMode, LineStyle,
} from "lightweight-charts";
import type { IChartApi, UTCTimestamp } from "lightweight-charts";
const ALERTS_JSON_PATH = "D:\\Dev\\TradeMirror_v2\\TradeMirror\\TradeMirror_Alert_Test\\alerts.json";

// ─── V3 backend candle type (Rust snake_case serialization) ──────────────────
interface RawCandleV3 {
  date: string; timestamp: string; symbol: string;
  open: number; high: number; low: number; close: number;
  volume: number; volume_sma20: number;
  sma20: number; sma50: number; sma200: number;
  ema9: number; ema20: number; ema50: number; ema100: number; ema200: number;
  macd: number; macd_signal: number; macd_histogram: number;
  adx: number; di_plus: number; di_minus: number;
  rsi9: number; rsi14: number; rsi_trend: string;
  stoch_rsi_k: number; stoch_rsi_d: number;
  cci: number; pivot_point: number;
  r1: number; r2: number; r3: number;
  s1: number; s2: number; s3: number;
  kijun: number; tenkan: number; senkou_a: number; senkou_b: number;
  atr14: number;
  bb_upper: number; bb_middle: number; bb_lower: number;
  keltner_upper: number; keltner_middle: number; keltner_lower: number;
  hist_vol: number;
  price_above_cloud: boolean; price_above_kijun: boolean;
  inside_bar: boolean; rsi_divergence: boolean;
}

interface RawCandleTf {
  date: string; timestamp: string;
  open: number; high: number; low: number; close: number; volume: number;
}

// Maps a raw backend row to SheetRow shape (for panel analysis) and EurusdSnapshot shape (for last row).
function mapToSheetRow(c: RawCandleV3) {
  return {
    date: c.date,
    open: c.open, high: c.high, low: c.low, close: c.close,
    volume: c.volume, volumeSma20: c.volume_sma20,
    atr14: c.atr14 * 10000, histVol: c.hist_vol,
    bbUpper: c.bb_upper, bbMiddle: c.bb_middle, bbLower: c.bb_lower,
    sma20: c.sma20, sma50: c.sma50, sma200: c.sma200,
    ema9: c.ema9, ema20: c.ema20, ema50: c.ema50, ema100: c.ema100, ema200: c.ema200,
    macd: c.macd, macdSignal: c.macd_signal, macdHistogram: c.macd_histogram,
    r3: c.r3, r2: c.r2, r1: c.r1, s1: c.s1, s2: c.s2, s3: c.s3,
    keltnerUpper: c.keltner_upper, keltnerMiddle: c.keltner_middle, keltnerLower: c.keltner_lower,
    rsi9: c.rsi9, rsi14: c.rsi14,
    stochRsiK: c.stoch_rsi_k, stochRsiD: c.stoch_rsi_d,
    cci: c.cci,
    diPlus: c.di_plus, diMinus: c.di_minus, adx: c.adx,
    tenkan: c.tenkan, kijun: c.kijun, senkouA: c.senkou_a, senkouB: c.senkou_b,
    insideBar: c.inside_bar,
  };
}

function mapToSnapshot(c: RawCandleV3) {
  return {
    date: c.date, timestamp: c.timestamp, symbol: c.symbol,
    open: c.open, high: c.high, low: c.low, close: c.close,
    volume: c.volume, volumeSma20: c.volume_sma20,
    ema9: c.ema9, ema20: c.ema20, ema50: c.ema50, sma200: c.sma200,
    macd: c.macd, macdSignal: c.macd_signal, macdHistogram: c.macd_histogram,
    adx: c.adx, diPlus: c.di_plus, diMinus: c.di_minus,
    rsi14: c.rsi14, rsiTrend: c.rsi_trend as "UP" | "DOWN" | "FLAT",
    stochRsiK: c.stoch_rsi_k, stochRsiD: c.stoch_rsi_d,
    cci: c.cci, pivotPoint: c.pivot_point,
    r1: c.r1, r2: c.r2, r3: c.r3,
    s1: c.s1, s2: c.s2, s3: c.s3,
    kijun: c.kijun, tenkan: c.tenkan, senkouA: c.senkou_a, senkouB: c.senkou_b,
    atr14: c.atr14 * 10000,
    bbUpper: c.bb_upper, bbMiddle: c.bb_middle, bbLower: c.bb_lower,
    keltnerUpper: c.keltner_upper, keltnerMiddle: c.keltner_middle, keltnerLower: c.keltner_lower,
    histVol: c.hist_vol,
    priceAboveCloud: c.price_above_cloud, priceAboveKijun: c.price_above_kijun,
    insideBar: c.inside_bar, rsiDivergence: c.rsi_divergence,
  };
}

// ─── Alert toast ──────────────────────────────────────────────────────────────

interface AlertToast {
  toastId: string;
  name: string;
  instrument: string;
  direction: string;
  price: number;
}

interface NewsArticle {
  title: string;
  link: string;
  pub_date: string;
  source: string;
}

function formatDataDate(dateStr: string): string {
  // dateStr is "YYYY-MM-DD" — parse as local date to avoid any timezone shift
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    year:    "numeric",
    month:   "long",
    day:     "numeric",
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
  { id: "avg-price",       area: "avgp",  label: "AVG Price",                   sub: "Group 5 — Avg Price · Close · Avg Delta" },
  { id: "roc",             area: "roc",   label: "ROC (5)",                      sub: "Group 5b — Rate of Change · 5-Session Momentum" },
  { id: "volatility",      area: "vola",  label: "Bollinger",                         sub: "Group 4 — Hist Vol · Bollinger Bands · BB %B" },
  { id: "atr",             area: "atr",   label: "ATR",                        sub: "Group 15 — ATR(14) · ATR SMA(20)" },
  { id: "squeeze",         area: "sqz",   label: "Squeeze",                    sub: "Volatility Squeeze · BB inside KC · Momentum" },
  { id: "macd",            area: "macd",  label: "MACD",                       sub: "Group 7 — MACD · Signal · Histogram" },
  { id: "moving-averages", area: "ma",    label: "EMAs",           sub: "Group 6 — SMA(20/50/200) · EMA(9/12/20/26/50/200)" },
  { id: "pivots",          area: "pvt",   label: "Pivots",               sub: "Group 8 — R3/R2/R1 · S1/S2/S3" },
  { id: "keltner",         area: "kelt",  label: "Keltner",                    sub: "Group 9 — Kelt Upper · Mid · Lower" },
  { id: "rsi9",            area: "rsi9",  label: "RSI (9)",                    sub: "Group 10 — RSI(9) · StochRSI %K/%D" },
  { id: "rsi14",           area: "rsi14", label: "RSI (14)",                   sub: "Group 11 — RSI(14) · RSI Trend" },
  { id: "cci",             area: "cci",   label: "CCI",                        sub: "Group 12a — Commodity Channel Index" },
  { id: "wr",              area: "wr",    label: "Williams %R",                sub: "Group 12b — Williams %R" },
  { id: "adx",             area: "adx",   label: "ADX",                        sub: "Group 13 — +DI · −DI · DX · ADX" },
  { id: "ichimoku",        area: "ichi",  label: "Ichimoku",                   sub: "Group 14 — Tenkan · Kijun · Senkou · Chikou" },
  { id: "failure-swing",   area: "fsw",   label: "FAILURE\nSWING",             sub: "" },
  { id: "ai-chat",         area: "aic",   label: "ALERTS",                      sub: "Active alerts · Triggered history" },
  { id: "candle-context",  area: "cctx",  label: "CANDLE\nCONTEXT",            sub: "Last 5 candles · Pattern recognition" },
  { id: "market-structure", area: "mstr", label: "MARKET\nSTRUCTURE",           sub: "" },
  { id: "regime",          area: "rgme",  label: "REGIME\nDETECTION",           sub: "Trending · Ranging · Compression" },
];


// First PINNED_SLOT_COUNT slots are fixed; the rest are in the scrollable section.
const PINNED_SLOT_COUNT = 2;

// Grid slot areas in row-major order.
// Slots 0-1 are pinned (top row). Slots 2+ are scrollable (bottom rows).
const SLOT_AREAS = [
  // ── Pinned ────────────────────────────────────────────────────────────────
  "ais", "aic",
  // ── Price Structure ───────────────────────────────────────────────────────
  "price", "avgp", "pvt",
  // ── Regime & Structure ────────────────────────────────────────────────────
  "mstr", "rgme",
  // ── Context & Patterns ────────────────────────────────────────────────────
  "vol", "cctx", "sess", "fsw",
  // ── Trend & Direction ─────────────────────────────────────────────────────
  "ma", "adx", "macd", "ichi",
  // ── Momentum & Oscillators ────────────────────────────────────────────────
  "rsi9", "rsi14", "cci", "wr", "roc",
  // ── Volatility & Bands ────────────────────────────────────────────────────
  "vola", "kelt", "atr", "sqz",
] as const;

const CATEGORIES: { label: string; count: number; visibleCols?: number }[] = [
  { label: "Price Structure",        count: 3, visibleCols: 2 },
  { label: "Regime & Structure",     count: 2 },
  { label: "Context & Patterns",     count: 4 },
  { label: "Trend & Direction",      count: 4 },
  { label: "Momentum & Oscillators", count: 5 },
  { label: "Volatility & Bands",     count: 4 },
];

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

const NO_SUB_IDS = new Set(["ai-synthesis", "price", "macd", "rsi9", "rsi14", "moving-averages", "keltner", "adx", "ichimoku", "session", "volume", "pivots", "cci", "wr", "volatility", "avg-price", "roc", "atr", "squeeze", "candle-context", "ai-chat", "regime"]);

function PanelModal({ panel, onClose, badge, subtitle, subtitle2, headerActions, children }: { panel: PanelMeta; onClose: () => void; badge?: React.ReactNode; subtitle?: string; subtitle2?: string; headerActions?: React.ReactNode; children?: React.ReactNode }) {
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
          {(subtitle || subtitle2) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
              {subtitle && (
                <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {subtitle}
                </span>
              )}
              {subtitle2 && (
                <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
                  {subtitle2}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-3 ml-auto">
            {badge}
            {headerActions}
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


function isForexOpen(): boolean {
  const now = new Date();
  const day = now.getUTCDay();
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (day === 6) return false;
  if (day === 0 && mins < 22 * 60) return false;
  if (day === 5 && mins >= 22 * 60) return false;
  return true;
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

function CandleShape({ x, width, payload, background, yDomain }: any) {
  if (!payload || !background || !yDomain) return null;
  const { open, high, low, close } = payload;
  if ([open, high, low, close].some((v: unknown) => v == null || isNaN(v as number))) return null;
  const isUp  = close >= open;
  const color = isUp ? "#60a5fa" : "#a78bfa";
  const [dMin, dMax] = yDomain;
  const range = dMax - dMin;
  if (range === 0) return null;
  const toPixel = (v: number) => background.y + (dMax - v) / range * background.height;
  const yH = toPixel(high);
  const yL = toPixel(low);
  const yO = toPixel(open);
  const yC = toPixel(close);
  const bodyTop = Math.min(yO, yC);
  const bodyH   = Math.max(Math.abs(yC - yO), 1.5);
  const cx      = x + width / 2;
  const bw      = Math.max(width - 2, 2);
  return (
    <g>
      <line x1={cx} y1={yH} x2={cx} y2={yL} stroke={color} strokeWidth={1} strokeOpacity={0.8} />
      <rect x={cx - bw / 2} y={bodyTop} width={bw} height={bodyH}
            fill={color} fillOpacity={1} stroke={color} strokeWidth={0.5} />
    </g>
  );
}

// ─── Indicator helpers ─────────────────────────────────────────────────────────

type IndKey = "bb" | "ichi" | "ema9" | "ema20" | "ema50" | "ema200";

const IND_DEFS: { key: IndKey; label: string; color: string }[] = [
  { key: "bb",    label: "BB(20,2)", color: "#64b5f6" },
  { key: "ichi",  label: "Ichimoku", color: "#26a69a" },
  { key: "ema9",  label: "EMA 9",   color: "#ff9f0a" },
  { key: "ema20", label: "EMA 20",  color: "#30d158" },
  { key: "ema50", label: "EMA 50",  color: "#ff6b6b" },
  { key: "ema200",label: "EMA 200", color: "#bf5af2" },
];

function computeEMA(closes: number[], period: number): (number | null)[] {
  if (closes.length < period) return closes.map(() => null);
  const k = 2 / (period + 1);
  const result: (number | null)[] = closes.map(() => null);
  result[period - 1] = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++)
    result[i] = closes[i] * k + result[i - 1]! * (1 - k);
  return result;
}

function computeBB(closes: number[], period = 20, mult = 2) {
  const upper:  (number | null)[] = closes.map(() => null);
  const middle: (number | null)[] = closes.map(() => null);
  const lower:  (number | null)[] = closes.map(() => null);
  for (let i = period - 1; i < closes.length; i++) {
    const sl  = closes.slice(i - period + 1, i + 1);
    const sma = sl.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(sl.reduce((a, b) => a + (b - sma) ** 2, 0) / period);
    middle[i] = sma; upper[i] = sma + mult * std; lower[i] = sma - mult * std;
  }
  return { upper, middle, lower };
}

function computeIchimoku(highs: number[], lows: number[]) {
  const n = highs.length;
  const hh = (from: number, to: number) => Math.max(...highs.slice(from, to + 1));
  const ll = (from: number, to: number) => Math.min(...lows.slice(from, to + 1));
  const tenkan:  (number | null)[] = Array(n).fill(null);
  const kijun:   (number | null)[] = Array(n).fill(null);
  const spanA:   (number | null)[] = Array(n).fill(null);
  const spanB:   (number | null)[] = Array(n).fill(null);
  for (let i = 8;  i < n; i++) tenkan[i] = (hh(i - 8, i)  + ll(i - 8, i))  / 2;
  for (let i = 25; i < n; i++) kijun[i]  = (hh(i - 25, i) + ll(i - 25, i)) / 2;
  for (let i = 25; i < n; i++) {
    if (tenkan[i] !== null && kijun[i] !== null)
      spanA[i] = (tenkan[i]! + kijun[i]!) / 2;
  }
  for (let i = 51; i < n; i++) spanB[i] = (hh(i - 51, i) + ll(i - 51, i)) / 2;
  return { tenkan, kijun, spanA, spanB };
}

// ─── Price history chart ────────────────────────────────────────────────────────

function PriceHistoryChart({ pair }: { rows: SheetRow[]; pair: string }) {
  const [viewMode,   setViewMode]   = useState<"candles" | "line">("candles");
  const [chartTf,    setChartTf]    = useState<"1W" | "1D" | "4H" | "1H" | "15M" | "5M">("1D");
  const [tfRows,     setTfRows]     = useState<RawCandleTf[]>([]);
  const [tfLoading,  setTfLoading]  = useState(false);
  const [activeInds, setActiveInds] = useState<Set<IndKey>>(new Set());

  const containerRef  = useRef<HTMLDivElement>(null);
  const chartRef      = useRef<IChartApi | null>(null);
  const seriesRef     = useRef<any>(null);
  const indSeriesRef  = useRef<Partial<Record<IndKey, any[]>>>({});
  const tfRowsRef     = useRef<RawCandleTf[]>([]);
  const viewModeRef   = useRef(viewMode);
  const activeIndsRef = useRef<Set<IndKey>>(new Set());

  useEffect(() => { tfRowsRef.current    = tfRows;     }, [tfRows]);
  useEffect(() => { viewModeRef.current  = viewMode;   }, [viewMode]);
  useEffect(() => { activeIndsRef.current = activeInds; }, [activeInds]);

  // Fetch on tf / pair change — also clears stale indicator series
  useEffect(() => {
    setTfLoading(true);
    setTfRows([]);
    if (chartRef.current)
      activeIndsRef.current.forEach(key => removeIndSeries(key));
    invoke<RawCandleTf[]>("get_live_candles", { pair, tf: chartTf })
      .then(candles => setTfRows(candles))
      .catch(() => {})
      .finally(() => setTfLoading(false));
  }, [chartTf, pair]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Indicator series helpers ────────────────────────────────────────────────

  const removeIndSeries = useCallback((key: IndKey) => {
    const existing = indSeriesRef.current[key];
    if (existing && chartRef.current) {
      existing.forEach((s: any) => { try { chartRef.current!.removeSeries(s); } catch (_) {} });
    }
    delete indSeriesRef.current[key];
  }, []);

  const addIndSeries = useCallback((key: IndKey, candles: RawCandleTf[]) => {
    const chart = chartRef.current;
    if (!chart || candles.length === 0) return;
    removeIndSeries(key);

    const times  = candles.map(r => Math.floor(new Date(r.timestamp).getTime() / 1000) as UTCTimestamp);
    const closes = candles.map(r => r.close);
    const toData = (vals: (number | null)[]) =>
      vals.reduce<{ time: UTCTimestamp; value: number }[]>((acc, v, i) => {
        if (v !== null) acc.push({ time: times[i], value: v });
        return acc;
      }, []);
    const indOpts = { lastValueVisible: false, priceLineVisible: false,
                      priceFormat: { type: "price" as const, precision: 5, minMove: 0.00001 } };

    if (key === "bb") {
      const { upper, middle, lower } = computeBB(closes);

      // Fill layer: blue tint from upper band to chart bottom (15% opacity)
      const fillArea = chart.addSeries(AreaSeries, {
        lineColor: "rgba(0,0,0,0)", lineWidth: 1,
        topColor: "rgba(100,181,246,0.15)", bottomColor: "rgba(100,181,246,0.15)",
      });
      fillArea.applyOptions({ lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
      fillArea.setData(toData(upper));

      // Mask layer: background colour from lower band to chart bottom (85% opacity)
      // Cancels the fill below the lower band while keeping candles ~visible
      const maskArea = chart.addSeries(AreaSeries, {
        lineColor: "rgba(0,0,0,0)", lineWidth: 1,
        topColor: "rgba(15,17,23,0.85)", bottomColor: "rgba(15,17,23,0.85)",
      });
      maskArea.applyOptions({ lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
      maskArea.setData(toData(lower));

      // Border lines
      const mk = (color: string, style: LineStyle) => {
        const s = chart.addSeries(LineSeries, { color, lineWidth: 1, lineStyle: style });
        s.applyOptions(indOpts); return s;
      };
      const uS = mk("rgba(100,181,246,0.85)", LineStyle.Solid);
      const mS = mk("rgba(100,181,246,0.5)",  LineStyle.Dashed);
      const lS = mk("rgba(100,181,246,0.85)", LineStyle.Solid);
      uS.setData(toData(upper)); mS.setData(toData(middle)); lS.setData(toData(lower));
      indSeriesRef.current.bb = [fillArea, maskArea, uS, mS, lS];
    } else if (key === "ichi") {
      const highs = candles.map(r => r.high);
      const lows  = candles.map(r => r.low);
      const { tenkan, kijun, spanA, spanB } = computeIchimoku(highs, lows);
      const OFFSET = 26;
      const n = candles.length;
      const candleDuration = n > 1
        ? Math.floor(new Date(candles[n - 1].timestamp).getTime() / 1000)
          - Math.floor(new Date(candles[n - 2].timestamp).getTime() / 1000)
        : 86400;

      // Build cloud points shifted +OFFSET bars forward
      const cloudPts: { time: UTCTimestamp; a: number; b: number }[] = [];
      for (let i = 25; i < n; i++) {
        const a = spanA[i], b = spanB[i];
        if (a === null || b === null) continue;
        const t: UTCTimestamp = i + OFFSET < n
          ? times[i + OFFSET]
          : (times[n - 1] + (i + OFFSET - n + 1) * candleDuration) as UTCTimestamp;
        cloudPts.push({ time: t, a, b });
      }

      // Split into contiguous same-regime segments.
      // Each AreaSeries only covers its own regime's bars, so there is never a
      // cross-regime diagonal "streak" at the crossover point.
      const segs: { bullish: boolean; pts: typeof cloudPts }[] = [];
      for (const pt of cloudPts) {
        const bull = pt.a >= pt.b;
        if (!segs.length || segs[segs.length - 1].bullish !== bull)
          segs.push({ bullish: bull, pts: [] });
        segs[segs.length - 1].pts.push(pt);
      }

      const spanAData: { time: UTCTimestamp; value: number }[] = [];
      const spanBData: { time: UTCTimestamp; value: number }[] = [];
      for (const pt of cloudPts) {
        spanAData.push({ time: pt.time, value: pt.a });
        spanBData.push({ time: pt.time, value: pt.b });
      }

      // Chikou (close shifted -26 bars)
      const chikouData: { time: UTCTimestamp; value: number }[] = [];
      for (let i = OFFSET; i < n; i++)
        chikouData.push({ time: times[i - OFFSET], value: closes[i] });

      const mkArea = (top: string, bot: string) => {
        const s = chart.addSeries(AreaSeries, {
          lineColor: "rgba(0,0,0,0)", lineWidth: 1, topColor: top, bottomColor: bot,
        });
        s.applyOptions({ lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
        return s;
      };
      const mkLine = (color: string, width: 1 | 2, style: LineStyle) => {
        const s = chart.addSeries(LineSeries, { color, lineWidth: width, lineStyle: style });
        s.applyOptions(indOpts); return s;
      };

      // One fill AreaSeries per segment (no mask — 15% fill on dark bg barely tints
      // candles below the cloud while keeping them fully readable)
      const segSeries: any[] = [];
      for (const seg of segs) {
        const c = seg.bullish ? "rgba(38,166,154,0.15)" : "rgba(239,83,80,0.15)";
        const fill = mkArea(c, c);
        fill.setData(seg.pts.map(p => ({ time: p.time, value: Math.max(p.a, p.b) })));
        segSeries.push(fill);
      }

      const tenkanS = mkLine("#ef5350", 1, LineStyle.Solid);
      const kijunS  = mkLine("#1565c0", 1, LineStyle.Solid);
      const spanAS  = mkLine("rgba(38,166,154,0.8)", 1, LineStyle.Solid);
      const spanBS  = mkLine("rgba(239,83,80,0.8)",  1, LineStyle.Solid);
      const chikouS = mkLine("#9c27b0", 1, LineStyle.Dashed);

      tenkanS.setData(toData(tenkan));
      kijunS.setData(toData(kijun));
      spanAS.setData(spanAData);
      spanBS.setData(spanBData);
      chikouS.setData(chikouData);

      indSeriesRef.current.ichi = [...segSeries, tenkanS, kijunS, spanAS, spanBS, chikouS];
    } else {
      const period = ({ ema9: 9, ema20: 20, ema50: 50, ema200: 200 } as Record<string, number>)[key]!;
      const color  = IND_DEFS.find(d => d.key === key)!.color;
      const s = chart.addSeries(LineSeries, { color, lineWidth: 1 });
      s.applyOptions(indOpts);
      s.setData(toData(computeEMA(closes, period)));
      indSeriesRef.current[key] = [s];
    }
  }, [removeIndSeries]);

  const toggleInd = useCallback((key: IndKey) => {
    setActiveInds(prev => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); removeIndSeries(key); }
      else               { next.add(key);    addIndSeries(key, tfRowsRef.current); }
      return next;
    });
  }, [addIndSeries, removeIndSeries]);

  // ── Price series helpers ────────────────────────────────────────────────────

  const applyData = useCallback((candles: RawCandleTf[], mode: string) => {
    const chart  = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || candles.length === 0) return;
    if (mode === "candles") {
      series.setData(candles.map(r => ({
        time:  Math.floor(new Date(r.timestamp).getTime() / 1000) as UTCTimestamp,
        open: r.open, high: r.high, low: r.low, close: r.close,
      })));
    } else {
      series.setData(candles.map(r => ({
        time:  Math.floor(new Date(r.timestamp).getTime() / 1000) as UTCTimestamp,
        value: r.close,
      })));
    }
    const last = candles[candles.length - 1];
    if (last) {
      const isUp = candles.length > 1 ? last.close >= candles[candles.length - 2].close : true;
      series.createPriceLine({ price: last.close, color: isUp ? "#60a5fa" : "#a78bfa",
        lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });
    }
    chart.timeScale().fitContent();
  }, []);

  const createSeries = useCallback((chart: IChartApi, mode: string) => {
    if (seriesRef.current) { chart.removeSeries(seriesRef.current); seriesRef.current = null; }
    if (mode === "candles") {
      const s = chart.addSeries(CandlestickSeries, {
        upColor: "#60a5fa", downColor: "#a78bfa",
        borderUpColor: "#60a5fa", borderDownColor: "#a78bfa",
        wickUpColor:   "#60a5fa", wickDownColor:   "#a78bfa",
      });
      s.applyOptions({ priceFormat: { type: "price", precision: 5, minMove: 0.00001 } });
      seriesRef.current = s;
    } else {
      const s = chart.addSeries(AreaSeries, {
        lineColor: "#60a5fa", lineWidth: 2,
        topColor: "rgba(96,165,250,0.18)", bottomColor: "rgba(96,165,250,0)",
      });
      s.applyOptions({ priceFormat: { type: "price", precision: 5, minMove: 0.00001 } });
      seriesRef.current = s;
    }
    if (tfRowsRef.current.length > 0) applyData(tfRowsRef.current, mode);
  }, [applyData]);

  // Init chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#0f1117" }, textColor: "#94a3b8", fontSize: 11 },
      grid: { vertLines: { color: "rgba(148,163,184,0.06)" }, horzLines: { color: "rgba(148,163,184,0.06)" } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { borderColor: "rgba(148,163,184,0.15)", timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.15)", scaleMargins: { top: 0.08, bottom: 0.08 } },
    });
    chartRef.current = chart;
    createSeries(chart, viewModeRef.current);
    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect(); chart.remove();
      chartRef.current = null; seriesRef.current = null; indSeriesRef.current = {};
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Recreate price series on viewMode change (indicator series survive)
  useEffect(() => {
    if (!chartRef.current) return;
    createSeries(chartRef.current, viewMode);
  }, [viewMode, createSeries]);

  // Apply price data + refresh all active indicators when data arrives
  useEffect(() => {
    if (tfRows.length === 0) return;
    applyData(tfRows, viewModeRef.current);
    activeIndsRef.current.forEach(key => addIndSeries(key, tfRows));
  }, [tfRows, applyData, addIndSeries]);

  const [showIndPanel, setShowIndPanel] = useState(false);
  const indBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showIndPanel) return;
    const close = (e: MouseEvent) => {
      if (indBtnRef.current && !indBtnRef.current.closest("[data-ind-panel]")?.contains(e.target as Node))
        setShowIndPanel(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showIndPanel]);

  const anyActive = activeInds.size > 0;

  return (
    <div style={{ width: "66.667%", marginBottom: 10, flexShrink: 0 }}>
      {/* Toolbar: timeframes · Indicators button · view mode */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {(["1W","1D","4H","1H","15M","5M"] as const).map(tf => (
            <button key={tf} onClick={() => setChartTf(tf)} style={{
              fontSize: 9, fontWeight: 700, padding: "4px 10px",
              textTransform: "uppercase", letterSpacing: "0.08em",
              background: chartTf === tf ? "var(--accent-dim)"    : "var(--bg-panel-alt)",
              border:     chartTf === tf ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
              color:      chartTf === tf ? "var(--accent-text)"   : "var(--text-secondary)",
              borderRadius: 8, cursor: "pointer",
            }}>{tf}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {/* Indicators button + dropdown */}
          <div style={{ position: "relative" }} data-ind-panel>
            <button
              ref={indBtnRef}
              onClick={() => setShowIndPanel(v => !v)}
              style={{
                fontSize: 9, fontWeight: 700, padding: "4px 10px",
                textTransform: "uppercase", letterSpacing: "0.08em",
                background: anyActive ? "var(--accent-dim)"    : "var(--bg-panel-alt)",
                border:     anyActive ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
                color:      anyActive ? "var(--accent-text)"   : "var(--text-secondary)",
                borderRadius: 8, cursor: "pointer",
              }}
            >
              Indicators{anyActive ? ` (${activeInds.size})` : ""}
            </button>
            {showIndPanel && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
                background: "var(--bg-panel)", border: "1px solid var(--border-medium)",
                borderRadius: 10, padding: "8px 0", minWidth: 180,
                boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
              }}>
                <div style={{ padding: "4px 12px 8px", fontSize: 9, fontWeight: 800,
                  textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>
                  Indicators
                </div>
                {IND_DEFS.map(({ key, label, color }) => {
                  const on = activeInds.has(key);
                  return (
                    <button key={key} onClick={() => toggleInd(key)} style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "7px 12px", background: "none", border: "none",
                      cursor: "pointer", textAlign: "left",
                    }}>
                      {/* colour swatch / checkbox */}
                      <span style={{
                        width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                        border: `2px solid ${color}`,
                        background: on ? color : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {on && <span style={{ width: 6, height: 6, borderRadius: 1, background: "#0f1117" }} />}
                      </span>
                      {/* colour line preview */}
                      <span style={{ width: 18, height: 2, background: color, borderRadius: 1, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 600,
                        color: on ? "var(--text-primary)" : "var(--text-secondary)" }}>
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {/* View mode toggle */}
          <button onClick={() => setViewMode(v => v === "candles" ? "line" : "candles")} style={{
            fontSize: 9, fontWeight: 700, padding: "4px 10px",
            textTransform: "uppercase", letterSpacing: "0.08em",
            background: "var(--bg-panel-alt)", border: "1px solid var(--border-medium)",
            borderRadius: 8, color: "var(--text-secondary)", cursor: "pointer",
          }}>{viewMode}</button>
        </div>
      </div>
      <div style={{ borderRadius: 14, overflow: "hidden", position: "relative" }}>
        {tfLoading && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, pointerEvents: "none" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.05em" }}>Loading…</span>
          </div>
        )}
        <div ref={containerRef} style={{ height: 480, opacity: tfLoading ? 0.3 : 1 }} />
      </div>
    </div>
  );
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
            <div className={cell} style={{ color: grey }}>{expanded ? (() => { const [y,m,d2] = r.date.split("-"); return `${parseInt(m)}/${parseInt(d2)}/${y}`; })() : fmtDate(r.date)}</div>
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
  const showHist   = true;
  const showMacd   = true;
  const showSignal = true;

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
        idx:       i,
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

      {/* Chart — no XAxis so we can insert slider before date labels */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }} barCategoryGap={expanded ? 1 : 0}>
            <XAxis
              dataKey="idx"
              tickLine={false}
              axisLine={false}
              height={expanded ? 34 : 0}
              hide={!expanded}
              tick={(props: any) => {
                const d = data[props.index];
                if (!d) return <g />;
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)">{d.date}</text>
                    {d.month && <text x={0} y={0} dy={23} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)" fontWeight={700}>{d.month}</text>}
                  </g>
                );
              }}
            />
            <YAxis
              tick={tickStyle}
              tickLine={false}
              axisLine={false}
              width={yAxisWidth}
              tickFormatter={v => v.toFixed(1)}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
            <Tooltip content={<MacdTooltip />} cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }} position={{ x: 60, y: 10 }} />
            {showHist && (
              <Bar dataKey="histogram" name="Histogram" isAnimationActive={false}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.histogram >= 0 ? "rgba(96,165,250,0.7)" : "rgba(167,139,250,0.7)"} />
                ))}
              </Bar>
            )}
            {showMacd   && <Line dataKey="macd"   name="MACD"   type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5} stroke="#60a5fa" isAnimationActive={false} />}
            {showSignal && <Line dataKey="signal" name="Signal" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#f59e0b" isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Slider — sits between chart and date labels */}
      {expanded && maxOffset > 0 && (
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
  const showRsi = true;
  const showK   = true;
  const showD   = true;

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
        idx:   i,
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

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="idx"
              type="category"
              tickLine={false}
              axisLine={false}
              height={expanded ? 34 : 0}
              hide={!expanded}
              tick={(props: any) => {
                const d = data[props.index];
                if (!d) return <g />;
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)">{d.date}</text>
                    {d.month && <text x={0} y={0} dy={23} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)" fontWeight={700}>{d.month}</text>}
                  </g>
                );
              }}
            />
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
            <Tooltip content={<RsiTooltip />} cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }} position={{ x: 60, y: 10 }} />
            {showRsi && <Line dataKey="rsi9" name="RSI(9)"      type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5} stroke="#60a5fa" isAnimationActive={false} />}
            {showK   && <Line dataKey="k"    name="StochRSI %K" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#f59e0b" isAnimationActive={false} />}
            {showD   && <Line dataKey="d"    name="StochRSI %D" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#c084fc" strokeDasharray="3 3" isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {expanded && maxOffset > 0 && (
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
  const showRsi14 = true;
  const showTrend = true;

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
        idx:   i,
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

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="idx"
              type="category"
              tickLine={false}
              axisLine={false}
              height={expanded ? 34 : 0}
              hide={!expanded}
              tick={(props: any) => {
                const d = data[props.index];
                if (!d) return <g />;
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)">{d.date}</text>
                    {d.month && <text x={0} y={0} dy={23} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)" fontWeight={700}>{d.month}</text>}
                  </g>
                );
              }}
            />
            <YAxis
              tick={tickStyle}
              tickLine={false}
              axisLine={false}
              width={yAxisWidth}
              domain={[20, 80]}
              ticks={[30, 50, 70]}
              tickFormatter={v => v.toFixed(0)}
            />
            <ReferenceArea y1={30} y2={70} fill="rgba(255,255,255,0.045)" ifOverflow="hidden" />
            <ReferenceLine y={70} stroke="rgba(255,255,255,0.20)" strokeWidth={1} />
            <ReferenceLine y={50} stroke="rgba(255,255,255,0.13)" strokeWidth={1} strokeDasharray="3 3" />
            <ReferenceLine y={30} stroke="rgba(255,255,255,0.20)" strokeWidth={1} />
            <Tooltip content={<Rsi14Tooltip />} cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }} position={{ x: 60, y: 10 }} />
            {showRsi14 && <Line dataKey="rsi14" name="RSI(14)" type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5} stroke="#60a5fa" isAnimationActive={false} />}
            {showTrend && <Line dataKey="trend" name="Trend"   type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#f59e0b" strokeDasharray="4 2" isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Slider */}
      {expanded && maxOffset > 0 && (
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

      {/* Indicator glossary — expanded only */}
      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#60a5fa", name: "RSI (14)", body: "Relative Strength Index over 14 periods — the standard setting. Smoother and more reliable than RSI(9), it filters out short-term noise and gives fewer but higher-quality signals. Above 70 = overbought; below 30 = oversold. Because it uses a longer lookback, overbought/oversold readings here carry more weight than on the 9-period." },
            { color: "#f59e0b", name: "Trend (5-bar SMA of RSI)", body: "A 5-period simple moving average applied to RSI(14) itself. When RSI(14) is above the Trend line, momentum is accelerating upward; when below, momentum is fading. The crossover between RSI(14) and its Trend line is an early signal of a momentum shift — useful for timing entries and exits within the broader RSI context." },
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
  const [showClose] = useState(true);
  const [showEma9,    setShowEma9]   = useState(true);
  const [showEma20,   setShowEma20]  = useState(true);
  const [showEma50,   setShowEma50]  = useState(!!expanded);
  const [showEma100,  setShowEma100] = useState(!!expanded);
  const [showEma200,  setShowEma200] = useState(!!expanded);
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
        ema100: r.ema100,
        ema200: r.ema200,
        sma20:  r.sma20,
        sma50:  r.sma50,
        sma200: r.sma200,
      };
    });
  }, [rows, offset, windowSize]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 48 : 44;
  const analysis   = useMemo(() => expanded ? buildMaAnalysis(rows) : null, [rows, expanded]);

  const TOGGLES = [
    { key: "ema9",   label: "EMA9",   color: "#c4b5fd",               on: showEma9,   set: setShowEma9   },
    { key: "ema20",  label: "EMA20",  color: "#a78bfa",               on: showEma20,  set: setShowEma20  },
    { key: "ema50",  label: "EMA50",  color: "#818cf8",               on: showEma50,  set: setShowEma50  },
    { key: "ema100", label: "EMA100", color: "#60a5fa",               on: showEma100, set: setShowEma100 },
    { key: "ema200", label: "EMA200", color: "#2563eb",               on: showEma200, set: setShowEma200 },
  ] as const;

  const yDomain = useMemo(() => {
    const vals: number[] = [];
    data.forEach(d => {
      if (showClose) { vals.push(d.high); vals.push(d.low); }
      if (showEma9)   vals.push(d.ema9);
      if (showEma20)  vals.push(d.ema20);
      if (showEma50)  vals.push(d.ema50);
      if (showEma100) vals.push(d.ema100);
      if (showEma200) vals.push(d.ema200);
    });
    if (!vals.length) return ["auto", "auto"] as const;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.15;
    return [min - pad, max + pad] as const;
  }, [data, showClose, showEma9, showEma20, showEma50, showEma100, showEma200]);

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
          <ComposedChart data={data} margin={{ top: 4, right: 24, bottom: 0, left: 16 }}>
            <XAxis
              dataKey="idx"
              type="category"
              tickLine={false}
              axisLine={false}
              height={expanded ? 34 : 0}
              hide={!expanded}
              tick={(props: any) => {
                const d = data[props.index];
                if (!d) return <g />;
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)">{d.date}</text>
                    {d.month && <text x={0} y={0} dy={23} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)" fontWeight={700}>{d.month}</text>}
                  </g>
                );
              }}
            />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={yDomain} tickFormatter={v => v.toFixed(4)} tickMargin={16} />
            <Tooltip content={<MaTooltip />} cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }} position={{ x: 60, y: 10 }} />
            {showClose && !showCandles && <Line dataKey="close"  name="Close"  type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="rgba(255,255,255,0.55)" isAnimationActive={false} />}
            {showEma9   && <Line dataKey="ema9"   name="EMA9"   type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#c4b5fd" isAnimationActive={false} />}
            {showEma20  && <Line dataKey="ema20"  name="EMA20"  type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#a78bfa" isAnimationActive={false} />}
            {showEma50  && <Line dataKey="ema50"  name="EMA50"  type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#818cf8" isAnimationActive={false} />}
            {showEma100 && <Line dataKey="ema100" name="EMA100" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#60a5fa" isAnimationActive={false} />}
            {showEma200 && <Line dataKey="ema200" name="EMA200" type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5} stroke="#2563eb" isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>

        {/* Candle overlay — absolutely positioned SVG */}
        {showClose && showCandles && chartSize && (() => {
          const plotLeft   = yAxisWidth + 16;
          const plotTop    = 4;
          const plotWidth  = chartSize.w - plotLeft - 24;
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
      {expanded && maxOffset > 0 && (
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

      {/* Indicator glossary — expanded only */}
      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#c4b5fd",               name: "EMA9",   body: "9-period Exponential Moving Average. The fastest line, highly responsive to recent price action. Acts as dynamic short-term support in uptrends and resistance in downtrends. A close below EMA9 in an uptrend is often the first warning of weakness." },
            { color: "#a78bfa",               name: "EMA20",  body: "20-period Exponential Moving Average. A responsive short-to-medium-term trend filter. Because EMAs weight recent prices more heavily than SMAs, EMA20 reacts faster to price changes. Price holding above EMA20 in an uptrend confirms short-term bullish structure; a sustained break below is an early warning of trend weakness." },
            { color: "#818cf8",               name: "EMA50",  body: "50-period Exponential Moving Average. The primary medium-term trend reference. Faster-reacting than SMA50, it gives earlier signals on trend changes. Institutional traders watch EMA50 closely — a price cross above or below this level often triggers significant order flow. Uptrends require price above EMA50." },
            { color: "#60a5fa",               name: "EMA100", body: "100-period Exponential Moving Average. A medium-to-long-term trend filter sitting between EMA50 and EMA200. Useful for confirming trend persistence — price holding above EMA100 after a pullback signals a healthy uptrend; a sustained break below warns of a deeper correction. Often used as a stop-loss reference on swing trades." },
            { color: "#2563eb",               name: "EMA200", body: "200-period Exponential Moving Average. The long-term trend anchor. Price above EMA200 = bull market context; below = bear market. The EMA200 golden cross (EMA50 crossing above EMA200) and death cross (EMA50 crossing below) are widely followed structural signals — EMA versions react faster than their SMA equivalents." },
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
  const showDiPlus  = true;
  const showDiMinus = true;
  const showAdx     = true;

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

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="idx"
              type="category"
              tickLine={false}
              axisLine={false}
              height={expanded ? 34 : 0}
              hide={!expanded}
              tick={(props: any) => {
                const d = data[props.index];
                if (!d) return <g />;
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)">{d.date}</text>
                    {d.month && <text x={0} y={0} dy={23} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)" fontWeight={700}>{d.month}</text>}
                  </g>
                );
              }}
            />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={expanded ? [0, Math.max(yDomain[1] as number, 45)] : yDomain} ticks={[25, 40]} tickFormatter={v => String(v)} />
            <Tooltip content={<MaTooltip />} cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }} position={{ x: 60, y: 10 }} />
            <ReferenceLine y={25} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="3 3" />
            <ReferenceLine y={40} stroke="rgba(255,255,255,0.10)" strokeWidth={1} strokeDasharray="2 4" />
            {showDiPlus  && <Line dataKey="diPlus"  name="+DI" type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5} stroke="#60a5fa" isAnimationActive={false} />}
            {showDiMinus && <Line dataKey="diMinus" name="−DI" type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5} stroke="#a78bfa" isAnimationActive={false} />}
            {showAdx     && <Line dataKey="adx"     name="ADX" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#f59e0b" isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Slider */}
      {expanded && maxOffset > 0 && (
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

      {/* Indicator glossary — expanded only */}
      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#60a5fa", name: "+DI (14)", body: "The Positive Directional Indicator measures the strength of upward price movement over 14 periods. When +DI is above −DI, bulls are in control of directional movement. A rising +DI confirms strengthening upside pressure; a falling +DI warns that bullish momentum is fading." },
            { color: "#a78bfa", name: "−DI (14)", body: "The Negative Directional Indicator measures the strength of downward price movement. When −DI is above +DI, bears dominate. A rising −DI signals increasing selling pressure. A crossover of −DI above +DI with ADX above 25 is a classic bearish trend entry signal." },
            { color: "#f59e0b", name: "ADX",      body: "The Average Directional Index measures trend strength, not direction — it rises in both up and downtrends. ADX below 20 = ranging market (avoid trend signals). ADX above 25 = trending. ADX above 40 = strong trend. A rising ADX confirms a trend is developing; a falling ADX signals the trend is fading regardless of direction." },
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
  const showClose   = true;
  const showTenkan  = true;
  const showKijun   = true;
  const showSenkouA = true;
  const showSenkouB = true;
  const showChikou  = true;
  const [showCandles, setShowCandles] = useState(() => localStorage.getItem("tm_ichi_show_candles") === "1");
  const chartRef  = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const handler = () => setShowCandles(localStorage.getItem("tm_ichi_show_candles") === "1");
    window.addEventListener("tm:ichi-candles-changed", handler);
    return () => window.removeEventListener("tm:ichi-candles-changed", handler);
  }, []);

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
        senkouA:        cloudRow && cloudRow.senkouA > 0 ? cloudRow.senkouA : (priceRow && priceRow.senkouA > 0 ? priceRow.senkouA : undefined),
        senkouB:        cloudRow && cloudRow.senkouB > 0 ? cloudRow.senkouB : (priceRow && priceRow.senkouB > 0 ? priceRow.senkouB : undefined),
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

  const yDomain = useMemo(() => {
    const vals: number[] = [];
    data.forEach(d => {
      if (showClose && showCandles) {
        if (d.high != null) vals.push(d.high);
        if (d.low  != null) vals.push(d.low);
      } else if (showClose && d.close != null) {
        vals.push(d.close);
      }
      if (showTenkan  && d.tenkan  != null && d.tenkan  !== 0) vals.push(d.tenkan);
      if (showKijun   && d.kijun   != null && d.kijun   !== 0) vals.push(d.kijun);
      if (showSenkouA && d.senkouA != null && d.senkouA !== 0) vals.push(d.senkouA);
      if (showSenkouB && d.senkouB != null && d.senkouB !== 0) vals.push(d.senkouB);
      if (showChikou  && d.chikou  != null && d.chikou  !== 0) vals.push(d.chikou);
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

      {expanded && <div className="shrink-0 flex items-center gap-1.5 px-2 pt-1" style={{ paddingLeft: yAxisWidth }}>
        {(
          <button
            onClick={() => {
              const next = !showCandles;
              localStorage.setItem("tm_ichi_show_candles", next ? "1" : "0");
              setShowCandles(next);
              window.dispatchEvent(new Event("tm:ichi-candles-changed"));
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

      {/* Chart */}
      <div ref={chartRef} className="flex-1 min-h-0" style={{ position: "relative" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="idx"
              type="category"
              tickLine={false}
              axisLine={false}
              height={expanded ? 34 : 0}
              hide={!expanded}
              tick={(props: any) => {
                const d = data[props.index];
                if (!d) return <g />;
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)">{d.date}</text>
                    {d.month && <text x={0} y={0} dy={23} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)" fontWeight={700}>{d.month}</text>}
                  </g>
                );
              }}
            />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={yDomain} tickFormatter={v => v.toFixed(4)} />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }}
              position={{ x: 60, y: 10 }}
              wrapperStyle={{ background: "none", border: "none", boxShadow: "none", zIndex: 50 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const filtered = showCandles ? payload.filter(p => p.name !== "Close") : payload;
                if (!filtered.length) return null;
                return (
                  <div style={{ background: "var(--bg-panel-alt, #181c2a)", border: "1px solid var(--border-medium)", borderRadius: 8, padding: "6px 10px", fontSize: 10, opacity: 1 }}>
                    {filtered.map(p => (
                      <div key={p.name} style={{ color: p.color }}>{p.name}: {(p.value as number).toFixed(5)}</div>
                    ))}
                  </div>
                );
              }}
            />
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
              {showClose && showCandles && data.map(d => {
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
      {expanded && maxOffset > 0 && (
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
      description = `A decisive ${pctChange.toFixed(3)}% advance with a ${bodyPct.toFixed(0)}% body fill reflects strong buying conviction. Buyers controlled the full ${rangePips}-pip range. The session open at ${cur.open.toFixed(4)} now acts as near-term support — pullbacks toward that level are likely to attract buyers.`;
    } else {
      headline    = "Strong Bearish Session";
      description = `A ${Math.abs(pctChange).toFixed(3)}% decline with a ${bodyPct.toFixed(0)}% body fill signals dominant selling pressure. Bears held control across the ${rangePips}-pip session range. The session open at ${cur.open.toFixed(4)} now acts as near-term resistance — intraday rallies toward that level are likely to find sellers.`;
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
      const bodyPct   = r.high !== r.low ? Math.abs(r.close - r.open) / (r.high - r.low) * 100 : 0;
      const rangePips = Math.round((r.high - r.low) * 10000);
      const parts     = r.date.split("-");
      const monthIdx  = parseInt(parts[1]) - 1;
      return { idx: i, pctChange, bodyPct, rangePips, insideBar: r.insideBar, bullish: r.close >= r.open, date: parseInt(parts[2]).toString(), monthIdx };
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
          <ComposedChart data={data} margin={{ top: 4, right: 20, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="idx"
              type="category"
              tickLine={false}
              axisLine={false}
              height={expanded ? 34 : 0}
              hide={!expanded}
              tick={(props: any) => {
                const d = data[props.index];
                if (!d) return <g />;
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)">{d.date}</text>
                    {d.month && <text x={0} y={0} dy={23} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)" fontWeight={700}>{d.month}</text>}
                  </g>
                );
              }}
            />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={yDomain} tickFormatter={v => v.toFixed(2) + "%"} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              position={{ x: 60, y: 10 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as typeof data[0];
                return (
                  <div className="rounded-lg px-3 py-2 text-[10px]" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-medium)", color: "var(--text-secondary)" }}>
                    <div className="font-bold mb-1" style={{ color: d.bullish ? "#60a5fa" : "#a78bfa" }}>
                      {d.pctChange >= 0 ? "+" : ""}{d.pctChange.toFixed(3)}%
                    </div>
                    <div>Range: {d.rangePips} pips</div>
                    <div>Body Fill: {d.bodyPct.toFixed(0)}%</div>
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

      {expanded && maxOffset > 0 && (
        <input type="range" className="momentum-scroll" min={0} max={maxOffset} value={offset}
          onChange={e => setOffset(Number(e.target.value))} style={{ direction: "rtl" }} />
      )}

      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#60a5fa",               name: "% Change",    body: "Session return from prior close to current close. Positive = bullish session; negative = bearish." },
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

  const typical   = (r: SheetRow) => (r.high + r.low + r.close) / 3;
  const avgPrice5 = rows.slice(-5).reduce((s, r) => s + typical(r), 0) / 5;
  const deltas    = rows.slice(-5).map((r, i, a) => i === 0 ? 0 : (r.close - a[i - 1].close) * 10000);
  const avgDelta  = deltas.slice(1).reduce((s, d) => s + d, 0) / 4;
  const aboveAvg  = cur.close > avgPrice5;
  const deltaPips = avgDelta.toFixed(1);
  const diffPips  = Math.round(Math.abs(cur.close - avgPrice5) * 10000);

  const bullets = [
    `Close: ${cur.close.toFixed(4)} · Avg Price (HLC/3 SMA5): ${avgPrice5.toFixed(4)}`,
    `Close is ${aboveAvg ? "above" : "below"} the 5-bar avg price by ${diffPips} pips`,
    `Avg Delta (5-bar): ${avgDelta >= 0 ? "+" : ""}${deltaPips} pips/session`,
  ];

  let headline: string, description: string;
  if (aboveAvg && avgDelta > 0) {
    headline    = "Bullish — Close Above Avg Price, Positive Drift";
    description = `Close (${cur.close.toFixed(4)}) sits ${diffPips} pips above the 5-bar average price (${avgPrice5.toFixed(4)}), and the average daily delta of +${deltaPips} pips confirms consistent net buying pressure across recent sessions. Price is trading above its own recent centre of gravity — buyers have been in control of both the range and the close.`;
  } else if (!aboveAvg && avgDelta < 0) {
    headline    = "Bearish — Close Below Avg Price, Negative Drift";
    description = `Close (${cur.close.toFixed(4)}) sits ${diffPips} pips below the 5-bar average price (${avgPrice5.toFixed(4)}), and the average daily delta of ${deltaPips} pips confirms persistent net selling pressure. Price is trading below its own recent centre of gravity — sellers have controlled both the range and the close across recent sessions.`;
  } else if (aboveAvg && avgDelta <= 0) {
    headline    = "Fading — Close Above Avg Price but Selling Drift";
    description = `Close (${cur.close.toFixed(4)}) is ${diffPips} pips above the 5-bar average price (${avgPrice5.toFixed(4)}), but the average daily delta of ${deltaPips} pips signals selling drift. The session close is above the recent range mid-point, yet intra-session pressure has been negative — watch for a reversion toward the average.`;
  } else if (!aboveAvg && avgDelta >= 0) {
    headline    = "Recovery — Close Below Avg Price but Buying Drift";
    description = `Close (${cur.close.toFixed(4)}) is ${diffPips} pips below the 5-bar average price (${avgPrice5.toFixed(4)}), but the average daily delta of +${deltaPips} pips suggests buying drift is beginning. Price has not yet closed above its recent centre of gravity, but session-by-session pressure is turning supportive.`;
  } else {
    headline    = "Neutral — Close Near Avg Price";
    description = `Close (${cur.close.toFixed(4)}) sits ${diffPips} pips ${aboveAvg ? "above" : "below"} the 5-bar average price (${avgPrice5.toFixed(4)}), a minimal deviation. The average daily delta of ${deltaPips >= "0" ? "+" : ""}${deltaPips} pips confirms little sustained directional pressure. Price is near its own recent centre of gravity — a range-bound condition with no clear edge.`;
  }
  return { headline, bullets, description };
}

function buildRocAnalysis(rows: SheetRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 6) return { headline: "—", bullets: [], description: "—" };
  const idx  = rows.length - 1;
  const cur  = rows[idx];

  const roc5     = idx >= 5 ? ((cur.close - rows[idx - 5].close) / rows[idx - 5].close) * 100 : 0;
  const rocSign  = roc5 >= 0 ? "+" : "";
  const recent20 = rows.slice(-20);
  const maxRoc   = Math.max(...recent20.map((r, i, a) => i < 5 ? 0 : Math.abs((r.close - a[i - 5].close) / a[i - 5].close * 100)));
  const rocRatio = maxRoc > 0 ? Math.abs(roc5) / maxRoc : 0;

  const bullets = [
    `ROC(5): ${rocSign}${roc5.toFixed(3)}%`,
    `${(rocRatio * 100).toFixed(0)}% of 20-session peak rate (peak: ${maxRoc > 0 ? "±" + maxRoc.toFixed(3) + "%" : "n/a"})`,
    roc5 > 0.5 ? "Strong bullish momentum — 5-session net gain above threshold" :
    roc5 < -0.5 ? "Strong bearish momentum — 5-session net loss below threshold" :
    Math.abs(roc5) > 0.1 ? `Moderate ${roc5 > 0 ? "bullish" : "bearish"} bias — directional but not extreme` :
    "Flat — minimal 5-session net change, no directional bias",
  ];

  let headline: string, description: string;
  if (roc5 > 0.5) {
    headline    = "Strong Bullish Rate of Change";
    description = `ROC(5) at ${rocSign}${roc5.toFixed(3)}% reflects a meaningful net gain over the past 5 sessions. At ${(rocRatio * 100).toFixed(0)}% of the 20-session peak rate, the current move has ${rocRatio > 0.7 ? "significant momentum that is hard to fade" : "room to extend before reaching a historic extreme"}. Accelerating ROC in the direction of a trend confirms momentum; watch for deceleration as an early warning of exhaustion.`;
  } else if (roc5 < -0.5) {
    headline    = "Strong Bearish Rate of Change";
    description = `ROC(5) at ${roc5.toFixed(3)}% reflects a meaningful net decline over the past 5 sessions. At ${(rocRatio * 100).toFixed(0)}% of the 20-session peak rate, the pace of decline is ${rocRatio > 0.7 ? "elevated — watch for exhaustion and potential bounce" : "moderate with room for further extension"}. ROC divergence (price makes new low but ROC does not) is the key early reversal signal to monitor.`;
  } else if (roc5 > 0.1) {
    headline    = "Moderate Bullish Rate of Change";
    description = `ROC(5) at ${rocSign}${roc5.toFixed(3)}% indicates moderate upside momentum over the past 5 sessions. At ${(rocRatio * 100).toFixed(0)}% of the recent peak rate, the move is constructive but not extreme. A further expansion toward +0.5% would confirm a stronger bullish impulse; a rollover back toward zero would suggest the bid is fading.`;
  } else if (roc5 < -0.1) {
    headline    = "Moderate Bearish Rate of Change";
    description = `ROC(5) at ${roc5.toFixed(3)}% indicates moderate downside momentum over the past 5 sessions. At ${(rocRatio * 100).toFixed(0)}% of the recent peak rate, the move has bearish bias but is not yet at an extreme. Continued deterioration below −0.5% would signal a stronger bearish impulse; stabilisation near zero would suggest selling pressure is abating.`;
  } else {
    headline    = "Rate of Change Flat — No Directional Bias";
    description = `ROC(5) at ${rocSign}${roc5.toFixed(3)}% indicates a nearly flat 5-session net change — price has gone essentially nowhere on a week-over-week basis. At ${(rocRatio * 100).toFixed(0)}% of the 20-session peak rate, momentum is minimal. This is a low-conviction environment. Wait for ROC to build a sustained move above +0.1% or below −0.1% before reading directional bias into the tape.`;
  }
  return { headline, bullets, description };
}

const AVGP_WINDOW = 20;

function AvgPricePanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize = expanded ? 40 : AVGP_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset]       = useState(0);
  const showClose    = true;
  const showAvgPrice = true;

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
        avgDelta,
      };
    });
  }, [rows, offset, windowSize]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 60 : 44;
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
            <XAxis
              dataKey="idx"
              type="category"
              tickLine={false}
              axisLine={false}
              height={expanded ? 34 : 0}
              hide={!expanded}
              tick={(props: any) => {
                const d = data[props.index];
                if (!d) return <g />;
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)">{d.date}</text>
                    {d.month && <text x={0} y={0} dy={23} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)" fontWeight={700}>{d.month}</text>}
                  </g>
                );
              }}
            />
            <YAxis yAxisId="price" tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={priceDomain} tickFormatter={v => v.toFixed(4)} />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }}
              position={{ x: 60, y: 10 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as typeof data[0];
                return (
                  <div className="rounded-lg px-3 py-2 text-[10px]" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-medium)", color: "var(--text-secondary)" }}>
                    <div className="font-bold mb-1" style={{ color: "rgba(255,255,255,0.85)" }}>{d.close.toFixed(4)}</div>
                    <div style={{ color: "#f59e0b" }}>Avg Price: {d.avgPrice.toFixed(4)}</div>
                    <div style={{ color: d.avgDelta >= 0 ? "#60a5fa" : "#a78bfa" }}>
                      Avg Δ: {d.avgDelta >= 0 ? "+" : ""}{d.avgDelta.toFixed(1)} pips/day
                    </div>
                  </div>
                );
              }}
            />
            {showAvgPrice && <Line yAxisId="price" dataKey="avgPrice" name="Avg Price" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#f59e0b" strokeDasharray="4 2" isAnimationActive={false} />}
            {showClose    && <Line yAxisId="price" dataKey="close"    name="Close"     type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5}   stroke="#60a5fa" isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {expanded && maxOffset > 0 && (
        <input type="range" className="momentum-scroll" min={0} max={maxOffset} value={offset}
          onChange={e => setOffset(Number(e.target.value))} style={{ direction: "rtl" }} />
      )}

      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "rgba(255,255,255,0.75)", name: "Close",                    body: "The session closing price — the primary reference point for all price comparisons. When close sits above the 5-bar average price, the most recent session closed with buyers in control of the recent range. When below, sellers have held the edge across the look-back window." },
            { color: "#f59e0b",               name: "Avg Price (HLC/3 SMA5)",   body: "The 5-session simple moving average of the typical price — (High + Low + Close) ÷ 3. Unlike a close-only moving average, it weights the full session range, giving a more balanced representation of where price has traded. When close is above avg price, buyers have dominated recent sessions; when below, sellers hold the edge." },
            { color: "#60a5fa",               name: "Avg Delta (5-bar)",        body: "The average pip change per session over the past 5 bars: mean of (Close[i] − Close[i−1]) × 10,000. Positive avg delta = net buying drift; negative = net selling drift. A small avg delta with a large ROC means one or two sessions drove the move. A large avg delta means the directional pressure has been consistent across all five sessions." },
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

const ROC_WINDOW = 20;

function RocPanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize = expanded ? 40 : ROC_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const data = useMemo(() => {
    const start    = rows.length - windowSize - offset;
    const end      = rows.length - offset;
    const slice    = rows.slice(Math.max(0, start), end);
    const startIdx = Math.max(0, start);
    return slice.map((r, i) => {
      const rowIdx   = startIdx + i;
      const parts    = r.date.split("-");
      const monthIdx = parseInt(parts[1]) - 1;
      const prevMonth = i > 0 ? parseInt(slice[i-1].date.split("-")[1]) - 1 : -1;
      const roc5     = rowIdx >= 5 ? ((r.close - rows[rowIdx - 5].close) / rows[rowIdx - 5].close) * 100 : 0;
      return {
        idx: i,
        date: parseInt(parts[2]).toString(),
        month: monthIdx !== prevMonth ? MONTHS[monthIdx] : "",
        roc5,
      };
    });
  }, [rows, offset, windowSize]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 52 : 38;
  const analysis   = useMemo(() => expanded ? buildRocAnalysis(rows) : null, [rows, expanded]);

  const rocDomain = useMemo(() => {
    if (!data.length) return [-1, 1] as const;
    const abs = Math.max(0.2, ...data.map(d => Math.abs(d.roc5)));
    return [-(abs * 1.2), abs * 1.2] as const;
  }, [data]);

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
            <XAxis
              dataKey="idx"
              type="category"
              tickLine={false}
              axisLine={false}
              height={expanded ? 34 : 0}
              hide={!expanded}
              tick={(props: any) => {
                const d = data[props.index];
                if (!d) return <g />;
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)">{d.date}</text>
                    {d.month && <text x={0} y={0} dy={23} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)" fontWeight={700}>{d.month}</text>}
                  </g>
                );
              }}
            />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={rocDomain} tickFormatter={v => v.toFixed(2) + "%"} />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }}
              position={{ x: 60, y: 10 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as typeof data[0];
                return (
                  <div className="rounded-lg px-3 py-2 text-[10px]" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-medium)", color: "var(--text-secondary)" }}>
                    <div style={{ color: d.roc5 >= 0 ? "#60a5fa" : "#a78bfa" }}>
                      ROC(5): {d.roc5 >= 0 ? "+" : ""}{d.roc5.toFixed(3)}%
                    </div>
                  </div>
                );
              }}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
            <Line dataKey="roc5" name="ROC(5)" type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5} stroke="#60a5fa" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {expanded && maxOffset > 0 && (
        <input type="range" className="momentum-scroll" min={0} max={maxOffset} value={offset}
          onChange={e => setOffset(Number(e.target.value))} style={{ direction: "rtl" }} />
      )}

      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#a78bfa", name: "ROC(5)",           body: "Rate of Change over 5 sessions: (Close − Close[5]) ÷ Close[5] × 100. Measures the net percentage gain or loss over exactly one trading week. Positive = net bullish week; negative = net bearish. Accelerating ROC in the direction of the trend confirms momentum; decelerating ROC warns of fatigue. Extreme readings signal overextension." },
            { color: "#60a5fa", name: "Above Zero",        body: "ROC above zero means this week's close is higher than the close five sessions ago — net buying pressure over the look-back window. The magnitude matters: readings above +0.5% indicate meaningful upside momentum. Readings approaching the 20-session peak rate suggest the move is maturing." },
            { color: "#a78bfa", name: "Below Zero",        body: "ROC below zero means this week's close is lower than the close five sessions ago — net selling pressure. Readings below −0.5% indicate meaningful downside momentum. Watch for ROC divergence: if price makes a new low but ROC fails to confirm, bearish momentum may be fading." },
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
  const showAtr    = true;
  const showAtrSma = true;

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
            <XAxis
              dataKey="idx"
              type="category"
              tickLine={false}
              axisLine={false}
              height={expanded ? 34 : 0}
              hide={!expanded}
              tick={(props: any) => {
                const d = data[props.index];
                if (!d) return <g />;
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)">{d.date}</text>
                    {d.month && <text x={0} y={0} dy={23} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)" fontWeight={700}>{d.month}</text>}
                  </g>
                );
              }}
            />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={yDomain} tickFormatter={v => v.toFixed(0)} />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }}
              position={{ x: 60, y: 10 }}
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
            {showAtr && <Line dataKey="atr" name="ATR(14)" type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5} stroke="#60a5fa" isAnimationActive={false} />}
            {showAtrSma && <Line dataKey="atrSma" name="ATR SMA20" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#f59e0b" isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {expanded && maxOffset > 0 && (
        <input type="range" className="momentum-scroll" min={0} max={maxOffset} value={offset}
          onChange={e => setOffset(Number(e.target.value))} style={{ direction: "rtl" }} />
      )}

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

// ─── Squeeze ─────────────────────────────────────────────────────────────────

const SQZ_WINDOW = 20;

function buildSqueezeAnalysis(rows: SheetRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 3) return { headline: "—", bullets: [], description: "—" };

  const cur  = rows[rows.length - 1];
  const prev = rows[rows.length - 2];

  const squeezed     = cur.bbUpper  < cur.keltnerUpper  && cur.bbLower  > cur.keltnerLower;
  const wasSqueezed  = prev.bbUpper < prev.keltnerUpper && prev.bbLower > prev.keltnerLower;
  const justFired    = wasSqueezed  && !squeezed;
  const justEntered  = !wasSqueezed && squeezed;

  const bbWidth  = (cur.bbUpper  - cur.bbLower)  * 10000;
  const kcWidth  = (cur.keltnerUpper - cur.keltnerLower) * 10000;

  // Count consecutive bars in current squeeze state
  let streak = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    const s = r.bbUpper < r.keltnerUpper && r.bbLower > r.keltnerLower;
    if (s === squeezed) streak++;
    else break;
  }

  // Momentum: close − avg(20-bar HH+LL midpoint, sma20) — approximate via last 20 rows
  const win20 = rows.slice(Math.max(0, rows.length - 20));
  const hh20  = Math.max(...win20.map(r => r.high));
  const ll20  = Math.min(...win20.map(r => r.low));
  const mom   = (cur.close - ((hh20 + ll20) / 2 + cur.sma20) / 2) * 10000;
  const momPrev = (() => {
    const w = rows.slice(Math.max(0, rows.length - 21), rows.length - 1);
    if (!w.length) return mom;
    const h = Math.max(...w.map(r => r.high));
    const l = Math.min(...w.map(r => r.low));
    return (prev.close - ((h + l) / 2 + prev.sma20) / 2) * 10000;
  })();
  const momRising = mom > momPrev;

  const headline = justFired   ? "Squeeze Fired — Volatility Expansion Underway"
    : justEntered ? "Squeeze Active — Volatility Contracting"
    : squeezed    ? `Squeeze: ${streak} bars — Coiling Continues`
    : `Squeeze Released — ${momRising ? "Bullish" : "Bearish"} Momentum`;

  const bullets: string[] = [
    `BB width: ${bbWidth.toFixed(1)} pips | KC width: ${kcWidth.toFixed(1)} pips | Ratio: ${(bbWidth / kcWidth).toFixed(2)}`,
    `Squeeze ${squeezed ? "ON" : "OFF"} for ${streak} consecutive bar${streak !== 1 ? "s" : ""}`,
    `Momentum: ${mom >= 0 ? "+" : ""}${mom.toFixed(1)} pips — ${momRising ? "rising" : "falling"}`,
  ];

  let description = "";
  if (justFired) {
    description = `The Bollinger Bands have just expanded outside the Keltner Channels — the squeeze has fired. Compressed volatility is releasing. Momentum is ${momRising ? "positive and rising, favouring longs" : "negative, favouring shorts"}. This is typically the highest-conviction entry window. Confirm direction with price action and volume before committing.`;
  } else if (squeezed && streak <= 3) {
    description = `The Bollinger Bands have just moved inside the Keltner Channels, signalling a new volatility squeeze. The market is beginning to coil. Historically, early-stage squeezes offer low-risk entry opportunities ahead of the breakout. Watch for momentum to build direction while waiting for the squeeze to fire.`;
  } else if (squeezed) {
    description = `The squeeze has been active for ${streak} bars. Volatility remains compressed — the Bollinger Bands are fully inside the Keltner Channels. Extended squeezes often precede sharp directional moves. Momentum is ${momRising ? "building to the upside" : "pressing to the downside"}. Patience is required — wait for the bands to expand before entering.`;
  } else if (momRising) {
    description = `The squeeze is off and momentum is rising. Bullish pressure is expanding. This is a continuation environment — pullbacks toward the midline are buying opportunities while momentum remains positive and rising. Monitor for momentum to peak and turn down as the first sign of exhaustion.`;
  } else {
    description = `The squeeze is off and momentum is falling. Bearish pressure is expanding. Avoid long entries until momentum stabilises. Short setups on bounces have the highest probability while momentum remains negative and declining.`;
  }

  return { headline, bullets, description };
}

function SqueezePanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize = expanded ? 40 : SQZ_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);

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

      const squeezed = r.bbUpper < r.keltnerUpper && r.bbLower > r.keltnerLower;

      // Momentum: close − avg(HH20+LL20 midpoint, sma20)
      const win = rows.slice(Math.max(0, absIdx - 19), absIdx + 1);
      const hh  = Math.max(...win.map(x => x.high));
      const ll  = Math.min(...win.map(x => x.low));
      const mom = (r.close - ((hh + ll) / 2 + r.sma20) / 2) * 10000;

      const prevMom = (() => {
        if (i === 0) return mom;
        const pi  = absIdx - 1;
        const pw  = rows.slice(Math.max(0, pi - 19), pi + 1);
        const ph  = Math.max(...pw.map(x => x.high));
        const pl  = Math.min(...pw.map(x => x.low));
        return (slice[i - 1].close - ((ph + pl) / 2 + slice[i - 1].sma20) / 2) * 10000;
      })();

      return {
        idx:      i,
        date:     parseInt(parts[2]).toString(),
        month:    monthIdx !== prevMonth ? MONTHS[monthIdx] : "",
        squeezed,
        mom,
        rising:   mom > prevMom,
      };
    });
  }, [rows, offset, windowSize]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 48 : 34;
  const analysis   = useMemo(() => expanded ? buildSqueezeAnalysis(rows) : null, [rows, expanded]);

  const latest = data[data.length - 1];
  const squeezed = latest?.squeezed ?? false;

  const yDomain = useMemo(() => {
    const vals = data.map(d => d.mom);
    if (!vals.length) return ["auto", "auto"] as const;
    const abs = Math.max(...vals.map(Math.abs));
    const pad = abs * 0.25;
    return [-(abs + pad), abs + pad] as const;
  }, [data]);

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
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }} barCategoryGap={expanded ? 2 : 1}>
            <XAxis
              dataKey="idx"
              type="category"
              tickLine={false}
              axisLine={false}
              height={expanded ? 34 : 0}
              hide={!expanded}
              tick={(props: any) => {
                const d = data[props.index];
                if (!d) return <g />;
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)">{d.date}</text>
                    {d.month && <text x={0} y={0} dy={23} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)" fontWeight={700}>{d.month}</text>}
                  </g>
                );
              }}
            />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={yDomain} tickFormatter={v => v.toFixed(0)} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }}
              position={{ x: 60, y: 10 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as typeof data[0];
                return (
                  <div className="rounded-lg px-3 py-2 text-[10px]" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-medium)", color: "var(--text-secondary)" }}>
                    <div style={{ color: d.squeezed ? "#fbbf24" : "#9ca3af", fontWeight: 700 }}>Squeeze: {d.squeezed ? "ON" : "OFF"}</div>
                    <div style={{ color: d.mom >= 0 ? "#60a5fa" : "#a78bfa" }}>Momentum: {d.mom >= 0 ? "+" : ""}{d.mom.toFixed(1)} pips</div>
                    <div style={{ color: "var(--text-muted)" }}>{d.rising ? "↑ Rising" : "↓ Falling"}</div>
                  </div>
                );
              }}
            />
            <Bar dataKey="mom" name="Momentum" isAnimationActive={false}>
              {data.map((d, i) => {
                const color = d.mom >= 0
                  ? (d.rising ? "#60a5fa" : "#93c5fd")
                  : (d.rising ? "#c4b5fd" : "#a78bfa");
                return <Cell key={i} fill={color} />;
              })}
            </Bar>
            {/* Squeeze dots at zero line */}
            <Line
              dataKey={() => 0}
              dot={(props: any) => {
                const d = data[props.index];
                if (!d) return <circle key={props.index} />;
                return (
                  <circle
                    key={props.index}
                    cx={props.cx}
                    cy={props.cy}
                    r={expanded ? 3 : 2}
                    fill={d.squeezed ? "#fbbf24" : "#9ca3af"}
                    stroke="none"
                  />
                );
              }}
              activeDot={false}
              stroke="none"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {expanded && maxOffset > 0 && (
        <input type="range" className="momentum-scroll" min={0} max={maxOffset} value={offset}
          onChange={e => setOffset(Number(e.target.value))} style={{ direction: "rtl" }} />
      )}

      {!expanded && (
        <div className="shrink-0 flex flex-col items-center pb-1 gap-1">
          <div className="flex items-center gap-1.5" style={{ fontSize: 9, color: squeezed ? "#fbbf24" : "#9ca3af" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: squeezed ? "#fbbf24" : "#9ca3af", flexShrink: 0 }} />
            {squeezed ? "SQUEEZE ON" : "SQUEEZE OFF"}
          </div>
          <div style={{
            height: 3,
            width: "calc(100% - 16px)",
            borderRadius: 2,
            background: squeezed ? "rgba(251,191,36,0.22)" : "#9ca3af",
            boxShadow: squeezed ? "none" : "0 0 6px rgba(156,163,175,0.65)",
            transition: "all 0.3s",
          }} />
        </div>
      )}

      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#9ca3af", name: "Squeeze Dot — OFF", body: "Gray dot: Bollinger Bands are outside the Keltner Channels. Volatility is expanding. The squeeze has fired or was never active. Momentum bars during this phase indicate the direction and strength of the breakout move." },
            { color: "#fbbf24", name: "Squeeze Dot — ON",  body: "Yellow dot: Bollinger Bands are fully inside the Keltner Channels. The market is coiling — volatility is compressed. The longer the squeeze persists, the more energy accumulates. Wait for the dots to turn gray before entering in the direction of momentum." },
            { color: "#60a5fa", name: "Momentum",          body: "A momentum oscillator derived from close relative to the 20-bar highest high/lowest low midpoint and SMA20. Rising blue bars = bullish momentum strengthening. Fading blue bars = bullish momentum weakening. Purple bars = bearish momentum. Use momentum direction at squeeze fire to determine trade bias." },
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
  const showCdf   = true;
  const showToday = true;
  const showPercs = true;

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

      <div className="flex-1 min-h-0" style={{ position: "relative" }}>
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
                stroke="#f59e0b"
                strokeWidth={expanded ? 1.5 : 1}
                strokeOpacity={0.75}
                label={expanded ? { value: `${todayFs}p`, position: "insideTopRight", fontSize: 10, fill: "#f59e0b" } : undefined}
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

// ─── Market Structure ─────────────────────────────────────────────────────────
const MS_WINDOW   = 20;
const MS_LOOKBACK = 3;

type MsSwing = { idx: number; type: "SH" | "SL"; price: number };
type MsEvent = { idx: number; type: "BOS" | "CHOCH"; direction: "bull" | "bear" };

function computeMarketStructure(rows: SheetRow[], N = MS_LOOKBACK): {
  swings: MsSwing[]; events: MsEvent[]; state: "Bullish" | "Bearish" | "Range";
} {
  if (rows.length < N * 2 + 1) return { swings: [], events: [], state: "Range" };
  const swings: MsSwing[] = [];
  for (let i = N; i < rows.length - N; i++) {
    let sh = true, sl = true;
    for (let k = 1; k <= N; k++) {
      if (rows[i - k].high >= rows[i].high || rows[i + k].high >= rows[i].high) sh = false;
      if (rows[i - k].low  <= rows[i].low  || rows[i + k].low  <= rows[i].low)  sl = false;
    }
    if (sh) swings.push({ idx: i, type: "SH", price: rows[i].high });
    if (sl) swings.push({ idx: i, type: "SL", price: rows[i].low  });
  }
  swings.sort((a, b) => a.idx - b.idx);

  // Enforce alternation: collapse consecutive same-type swings, keeping highest SH / lowest SL
  const alternating: MsSwing[] = [];
  for (const s of swings) {
    const prev = alternating[alternating.length - 1];
    if (prev && prev.type === s.type) {
      if (s.type === "SH" && s.price > prev.price) alternating[alternating.length - 1] = s;
      if (s.type === "SL" && s.price < prev.price) alternating[alternating.length - 1] = s;
    } else {
      alternating.push(s);
    }
  }

  const SHs = alternating.filter(s => s.type === "SH");
  const SLs = alternating.filter(s => s.type === "SL");
  let state: "Bullish" | "Bearish" | "Range" = "Range";
  if (SHs.length >= 2 && SLs.length >= 2) {
    const hh = SHs[SHs.length - 1].price > SHs[SHs.length - 2].price;
    const hl = SLs[SLs.length - 1].price > SLs[SLs.length - 2].price;
    const lh = SHs[SHs.length - 1].price < SHs[SHs.length - 2].price;
    const ll = SLs[SLs.length - 1].price < SLs[SLs.length - 2].price;
    if (hh && hl)      state = "Bullish";
    else if (lh && ll) state = "Bearish";
  }
  const events: MsEvent[] = [];
  let trend: "bull" | "bear" | null = null;
  let lastSH: MsSwing | null = null;
  let lastSL: MsSwing | null = null;
  for (const s of alternating) {
    if (s.type === "SH") {
      if (lastSH !== null && s.price > lastSH.price) {
        events.push({ idx: s.idx, type: trend === "bear" ? "CHOCH" : "BOS", direction: "bull" });
        trend = "bull";
      }
      lastSH = s;
    } else {
      if (lastSL !== null && s.price < lastSL.price) {
        events.push({ idx: s.idx, type: trend === "bull" ? "CHOCH" : "BOS", direction: "bear" });
        trend = "bear";
      }
      lastSL = s;
    }
  }
  return { swings: alternating, events, state };
}

function buildMarketStructureAnalysis(rows: SheetRow[]): { bullets: string[]; description: string } {
  const { swings, events, state } = computeMarketStructure(rows);
  const SHs      = swings.filter(s => s.type === "SH");
  const SLs      = swings.filter(s => s.type === "SL");
  const lastEv   = events[events.length - 1];
  const hhhl     = SHs.length >= 2 && SLs.length >= 2
    ? `HH: ${SHs[SHs.length-1].price > SHs[SHs.length-2].price ? "Yes" : "No"} · HL: ${SLs[SLs.length-1].price > SLs[SLs.length-2].price ? "Yes" : "No"}`
    : "Insufficient swing data";
  const bullets = [
    `State: ${state}`,
    `Swing Highs: ${SHs.length}  ·  Swing Lows: ${SLs.length}`,
    hhhl,
    lastEv ? `Last signal: ${lastEv.type} ${lastEv.direction === "bull" ? "↑ Bullish" : "↓ Bearish"}` : "No BOS / CHOCH detected",
  ];
  const description =
    state === "Bullish"
      ? "Price is forming higher highs and higher lows — classic bullish market structure. Smart money is accumulating at each pullback into support. Look for BOS signals to confirm continuation."
      : state === "Bearish"
      ? "Price is forming lower highs and lower lows — classic bearish market structure. Distribution is occurring at each rally into resistance. BOS to the downside confirms continuation."
      : "No consistent pattern of higher highs/lows or lower highs/lows. Market is in a ranging structure — avoid momentum bias and wait for a structural break before committing to a direction.";
  return { bullets, description };
}

function MarketStructurePanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize = expanded ? 40 : MS_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);
  const [showZones, setShowZones] = useState(true);
  const chartRef   = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState<{ w: number; h: number } | null>(null);
  const [hoverPos, setHoverPos]   = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = chartRef.current; if (!el) return;
    const obs = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setChartSize({ w: r.width, h: r.height });
    });
    obs.observe(el); return () => obs.disconnect();
  }, []);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const structure = useMemo(() => computeMarketStructure(rows), [rows]);

  const data = useMemo(() => {
    const start = rows.length - windowSize - offset;
    const end   = rows.length - offset;
    const slice = rows.slice(Math.max(0, start), end);
    return slice.map((r, i) => {
      const globalIdx = Math.max(0, start) + i;
      const parts     = r.date.split("-");
      const monthIdx  = parseInt(parts[1]) - 1;
      const prevMonth = i > 0 ? parseInt(slice[i - 1].date.split("-")[1]) - 1 : -1;
      return {
        idx:         i,
        globalIdx,
        date:        parseInt(parts[2]).toString(),
        month:       monthIdx !== prevMonth ? MONTHS[monthIdx] : "",
        open:        r.open,
        high:        r.high,
        low:         r.low,
        close:       r.close,
        isSwingHigh: structure.swings.some(s => s.idx === globalIdx && s.type === "SH"),
        isSwingLow:  structure.swings.some(s => s.idx === globalIdx && s.type === "SL"),
        events:      structure.events.filter(e => e.idx === globalIdx),
      };
    });
  }, [rows, offset, windowSize, structure]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 60 : 44;

  const yDomain = useMemo(() => {
    if (!data.length) return ["auto", "auto"] as const;
    const min = Math.min(...data.map(d => d.low));
    const max = Math.max(...data.map(d => d.high));
    const pad = (max - min) * 0.18;
    return [min - pad, max + pad] as const;
  }, [data]);

  const { state } = structure;
  const stateColor = state === "Bullish" ? "#60a5fa" : state === "Bearish" ? "#a78bfa" : "#94a3b8";
  const analysis   = useMemo(() => expanded ? buildMarketStructureAnalysis(rows) : null, [rows, expanded]);

  const lastBos = useMemo(() => {
    const ev = [...structure.events].reverse().find(e => e.type === "BOS");
    if (!ev) return null;
    return { direction: ev.direction === "bull" ? "Bullish" : "Bearish", barsAgo: rows.length - 1 - ev.idx };
  }, [structure, rows.length]);

  const lastChoch = useMemo(() => {
    const ev = [...structure.events].reverse().find(e => e.type === "CHOCH");
    if (!ev) return null;
    return { direction: ev.direction === "bull" ? "Bullish" : "Bearish", barsAgo: rows.length - 1 - ev.idx };
  }, [structure, rows.length]);

  return (
    <div className="flex flex-col h-full">
      {expanded && analysis && (
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
        </div>
      )}

      <div ref={chartRef} className="flex-1 min-h-0" style={{ position: "relative" }}
        onMouseMove={e => {
          const rect = chartRef.current?.getBoundingClientRect();
          if (rect) setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
        onMouseLeave={() => setHoverPos(null)}
      >
        {expanded && (
          <div style={{ position: "absolute", top: 6, right: 8, zIndex: 10 }}>
            <button onClick={() => setShowZones(z => !z)} style={{
              fontSize: 8, fontWeight: 700, fontFamily: "monospace", textTransform: "uppercase",
              letterSpacing: "0.05em", padding: "1px 6px", borderRadius: 999, cursor: "pointer",
              color: showZones ? "#94a3b8" : "#475569",
              background: showZones ? "rgba(148,163,184,0.12)" : "transparent",
              border: `1px solid ${showZones ? "rgba(148,163,184,0.3)" : "rgba(71,85,105,0.3)"}`,
            }}>Zones</button>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="date"
              type="category"
              tickLine={false}
              axisLine={false}
              height={expanded ? 34 : 0}
              hide={!expanded}
              tick={(props: any) => {
                const d = data[props.index];
                if (!d) return <g />;
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)">{d.date}</text>
                    {d.month && <text x={0} y={0} dy={23} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)" fontWeight={700}>{d.month}</text>}
                  </g>
                );
              }}
            />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={yDomain} tickFormatter={v => v.toFixed(4)} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              position={{ x: 60, y: 10 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload as typeof data[0];
                if (!d) return null;
                let snapLabel = "C";
                let snapVal   = d.close;
                if (hoverPos && chartSize) {
                  const [yMin, yMax] = yDomain as [number, number];
                  if (typeof yMin === "number" && typeof yMax === "number" && yMax !== yMin) {
                    const plotTop    = 4;
                    const plotHeight = chartSize.h - plotTop;
                    const yPxLocal   = (v: number) => plotTop + ((yMax - v) / (yMax - yMin)) * plotHeight;
                    const my = hoverPos.y;
                    const candidates = [
                      { label: "O", val: d.open  },
                      { label: "H", val: d.high  },
                      { label: "L", val: d.low   },
                      { label: "C", val: d.close },
                    ] as const;
                    const nearest = candidates.reduce((best, cur) =>
                      Math.abs(yPxLocal(cur.val) - my) < Math.abs(yPxLocal(best.val) - my) ? cur : best
                    );
                    snapLabel = nearest.label;
                    snapVal   = nearest.val;
                  }
                }
                return (
                  <div style={{ background: "var(--bg-panel-alt, #181c2a)", border: "1px solid var(--border-medium)", borderRadius: 8, padding: "6px 10px", fontSize: 10, color: "var(--text-secondary)", opacity: 1 }}>
                    <div style={{ color: "rgba(255,255,255,0.85)", fontWeight: 700 }}>{snapLabel}: {snapVal.toFixed(4)}</div>
                    {d.isSwingHigh && <div style={{ color: "#f87171" }}>↑ Swing High</div>}
                    {d.isSwingLow  && <div style={{ color: "#34d399" }}>↓ Swing Low</div>}
                    {d.events.map((ev, i) => (
                      <div key={i} style={{ color: ev.type === "BOS" ? "#ffffff" : ev.direction === "bull" ? "#34d399" : "#f87171" }}>
                        {ev.type} {ev.direction === "bull" ? "↑" : "↓"}
                      </div>
                    ))}
                  </div>
                );
              }}
              wrapperStyle={{ background: "none", border: "none", boxShadow: "none", zIndex: 50 }}
            />
            <Line dataKey="close" dot={false} activeDot={false} stroke="transparent" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>

        {chartSize && (() => {
          const plotLeft   = yAxisWidth;
          const plotTop    = 4;
          const plotWidth  = chartSize.w - yAxisWidth - 6;
          const plotHeight = chartSize.h - plotTop;
          const [yMin, yMax] = yDomain as [number, number];
          if (typeof yMin !== "number" || typeof yMax !== "number" || yMax === yMin) return null;
          const xPx     = (idx: number) => plotLeft + (idx / Math.max(data.length - 1, 1)) * plotWidth;
          const yPx     = (val: number) => plotTop + ((yMax - val) / (yMax - yMin)) * plotHeight;
          const candleW = Math.max(2, Math.floor((plotWidth / Math.max(data.length - 1, 1)) * 0.6));
          const fs      = expanded ? 11 : 9;
          return (
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
              {/* Supply / demand zones — rendered behind candles */}
              {showZones && (() => {
                const zoneH = plotHeight * 0.018;
                const rightEdge = plotLeft + plotWidth;
                return (
                  <>
                    {data.filter(d => d.isSwingHigh).map(d => (
                      <rect key={`sz${d.idx}`}
                        x={xPx(d.idx)} y={yPx(d.high)}
                        width={rightEdge - xPx(d.idx)} height={zoneH}
                        fill="rgba(248,113,113,0.10)" />
                    ))}
                    {data.filter(d => d.isSwingLow).map(d => (
                      <rect key={`dz${d.idx}`}
                        x={xPx(d.idx)} y={yPx(d.low) - zoneH}
                        width={rightEdge - xPx(d.idx)} height={zoneH}
                        fill="rgba(52,211,153,0.10)" />
                    ))}
                  </>
                );
              })()}
              {/* Candles */}
              {data.map(d => {
                const bull    = d.close >= d.open;
                const color   = bull ? "#60a5fa" : "#a78bfa";
                const cx      = xPx(d.idx);
                const bodyTop = Math.min(yPx(d.open), yPx(d.close));
                const bodyH   = Math.max(1, Math.abs(yPx(d.close) - yPx(d.open)));
                return (
                  <g key={`c${d.idx}`}>
                    <line x1={cx} y1={yPx(d.high)} x2={cx} y2={yPx(d.low)} stroke={color} strokeWidth={1} />
                    <rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} stroke={color} strokeWidth={1} />
                  </g>
                );
              })}
              {/* Structure markers — stacked per candle to prevent overlap */}
              {data.map(d => {
                const cx      = xPx(d.idx);
                const highY   = yPx(d.high);
                const lowY    = yPx(d.low);
                const bullEvs = d.events.filter(e => e.direction === "bull");
                const bearEvs = d.events.filter(e => e.direction === "bear");
                const TRI_H   = 8;
                const PILL_H  = expanded ? 14 : 11;
                const GAP     = expanded ? 4 : 3;
                const bw      = expanded ? 38 : 28;
                const glow    = (c: string) => ({ filter: `drop-shadow(0 0 4px ${c})` });

                const above: React.ReactNode[] = [];
                const below: React.ReactNode[] = [];

                // ── Above: SH triangle → SH text + price (expanded) / price (compact) → bull events ──
                if (d.isSwingHigh || bullEvs.length > 0) {
                  const triBase = highY - GAP;
                  const triTip  = triBase - TRI_H;
                  above.push(
                    <polygon key="sh-tri" points={`${cx},${triTip} ${cx - 4},${triBase} ${cx + 4},${triBase}`} fill="#f87171" />
                  );
                  let curY = triTip - GAP;
                  if (d.isSwingHigh) {
                    if (expanded) {
                      above.push(
                        <text key="sh-txt" x={cx} y={curY} textAnchor="middle" fill="#f87171" fontSize={fs} fontWeight={700} fontFamily="monospace">SH</text>
                      );
                      curY -= (fs + 1);
                      above.push(
                        <text key="sh-price" x={cx} y={curY} textAnchor="middle" fill="#f87171" fontSize={fs - 2} fontFamily="monospace">{d.high.toFixed(4)}</text>
                      );
                      curY -= ((fs - 2) + GAP);
                    } else {
                      // collapsed: no price label
                    }
                  }
                  bullEvs.forEach((ev, i) => {
                    const color = ev.type === "BOS" ? "#ffffff" : "#34d399";
                    above.push(
                      <g key={`be${i}`}>
                        <text x={cx} y={curY - 1} textAnchor="middle" fill={color} fontSize={fs} fontWeight={800} fontFamily="monospace">{ev.type}</text>
                      </g>
                    );
                    curY -= (PILL_H + GAP);
                  });
                }

                // ── Below: SL triangle → SL text + price (expanded) / price (compact) → bear events ──
                if (d.isSwingLow || bearEvs.length > 0) {
                  const triBase = lowY + GAP;
                  const triTip  = triBase + TRI_H;
                  below.push(
                    <polygon key="sl-tri" points={`${cx},${triTip} ${cx - 4},${triBase} ${cx + 4},${triBase}`} fill="#34d399" />
                  );
                  let curY = triTip + GAP;
                  if (d.isSwingLow) {
                    if (expanded) {
                      curY += fs;
                      below.push(
                        <text key="sl-txt" x={cx} y={curY} textAnchor="middle" fill="#34d399" fontSize={fs} fontWeight={700} fontFamily="monospace">SL</text>
                      );
                      curY += (1);
                      below.push(
                        <text key="sl-price" x={cx} y={curY + (fs - 2)} textAnchor="middle" fill="#34d399" fontSize={fs - 2} fontFamily="monospace">{d.low.toFixed(4)}</text>
                      );
                      curY += ((fs - 2) + GAP);
                    } else {
                      // collapsed: no price label
                    }
                  }
                  bearEvs.forEach((ev, i) => {
                    const color = ev.type === "BOS" ? "#ffffff" : "#f87171";
                    below.push(
                      <g key={`be${i}`}>
                        <text x={cx} y={curY + PILL_H - 3} textAnchor="middle" fill={color} fontSize={fs} fontWeight={800} fontFamily="monospace">{ev.type}</text>
                      </g>
                    );
                    curY += (PILL_H + GAP);
                  });
                }

                if (!above.length && !below.length) return null;
                return <g key={`ms${d.idx}`}>{above}{below}</g>;
              })}
              {/* Hover snap circle */}
              {hoverPos && (() => {
                const mx = hoverPos.x;
                const my = hoverPos.y;
                if (mx < plotLeft || mx > plotLeft + plotWidth) return null;
                const frac  = (mx - plotLeft) / plotWidth;
                const idxF  = frac * (data.length - 1);
                const idx   = Math.max(0, Math.min(data.length - 1, Math.round(idxF)));
                const d     = data[idx];
                if (!d) return null;
                const nearest = (["open", "high", "low", "close"] as const).reduce((best, key) =>
                  Math.abs(yPx(d[key]) - my) < Math.abs(yPx(d[best]) - my) ? key : best
                , "close" as "open" | "high" | "low" | "close");
                const cx = xPx(idx);
                const cy = yPx(d[nearest]);
                return (
                  <g>
                    <line x1={cx} y1={plotTop} x2={cx} y2={plotTop + plotHeight} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
                    <circle cx={cx} cy={cy} r={3.5} fill="white" stroke="rgba(0,0,0,0.4)" strokeWidth={1} />
                  </g>
                );
              })()}
            </svg>
          );
        })()}
      </div>

      {expanded && maxOffset > 0 && (
        <input type="range" className="momentum-scroll" min={0} max={maxOffset} value={offset}
          onChange={e => setOffset(Number(e.target.value))} style={{ direction: "rtl" }} />
      )}

      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#f87171", name: "Swing High (SH)", body: "A local price peak confirmed by being the highest high within the surrounding N bars on each side. Marks potential resistance and defines the upper boundary of structure. Used to identify HH/LH sequences." },
            { color: "#34d399", name: "Swing Low (SL)",  body: "A local price trough confirmed by being the lowest low within the surrounding N bars on each side. Marks potential support and the lower boundary of structure. Used to identify HL/LL sequences." },
            { color: "#ffffff", name: "BOS — Break of Structure", body: "Price closes beyond the last swing high (bull BOS) or swing low (bear BOS) in the direction of the prevailing trend, confirming continuation. Smart money is defending and extending the move." },
            { color: "#f59e0b", name: "CHOCH — Change of Character", body: "Price breaks a swing level counter to the current trend, signalling a potential reversal. CHOCH is the first warning that dominant structure is failing. Watch for follow-through confirmation before acting." },
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
  const yAxisWidth = expanded ? 48 : 44;
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

      {expanded && <div className="shrink-0 flex items-center pt-1" style={{ position: "relative", paddingLeft: yAxisWidth, paddingRight: 8 }}>
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
            marginTop: 14,
            flexShrink: 0,
            border: `1px solid ${showCandles ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.10)"}`,
            background: showCandles ? "rgba(255,255,255,0.08)" : "transparent",
            color: showCandles ? "var(--text-primary)" : "var(--text-muted)",
            transition: "all 0.15s",
          }}
        >
          {showCandles ? "Candles" : "Line"}
        </button>
      </div>}

      <div ref={chartRef} className="flex-1 min-h-0" style={{ position: "relative" }}>
        {/* Candle overlay — rendered BEFORE Recharts so dots appear on top */}
        {showClose && showCandles && chartSize && (() => {
          const plotLeft   = yAxisWidth + 16;
          const plotTop    = 4;
          const plotRight  = 24;
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
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 24, bottom: 0, left: 16 }}>
            <XAxis
              dataKey="idx"
              type="category"
              tickLine={false}
              axisLine={false}
              height={expanded ? 34 : 0}
              hide={!expanded}
              tick={(props: any) => {
                const d = data[props.index];
                if (!d) return <g />;
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)">{d.date}</text>
                    {d.month && <text x={0} y={0} dy={23} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)" fontWeight={700}>{d.month}</text>}
                  </g>
                );
              }}
            />
            <YAxis yAxisId="price" tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={priceDomain} tickFormatter={v => v.toFixed(4)} tickMargin={16} />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }}
              position={{ x: 60, y: 10 }}
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

      </div>

      {expanded && maxOffset > 0 && (
        <input type="range" className="momentum-scroll" min={0} max={maxOffset} value={offset}
          onChange={e => setOffset(Number(e.target.value))} style={{ direction: "rtl" }} />
      )}

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
  const mom  = computeMom10(rows, idx);

  const cciZone = cci > 200 ? "extreme overbought" : cci > 100 ? "overbought" : cci < -200 ? "extreme oversold" : cci < -100 ? "oversold" : cci > 0 ? "mildly bullish" : "mildly bearish";

  const bullets = [
    `CCI: ${cci.toFixed(1)} — ${cciZone}`,
    `Momentum(10): ${mom >= 0 ? "+" : ""}${mom.toFixed(3)}% vs 10-session prior close`,
    cci > 100 ? mom > 0 ? "CCI overbought with positive momentum — trend intact but extended"
                        : "CCI overbought with fading momentum — pullback risk elevated"
    : cci < -100 ? mom < 0 ? "CCI oversold with negative momentum — decline extended, watch for base"
                           : "CCI oversold with recovering momentum — bounce potential elevated"
    : "CCI in neutral range — no extreme momentum signal",
  ];

  let headline: string, description: string;
  if (cci > 100) {
    headline    = mom > 0 ? "CCI Overbought — Trend Extended" : "CCI Overbought — Momentum Fading";
    description = `CCI at ${cci.toFixed(0)} is in overbought territory above +100, signalling strong bullish momentum. Momentum(10) at ${mom >= 0 ? "+" : ""}${mom.toFixed(3)}% ${mom > 0 ? "remains positive — the trend is still pushing forward, though the move is extended and susceptible to a pullback." : "is turning negative — weakening momentum combined with overbought CCI raises the probability of a near-term pullback or consolidation."} Monitor for a CCI rollover back below +100 as the first exit or tightening signal.`;
  } else if (cci < -100) {
    headline    = mom < 0 ? "CCI Oversold — Decline Extended" : "CCI Oversold — Momentum Recovering";
    description = `CCI at ${cci.toFixed(0)} is in oversold territory below −100, signalling dominant selling pressure. Momentum(10) at ${mom >= 0 ? "+" : ""}${mom.toFixed(3)}% ${mom < 0 ? "remains negative — the decline has not yet shown signs of exhaustion. Await a CCI recovery above −100 before considering mean-reversion longs." : "is turning positive — recovering momentum combined with oversold CCI raises the probability of a base forming. A CCI cross back above −100 would be an early confirmation signal."} `;
  } else {
    headline    = "CCI in Neutral Zone";
    description = `CCI at ${cci.toFixed(0)} sits in the neutral range (−100 to +100). No extreme momentum reading in either direction. Momentum(10) at ${mom >= 0 ? "+" : ""}${mom.toFixed(3)}%. In neutral CCI environments, signals are weaker and mean-reversion trades carry lower edge. Wait for CCI to breach ±100 for a higher-conviction setup.`;
  }
  return { headline, bullets, description };
}

const MOM_WINDOW = 20;

function CciPanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize = expanded ? 40 : MOM_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const data = useMemo(() => {
    const startRow = Math.max(0, rows.length - windowSize - offset);
    const endRow   = rows.length - offset;
    const slice    = rows.slice(startRow, endRow);
    return slice.map((r, i) => {
      const absIdx    = startRow + i;
      const maStart   = Math.max(0, absIdx - 13);
      const maSlice   = rows.slice(maStart, absIdx + 1);
      const cciMa     = maSlice.reduce((s, x) => s + x.cci, 0) / maSlice.length;
      const parts     = r.date.split("-");
      const monthIdx  = parseInt(parts[1]) - 1;
      const prevMonth = i > 0 ? parseInt(slice[i-1].date.split("-")[1]) - 1 : -1;
      return {
        idx:   i,
        date:  parseInt(parts[2]).toString(),
        month: monthIdx !== prevMonth ? MONTHS[monthIdx] : "",
        cci:   r.cci,
        cciMa,
      };
    });
  }, [rows, offset, windowSize]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 44 : 32;
  const analysis   = useMemo(() => expanded ? buildMomentumAnalysis(rows) : null, [rows, expanded]);

  const yDomain = useMemo(() => {
    if (!data.length) return [-220, 220] as const;
    const abs = Math.max(110, ...data.map(d => Math.abs(d.cci)));
    return [-(abs * 1.12), abs * 1.12] as const;
  }, [data]);

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

      <div className="flex-1 min-h-0" style={{ position: "relative" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="idx"
              type="category"
              tickLine={false}
              axisLine={false}
              height={expanded ? 34 : 0}
              hide={!expanded}
              tick={(props: any) => {
                const d = data[props.index];
                if (!d) return <g />;
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)">{d.date}</text>
                    {d.month && <text x={0} y={0} dy={23} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)" fontWeight={700}>{d.month}</text>}
                  </g>
                );
              }}
            />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={yDomain} ticks={[-100, 0, 100]} tickFormatter={v => v.toFixed(0)} />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }}
              position={{ x: 60, y: 10 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as typeof data[0];
                return (
                  <div className="rounded-lg px-3 py-2 text-[10px]" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-medium)", color: "var(--text-secondary)" }}>
                    <div className="font-bold" style={{ color: d.cci > 100 ? "#a78bfa" : d.cci < -100 ? "#60a5fa" : "var(--text-primary)" }}>
                      CCI: {d.cci.toFixed(1)}
                    </div>
                    <div style={{ color: "var(--text-muted)" }}>MA(14): {d.cciMa.toFixed(1)}</div>
                  </div>
                );
              }}
            />
            <ReferenceArea y1={-100} y2={100} fill="rgba(167,139,250,0.07)" ifOverflow="hidden" />
            <ReferenceLine y={0}    stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
            <ReferenceLine y={100}  stroke="rgba(167,139,250,0.28)" strokeWidth={1} strokeDasharray="3 3" />
            <ReferenceLine y={-100} stroke="rgba(96,165,250,0.28)"  strokeWidth={1} strokeDasharray="3 3" />
            <Line dataKey="cciMa" name="CCI MA(14)" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#f59e0b" isAnimationActive={false} />
            <Line dataKey="cci"   name="CCI"        type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5} stroke="#60a5fa" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {expanded && maxOffset > 0 && (
        <input type="range" className="momentum-scroll" min={0} max={maxOffset} value={offset}
          onChange={e => setOffset(Number(e.target.value))} style={{ direction: "rtl" }} />
      )}

      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#60a5fa", name: "CCI",       body: "Commodity Channel Index — measures how far price has deviated from its statistical mean. A leading oscillator: it turns before price and excels at identifying momentum extremes and divergences." },
            { color: "#f59e0b", name: "CCI MA(14)", body: "14-period simple moving average of CCI. Smooths the raw CCI line so shorter-term noise doesn't obscure the underlying momentum cycle. Crossovers between CCI and its MA often signal early momentum shifts before the raw line reaches an extreme." },
            { color: "#a78bfa", name: "Levels",     body: "Above +100 = overbought (bullish momentum extreme — consider exits or tightened stops). Below −100 = oversold (bearish extreme — watch for bounce). ±100 to 0 = neutral range. Above +200 or below −200 = unsustainable extreme — high mean-reversion probability." },
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

function buildWrAnalysis(rows: SheetRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 14) return { headline: "—", bullets: [], description: "—" };
  const idx     = rows.length - 1;
  const wr      = computeWR(rows, idx);
  const prev5   = Array.from({ length: 5 }, (_, i) => computeWR(rows, Math.max(0, idx - i - 1)));
  const trend   = wr > prev5[0] ? "rising" : wr < prev5[0] ? "falling" : "flat";
  const wrR     = Math.round(wr * 10) / 10;
  const overbought = wr > -20;
  const oversold   = wr < -80;
  const neutral    = !overbought && !oversold;
  const zone    = overbought ? "Overbought (above −20)" : oversold ? "Oversold (below −80)" : wr <= -50 ? "Lower neutral range" : "Upper neutral range";
  const sessionsInZone = prev5.filter(v => overbought ? v > -20 : oversold ? v < -80 : true).length + 1;
  const bullets = [
    `Williams %R: ${wrR} · ${zone}`,
    `Trend: ${trend} over last 5 sessions`,
    `Sessions in current zone: ${sessionsInZone}`,
    `Previous session: ${Math.round(prev5[0] * 10) / 10}`,
  ];
  let description = "";
  if (overbought) {
    description = `Williams %R at ${wrR} places the close in the top ${Math.round((wr + 100) * 10) / 10}% of the 14-session range — overbought territory. ${trend === "rising" ? "Momentum is continuing to press higher; in a trending market this confirms bullish strength." : "The reading is starting to pull back from the extreme — watch for a cross back below −20 as a potential exit or reversal signal."} ${sessionsInZone > 2 ? `The indicator has held above −20 for ${sessionsInZone} consecutive sessions, which in strong trends can indicate sustained buying pressure rather than imminent reversal.` : "A single-session overbought touch alone is not a reversal signal — confirmation of the roll requires the cross."}`;
  } else if (oversold) {
    description = `Williams %R at ${wrR} places the close in the bottom ${Math.round(Math.abs(wr + 100) * 10) / 10}% of the 14-session range — oversold territory. ${trend === "falling" ? "Selling pressure is continuing; in a downtrend this confirms bearish strength — don't buy the first touch." : "The indicator is beginning to recover from the extreme — wait for a cross back above −80 before treating this as a bounce signal."} ${sessionsInZone > 2 ? `Holding below −80 for ${sessionsInZone} sessions suggests a sustained bear move rather than a simple oversold bounce.` : ""}`;
  } else {
    description = `Williams %R at ${wrR} is in the neutral zone between the overbought (−20) and oversold (−80) thresholds. ${wr > -50 ? "Price is holding in the upper half of the recent range, favouring bulls on short-term momentum." : "Price is in the lower half of the recent range, with bears holding the edge over the look-back window."} A move above −20 would signal overbought conditions; a drop below −80 would signal oversold. Current readings offer no extreme-based trade signal.`;
  }
  const headline = overbought ? "Overbought — Watch for Reversal" : oversold ? "Oversold — Watch for Bounce" : wr > -50 ? "Neutral — Upper Range" : "Neutral — Lower Range";
  return { headline, bullets, description };
}

function WrPanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize = expanded ? 40 : MOM_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);

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
        wr:    computeWR(rows, rowIdx),
      };
    });
  }, [rows, offset, windowSize]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 44 : 32;
  const analysis   = useMemo(() => expanded ? buildWrAnalysis(rows) : null, [rows, expanded]);

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

      <div className="flex-1 min-h-0" style={{ position: "relative" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="idx"
              type="category"
              tickLine={false}
              axisLine={false}
              height={expanded ? 34 : 0}
              hide={!expanded}
              tick={(props: any) => {
                const d = data[props.index];
                if (!d) return <g />;
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)">{d.date}</text>
                    {d.month && <text x={0} y={0} dy={23} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)" fontWeight={700}>{d.month}</text>}
                  </g>
                );
              }}
            />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={[-105, 5]} ticks={[-80, -50, -20]} tickFormatter={v => v.toFixed(0)} />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }}
              position={{ x: 60, y: 10 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as typeof data[0];
                return (
                  <div className="rounded-lg px-3 py-2 text-[10px]" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-medium)", color: "var(--text-secondary)" }}>
                    <div className="font-bold" style={{ color: d.wr > -20 ? "#a78bfa" : d.wr < -80 ? "#60a5fa" : "var(--text-primary)" }}>
                      Williams %R: {d.wr.toFixed(1)}
                    </div>
                  </div>
                );
              }}
            />
            <ReferenceArea y1={-80} y2={-20} fill="rgba(255,255,255,0.045)" ifOverflow="hidden" />
            <ReferenceLine y={-20} stroke="rgba(167,139,250,0.28)" strokeWidth={1} strokeDasharray="3 3" />
            <ReferenceLine y={-50} stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
            <ReferenceLine y={-80} stroke="rgba(96,165,250,0.28)"  strokeWidth={1} strokeDasharray="3 3" />
            <Line dataKey="wr" name="Williams %R" type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5} stroke="#60a5fa" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {expanded && maxOffset > 0 && (
        <input type="range" className="momentum-scroll" min={0} max={maxOffset} value={offset}
          onChange={e => setOffset(Number(e.target.value))} style={{ direction: "rtl" }} />
      )}

      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#60a5fa", name: "Williams %R",  body: "Measures where the most recent close sits within the high-low range of the last 14 bars. Ranges from −100 (close at the period low — most oversold) to 0 (close at the period high — most overbought). A fast, reactive oscillator that leads price turns." },
            { color: "#a78bfa", name: "Overbought >−20",  body: "When %R rises above −20 the close is in the top 20% of the recent range. In a trending market this confirms bullish strength. In a ranging market or after an extended rally it signals reversal risk — watch for %R to roll back below −20 as an exit trigger." },
            { color: "#60a5fa", name: "Oversold <−80",    body: "When %R drops below −80 the close is in the bottom 20% of the recent range. Potential mean-reversion bounce zone. Confirmation requires %R crossing back above −80. In a strong downtrend oversold can persist — don't buy the first touch; wait for the cross." },
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
  const showClose   = true;
  const showR1      = true;
  const showR2      = true;
  const showR3      = true;
  const showS1      = true;
  const showS2      = true;
  const showS3      = true;
  const [showCandles, setShowCandles] = useState(() => localStorage.getItem("tm_pvt_show_candles") === "1");
  const chartRef  = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const handler = () => setShowCandles(localStorage.getItem("tm_pvt_show_candles") === "1");
    window.addEventListener("tm:pvt-candles-changed", handler);
    return () => window.removeEventListener("tm:pvt-candles-changed", handler);
  }, []);

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
          { label: "R3", value: cur.r3, color: "#1e40af" },
          { label: "R2", value: cur.r2, color: "#3b82f6" },
          { label: "R1", value: cur.r1, color: "#93c5fd" },
          { label: "S1", value: cur.s1, color: "#c4b5fd" },
          { label: "S2", value: cur.s2, color: "#a78bfa" },
          { label: "S3", value: cur.s3, color: "#7c3aed" },
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

      {expanded && <div className="shrink-0 flex items-center gap-1.5 px-2 pt-1" style={{ paddingLeft: yAxisWidth }}>
        {(
          <button
            onClick={() => {
              const next = !showCandles;
              localStorage.setItem("tm_pvt_show_candles", next ? "1" : "0");
              setShowCandles(next);
              window.dispatchEvent(new Event("tm:pvt-candles-changed"));
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
            <XAxis
              dataKey="date"
              type="category"
              tickLine={false}
              axisLine={false}
              height={expanded ? 34 : 0}
              hide={!expanded}
              tick={(props: any) => {
                const d = data[props.index];
                if (!d) return <g />;
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)">{d.date}</text>
                    {d.month && <text x={0} y={0} dy={23} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)" fontWeight={700}>{d.month}</text>}
                  </g>
                );
              }}
            />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={yDomain} tickFormatter={v => v.toFixed(4)} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              position={{ x: 60, y: 10 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as typeof data[0];
                const above = [{ n: "R3", v: d.r3 }, { n: "R2", v: d.r2 }, { n: "R1", v: d.r1 }].filter(l => l.v > d.close);
                const below = [{ n: "S1", v: d.s1 }, { n: "S2", v: d.s2 }, { n: "S3", v: d.s3 }].filter(l => l.v <= d.close);
                const nearRes = above.sort((a, b) => a.v - b.v)[0];
                const nearSup = below.sort((a, b) => b.v - a.v)[0];
                return (
                  <div style={{ background: "var(--bg-panel-alt, #181c2a)", border: "1px solid var(--border-medium)", borderRadius: 8, padding: "6px 10px", fontSize: 10, color: "var(--text-secondary)", opacity: 1 }}>
                    {!showCandles && <div className="font-bold mb-1" style={{ color: "rgba(255,255,255,0.85)" }}>{d.close.toFixed(4)}</div>}
                    {nearRes && <div style={{ color: "#a78bfa" }}>↑ {nearRes.n}: {nearRes.v.toFixed(4)} ({Math.round((nearRes.v - d.close) * 10000)} pips)</div>}
                    {nearSup && <div style={{ color: "#60a5fa" }}>↓ {nearSup.n}: {nearSup.v.toFixed(4)} ({Math.round((d.close - nearSup.v) * 10000)} pips)</div>}
                  </div>
                );
              }}
              wrapperStyle={{ background: "none", border: "none", boxShadow: "none", zIndex: 50 }}
            />
            {showR3    && <Line dataKey="r3"    name="R3"    type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#1e40af" strokeDasharray="3 2" isAnimationActive={false} />}
            {showR2    && <Line dataKey="r2"    name="R2"    type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#3b82f6" strokeDasharray="3 2" isAnimationActive={false} />}
            {showR1    && <Line dataKey="r1"    name="R1"    type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#93c5fd" strokeDasharray="3 2" isAnimationActive={false} />}
            {showS1    && <Line dataKey="s1"    name="S1"    type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#c4b5fd" strokeDasharray="3 2" isAnimationActive={false} />}
            {showS2    && <Line dataKey="s2"    name="S2"    type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#a78bfa" strokeDasharray="3 2" isAnimationActive={false} />}
            {showS3    && <Line dataKey="s3"    name="S3"    type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#7c3aed" strokeDasharray="3 2" isAnimationActive={false} />}
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

      {expanded && maxOffset > 0 && (
        <input type="range" className="momentum-scroll" min={0} max={maxOffset} value={offset}
          onChange={e => setOffset(Number(e.target.value))} style={{ direction: "rtl" }} />
      )}

      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#3b82f6", name: "R1 / R2 / R3", body: "Resistance levels derived from the prior session's high, low, and close. R1 is the first target above the pivot; R2 and R3 mark progressively stronger resistance. A close above any resistance level turns it into new support. R3 is rarely tested in a single session — reaching it signals an exceptionally strong bullish move." },
            { color: "#a78bfa", name: "S1 / S2 / S3", body: "Support levels below the classic pivot point. S1 is the first demand zone; S2 and S3 are deeper levels that come into play on pronounced selling sessions. A close below any support level turns it into new resistance. S3 violations are typically associated with high-volatility, trend-driven sessions." },
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
  const showVol = true;
  const showSma = true;

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
            <XAxis
              dataKey="idx"
              type="category"
              tickLine={false}
              axisLine={false}
              height={expanded ? 34 : 0}
              hide={!expanded}
              tick={(props: any) => {
                const d = data[props.index];
                if (!d) return <g />;
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)">{d.date}</text>
                    {d.month && <text x={0} y={0} dy={23} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)" fontWeight={700}>{d.month}</text>}
                  </g>
                );
              }}
            />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={yDomain} tickFormatter={v => fmt(v)} />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }}
              position={{ x: 60, y: 10 }}
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

      {expanded && maxOffset > 0 && (
        <input type="range" className="momentum-scroll" min={0} max={maxOffset} value={offset}
          onChange={e => setOffset(Number(e.target.value))} style={{ direction: "rtl" }} />
      )}

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
  const showClose   = true;
  const showUpper   = true;
  const showMid     = true;
  const showLower   = true;
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
  const yAxisWidth = expanded ? 48 : 44;
  const analysis   = useMemo(() => expanded ? buildKeltAnalysis(rows) : null, [rows, expanded]);

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

      {expanded && <div className="shrink-0 flex items-center pt-1" style={{ position: "relative", paddingLeft: yAxisWidth, paddingRight: 8 }}>
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
            marginTop: 14,
            flexShrink: 0,
            border: `1px solid ${showCandles ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.10)"}`,
            background: showCandles ? "rgba(255,255,255,0.08)" : "transparent",
            color: showCandles ? "var(--text-primary)" : "var(--text-muted)",
            transition: "all 0.15s",
          }}
        >
          {showCandles ? "Candles" : "Line"}
        </button>
      </div>}

      {/* Chart */}
      <div ref={chartRef} className="flex-1 min-h-0" style={{ position: "relative" }}>
        {/* Candle overlay — rendered BEFORE Recharts so dots appear on top */}
        {showClose && showCandles && chartSize && (() => {
          const plotLeft   = yAxisWidth + 16;
          const plotTop    = 4;
          const plotWidth  = chartSize.w - plotLeft - 24;
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
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 24, bottom: 0, left: 16 }}>
            <XAxis
              dataKey="idx"
              type="category"
              tickLine={false}
              axisLine={false}
              height={expanded ? 34 : 0}
              hide={!expanded}
              tick={(props: any) => {
                const d = data[props.index];
                if (!d) return <g />;
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)">{d.date}</text>
                    {d.month && <text x={0} y={0} dy={23} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)" fontWeight={700}>{d.month}</text>}
                  </g>
                );
              }}
            />
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={yDomain} tickFormatter={v => v.toFixed(4)} tickMargin={16} />
            <Tooltip content={<MaTooltip />} cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }} position={{ x: 60, y: 10 }} wrapperStyle={{ zIndex: 10 }} />
            {showUpper && <Line dataKey="upper" name="Upper" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#a78bfa" strokeDasharray="3 2" isAnimationActive={false} />}
            {showMid   && <Line dataKey="mid"   name="Mid"   type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#94a3b8" isAnimationActive={false} />}
            {showLower && <Line dataKey="lower" name="Lower" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#60a5fa" strokeDasharray="3 2" isAnimationActive={false} />}
            {showClose && !showCandles && <Line dataKey="close" name="Close" type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5} stroke="rgba(255,255,255,0.75)" isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Slider */}
      {expanded && maxOffset > 0 && (
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

// ─── Regime Detection Panel ───────────────────────────────────────────────────
const REGIME_WINDOW = 20;

type RegimeState     = "Trending" | "Ranging" | "Compression";
type VolatilityState = "Expanding" | "Contracting" | "Neutral";

function computeRegime(rows: SheetRow[], idx: number): RegimeState {
  if (idx < 0 || idx >= rows.length) return "Ranging";
  const r       = rows[idx];
  const adx     = r.adx ?? 0;
  const bbWidth = ((r.bbUpper ?? 0) - (r.bbLower ?? 0)) * 10000;
  const slice   = rows.slice(Math.max(0, idx - 19), idx + 1);
  const bbAvg   = slice.reduce((s, rr) => s + ((rr.bbUpper ?? 0) - (rr.bbLower ?? 0)) * 10000, 0) / (slice.length || 1);
  if (bbWidth > 0 && bbAvg > 0 && bbWidth < bbAvg * 0.75) return "Compression";
  if (adx > 25) return "Trending";
  return "Ranging";
}

const REGIME_MIN_HOLD = 5;
const REGIME_CONFIRM  = 3;

function computeRegimeSequence(rows: SheetRow[]): RegimeState[] {
  if (!rows.length) return [];
  const result: RegimeState[] = [];
  let current: RegimeState        = computeRegime(rows, 0);
  let holdCount                   = 1;
  let pendingRegime: RegimeState | null = null;
  let pendingCount                = 0;
  result.push(current);
  for (let i = 1; i < rows.length; i++) {
    const raw = computeRegime(rows, i);
    if (raw !== current) {
      if (raw === pendingRegime) {
        pendingCount++;
      } else {
        pendingRegime = raw;
        pendingCount  = 1;
      }
      if (holdCount >= REGIME_MIN_HOLD && pendingCount >= REGIME_CONFIRM) {
        current       = pendingRegime!;
        holdCount     = 1;
        pendingRegime = null;
        pendingCount  = 0;
      } else {
        holdCount++;
      }
    } else {
      pendingRegime = null;
      pendingCount  = 0;
      holdCount++;
    }
    result.push(current);
  }
  return result;
}

function computeRegimeVolatility(rows: SheetRow[], idx: number): VolatilityState {
  if (idx < 0 || idx >= rows.length) return "Normal";
  const slice = rows.slice(Math.max(0, idx - 19), idx + 1);
  const sma   = slice.reduce((s, r) => s + (r.atr14 ?? 0), 0) / (slice.length || 1);
  const atr   = rows[idx].atr14 ?? 0;
  if (sma === 0) return "Neutral";
  if (atr > sma * 1.1) return "Expanding";
  if (atr < sma * 0.9) return "Contracting";
  return "Neutral";
}

function buildRegimeAnalysis(rows: SheetRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 5) return { headline: "—", bullets: [], description: "—" };
  const cur      = rows[rows.length - 1];
  const adx      = cur.adx      ?? 0;
  const atr14    = cur.atr14    ?? 0;
  const bbWidth  = ((cur.bbUpper ?? 0) - (cur.bbLower ?? 0)) * 10000;
  const slice20  = rows.slice(-20);
  const bbAvg    = slice20.reduce((s, r) => s + ((r.bbUpper ?? 0) - (r.bbLower ?? 0)) * 10000, 0) / slice20.length;
  const atrSma   = slice20.reduce((s, r) => s + (r.atr14 ?? 0), 0) / slice20.length;
  const regime: RegimeState = bbWidth > 0 && bbAvg > 0 && bbWidth < bbAvg * 0.75 ? "Compression" : adx > 25 ? "Trending" : "Ranging";
  const volatility: VolatilityState = atrSma === 0 ? "Neutral" : atr14 > atrSma * 1.1 ? "Expanding" : atr14 < atrSma * 0.9 ? "Contracting" : "Neutral";
  const adxR     = Math.round(adx * 10) / 10;
  const bwPips   = Math.round(bbWidth);
  const bwAvgP   = Math.round(bbAvg);
  const atrPips  = Math.round(atr14 * 10000);
  const atrSmaP  = Math.round(atrSma * 10000);
  const adxLabel = adx >= 40 ? "Strong trend" : adx >= 25 ? "Trend confirmed" : adx >= 15 ? "Weak momentum" : "No trend";
  const bullets = [
    `Regime: ${regime} · Volatility: ${volatility}`,
    `ADX: ${adxR} · ${adxLabel}`,
    `BB Width: ${bwPips} pips · 20-bar avg: ${bwAvgP} pips`,
    `ATR(14): ${atrPips} pips · Avg: ${atrSmaP} pips`,
  ];
  let description = "";
  if (regime === "Compression") {
    const pctBelow = Math.round((1 - bbWidth / bbAvg) * 100);
    description = `Bollinger Band width has contracted to ${bwPips} pips — ${pctBelow}% below the 20-bar average. Compression signals low momentum and reduced edge for trend-following strategies. Watch for a volatility expansion as bands widen; the initial breakout direction often sets the short-term bias.`;
  } else if (regime === "Trending") {
    const dir = (cur.diPlus ?? 0) > (cur.diMinus ?? 0) ? "bullish" : "bearish";
    const volNote = volatility === "Expanding" ? "Volatility is expanding — the trend may be accelerating." : volatility === "Contracting" ? "Volatility is contracting despite the trend — watch for momentum fatigue." : "Volatility is neutral — trend conditions remain stable.";
    description = `ADX at ${adxR} confirms an active trend with directional pressure favouring ${dir} momentum. Trend-following strategies carry higher edge in this environment. ${volNote}`;
  } else {
    const volNote = volatility === "Expanding" ? " Expanding volatility may signal an emerging breakout." : volatility === "Contracting" ? " Contracting volatility suggests continued consolidation." : "";
    description = `ADX at ${adxR} indicates a directionless, ranging market. Price is oscillating without sustained momentum and mean reversion strategies are favoured. Avoid trend entries until ADX rises above 25.${volNote}`;
  }
  const headline = regime === "Compression" ? "Compression — Breakout Watch" : regime === "Trending" ? (adx >= 40 ? "Strong Trend Active" : "Trend Confirmed") : "Ranging — Low Edge Environment";
  return { headline, bullets, description };
}

function RegimePanelBody({ rows, expanded, showCandles, onToggleCandles }: { rows: SheetRow[]; expanded?: boolean; showCandles: boolean; onToggleCandles: () => void }) {
  const windowSize = expanded ? 40 : REGIME_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);
  const chartRef  = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      if (e) setChartSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const regimeSeq = useMemo(() => computeRegimeSequence(rows), [rows]);

  const data = useMemo(() => {
    const start = rows.length - windowSize - offset;
    const end   = rows.length - offset;
    const slice = rows.slice(Math.max(0, start), end);
    return slice.map((r, i) => {
      const parts     = r.date.split("-");
      const monthIdx  = parseInt(parts[1]) - 1;
      const prevMonth = i > 0 ? parseInt(slice[i - 1].date.split("-")[1]) - 1 : -1;
      const absIdx    = Math.max(0, start) + i;
      return {
        idx:        i,
        date:       parseInt(parts[2]).toString(),
        month:      monthIdx !== prevMonth ? MONTHS[monthIdx] : "",
        open:       r.open,
        high:       r.high,
        low:        r.low,
        close:      r.close,
        regime:     regimeSeq[absIdx] ?? "Ranging",
        volatility: computeRegimeVolatility(rows, absIdx),
      };
    });
  }, [rows, offset, windowSize, regimeSeq]);

  const latest    = data[data.length - 1];
  const curRegime = latest?.regime     ?? "Ranging";
  const curVol    = latest?.volatility ?? "Neutral";

  const regimeColor = curRegime === "Trending"    ? "#60a5fa"
                    : curRegime === "Compression" ? "#f59e0b"
                    : "#94a3b8";
  const volColor    = curVol === "Expanding"   ? "#f87171"
                    : curVol === "Contracting" ? "#34d399"
                    : "#94a3b8";

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 52 : 40;
  const analysis   = useMemo(() => expanded ? buildRegimeAnalysis(rows) : null, [rows, expanded]);

  const allPrices = data.flatMap(d => [d.high, d.low]).filter(Boolean);
  const yMin    = allPrices.length ? Math.min(...allPrices) : 0;
  const yMax    = allPrices.length ? Math.max(...allPrices) : 1;
  const yPad    = (yMax - yMin) * 0.05 || 0.001;
  const yDomain: [number, number] = [yMin - yPad, yMax + yPad];

  const regimeSegments = useMemo(() => {
    if (!data.length) return [] as { x1: number; x2: number; regime: RegimeState }[];
    const segs: { x1: number; x2: number; regime: RegimeState }[] = [];
    let segStart = 0;
    let segRegime = data[0].regime;
    for (let i = 1; i < data.length; i++) {
      if (data[i].regime !== segRegime) {
        segs.push({ x1: segStart, x2: i - 1, regime: segRegime });
        segStart = i;
        segRegime = data[i].regime;
      }
    }
    segs.push({ x1: segStart, x2: data.length - 1, regime: segRegime });
    return segs;
  }, [data]);

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

      {/* ── Chart ── */}
      <div ref={chartRef} className="flex-1 min-h-0" style={{ position: "relative" }}>
        {expanded && (
          <button
            onClick={onToggleCandles}
            className="flex items-center gap-1 rounded-full cursor-pointer"
            style={{
              position: "absolute", top: 8, left: yAxisWidth + 8, zIndex: 10,
              fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
              padding: "2px 8px",
              border: `1px solid ${showCandles ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.10)"}`,
              background: showCandles ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.25)",
              color: showCandles ? "var(--text-primary)" : "var(--text-muted)",
              transition: "all 0.15s",
            }}
          >{showCandles ? "Candles" : "Line"}</button>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="idx"
              type="category"
              tickLine={false}
              axisLine={false}
              height={expanded ? 34 : 0}
              hide={!expanded}
              tick={(props: any) => {
                const d = data[props.index];
                if (!d) return <g />;
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={0} y={0} dy={11} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)">{d.date}</text>
                    {d.month && <text x={0} y={0} dy={23} textAnchor="middle" fontSize={tickStyle.fontSize} fill="var(--text-muted)" fontWeight={700}>{d.month}</text>}
                  </g>
                );
              }}
            />
            <YAxis
              tick={tickStyle}
              tickLine={false}
              axisLine={false}
              width={yAxisWidth}
              domain={yDomain}
              tickFormatter={v => v.toFixed(4)}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload as typeof data[0];
                const rc = d.regime === "Trending" ? "#60a5fa" : d.regime === "Compression" ? "#f59e0b" : "#94a3b8";
                const vc = d.volatility === "Expanding" ? "#f87171" : d.volatility === "Contracting" ? "#34d399" : "#94a3b8";
                return (
                  <div style={{ background: "var(--bg-sidebar)", border: "1px solid var(--border-medium)", borderRadius: 8, padding: "7px 10px", fontSize: 11, boxShadow: "0 4px 16px rgba(0,0,0,0.6)" }}>
                    <div style={{ color: rc, fontWeight: 700 }}>Regime: {d.regime}</div>
                    <div style={{ color: vc }}>Volatility: {d.volatility}</div>
                  </div>
                );
              }}
              wrapperStyle={{ opacity: 1, zIndex: 20 }}
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              position={{ x: 60, y: 10 }}
            />
            {regimeSegments.map((seg, i) => (
              <ReferenceArea
                key={i}
                x1={seg.x1}
                x2={seg.x2}
                fill={
                  seg.regime === "Trending"    ? "rgba(96,165,250,0.10)"  :
                  seg.regime === "Compression" ? "rgba(245,158,11,0.10)"  :
                  "rgba(148,163,184,0.05)"
                }
                ifOverflow="hidden"
              />
            ))}
            {regimeSegments.slice(1).map((seg, i) => (
              <ReferenceLine
                key={`rt${i}`}
                x={seg.x1}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={1}
                strokeDasharray="2 3"
                ifOverflow="hidden"
              />
            ))}
            <Line dataKey="close" type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5} stroke={showCandles ? "transparent" : "#e2e8f0"} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>

        {/* ── Candle overlay ── */}
        {showCandles && chartSize && (() => {
          const plotLeft   = yAxisWidth;
          const plotTop    = 4;
          const plotWidth  = chartSize.w - yAxisWidth - 6;
          const plotHeight = chartSize.h - plotTop;
          const [yLo, yHi] = yDomain as [number, number];
          if (typeof yLo !== "number" || typeof yHi !== "number" || yHi === yLo) return null;
          const total  = data.length;
          const xPx    = (idx: number) => plotLeft + (idx / Math.max(total - 1, 1)) * plotWidth;
          const yPx    = (val: number) => plotTop + ((yHi - val) / (yHi - yLo)) * plotHeight;
          const candleW = Math.max(2, Math.floor((plotWidth / Math.max(total - 1, 1)) * 0.6));
          return (
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
              {data.map(d => {
                const bull    = d.close >= d.open;
                const color   = bull ? "#60a5fa" : "#a78bfa";
                const cx      = xPx(d.idx);
                const bodyTop = Math.min(yPx(d.open), yPx(d.close));
                const bodyH   = Math.max(1, Math.abs(yPx(d.close) - yPx(d.open)));
                return (
                  <g key={d.idx}>
                    <line x1={cx} y1={yPx(d.high)} x2={cx} y2={yPx(d.low)} stroke={color} strokeWidth={1} />
                    <rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} stroke={color} strokeWidth={1} />
                  </g>
                );
              })}
            </svg>
          );
        })()}
      </div>

      {/* ── Scroll ── */}
      {expanded && maxOffset > 0 && (
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

      {/* ── Glossary (expanded only) ── */}
      {expanded && (
        <div className="shrink-0 flex" style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.015)" }}>
          {[
            { color: "#60a5fa", name: "Trending", body: "ADX is above 25, indicating a directional trend is in place. Price is making consistent higher highs / higher lows or lower highs / lower lows. Momentum-based indicators are more reliable in this regime. Breakouts from zones are more likely to hold and continue." },
            { color: "#94a3b8", name: "Ranging",  body: "ADX is below 25 and Bollinger Bands are not compressed. Price oscillates between support and resistance without a clear directional bias. Mean-reversion strategies tend to perform better here. Breakouts are more likely to fail and fade back into the range." },
            { color: "#f59e0b", name: "Compression", body: "Bollinger Band width has contracted below 60 pips, signalling a volatility squeeze. Energy is building for a significant expansion move. Direction of the breakout is unknown — wait for confirmation before committing to a side." },
            { color: "#f87171", name: "Expanding / Contracting / Neutral", body: "Volatility state is measured by comparing current ATR(14) to its 20-period SMA. Expanding: ATR above 110% of SMA — ranges are widening, use wider stops and reduce size. Contracting: ATR below 90% of SMA — ranges are tightening, conditions are quieting. Neutral: ATR within the 90–110% band — normal, predictable volatility environment." },
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
          <div style={{ position: "absolute", top: 6, left: 8, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
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

function BlankPanel({ area, label, sub, style, onExpand, badge, subtitle, subtitle2, children,
  isDragging, isDragOver, containerRef, onHeaderMouseDown, pinned, headerActions,
}: {
  area?: string;
  label: string;
  sub: string;
  style?: React.CSSProperties;
  onExpand: () => void;
  badge?: React.ReactNode;
  subtitle?: string;
  subtitle2?: string;
  children?: React.ReactNode;
  isDragging?: boolean;
  isDragOver?: boolean;
  containerRef?: (el: HTMLDivElement | null) => void;
  onHeaderMouseDown?: (e: React.MouseEvent) => void;
  pinned?: boolean;
  headerActions?: React.ReactNode;
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
        <div className="flex-1 flex flex-col items-center justify-center px-2 gap-0.5">
          {subtitle && (
            <span className="text-[11px] font-semibold leading-none" style={{ color: "var(--text-secondary)" }}>
              {subtitle}
            </span>
          )}
          {subtitle2 && (
            <span className="text-[9px] font-medium leading-none" style={{ color: "var(--text-muted)" }}>
              {subtitle2}
            </span>
          )}
        </div>
        {badge && <div className="shrink-0 flex items-center mr-1">{badge}</div>}
        {headerActions && <div className="shrink-0 flex items-center mr-1">{headerActions}</div>}
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


function formatNewsDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const diffMs   = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    if (diffMins < 1)  return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffH = Math.floor(diffMins / 60);
    if (diffH < 24)    return `${diffH}h ago`;
    return d.toLocaleDateString();
  } catch { return ""; }
}

function ForexNewsPanel({ news, loading }: { news: NewsArticle[]; loading: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: 338, marginTop: 14 }}>
      <div style={{
        flex: 1, overflowY: "auto", borderRadius: 12,
        background: "var(--bg-panel)", border: "1px solid var(--border-medium)",
        padding: "4px 0",
      }}>
        {news.length === 0 && !loading && (
          <div style={{ padding: "20px 12px", fontSize: 11, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.5 }}>
            No news loaded.<br />Check network access.
          </div>
        )}
        {news.map((item, i) => (
          <button
            key={i}
            onClick={() => invoke("plugin:opener|open_url", { url: item.link }).catch(() => window.open(item.link, "_blank"))}
            style={{
              display: "block", width: "100%", textAlign: "left",
              background: "transparent", border: "none",
              borderBottom: i < news.length - 1 ? "1px solid var(--border-light)" : "none",
              padding: "8px 10px", cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.4, marginBottom: 4 }}>
              {item.title}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: "var(--accent-text)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {item.source}
              </span>
              {item.pub_date && (
                <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
                  {formatNewsDate(item.pub_date)}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 5 }}>
        {loading && (
          <span style={{ fontSize: 9, color: "var(--text-muted)" }}>Updating…</span>
        )}
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>
          Live News · EUR/USD
        </span>
      </div>
    </div>
  );
}

export function AnalyticsV3() {
  const { analysisResult, eurusdSnapshot, sheetRows } = useAnalytics();
  const [error, setError]       = useState<string | null>(null);
  const [selectedPair, setSelectedPair] = useState("EUR/USD");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [toasts, setToasts] = useState<AlertToast[]>([]);
  const seenStatuses = useRef<Record<string, string>>({});
  const [newsItems, setNewsItems]     = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [livePrice, setLivePrice]     = useState<number | null>(null);
  const [priceError, setPriceError]   = useState<string | null>(null);

  function saveAlerts(list: Alert[]) {
    invoke("write_text_file", { path: ALERTS_JSON_PATH, content: JSON.stringify(list, null, 2) })
      .catch(console.error);
  }

  // Live price — poll every 2 s
  useEffect(() => {
    const poll = () => {
      invoke<number>("get_live_price")
        .then(p => { setLivePrice(p); setPriceError(null); })
        .catch(e => setPriceError(String(e)));
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  // Forex news — fetch on mount then every 60 s
  useEffect(() => {
    const load = () => {
      setNewsLoading(true);
      invoke<NewsArticle[]>("get_forex_news")
        .then(items => setNewsItems(items))
        .catch(() => {})
        .finally(() => setNewsLoading(false));
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  // Initial load — seed seenStatuses so we don't fire on startup
  useEffect(() => {
    invoke<string>("read_credentials_file", { path: ALERTS_JSON_PATH })
      .then(content => {
        const loaded = JSON.parse(content) as Alert[];
        loaded.forEach(a => { seenStatuses.current[a.id] = a.status; });
        setAlerts(loaded);
      })
      .catch(() => setAlerts([]));
  }, []);

  // Poll alerts.json every 10 s for status changes → in-app notification + sound
  useEffect(() => {
    const poll = () => {
      invoke<string>("read_credentials_file", { path: ALERTS_JSON_PATH })
        .then(content => {
          const loaded = JSON.parse(content) as Alert[];
          const newToasts: AlertToast[] = [];

          loaded.forEach(a => {
            const prev = seenStatuses.current[a.id];
            if (prev === "watching" && a.status === "triggered" && a.notifications.in_app) {
              newToasts.push({
                toastId: crypto.randomUUID(),
                name: a.name,
                instrument: a.instrument,
                direction: a.direction,
                price: a.price,
              });
            }
            seenStatuses.current[a.id] = a.status;
          });

          if (newToasts.length > 0) {
            // Play the sound of the first triggered alert (or chime as fallback)
            const triggeredAlert = loaded.find(a => newToasts.some(t => t.name === a.name));
            playAlertSound((triggeredAlert?.sound as AlertSound) ?? "chime");
            setToasts(prev => [...prev, ...newToasts]);
          }

          setAlerts(loaded);
        })
        .catch(() => {});
    };

    const id = setInterval(poll, 10_000);
    return () => clearInterval(id);
  }, []);

  function createAlert() {
    const next: Alert = {
      id:              crypto.randomUUID(),
      name:            "New Alert",
      instrument:      selectedPair.replace("/", "_"),
      direction:       "above",
      price:           0,
      active:          true,
      status:          "watching",
      notifications:   { in_app: true, telegram: true },
      sound:           "chime",
      created_at_utc:  new Date().toISOString(),
      triggered_at_utc: null,
      last_hit_price:  null,
    };
    const updated = [...alerts, next];
    setAlerts(updated);
    saveAlerts(updated);
  }

  function sendTestNotification() {
    setToasts(prev => [...prev, {
      toastId: crypto.randomUUID(),
      name: "Test Notification",
      instrument: selectedPair.replace("/", "_"),
      direction: "test",
      price: 0,
    }]);
    playAlertSound("chime");
    invoke("send_test_notification")
      .catch((e: unknown) => {
        setToasts(prev => [...prev, {
          toastId: crypto.randomUUID(),
          name: "Telegram failed",
          instrument: String(e).slice(0, 40),
          direction: "✗",
          price: 0,
        }]);
      });
  }

  function updateAlert(id: string, patch: Partial<Alert>) {
    setAlerts(prev => {
      const next = prev.map(a => a.id === id ? { ...a, ...patch } : a);
      saveAlerts(next);
      return next;
    });
  }

  function deleteAlert(id: string) {
    setAlerts(prev => {
      const next = prev.filter(a => a.id !== id);
      saveAlerts(next);
      return next;
    });
  }
  const [expanded, setExpanded] = useState<PanelMeta | null>(null);
  const [ichiRows, setIchiRows] = useState<SheetRow[]>([]);
  const [timeframe, setTimeframe] = useState("1D");
  const [tfOpen, setTfOpen]       = useState(false);
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
    const loadIchiRows = () =>
      invoke<RawCandleV3[]>("get_ichi_rows_v3")
        .then(candles => { if (candles.length) setIchiRows(candles.map(mapToSheetRow)); })
        .catch(() => {});

    const loadCandles = () =>
      invoke<RawCandleV3[]>("get_candles_v3")
        .then(candles => {
          if (!candles.length) return;
          const last = candles[candles.length - 1];
          setLiveAnalytics({
            eurusdSnapshot: mapToSnapshot(last),
            analysisResult: defaultAnalysisResult,
            signalTags, signalHistory, historicalAccuracy,
            evidenceCards, emaStackData, macdChartData,
            momentumChartData, volatilityChartData, directionalChartData,
            sheetRows: candles.map(mapToSheetRow),
          });
          loadIchiRows();
        })
        .catch(err => setError(String(err)));

    // Always read from DB after sync resolves or fails — backend thread handles the sync.
    invoke<number>("sync_oanda_candles_v3")
      .then(() => loadCandles())
      .catch(() => loadCandles());
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
  // Bias: primary rule — cloud position determines trend direction (above=bullish, below=bearish, inside=neutral)
  const ichiBias = !latestRow ? "neutral"
    : latestRow.close > Math.max(latestRow.senkouA, latestRow.senkouB) ? "bullish"
    : latestRow.close < Math.min(latestRow.senkouA, latestRow.senkouB) ? "bearish"
    : "neutral";
  // Score: counts how many of the 4 Ichimoku confirmations align with the bias direction
  // Confirmations: (1) price vs cloud, (2) cloud color, (3) Tenkan/Kijun alignment, (4) Chikou vs price 26 bars ago
  const ichiScore = useMemo(() => {
    if (!latestRow) return 0;
    const cloudTop     = Math.max(latestRow.senkouA, latestRow.senkouB);
    const cloudBottom  = Math.min(latestRow.senkouA, latestRow.senkouB);
    const aboveCloud   = latestRow.close > cloudTop;
    const belowCloud   = latestRow.close < cloudBottom;
    const bullishCloud = latestRow.senkouA > latestRow.senkouB;
    const bearishCloud = latestRow.senkouB > latestRow.senkouA;
    const tkBullish    = latestRow.tenkan > latestRow.kijun;
    const chikouRef    = sheetRows.length > 26 ? sheetRows[sheetRows.length - 27] : null;
    const chikouBull   = chikouRef ? latestRow.close > chikouRef.close : null;
    if (aboveCloud) {
      let c = 1;
      if (bullishCloud)        c++;
      if (tkBullish)           c++;
      if (chikouBull === true) c++;
      return Math.round((c / 4) * 100);
    }
    if (belowCloud) {
      let c = 1;
      if (bearishCloud)         c++;
      if (!tkBullish)           c++;
      if (chikouBull === false) c++;
      return Math.round((c / 4) * 100);
    }
    // Inside cloud — score reflects penetration depth (higher = closer to a breakout edge)
    const bandwidth = cloudTop - cloudBottom;
    if (bandwidth <= 0) return 0;
    const cloudMid = (cloudTop + cloudBottom) / 2;
    return Math.min(100, Math.round((Math.abs(latestRow.close - cloudMid) / (bandwidth / 2)) * 100));
  }, [latestRow, sheetRows]);
  const makeIchiBadge = (large?: boolean) => (
    <HoverTooltip tip={`Score ${ichiScore}/100 — ${latestRow && latestRow.close > Math.max(latestRow.senkouA, latestRow.senkouB) ? "bullish confirmations" : latestRow && latestRow.close < Math.min(latestRow.senkouA, latestRow.senkouB) ? "bearish confirmations" : "cloud penetration depth"}. Counts: (1) price vs cloud, (2) cloud color, (3) Tenkan/Kijun alignment, (4) Chikou vs price 26 bars ago. Higher = more confirmations aligned.`}>
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

  const latestWr = useMemo(() =>
    sheetRows.length > 0 ? computeWR(sheetRows, sheetRows.length - 1) : -50,
  [sheetRows]);
  const wrHeadline = sheetRows.length > 0
    ? (latestWr > -20 ? "Overbought — Reversal Watch"
      : latestWr < -80 ? "Oversold — Bounce Watch"
      : `Neutral Zone — %R ${latestWr.toFixed(1)}`)
    : "";
  const wrBias: "bullish" | "bearish" | "neutral" = !latestRow ? "neutral"
    : latestWr > -20 ? "bearish"
    : latestWr < -80 ? "bullish"
    : "neutral";
  const wrScore = useMemo(() => {
    return Math.round(Math.abs(latestWr + 50) / 50 * 100);
  }, [latestWr]);
  const makeWrBadge = (large?: boolean) => (
    <HoverTooltip tip={`Score ${wrScore}/100 — Williams %R distance from the −50 midpoint. Above −20 = overbought; below −80 = oversold. Current: ${latestWr.toFixed(1)}.`}>
      <span
        className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
        style={{
          color:         BIAS_STYLE[wrBias].color,
          background:    BIAS_STYLE[wrBias].bg,
          border:        `1px solid ${BIAS_STYLE[wrBias].border}`,
          boxShadow:     large ? `${BIAS_STYLE[wrBias].glow}, 0 0 16px ${BIAS_STYLE[wrBias].border}` : BIAS_STYLE[wrBias].glow,
          letterSpacing: "0.10em",
          padding:       large ? "4px 12px" : "2px 8px",
          cursor:        "default",
        }}>
        {wrBias} {wrScore}
      </span>
    </HoverTooltip>
  );
  const wrBadge         = makeWrBadge();
  const wrBadgeExpanded = makeWrBadge(true);

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

  const msStructure = useMemo(() => computeMarketStructure(ichiRows.length > 0 ? ichiRows : sheetRows), [ichiRows, sheetRows]);
  const msState     = msStructure.state;
  const msHeadline  = msState;
  const msBias      = msState === "Bullish" ? "bullish" : msState === "Bearish" ? "bearish" : "neutral";
  const makeMsBadge = (large?: boolean) => (
    <span
      className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
      style={{
        color:         BIAS_STYLE[msBias].color,
        background:    BIAS_STYLE[msBias].bg,
        border:        `1px solid ${BIAS_STYLE[msBias].border}`,
        boxShadow:     large ? `${BIAS_STYLE[msBias].glow}, 0 0 16px ${BIAS_STYLE[msBias].border}` : BIAS_STYLE[msBias].glow,
        letterSpacing: "0.10em",
        padding:       large ? "4px 12px" : "2px 8px",
        cursor:        "default",
      }}
    >{msState}</span>
  );
  const msBadge         = makeMsBadge();
  const msBadgeExpanded = makeMsBadge(true);

  const [regimeShowCandles, setRegimeShowCandles] = useState(false);
  const regimeRows   = ichiRows.length > 0 ? ichiRows : sheetRows;
  const curRegimeState = useMemo<RegimeState>(() => {
    const seq = computeRegimeSequence(regimeRows);
    return seq[seq.length - 1] ?? "Ranging";
  }, [regimeRows]);
  const curVolState = useMemo<VolatilityState>(() => {
    return regimeRows.length ? computeRegimeVolatility(regimeRows, regimeRows.length - 1) : "Neutral";
  }, [regimeRows]);
  const regimeAdx = regimeRows.length ? (regimeRows[regimeRows.length - 1]?.adx ?? 0) : 0;
  const trendStrength = curRegimeState === "Trending"
    ? regimeAdx >= 35 ? "Strong"
    : regimeAdx >= 25 ? "Normal"
    : "Weak"
    : null;
  const trendStrengthColor = trendStrength === "Strong" ? "#34d399"
                           : trendStrength === "Normal" ? "#60a5fa"
                           : "#94a3b8";

  const regimeInsight  = curRegimeState === "Trending"    ? "Momentum strategies favored"
                       : curRegimeState === "Compression" ? "Breakout conditions building"
                       : "Mean reversion environment";
  const regimeHeadline = trendStrength
    ? `${trendStrength} Trend · ${regimeInsight}`
    : regimeInsight;
  const regimeAlignmentInsight: string =
    curRegimeState === "Compression"
      ? "Breakout setup forming"
      : curRegimeState === "Trending" && msState === "Bullish"
      ? "High confidence bullish conditions"
      : curRegimeState === "Trending" && msState === "Bearish"
      ? "High confidence bearish conditions"
      : curRegimeState === "Trending"
      ? "Trend / structure mismatch — mixed signals"
      : curRegimeState === "Ranging" && msState === "Range"
      ? "Choppy / low edge environment"
      : curRegimeState === "Ranging" && msState === "Bullish"
      ? "Ranging into bullish structure"
      : curRegimeState === "Ranging" && msState === "Bearish"
      ? "Ranging into bearish structure"
      : "Mixed conditions";
  const makeRegimeBadge = (large?: boolean) => {
    const color = curRegimeState === "Trending"    ? "#60a5fa"
                : curRegimeState === "Compression" ? "#f59e0b"
                : "#94a3b8";
    const bg    = curRegimeState === "Trending"    ? "rgba(96,165,250,0.12)"
                : curRegimeState === "Compression" ? "rgba(245,158,11,0.12)"
                : "rgba(148,163,184,0.10)";
    const border = curRegimeState === "Trending"    ? "rgba(96,165,250,0.35)"
                 : curRegimeState === "Compression" ? "rgba(245,158,11,0.35)"
                 : "rgba(148,163,184,0.25)";
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        <span
          className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
          style={{
            color,
            background:    bg,
            border:        `1px solid ${border}`,
            letterSpacing: "0.10em",
            padding:       large ? "4px 12px" : "2px 8px",
            cursor:        "default",
          }}
        >{curRegimeState}</span>
        {trendStrength && (
          <span
            className={`${large ? "text-[10px]" : "text-[7px]"} font-bold uppercase rounded-full`}
            style={{
              color:         trendStrengthColor,
              background:    `${trendStrengthColor}1a`,
              border:        `1px solid ${trendStrengthColor}55`,
              letterSpacing: "0.08em",
              padding:       large ? "3px 10px" : "1px 6px",
              cursor:        "default",
            }}
          >{trendStrength}</span>
        )}
      </span>
    );
  };
  const regimeBadge         = makeRegimeBadge();
  const regimeBadgeExpanded = makeRegimeBadge(true);

  const fswStats = useMemo(() => {
    const all: number[] = [];
    for (const r of sheetRows) { const v = computeFsWick(r); if (v !== null) all.push(v); }
    const sorted = [...all].sort((a, b) => a - b);
    if (!sorted.length || !sheetRows.length) return null;
    const cur = sheetRows[sheetRows.length - 1];
    const todayFs = cur ? computeFsWick(cur) : null;
    const todayRank = todayFs !== null ? fsPercentileRank(sorted, todayFs) : null;
    return { todayFs, todayRank };
  }, [sheetRows]);
  const fswBadge = (fswStats?.todayFs != null)
    ? <span className="tabular-nums" style={{ fontSize: 10, fontWeight: 600, color: "#f59e0b" }}>{fswStats.todayFs}p{fswStats.todayRank != null ? ` · ${fswStats.todayRank}th` : ""}</span>
    : undefined;
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

  const rocHeadline = sheetRows.length > 0 ? buildRocAnalysis(sheetRows).headline : "";
  const rocBias = useMemo(() => {
    if (sheetRows.length < 6) return "neutral" as const;
    const idx  = sheetRows.length - 1;
    const roc5 = ((sheetRows[idx].close - sheetRows[idx - 5].close) / sheetRows[idx - 5].close) * 100;
    return roc5 > 0.05 ? "bullish" as const : roc5 < -0.05 ? "bearish" as const : "neutral" as const;
  }, [sheetRows]);
  const rocScore = useMemo(() => {
    if (sheetRows.length < 6) return 0;
    const idx  = sheetRows.length - 1;
    const roc5 = Math.abs(((sheetRows[idx].close - sheetRows[idx - 5].close) / sheetRows[idx - 5].close) * 100);
    return Math.min(100, Math.round(roc5 * 20));
  }, [sheetRows]);
  const makeRocBadge = (large?: boolean) => (
    <HoverTooltip tip={`Score ${rocScore}/100 — ROC(5) magnitude × 20, capped at 100 (±5% ROC = score 100). Higher = stronger 5-session directional momentum. ${sheetRows.length >= 6 ? `ROC(5) is ${(((sheetRows[sheetRows.length - 1].close - sheetRows[sheetRows.length - 6].close) / sheetRows[sheetRows.length - 6].close) * 100).toFixed(3)}%.` : ""}`}>
      <span
        className={`${large ? "text-[11px]" : "text-[8px]"} font-black uppercase rounded-full`}
        style={{
          color:         BIAS_STYLE[rocBias].color,
          background:    BIAS_STYLE[rocBias].bg,
          border:        `1px solid ${BIAS_STYLE[rocBias].border}`,
          boxShadow:     large ? `${BIAS_STYLE[rocBias].glow}, 0 0 16px ${BIAS_STYLE[rocBias].border}` : BIAS_STYLE[rocBias].glow,
          letterSpacing: "0.10em",
          padding:       large ? "4px 12px" : "2px 8px",
          cursor:        "default",
        }}>
        {rocBias} {rocScore}
      </span>
    </HoverTooltip>
  );
  const rocBadge         = makeRocBadge();
  const rocBadgeExpanded = makeRocBadge(true);

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

      {/* ── Top bar: Pair Selector + Timeframe + Data date ─────────── */}
      <div className="flex items-center gap-3 shrink-0" style={{ height: "40px" }}>
        <PairSelector onPairChange={(pair) => setSelectedPair(pair)} />
        <div className="relative h-full" style={{ zIndex: tfOpen ? 20 : "auto" }}>
          <div
            className="h-full flex items-center rounded-[14px] overflow-hidden"
            style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", position: "relative", zIndex: 1 }}
          >
            {/* Trigger */}
            <button
              onClick={() => setTfOpen((o) => !o)}
              className="h-full flex items-center gap-2 px-4 shrink-0"
            >
              <span className="text-[13px] font-bold tracking-wide" style={{ color: "var(--text-primary)" }}>
                {timeframe}
              </span>
              <ChevronDown
                size={13}
                style={{
                  color:     "var(--text-muted)",
                  transform:  tfOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.18s",
                }}
              />
            </button>

            {/* Expanded options */}
            <div
              className="flex items-center overflow-hidden"
              style={{
                maxWidth:      tfOpen ? "300px" : "0px",
                opacity:       tfOpen ? 1 : 0,
                transition:    "max-width 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease",
                pointerEvents: tfOpen ? "auto" : "none",
              }}
            >
              <div className="h-5 w-px shrink-0" style={{ background: "var(--border-medium)" }} />
              <div className="flex items-center gap-1 px-2.5">
                {(["1W","1D","4H","1H","15M"] as const).map((tf) => {
                  const active   = tf === timeframe;
                  const disabled = tf !== "1D";
                  return (
                    <button
                      key={tf}
                      disabled={disabled}
                      onClick={() => { if (!disabled) { setTimeframe(tf); setTfOpen(false); } }}
                      className="px-2.5 py-1 rounded-[8px] text-[10px] font-semibold uppercase tracking-widest transition-all"
                      style={{
                        background: active   ? "var(--accent-dim)"          : "transparent",
                        border:     active   ? "1px solid var(--accent-border)" : "1px solid transparent",
                        color:      active   ? "var(--accent-text)"
                                  : disabled ? "var(--text-muted)"
                                  :            "var(--text-secondary)",
                        opacity:    disabled ? 0.45 : 1,
                        cursor:     disabled ? "default" : "pointer",
                      }}
                    >
                      {tf}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
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
            {formatDataDate(eurusdSnapshot.date)}
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
                headerActions={p.id === "ai-chat" ? (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={() => sendTestNotification()}
                      style={{
                        fontSize: 9, padding: "2px 7px", borderRadius: 6, fontWeight: 600,
                        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)",
                        color: "var(--text-muted)", cursor: "pointer",
                      }}
                    >
                      Test
                    </button>
                    <button
                      onClick={() => createAlert()}
                      style={{
                        fontSize: 9, padding: "2px 7px", borderRadius: 6, fontWeight: 600,
                        background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)",
                        color: "var(--text-secondary)", cursor: "pointer",
                      }}
                    >
                      + Add Alert
                    </button>
                  </div>
                ) : undefined}
                onExpand={() => setExpanded({ id: p.id, label: p.label, sub: p.sub })}>
                {p.id === "ai-synthesis" && <AiSynthesisPanelBody result={analysisResult} />}
                {p.id === "ai-chat"      && <AlertsPanel instrument={selectedPair.replace("/", "_")} alerts={alerts} onUpdate={updateAlert} onDelete={deleteAlert} />}
              </BlankPanel>
            );
          })}
        </div>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: "var(--border-medium)", flexShrink: 0 }} />

        {/* ── Scrollable bottom rows — category container panels ── */}
        <div className="flex-1 min-h-0" style={{ overflowY: "auto", paddingTop: "10px", paddingRight: "10px" }}>
          {sheetRows.length > 0 && (
            <div style={{ display: "flex", alignItems: "flex-start" }}>
              <PriceHistoryChart rows={sheetRows} pair={selectedPair} />
              <div style={{ flex: 1, paddingLeft: 24, marginTop: 4, position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
                  <div style={{ display: "flex", alignItems: "flex-start" }}>
                    <span style={{
                      fontSize: 52, fontWeight: 800, color: "#ffffff",
                      letterSpacing: "-0.02em", lineHeight: 1,
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {selectedPair}
                    </span>
                    <span className="flex items-center justify-center" style={{ width: 20, height: 20, flexShrink: 0, marginLeft: 10 }}>
                      <span className="animate-ping absolute inline-flex rounded-full" style={{ width: 12, height: 12, opacity: 0.45, background: "#60a5fa", animationDuration: "2s" }} />
                      <span className="relative inline-flex rounded-full" style={{ width: 8, height: 8, background: "#60a5fa" }} />
                    </span>
                  </div>
                  {latestRow && (() => {
                    const display = livePrice ?? latestRow.close;
                    const isUp = display >= latestRow.open;
                    const pct = (latestRow.close - latestRow.open) / latestRow.open * 100;
                    return (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 32, marginTop: 8, marginLeft: -24 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center", marginLeft: -5 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>Current Price</span>
                          <span style={{ fontSize: 36, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: isUp ? "#60a5fa" : "#a78bfa", letterSpacing: "-0.01em", lineHeight: 1 }}>
                            {display.toFixed(5)}
                          </span>
                          {priceError && <span style={{ fontSize: 9, color: "#f87171", maxWidth: 200 }}>{priceError}</span>}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginLeft: -11 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Today's Change</span>
                          <span style={{ fontSize: 22, fontWeight: 400, color: pct >= 0 ? "#60a5fa" : "#a78bfa", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em", lineHeight: 1, marginTop: 12 }}>
                            {pct >= 0 ? "+" : ""}{pct.toFixed(3)}%
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                {latestRow && (
                  <div style={{ height: 1, background: "var(--border-medium)", margin: "14px 0 14px" }} />
                )}
                {latestRow && (
                  <>
                    <div style={{ display: "flex", gap: 48, justifyContent: "center" }}>
                      {([["Today's Open", latestRow.open], ["Today's High", latestRow.high], ["Today's Low", latestRow.low], ["Today's Close", latestRow.close]] as const).map(([label, value]) => (
                        <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</span>
                          <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: label === "Today's Close" ? (latestRow.close >= latestRow.open ? "#60a5fa" : "#a78bfa") : "var(--text-secondary)" }}>
                            {(value as number).toFixed(5)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div style={{ height: 1, background: "var(--border-medium)", marginTop: 14 }} />
                  </>
                )}
                <ForexNewsPanel news={newsItems} loading={newsLoading} />
              </div>
            </div>
          )}
          <div style={{ height: 2, background: "rgba(255,255,255,0.12)", margin: "10px 0 16px" }} />
          <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", columnGap: 10, rowGap: 0, alignItems: "flex-start", paddingTop: 10 }}>
            {(() => {
              let offset = 0;
              let colsAccum = 0;
              return CATEGORIES.flatMap((cat, catIdx) => {
                const catStart = offset;
                offset += cat.count;
                const catSlots = panelOrder.slice(PINNED_SLOT_COUNT + catStart, PINNED_SLOT_COUNT + catStart + cat.count);

                const cols = cat.visibleCols ?? Math.min(cat.count, 4);
                colsAccum += cols;
                const scrollable = cat.count > cols;
                const el = (
                  <div
                    key={cat.label}
                    style={{
                      borderRadius: 14,
                      border: "2px solid transparent",
                      background: [
                        "linear-gradient(var(--bg-panel-alt), var(--bg-panel-alt)) padding-box",
                        "radial-gradient(ellipse 80% 80% at 0% 0%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 100%) border-box",
                      ].join(", "),
                      overflow: "hidden",
                      flexShrink: 0,
                      width: cols < 4 ? `calc(${cols} * 25% - ${(4 - cols) * 10 / 4}px${cat.label === "Regime & Structure" ? " - 8px" : ""})` : "100%",
                      marginLeft: cat.label === "Regime & Structure" ? 8 : undefined,
                      alignSelf: cat.label === "Regime & Structure" ? "stretch" : undefined,
                    }}
                  >
                    {/* Category header */}
                    <div style={{
                      display: "flex", alignItems: "center",
                      padding: "7px 14px",
                      borderBottom: "1px solid var(--border-subtle)",
                      background: "var(--bg-panel)",
                    }}>
                      <span style={{
                        fontSize: 9, fontWeight: 800, color: "var(--text-primary)",
                        textTransform: "uppercase", letterSpacing: "0.13em",
                      }}>
                        {cat.label}
                      </span>
                    </div>

                    {/* Sub-panels grid (scrollable wrapper when panels exceed 4) */}
                    <div style={{ overflowX: scrollable ? "auto" : "visible" }}>
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${cat.count}, 1fr)`,
                      gridAutoRows: "200px",
                      gap: "10px",
                      padding: "10px",
                      width: scrollable ? `${(cat.count / cols) * 100}%` : undefined,
                    }}>
                      {catSlots.map((panelId, j) => {
                        const slotIdx = PINNED_SLOT_COUNT + catStart + j;
                        if (panelId === "__empty__") return <div key={`eb${slotIdx}`} ref={setPanelRef(slotIdx)} />;
                        const p = PANELS.find(p => p.id === panelId)!;
                        return (
                          <BlankPanel key={p.id} label={p.label} sub={p.sub}
                            style={{ height: "100%" }}
                            isDragging={draggingSlot === slotIdx}
                            isDragOver={dragOverSlot === slotIdx}
                            containerRef={setPanelRef(slotIdx)}
                            onHeaderMouseDown={e => startPanelDrag(slotIdx, e)}
                            badge={p.id === "price" ? priceBadge : p.id === "macd" ? macdBadge : p.id === "rsi9" ? rsiBadge : p.id === "rsi14" ? rsi14Badge : p.id === "moving-averages" ? maBadge : p.id === "keltner" ? keltBadge : p.id === "adx" ? adxBadge : p.id === "ichimoku" ? ichiBadge : p.id === "session" ? sessionBadge : p.id === "volume" ? volBadge : p.id === "pivots" ? pivotBadge : p.id === "cci" ? momBadge : p.id === "wr" ? wrBadge : p.id === "volatility" ? volaBadge : p.id === "avg-price" ? avgpBadge : p.id === "roc" ? rocBadge : p.id === "atr" ? atrBadge : p.id === "candle-context" ? cctxBadge : p.id === "failure-swing" ? fswBadge : p.id === "market-structure" ? msBadge : p.id === "regime" ? regimeBadge : undefined}
                            subtitle={p.id === "price" ? priceHeadline : p.id === "macd" ? macdHeadline : p.id === "rsi9" ? rsiHeadline : p.id === "rsi14" ? rsi14Headline : p.id === "moving-averages" ? maHeadline : p.id === "keltner" ? keltHeadline : p.id === "adx" ? adxHeadline : p.id === "ichimoku" ? ichiHeadline : p.id === "session" ? sessionHeadline : p.id === "volume" ? volHeadline : p.id === "pivots" ? pivotHeadline : p.id === "cci" ? momHeadline : p.id === "wr" ? wrHeadline : p.id === "volatility" ? volaHeadline : p.id === "avg-price" ? avgpHeadline : p.id === "roc" ? rocHeadline : p.id === "atr" ? atrHeadline : p.id === "failure-swing" ? fswHeadline : p.id === "candle-context" ? cctxHeadline : p.id === "market-structure" ? msHeadline : p.id === "regime" ? regimeHeadline : undefined}
                            subtitle2={p.id === "regime" ? regimeAlignmentInsight : undefined}
                            onExpand={() => setExpanded({ id: p.id, label: p.label, sub: p.sub })}>
                            {p.id === "price"           && <PricePanelBody        rows={sheetRows} />}
                            {p.id === "macd"            && <MacdPanelBody         rows={ichiRows.length > 0 ? ichiRows : sheetRows} />}
                            {p.id === "rsi9"            && <RsiPanelBody          rows={ichiRows.length > 0 ? ichiRows : sheetRows} />}
                            {p.id === "rsi14"           && <Rsi14PanelBody        rows={ichiRows.length > 0 ? ichiRows : sheetRows} />}
                            {p.id === "moving-averages" && <MaPanelBody           rows={ichiRows.length > 0 ? ichiRows : sheetRows} />}
                            {p.id === "keltner"         && <KeltPanelBody         rows={ichiRows.length > 0 ? ichiRows : sheetRows} />}
                            {p.id === "adx"             && <AdxPanelBody          rows={ichiRows.length > 0 ? ichiRows : sheetRows} />}
                            {p.id === "ichimoku"        && <IchiPanelBody         rows={ichiRows.length > 0 ? ichiRows : sheetRows} />}
                            {p.id === "session"         && <SessionPanelBody      rows={sheetRows} />}
                            {p.id === "volume"          && <VolumePanelBody       rows={sheetRows} />}
                            {p.id === "pivots"          && <PivotPanelBody        rows={ichiRows.length > 0 ? ichiRows : sheetRows} />}
                            {p.id === "cci"             && <CciPanelBody          rows={ichiRows.length > 0 ? ichiRows : sheetRows} />}
                            {p.id === "wr"              && <WrPanelBody           rows={ichiRows.length > 0 ? ichiRows : sheetRows} />}
                            {p.id === "volatility"      && <VolatilityPanelBody   rows={ichiRows.length > 0 ? ichiRows : sheetRows} />}
                            {p.id === "avg-price"       && <AvgPricePanelBody     rows={ichiRows.length > 0 ? ichiRows : sheetRows} />}
                            {p.id === "roc"             && <RocPanelBody          rows={ichiRows.length > 0 ? ichiRows : sheetRows} />}
                            {p.id === "atr"             && <AtrPanelBody          rows={ichiRows.length > 0 ? ichiRows : sheetRows} />}
                            {p.id === "squeeze"         && <SqueezePanelBody      rows={ichiRows.length > 0 ? ichiRows : sheetRows} />}
                            {p.id === "failure-swing"   && <FailureSwingPanelBody  rows={sheetRows} />}
                            {p.id === "candle-context"  && <CandleContextPanelBody    rows={sheetRows} />}
                            {p.id === "market-structure" && <MarketStructurePanelBody rows={ichiRows.length > 0 ? ichiRows : sheetRows} />}
                            {p.id === "regime"          && <RegimePanelBody           rows={ichiRows.length > 0 ? ichiRows : sheetRows} showCandles={regimeShowCandles} onToggleCandles={() => setRegimeShowCandles(v => !v)} />}
                          </BlankPanel>
                        );
                      })}
                    </div>
                    </div>
                  </div>
                );
                const isRowEnd = colsAccum % 4 === 0;
                return catIdx < CATEGORIES.length - 1 && isRowEnd
                  ? [el, <div key={`sep-${catIdx}`} style={{ width: "100%", height: 26, display: "flex", alignItems: "center", pointerEvents: "none" }}><div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} /></div>]
                  : [el];
              });
            })()}
          </div>
        </div>
      </div>

      {expanded && (
        <PanelModal panel={expanded} onClose={close} headerActions={expanded.id === "ai-chat" ? (
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => sendTestNotification()}
              style={{
                fontSize: 10, padding: "3px 10px", borderRadius: 6, fontWeight: 600,
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)",
                color: "var(--text-muted)", cursor: "pointer",
              }}
            >
              Test
            </button>
            <button
              onClick={() => createAlert()}
              style={{
                fontSize: 10, padding: "3px 10px", borderRadius: 6, fontWeight: 600,
                background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)",
                color: "var(--text-secondary)", cursor: "pointer",
              }}
            >
              + Add Alert
            </button>
          </div>
        ) : undefined} badge={expanded.id === "ai-synthesis" ? aisBadgeExpanded : expanded.id === "macd" ? macdBadgeExpanded : expanded.id === "price" ? priceBadgeExpanded : expanded.id === "rsi9" ? rsiBadgeExpanded : expanded.id === "rsi14" ? rsi14BadgeExpanded : expanded.id === "moving-averages" ? maBadgeExpanded : expanded.id === "keltner" ? keltBadgeExpanded : expanded.id === "adx" ? adxBadgeExpanded : expanded.id === "ichimoku" ? ichiBadgeExpanded : expanded.id === "session" ? sessionBadgeExpanded : expanded.id === "volume" ? volBadgeExpanded : expanded.id === "pivots" ? pivotBadgeExpanded : expanded.id === "cci" ? momBadgeExpanded : expanded.id === "wr" ? wrBadgeExpanded : expanded.id === "volatility" ? volaBadgeExpanded : expanded.id === "avg-price" ? avgpBadgeExpanded : expanded.id === "roc" ? rocBadgeExpanded : expanded.id === "atr" ? atrBadgeExpanded : expanded.id === "candle-context" ? cctxBadgeExpanded : expanded.id === "market-structure" ? msBadgeExpanded : expanded.id === "regime" ? regimeBadgeExpanded : undefined} subtitle={expanded.id === "ai-synthesis" ? aisHeadline : expanded.id === "macd" ? macdHeadline : expanded.id === "price" ? priceHeadline : expanded.id === "rsi9" ? rsiHeadline : expanded.id === "rsi14" ? rsi14Headline : expanded.id === "moving-averages" ? maHeadline : expanded.id === "keltner" ? keltHeadline : expanded.id === "adx" ? adxHeadline : expanded.id === "ichimoku" ? ichiHeadline : expanded.id === "session" ? sessionHeadline : expanded.id === "volume" ? volHeadline : expanded.id === "pivots" ? pivotHeadline : expanded.id === "cci" ? momHeadline : expanded.id === "wr" ? wrHeadline : expanded.id === "volatility" ? volaHeadline : expanded.id === "avg-price" ? avgpHeadline : expanded.id === "roc" ? rocHeadline : expanded.id === "atr" ? atrHeadline : expanded.id === "failure-swing" ? fswHeadline : expanded.id === "candle-context" ? cctxHeadline : expanded.id === "market-structure" ? msHeadline : expanded.id === "regime" ? regimeHeadline : undefined} subtitle2={expanded.id === "regime" ? regimeAlignmentInsight : undefined}>
          {expanded.id === "ai-synthesis"    && <AiSynthesisPanelBody result={analysisResult} expanded />}
          {expanded.id === "price"           && <PricePanelBody      rows={sheetRows} expanded />}
          {expanded.id === "macd"            && <MacdPanelBody       rows={ichiRows.length > 0 ? ichiRows : sheetRows} expanded />}
          {expanded.id === "rsi9"            && <RsiPanelBody        rows={ichiRows.length > 0 ? ichiRows : sheetRows} expanded />}
          {expanded.id === "rsi14"           && <Rsi14PanelBody      rows={ichiRows.length > 0 ? ichiRows : sheetRows} expanded />}
          {expanded.id === "moving-averages" && <MaPanelBody         rows={ichiRows.length > 0 ? ichiRows : sheetRows} expanded />}
          {expanded.id === "keltner"         && <KeltPanelBody       rows={ichiRows.length > 0 ? ichiRows : sheetRows} expanded />}
          {expanded.id === "adx"             && <AdxPanelBody        rows={ichiRows.length > 0 ? ichiRows : sheetRows} expanded />}
          {expanded.id === "ichimoku"        && <IchiPanelBody       rows={ichiRows.length > 0 ? ichiRows : sheetRows} expanded />}
          {expanded.id === "session"         && <SessionPanelBody    rows={sheetRows} expanded />}
          {expanded.id === "volume"          && <VolumePanelBody     rows={sheetRows} expanded />}
          {expanded.id === "pivots"          && <PivotPanelBody      rows={ichiRows.length > 0 ? ichiRows : sheetRows} expanded />}
          {expanded.id === "cci"             && <CciPanelBody        rows={ichiRows.length > 0 ? ichiRows : sheetRows} expanded />}
          {expanded.id === "wr"              && <WrPanelBody         rows={ichiRows.length > 0 ? ichiRows : sheetRows} expanded />}
          {expanded.id === "volatility"      && <VolatilityPanelBody rows={ichiRows.length > 0 ? ichiRows : sheetRows} expanded />}
          {expanded.id === "avg-price"       && <AvgPricePanelBody   rows={ichiRows.length > 0 ? ichiRows : sheetRows} expanded />}
          {expanded.id === "roc"             && <RocPanelBody        rows={ichiRows.length > 0 ? ichiRows : sheetRows} expanded />}
          {expanded.id === "atr"             && <AtrPanelBody             rows={ichiRows.length > 0 ? ichiRows : sheetRows} expanded />}
          {expanded.id === "squeeze"         && <SqueezePanelBody         rows={ichiRows.length > 0 ? ichiRows : sheetRows} expanded />}
          {expanded.id === "failure-swing"   && <FailureSwingPanelBody   rows={sheetRows} expanded />}
          {expanded.id === "ai-chat"         && <AlertsPanel instrument={selectedPair.replace("/", "_")} alerts={alerts} onUpdate={updateAlert} onDelete={deleteAlert} />}
          {expanded.id === "candle-context"   && <CandleContextPanelBody    rows={sheetRows} expanded />}
          {expanded.id === "market-structure" && <MarketStructurePanelBody  rows={ichiRows.length > 0 ? ichiRows : sheetRows} expanded />}
          {expanded.id === "regime"           && <RegimePanelBody           rows={ichiRows.length > 0 ? ichiRows : sheetRows} expanded showCandles={regimeShowCandles} onToggleCandles={() => setRegimeShowCandles(v => !v)} />}
        </PanelModal>
      )}

      {/* ── Alert toasts ──────────────────────────────────────────────────── */}
      {toasts.length > 0 && (
        <div style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 9999,
          display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
        }}>
          {toasts.map(t => (
            <AlertToastCard
              key={t.toastId}
              toast={t}
              onDismiss={() => setToasts(prev => prev.filter(x => x.toastId !== t.toastId))}
            />
          ))}
        </div>
      )}

    </div>
  );
}

// ─── Toast card ───────────────────────────────────────────────────────────────

function AlertToastCard({ toast, onDismiss }: { toast: AlertToast; onDismiss: () => void }) {
  return (
    <div style={{
      pointerEvents: "all",
      background: "rgba(20,20,35,0.97)",
      border: "1px solid rgba(167,139,250,0.35)",
      borderRadius: 10,
      padding: "10px 14px",
      minWidth: 360,
      boxShadow: "0 6px 24px rgba(0,0,0,0.6)",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          ⚡ Alert Triggered
        </span>
        <button
          onClick={onDismiss}
          style={{
            background: "none", border: "none", color: "var(--text-muted)",
            cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", textAlign: "center" }}>
        {toast.name}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", textAlign: "center" }}>
        {toast.instrument.replace("_", "/")} · {toast.direction} {toast.price.toFixed(5)}
      </div>
    </div>
  );
}
