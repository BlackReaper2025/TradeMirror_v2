// ─── Analytics — 3-row layout + pair selector ─────────────────────────────────
//
//  PairSelector  — top strip, EUR/USD active, others placeholder
//  Row 1         — Verdict:  direction · confidence bar · signal tags · history %
//  Row 2         — Evidence: 5 equal group cards (Trend, MACD, Momentum, Volatility, Directional)
//  Row 3         — Detail:   Entry/Exit plan | Signal history dots | Live indicator bars
//
import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, ReferenceLine, ReferenceArea,
  ResponsiveContainer, Cell, Tooltip,
} from "recharts";
import { Maximize2, Minimize2, X, GripVertical, Settings, Camera, Info, LayoutGrid, ChevronDown, Lock, Unlock,
  MousePointer2, Minus, ArrowUpRight, ArrowRight, Square, Type, Trash2, Eraser, Magnet, Layers, Eye, EyeOff } from "lucide-react";
import { toPng } from "html-to-image";
import { getSettings, getAllTradesWithJournal, addTradeImage, localDateStr, type TradeWithJournal } from "../db/queries";
import { PairSelector, ALL_ASSETS } from "../components/analytics/PairSelector";
import { InstrumentTicker }      from "../components/analytics/InstrumentTicker";
import { AnalyticsClock }        from "../components/analytics/AnalyticsClock";
import { useAnalytics, setLiveAnalytics, signalHistory, historicalAccuracy,
  analysisResult as defaultAnalysisResult, signalTags, evidenceCards,
  emaStackData, macdChartData, momentumChartData, volatilityChartData, directionalChartData,
} from "../data/analyticsDataV3";
import type { AnalysisResult } from "../data/analyticsDataV3";
import type { SheetRow }         from "../lib/googleSheets";
import { fetchSynthesis, synthesisToAnalysisResult } from "../lib/brain/synthesis";
import type { Synthesis }        from "../lib/brain/synthesis";
import { getAnalyticsPanelOrder, setAnalyticsPanelOrder, getReversalSettings, setReversalSettings, getTreasuryAuctionsBackfilled, setTreasuryAuctionsBackfilled, getQuadPairs, setQuadPairs, getChartDrawings, setChartDrawings, getLastChartSelection, setLastChartSelection, getChartViewSettings, setChartViewSettings, type StoredDrawing, type StoredDrawPoint } from "../lib/preferences";
import { pairSelectionEvents } from "../lib/pairSelection";
import { sidebarEvents } from "../lib/sidebarEvents";
import { playAlertSound } from "../lib/alertSound";
import type { AlertSound } from "../lib/alertSound";
import { AlertsPanel, type Alert } from "../components/panels/AlertsPanel";
import { computeSupplyDemandZones, type SupplyDemandZone } from "../lib/supplyDemand";
import { computeAutoTrendlines, type TrendlineSegment } from "../lib/trendlines";
import { decimalsForPair, formatPrice } from "../lib/priceFormat";
import { invoke }                from "@tauri-apps/api/core";
import { homeDir, join }         from "@tauri-apps/api/path";
import {
  createChart, CandlestickSeries, AreaSeries, LineSeries, HistogramSeries,
  ColorType, CrosshairMode, LineStyle, TickMarkType,
} from "lightweight-charts";
import type { IChartApi, UTCTimestamp } from "lightweight-charts";
// Shared with the standalone Python alert engine (TradeMirror_Alert_Test/price_alert.py),
// which reads/writes the same two files under ~/.trademirror/.
const alertsJsonPath = homeDir().then(h => join(h, ".trademirror", "alerts.json"));
const economicCalendarCachePath = homeDir().then(h => join(h, ".trademirror", "economic_calendar_cache.json"));

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
  subtitle?: string;
}

interface NewsArticle {
  title: string;
  link: string;
  pub_date: string;
  source: string;
}

interface EconomicEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string;
  previous: string;
  actual?: string;
}

// A 10Y note or 30Y bond auction result, sourced from TreasuryDirect's own
// public auction-results API (see sync_treasury_auctions/
// get_stored_treasury_auctions in src-tauri/src/lib.rs) — real published
// data, not the ForexFactory calendar feed. TreasuryDirect's results don't
// include a "tail"/when-issued-yield field at all (that's a market-quoted
// figure, not something Treasury itself publishes), so those stay
// unavailable rather than invented.
interface TreasuryAuction {
  cusip: string;
  securityTerm: string;
  auctionDate: string;
  issueDate: string;
  highYield: string;
  bidToCoverRatio: string;
  indirectBidderAccepted: string;
  directBidderAccepted: string;
  primaryDealerAccepted: string;
  totalAccepted: string;
  offeringAmount: string;
  // auctionDate is date-only (midnight, no timezone) — the real close/
  // results time is here instead, e.g. "01:00 PM", always US Eastern
  // (confirmed against the live API). See auctionTimestamp() below.
  closingTimeCompetitive: string;
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
  { id: "macd-stack",      area: "mstk",  label: "MACD STACK",                  sub: "Multi-timeframe MACD vs signal direction" },
  { id: "ema-stack",       area: "estk",  label: "EMA 9/20 STACK",              sub: "EMA9 vs EMA20 direction · price trend vs consolidation" },
  { id: "ema-stack-200",   area: "estk2", label: "EMA 50/200 STACK",            sub: "EMA50 vs EMA200 direction · price trend vs consolidation" },
  { id: "adx-stack",       area: "astk",  label: "ADX STACK",                   sub: "+DI vs −DI direction · ADX trend strength" },
  { id: "rsi-stack",       area: "rstk",  label: "RSI STACK",                   sub: "RSI-14 momentum direction · trending vs consolidating" },
  { id: "squeeze-stack",   area: "sqstk", label: "SQUEEZE STACK",               sub: "Squeeze break direction · in-squeeze vs released" },
  { id: "cci-stack",       area: "cstk",  label: "CCI STACK",                   sub: "CCI direction · trending vs ranging" },
  { id: "ms-stack",        area: "msstk", label: "STRUCTURE STACK",             sub: "Swing-structure bias (HH/HL vs LH/LL) · trending vs range" },
];


// First PINNED_SLOT_COUNT slots are fixed; the rest are in the scrollable section.
const PINNED_SLOT_COUNT = 2;

// Grid slot areas in row-major order.
// Slots 0-1 are pinned (top row). Slots 2+ are scrollable (bottom rows).
const SLOT_AREAS = [
  // ── Pinned ────────────────────────────────────────────────────────────────
  "ais", "aic",
  // ── Strategies ────────────────────────────────────────────────────────────
  "msstk", "estk2", "estk", "astk", "mstk", "rstk", "sqstk", "cstk",
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
  { label: "Strategies",             count: 8, visibleCols: 4 },
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

const NO_SUB_IDS = new Set(["ai-synthesis", "price", "macd", "rsi9", "rsi14", "moving-averages", "keltner", "adx", "ichimoku", "session", "volume", "pivots", "cci", "wr", "volatility", "avg-price", "roc", "atr", "squeeze", "candle-context", "ai-chat", "regime", "macd-stack", "ema-stack", "ema-stack-200", "adx-stack", "rsi-stack", "squeeze-stack", "cci-stack", "ms-stack"]);

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

// ─── Indicator helpers ─────────────────────────────────────────────────────────

type IndKey = "bb" | "ichi" | "ema9" | "ema20" | "ema50" | "ema200" | "sma200" | "sma400" | "volume" | "reversal" | "session8am" | "pivots";

// ─── Quad View lock — broadcast the primary tile's toolbar settings to the
// other 3 tiles ────────────────────────────────────────────────────────────
// Module-scope pub/sub (same lightweight pattern as pairSelectionEvents/
// tradeEvents), scoped to this file since QuadSyncSettings mirrors
// PriceHistoryChart's own internal state shape. Only the toolbar-level
// master toggles are synced (timeframe, which overlays are on, view mode,
// candle colors) — not each overlay's own right-click sub-settings (ORB's
// per-session picks, Pivot timeframes, News categories, etc.), which stay
// per-tile even when locked.
interface QuadSyncSettings {
  chartTf: "1W" | "1D" | "4H" | "1H" | "15M" | "5M" | "1M";
  activeInds: IndKey[];
  showDailyZones: boolean; show4HZones: boolean; show1HZones: boolean; show15MZones: boolean; show5MZones: boolean;
  showWeeklyTrend: boolean; showDailyTrend: boolean; show4HTrend: boolean; show1HTrend: boolean; show15MTrend: boolean; show5MTrend: boolean; show1MTrend: boolean;
  showOrbNY: boolean; showOrbTokyo: boolean; showOrbLondon: boolean; showOrb930: boolean;
  showSessions: boolean;
  showNews: boolean;
  viewMode: "candles" | "line";
  candleColorScheme: "default" | "tradingview";
}
type QuadSyncListener = (settings: QuadSyncSettings) => void;
const quadSyncListeners = new Set<QuadSyncListener>();
const quadSyncEvents = {
  subscribe(fn: QuadSyncListener): () => void { quadSyncListeners.add(fn); return () => quadSyncListeners.delete(fn); },
  publish(settings: QuadSyncSettings): void { quadSyncListeners.forEach(fn => fn(settings)); },
};

const IND_DEFS: { key: IndKey; label: string; color: string }[] = [
  { key: "bb",    label: "BB(20,2)", color: "#64b5f6" },
  { key: "ichi",  label: "Ichimoku", color: "#60a5fa" },
  { key: "ema9",  label: "EMA 9",   color: "#ff9f0a" },
  { key: "ema20", label: "EMA 20",  color: "#30d158" },
  { key: "ema50", label: "EMA 50",  color: "#ff6b6b" },
  { key: "ema200",label: "EMA 200", color: "#bf5af2" },
  { key: "sma200",label: "SMA 200", color: "#38bdf8" },
  { key: "sma400",label: "SMA 400", color: "#f472b6" },
  { key: "volume",label: "Volume",  color: "#94a3b8" },
];

// Volume histogram bar colors — muted versions of the current candle
// up/down colors so it reads as "the same candles, quieter" rather than a
// clashing third color scheme.
const VOLUME_COLOR_SCHEMES = {
  default:     { up: "rgba(96,165,250,0.5)",  down: "rgba(167,139,250,0.5)" },
  tradingview: { up: "rgba(34,197,94,0.5)",   down: "rgba(239,68,68,0.5)" },
} as const;

function computeEMA(closes: number[], period: number): (number | null)[] {
  if (closes.length < period) return closes.map(() => null);
  const k = 2 / (period + 1);
  const result: (number | null)[] = closes.map(() => null);
  result[period - 1] = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++)
    result[i] = closes[i] * k + result[i - 1]! * (1 - k);
  return result;
}

function computeSMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = closes.map(() => null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= period) sum -= closes[i - period];
    if (i >= period - 1) result[i] = sum / period;
  }
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
  const hh = (from: number, to: number) => { let m = -Infinity; for (let i = from; i <= to; i++) if (highs[i] > m) m = highs[i]; return m; };
  const ll = (from: number, to: number) => { let m =  Infinity; for (let i = from; i <= to; i++) if (lows[i]  < m) m = lows[i];  return m; };
  const tenkan: (number | null)[] = Array(n).fill(null);
  const kijun:  (number | null)[] = Array(n).fill(null);
  const spanA:  (number | null)[] = Array(n).fill(null);
  const spanB:  (number | null)[] = Array(n).fill(null);
  for (let i = 8;  i < n; i++) tenkan[i] = (hh(i - 8,  i) + ll(i - 8,  i)) / 2;
  for (let i = 25; i < n; i++) kijun[i]  = (hh(i - 25, i) + ll(i - 25, i)) / 2;
  for (let i = 25; i < n; i++) {
    if (tenkan[i] !== null && kijun[i] !== null)
      spanA[i] = (tenkan[i]! + kijun[i]!) / 2;
  }
  for (let i = 51; i < n; i++) spanB[i] = (hh(i - 51, i) + ll(i - 51, i)) / 2;
  return { tenkan, kijun, spanA, spanB };
}


// Ichimoku cloud fill primitive — paints the area between Senkou A and Senkou B
// directly in canvas using the chart's coordinate system, so the fill always
// tracks the dashed lines exactly. Bullish (A >= B) and bearish (B > A) regions
// are split at the exact crossover so the cloud comes to a clean point.
class IchiCloudPaneView {
  _p: IchiCloudPrimitive;
  constructor(p: IchiCloudPrimitive) { this._p = p; }
  update() {}
  zOrder() { return "bottom" as const; }
  renderer() { return new IchiCloudRenderer(this._p); }
}

class IchiCloudRenderer {
  _p: IchiCloudPrimitive;
  constructor(p: IchiCloudPrimitive) { this._p = p; }
  draw(target: any) {
    const chart  = this._p._chart;
    const series = this._p._series;
    const A = this._p._spanA;
    const B = this._p._spanB;
    if (!chart || !series || A.length === 0 || A.length !== B.length) return;
    // See the comment on ReversalMarkerRenderer.draw() below — an uncaught
    // throw from any custom primitive's draw() kills lightweight-charts'
    // whole render loop (it doesn't wrap these calls itself), so every
    // primitive in this file guards its paint the same way.
    try {
    target.useBitmapCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      const ts  = chart.timeScale();
      const hr  = scope.horizontalPixelRatio;
      const vr  = scope.verticalPixelRatio;

      type Pt = { x: number; topY: number; botY: number };
      const bullSegs: Pt[][] = [];
      const bearSegs: Pt[][] = [];
      let curBull: Pt[] = [];
      let curBear: Pt[] = [];
      let prev: { a: number; b: number; x: number; yA: number; yB: number } | null = null;

      for (let i = 0; i < A.length; i++) {
        const a = A[i].value;
        const b = B[i].value;
        const xRaw  = ts.timeToCoordinate(A[i].time);
        const yARaw = series.priceToCoordinate(a);
        const yBRaw = series.priceToCoordinate(b);
        if (xRaw === null || yARaw === null || yBRaw === null) {
          if (curBull.length) { bullSegs.push(curBull); curBull = []; }
          if (curBear.length) { bearSegs.push(curBear); curBear = []; }
          prev = null;
          continue;
        }
        const x  = xRaw  * hr;
        const yA = yARaw * vr;
        const yB = yBRaw * vr;
        const isBull = a >= b;

        if (prev && (prev.a >= prev.b) !== isBull) {
          const denom = (a - b) - (prev.a - prev.b);
          if (denom !== 0) {
            const t = (prev.b - prev.a) / denom;
            if (t >= 0 && t <= 1) {
              const cx = prev.x  + t * (x  - prev.x);
              const cy = prev.yA + t * (yA - prev.yA);
              const tip: Pt = { x: cx, topY: cy, botY: cy };
              if (prev.a >= prev.b) {
                curBull.push(tip);
                bullSegs.push(curBull); curBull = [];
                curBear.push(tip);
              } else {
                curBear.push(tip);
                bearSegs.push(curBear); curBear = [];
                curBull.push(tip);
              }
            }
          }
        }

        const topY = a >= b ? yA : yB;
        const botY = a >= b ? yB : yA;
        if (isBull) curBull.push({ x, topY, botY });
        else        curBear.push({ x, topY, botY });
        prev = { a, b, x, yA, yB };
      }
      if (curBull.length) bullSegs.push(curBull);
      if (curBear.length) bearSegs.push(curBear);

      const paint = (segs: Pt[][], fill: string) => {
        ctx.fillStyle = fill;
        for (const seg of segs) {
          if (seg.length < 1) continue;
          ctx.beginPath();
          ctx.moveTo(seg[0].x, seg[0].topY);
          for (let i = 1; i < seg.length; i++) ctx.lineTo(seg[i].x, seg[i].topY);
          for (let i = seg.length - 1; i >= 0; i--) ctx.lineTo(seg[i].x, seg[i].botY);
          ctx.closePath();
          ctx.fill();
        }
      };
      paint(bullSegs, "rgba(96,165,250,0.22)");
      paint(bearSegs, "rgba(167,139,250,0.22)");
    });
    } catch (_) { /* never let a stale reference or bad data blank the chart */ }
  }
}

class IchiCloudPrimitive {
  _chart: any = null;
  _series: any = null;
  _spanA: { time: any; value: number }[];
  _spanB: { time: any; value: number }[];
  _views: IchiCloudPaneView[] = [];
  constructor(a: { time: any; value: number }[], b: { time: any; value: number }[]) {
    this._spanA = a;
    this._spanB = b;
  }
  attached({ chart, series }: any) {
    this._chart  = chart;
    this._series = series;
    this._views  = [new IchiCloudPaneView(this)];
  }
  detached() {
    this._chart  = null;
    this._series = null;
    this._views  = [];
  }
  updateAllViews() { this._views.forEach(v => v.update()); }
  paneViews()      { return this._views; }
}


// Bollinger Band fill primitive — paints the band between upper/lower as a polygon
// at zOrder 'bottom' so candles always render on top (AreaSeries would clip them).
class BBFillPaneView {
  _p: BBFillPrimitive;
  constructor(p: BBFillPrimitive) { this._p = p; }
  update() {}
  zOrder() { return "bottom" as const; }
  renderer() { return new BBFillRenderer(this._p); }
}

class BBFillRenderer {
  _p: BBFillPrimitive;
  constructor(p: BBFillPrimitive) { this._p = p; }
  draw(target: any) {
    const chart  = this._p._chart;
    const series = this._p._series;
    const upper  = this._p._upper;
    const lower  = this._p._lower;
    if (!chart || !series || upper.length === 0 || lower.length === 0) return;
    try {
    target.useBitmapCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      const ts  = chart.timeScale();
      const hr  = scope.horizontalPixelRatio;
      const vr  = scope.verticalPixelRatio;

      const up: { x: number; y: number }[] = [];
      for (const pt of upper) {
        const x = ts.timeToCoordinate(pt.time);
        const y = series.priceToCoordinate(pt.value);
        if (x !== null && y !== null) up.push({ x, y });
      }
      const lo: { x: number; y: number }[] = [];
      for (const pt of lower) {
        const x = ts.timeToCoordinate(pt.time);
        const y = series.priceToCoordinate(pt.value);
        if (x !== null && y !== null) lo.push({ x, y });
      }
      if (up.length === 0 || lo.length === 0) return;

      ctx.beginPath();
      ctx.moveTo(up[0].x * hr, up[0].y * vr);
      for (let i = 1; i < up.length; i++) ctx.lineTo(up[i].x * hr, up[i].y * vr);
      for (let i = lo.length - 1; i >= 0; i--) ctx.lineTo(lo[i].x * hr, lo[i].y * vr);
      ctx.closePath();
      ctx.fillStyle = "rgba(100,181,246,0.15)";
      ctx.fill();
    });
    } catch (_) { /* see IchiCloudRenderer above — never let this blank the chart */ }
  }
}

class BBFillPrimitive {
  _chart: any = null;
  _series: any = null;
  _upper: { time: any; value: number }[];
  _lower: { time: any; value: number }[];
  _views: BBFillPaneView[] = [];

  constructor(upper: { time: any; value: number }[], lower: { time: any; value: number }[]) {
    this._upper = upper;
    this._lower = lower;
  }
  attached({ chart, series }: any) {
    this._chart  = chart;
    this._series = series;
    this._views  = [new BBFillPaneView(this)];
  }
  detached() {
    this._chart  = null;
    this._series = null;
    this._views  = [];
  }
  updateAllViews() { this._views.forEach(v => v.update()); }
  paneViews()      { return this._views; }
}


// Supply/demand zone box — draws full-width shaded price bands. Price-anchored
// rather than time-anchored, so a zone stays correctly positioned regardless of
// which candle timeframe the chart itself is currently displaying.
interface ZoneBox {
  type: "supply" | "demand";
  low: number;
  high: number;
  originTime: UTCTimestamp;
  label: string;
  tapped?: boolean;
  // 0 = just tapped (still full supply/demand color) → 1 = fully faded to
  // grey. Ramps up over TAPPED_FADE_CANDLES candles since the tap.
  tapFade?: number;
  insideTapped?: boolean;
}
const ZONE_BASE_RGB: Record<"supply" | "demand", [number, number, number]> = {
  supply: [226, 75, 74],
  demand: [139, 195, 74],
};
// Most-recently-tapped zone fades to grey instead of snapping there
// instantly, so it visually reads as "reacting" for a while before it settles
// into "already reacted to". Ramps over this many candles on the zone's own
// timeframe — user-configurable from the Supply & Demand settings popup.
const DEFAULT_TAP_FADE_CANDLES = 10;
const TAPPED_BASE_RGB: [number, number, number] = [148, 163, 184];
function zoneFadeColor(base: [number, number, number], t: number): { fill: string; fillFaint: string; stroke: string } {
  const [r0, g0, b0] = base;
  const [r1, g1, b1] = TAPPED_BASE_RGB;
  const r = Math.round(r0 + (r1 - r0) * t);
  const g = Math.round(g0 + (g1 - g0) * t);
  const b = Math.round(b0 + (b1 - b0) * t);
  return { fill: `rgba(${r},${g},${b},0.16)`, fillFaint: `rgba(${r},${g},${b},0.10)`, stroke: `rgb(${r},${g},${b})` };
}
const ZONE_COLORS: Record<"supply" | "demand", { fill: string; fillFaint: string; stroke: string }> = {
  supply: zoneFadeColor(ZONE_BASE_RGB.supply, 0),
  demand: zoneFadeColor(ZONE_BASE_RGB.demand, 0),
};
// A fresh zone nested entirely inside the most-recently-tapped zone of the
// same timeframe is drawn in yellow — it sits inside price action that's
// already reacted, so it reads as heightened-relevance context.
const INSIDE_TAPPED_ZONE_COLOR = { fill: "rgba(234,179,8,0.16)", fillFaint: "rgba(234,179,8,0.10)", stroke: "#EAB308" };

class ZoneBoxRenderer {
  _p: ZoneBoxPrimitive;
  constructor(p: ZoneBoxPrimitive) { this._p = p; }
  draw(target: any) {
    const chart  = this._p._chart;
    const series = this._p._series;
    const zones  = this._p._zones;
    if (!chart || !series || zones.length === 0) return;
    try {
    target.useBitmapCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      const w  = scope.bitmapSize.width;
      const ts = chart.timeScale();
      for (const z of zones) {
        const yHighRaw = series.priceToCoordinate(z.high);
        const yLowRaw  = series.priceToCoordinate(z.low);
        if (yHighRaw === null || yLowRaw === null) continue;

        // Anchor the left edge to the origin candle — nearest bar index on
        // whatever timeframe the chart is currently displaying, so the box
        // never gets drawn over history that predates the zone forming.
        const idx = ts.timeToIndex(z.originTime, true);
        if (idx === null) continue;
        const xRaw = ts.logicalToCoordinate(idx as any);
        if (xRaw === null) continue;
        const x1 = Math.max(0, xRaw * hr);

        const yTop = yHighRaw * vr;
        const yBot = Math.max(yTop + 1, yLowRaw * vr);
        const colors = z.tapped
          ? zoneFadeColor(ZONE_BASE_RGB[z.type], z.tapFade ?? 1)
          : z.insideTapped ? INSIDE_TAPPED_ZONE_COLOR : ZONE_COLORS[z.type];
        ctx.fillStyle = colors.fillFaint;
        ctx.fillRect(x1, yTop, w - x1, yBot - yTop);
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = hr;
        ctx.strokeRect(x1, yTop, w - x1, yBot - yTop);

        // Dashed line marking the zone's midpoint price.
        const yMid = (yTop + yBot) / 2;
        ctx.save();
        ctx.setLineDash([4 * hr, 3 * hr]);
        ctx.beginPath();
        ctx.moveTo(x1, yMid);
        ctx.lineTo(w, yMid);
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = hr;
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = colors.stroke;
        ctx.font = `${Math.round(10 * vr)}px sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillText(z.label, x1 + 6 * hr, yTop + 4 * vr);
      }
    });
    } catch (_) { /* see IchiCloudRenderer above — never let this blank the chart */ }
  }
}
class ZoneBoxPaneView {
  _p: ZoneBoxPrimitive;
  constructor(p: ZoneBoxPrimitive) { this._p = p; }
  update() {}
  zOrder() { return "bottom" as const; }
  renderer() { return new ZoneBoxRenderer(this._p); }
}
class ZoneBoxPrimitive {
  _chart: any = null;
  _series: any = null;
  _zones: ZoneBox[];
  _views: ZoneBoxPaneView[] = [];
  constructor(zones: ZoneBox[]) { this._zones = zones; }
  attached({ chart, series }: any) { this._chart = chart; this._series = series; this._views = [new ZoneBoxPaneView(this)]; }
  detached() { this._chart = null; this._series = null; this._views = []; }
  updateAllViews() { this._views.forEach(v => v.update()); }
  paneViews() { return this._views; }
}

// Generic time-and-price-bounded box — a box drawn between two times and two
// price levels, in the style of ZoneBox but bounded on both left and right
// edges (ZoneBox is anchored left and unbounded right). Shared by the 8am
// session box and the London/Tokyo/New York session-range boxes below.
interface TimeRangeBox {
  low:       number;
  high:      number;
  startTime: UTCTimestamp;
  endTime:   UTCTimestamp;
  fill:      string;
  stroke:    string;
  label?:    string;
  // "left" (default) suits a box with real width/height — top-left reads
  // naturally as its title. Pivot lines are a zero-height box, and reads
  // better labeled off their right (forward) edge, like a horizontal ray.
  labelAlign?: "left" | "right";
  midLine?:  boolean;
}

class TimeRangeBoxRenderer {
  _p: TimeRangeBoxPrimitive;
  constructor(p: TimeRangeBoxPrimitive) { this._p = p; }
  draw(target: any) {
    const chart  = this._p._chart;
    const series = this._p._series;
    const boxes  = this._p._boxes;
    if (!chart || !series || boxes.length === 0) return;
    try {
    target.useBitmapCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      const ts = chart.timeScale();
      for (const b of boxes) {
        const yHighRaw = series.priceToCoordinate(b.high);
        const yLowRaw  = series.priceToCoordinate(b.low);
        if (yHighRaw === null || yLowRaw === null) continue;

        const idx1 = ts.timeToIndex(b.startTime, true);
        const idx2 = ts.timeToIndex(b.endTime, true);
        if (idx1 === null || idx2 === null) continue;
        // logicalToCoordinate(idx) gives the CENTER of bar idx (confirmed in
        // lightweight-charts' own indexToCoordinate: `-(delta + 0.5) * barSpacing`),
        // and only accepts integer logical indices — passing idx - 0.5 silently
        // collapses to coordinate 0. Shift by half the bar's pixel width instead
        // so both edges land on the actual bar boundary (start time).
        const barSpacing = ts.options().barSpacing;
        const c1 = ts.logicalToCoordinate(idx1 as any);
        const c2 = ts.logicalToCoordinate(idx2 as any);
        if (c1 === null || c2 === null) continue;
        const x1Raw = c1 - barSpacing / 2;
        const x2Raw = c2 - barSpacing / 2;
        const x1 = x1Raw * hr;
        const x2 = Math.max(x1 + 1, x2Raw * hr);

        const yTop = yHighRaw * vr;
        const yBot = Math.max(yTop + 1, yLowRaw * vr);

        ctx.fillStyle = b.fill;
        ctx.fillRect(x1, yTop, x2 - x1, yBot - yTop);
        ctx.strokeStyle = b.stroke;
        ctx.lineWidth = hr;
        ctx.strokeRect(x1, yTop, x2 - x1, yBot - yTop);

        if (b.midLine) {
          const yMid = (yTop + yBot) / 2;
          ctx.save();
          ctx.setLineDash([4 * hr, 3 * hr]);
          ctx.beginPath();
          ctx.moveTo(x1, yMid);
          ctx.lineTo(x2, yMid);
          ctx.stroke();
          ctx.restore();
        }

        if (b.label) {
          ctx.fillStyle = b.stroke;
          ctx.font = `${Math.round(10 * vr)}px sans-serif`;
          if (b.labelAlign === "right") {
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.fillText(b.label, x2 - 4 * hr, yTop - 8 * vr);
          } else {
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.fillText(b.label, x1 + 4 * hr, yTop + 3 * vr);
          }
        }
      }
    });
    } catch (_) { /* see IchiCloudRenderer above — never let this blank the chart */ }
  }
}
class TimeRangeBoxPaneView {
  _p: TimeRangeBoxPrimitive;
  constructor(p: TimeRangeBoxPrimitive) { this._p = p; }
  update() {}
  zOrder() { return "top" as const; }
  renderer() { return new TimeRangeBoxRenderer(this._p); }
}
class TimeRangeBoxPrimitive {
  _chart: any = null;
  _series: any = null;
  _boxes: TimeRangeBox[];
  _views: TimeRangeBoxPaneView[] = [];
  constructor(boxes: TimeRangeBox[]) { this._boxes = boxes; }
  attached({ chart, series }: any) { this._chart = chart; this._series = series; this._views = [new TimeRangeBoxPaneView(this)]; }
  detached() { this._chart = null; this._series = null; this._views = []; }
  updateAllViews() { this._views.forEach(v => v.update()); }
  paneViews() { return this._views; }
}

// Reversal-candle callouts — custom-drawn (not the built-in series-markers
// plugin) because we need two independent colors per marker (arrow vs. label
// text) and greedy row-packing so labels on nearby candles stack vertically
// instead of overlapping, neither of which the plugin supports.
interface ReversalMarkerData {
  time: UTCTimestamp;
  anchorPrice: number; // candle low (bullish) or high (bearish) to plant the arrow against
  bias: "bullish" | "bearish";
  text: string;
}
class ReversalMarkerRenderer {
  _p: ReversalMarkerPrimitive;
  constructor(p: ReversalMarkerPrimitive) { this._p = p; }
  draw(target: any) {
    const chart   = this._p._chart;
    const series  = this._p._series;
    const markers = this._p._markers;
    if (!chart || !series || markers.length === 0) return;
    // A stale chart/series reference (e.g. a paint scheduled just before a
    // viewMode toggle tears down and recreates the candle series) can make
    // timeToIndex/priceToCoordinate throw. lightweight-charts does not wrap
    // primitive draw() calls itself, and an uncaught throw here aborts its
    // internal render loop for good — the chart goes blank and stops
    // repainting entirely until the component remounts. Swallow it instead:
    // worst case this frame's markers are skipped, not the whole chart.
    try {
    target.useBitmapCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      const ts = chart.timeScale();
      ctx.font = `${Math.round(10 * vr)}px sans-serif`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      const arrowR  = 4 * vr;
      const rowGap  = 15 * vr;
      const padding = 8 * hr;
      // Rightmost pixel already claimed in each stacked row, tracked
      // separately for above-bar (bearish) and below-bar (bullish) markers —
      // markers are processed in time order (left-to-right), so a marker
      // only needs to check earlier rows for its own side.
      const rowsAbove: number[] = [];
      const rowsBelow: number[] = [];
      for (const m of markers) {
        const idx = ts.timeToIndex(m.time, true);
        if (idx === null) continue;
        const xRaw = ts.logicalToCoordinate(idx as any);
        const yAnchorRaw = series.priceToCoordinate(m.anchorPrice);
        if (xRaw === null || yAnchorRaw === null) continue;
        const x = xRaw * hr;
        const yAnchor = yAnchorRaw * vr;
        const bullish = m.bias === "bullish";

        const textWidth = ctx.measureText(m.text).width;
        const groupLeft  = x - arrowR;
        const groupRight = x + arrowR + 4 * hr + textWidth + padding;

        const rows = bullish ? rowsBelow : rowsAbove;
        let row = 0;
        while (rows[row] !== undefined && groupLeft < rows[row]) row++;
        rows[row] = groupRight;

        const y = bullish ? yAnchor + 10 * vr + row * rowGap : yAnchor - 10 * vr - row * rowGap;

        ctx.fillStyle = bullish ? "#22c55e" : "#ef4444";
        ctx.beginPath();
        if (bullish) {
          ctx.moveTo(x, y - arrowR); ctx.lineTo(x - arrowR, y + arrowR); ctx.lineTo(x + arrowR, y + arrowR);
        } else {
          ctx.moveTo(x, y + arrowR); ctx.lineTo(x - arrowR, y - arrowR); ctx.lineTo(x + arrowR, y - arrowR);
        }
        ctx.closePath();
        ctx.fill();

        if (this._p._showLabels) {
          ctx.fillStyle = "#eab308";
          ctx.fillText(m.text, x + arrowR + 4 * hr, y);
        }
      }
    });
    } catch (_) { /* see comment above draw() — never let this take the chart down */ }
  }
}
class ReversalMarkerPaneView {
  _p: ReversalMarkerPrimitive;
  constructor(p: ReversalMarkerPrimitive) { this._p = p; }
  update() {}
  zOrder() { return "top" as const; }
  renderer() { return new ReversalMarkerRenderer(this._p); }
}
class ReversalMarkerPrimitive {
  _chart: any = null;
  _series: any = null;
  _markers: ReversalMarkerData[];
  _showLabels: boolean = true;
  _views: ReversalMarkerPaneView[] = [];
  constructor(markers: ReversalMarkerData[]) { this._markers = markers; }
  attached({ chart, series }: any) { this._chart = chart; this._series = series; this._views = [new ReversalMarkerPaneView(this)]; }
  detached() { this._chart = null; this._series = null; this._views = []; }
  updateAllViews() { this._views.forEach(v => v.update()); }
  paneViews() { return this._views; }
}

// ─── Manual drawing tools (trend line / ray / horizontal / rectangle / fib /
// gann fan / text) — the user-placed counterpart to the auto-computed
// TrendlinePrimitive above. One primitive holds every completed drawing plus
// at most one in-progress "pending" shape (the rubber-band preview between a
// tool's first click and the current cursor position). Point coordinates use
// the same timeToIndex/logicalToCoordinate + priceToCoordinate conversion
// every other primitive in this file uses, so behavior (including RTL/zoom)
// stays consistent with them.
type DrawPoint = StoredDrawPoint;
type Drawing = StoredDrawing;
type DrawTool = "cursor" | Drawing["kind"];
// p2 is only ever populated mid-placement of "fibext" (the one 3-point
// tool) — its 2nd click confirms the B anchor while still waiting on the
// 3rd (C); every other (2-point) tool goes straight from p1 to a completed
// drawing on its 2nd click and never touches p2 here.
interface PendingDrawing { kind: Exclude<DrawTool, "cursor">; p1: DrawPoint; p2?: DrawPoint; cursor: DrawPoint | null; }

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
// Fibonacci Extension — projects the A→B move's ratio from anchor C, the
// standard 3-point extension (as opposed to the 2-point retracement above).
const FIBEXT_LEVELS = [0, 0.382, 0.618, 1, 1.272, 1.618, 2, 2.618];
// Display name for a drawing's kind — used by the Layers panel.
const DRAWING_KIND_LABELS: Record<Drawing["kind"], string> = {
  trendline: "Trend Line", ray: "Ray", horizontal: "Horizontal Line", horizontalray: "Horizontal Ray",
  rectangle: "Rectangle", fib: "Fib Retracement", fibext: "Fib Extension", gann: "Gann Fan", text: "Text",
};
// Steepest (1/8) to shallowest (8/1) — order matters, the first/last entries
// bound the shaded wedge drawn behind the fan. Colors/labels match
// TradingView's default Gann Fan palette.
const GANN_RATIOS: { dxMul: number; dyMul: number; label: string; color: string }[] = [
  { dxMul: 1, dyMul: 8, label: "1/8", color: "#ffa726" },
  { dxMul: 1, dyMul: 4, label: "1/4", color: "#66bb6a" },
  { dxMul: 1, dyMul: 3, label: "1/3", color: "#26a69a" },
  { dxMul: 1, dyMul: 2, label: "1/2", color: "#26c6da" },
  { dxMul: 1, dyMul: 1, label: "1/1", color: "#42a5f5" },
  { dxMul: 2, dyMul: 1, label: "2/1", color: "#ab47bc" },
  { dxMul: 3, dyMul: 1, label: "3/1", color: "#d946a5" },
  { dxMul: 4, dyMul: 1, label: "4/1", color: "#ec4899" },
  { dxMul: 8, dyMul: 1, label: "8/1", color: "#ef5350" },
];

// Resolves a drawing's stored (time, price) point to a CSS-pixel coordinate.
// timeToIndex(time, true) CLAMPS a time outside the currently-loaded window
// onto the nearest edge bar rather than returning it — meaning a drawing
// made on one timeframe (e.g. a Gann fan's two points, an hour or so apart
// on 1H) can have every one of its points collapse onto that SAME single
// edge coordinate the moment you switch to a much finer timeframe whose
// loaded window (each timeframe loads a fixed candle count, so finer
// timeframes cover much less wall-clock time) doesn't reach back that far —
// the whole drawing then renders squashed to zero width at one edge,
// invisible in practice. Extrapolating past the clamp using the loaded
// data's own bar spacing keeps the point at its correct relative time
// position instead (even if that's off-screen, matching TradingView: an
// old drawing on a much finer timeframe may need scrolling back to see, but
// isn't geometrically broken). This is a no-op for an in-range point, since
// its resolved bar's own time already equals pt.time exactly.
function resolvePointCssXY(chart: any, series: any, pt: DrawPoint): { x: number; y: number } | null {
  const ts = chart.timeScale();
  const idx = ts.timeToIndex(pt.time as UTCTimestamp, true) as number | null;
  if (idx === null) return null;
  let xRaw = ts.logicalToCoordinate(idx as any);
  if (xRaw === null) return null;
  const idxTime = ts.coordinateToTime(xRaw) as number | null;
  if (idxTime !== null && idxTime !== pt.time) {
    const neighborIdx = idx === 0 ? idx + 1 : idx - 1;
    const neighborX = ts.logicalToCoordinate(neighborIdx as any);
    const neighborTime = neighborX !== null ? (ts.coordinateToTime(neighborX) as number | null) : null;
    if (neighborX !== null && neighborTime !== null && neighborTime !== idxTime) {
      const barSeconds = idx === 0 ? neighborTime - idxTime : idxTime - neighborTime;
      const pxPerBar   = idx === 0 ? neighborX - xRaw   : xRaw - neighborX;
      xRaw += ((pt.time - idxTime) / barSeconds) * pxPerBar;
    }
  }
  const yRaw = series.priceToCoordinate(pt.price);
  if (yRaw === null) return null;
  return { x: xRaw, y: yRaw };
}
function drawPointToXY(chart: any, series: any, hr: number, vr: number, pt: DrawPoint): { x: number; y: number } | null {
  const p = resolvePointCssXY(chart, series, pt);
  return p ? { x: p.x * hr, y: p.y * vr } : null;
}

// Extends a ray from (x1,y1) through (x2,y2) far enough to reach the pane's
// bitmap edge in whichever x-direction it's heading — canvas clips anything
// drawn past the edge automatically, so this only needs to overshoot, not
// clip precisely.
function rayEndpoint(x1: number, y1: number, x2: number, y2: number, w: number): { x: number; y: number } {
  const dx = x2 - x1, dy = y2 - y1;
  let t: number;
  if (dx > 0) t = (w + 50 - x1) / dx;
  else if (dx < 0) t = (-50 - x1) / dx;
  else t = 1e4;
  t = Math.max(1, t);
  return { x: x1 + dx * t, y: y1 + dy * t };
}

// CSS-pixel (not bitmap) coordinate conversion, for hit-testing against raw
// MouseEventParams.point values — logicalToCoordinate/priceToCoordinate
// already return media/CSS coordinates, so no pixel-ratio scaling here
// (contrast with drawPointToXY above, used inside the bitmap-space renderer).
function drawPointToCssXY(chart: any, series: any, pt: DrawPoint): { x: number; y: number } | null {
  return resolvePointCssXY(chart, series, pt);
}
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
// Rectangle/fib are hit-tested as "click anywhere in the bounding box" (matches
// how a filled rectangle reads to a user); trendline/ray/gann as distance to
// the p1->p2 baseline only — a ray or gann fan's extension past p2, and a
// gann fan's non-1x1 lines, aren't individually hit-tested, which is an
// acceptable v1 approximation since deleting removes the whole drawing anyway.
// Magnet mode — like TradingView's, pulls a placed point onto the nearest
// candle's O/H/L/C when the cursor is close to it. "Close" is judged in
// actual screen pixels against that O/H/L/C's real (time, price) position —
// not just "closest of the 4 values of whatever bar is under the cursor's
// x" — so it also searches the couple of neighboring bars and can pull both
// the time and the price onto the snapped point, the way a magnet actually
// grabs the nearest point rather than only the nearest value on one axis.
// Returns null (no snap) when nothing is within range, so the caller falls
// back to the raw cursor position.
const MAGNET_SNAP_PX = 18;
function findMagnetSnap(chart: any, series: any, mouseX: number, mouseY: number, rows: RawCandleTf[]): DrawPoint | null {
  const ts = chart.timeScale();
  const centerLogical = ts.coordinateToLogical(mouseX);
  if (centerLogical === null) return null;
  const centerIdx = Math.round(centerLogical as number);
  let best: DrawPoint | null = null;
  let bestDist = MAGNET_SNAP_PX;
  for (let idx = centerIdx - 3; idx <= centerIdx + 3; idx++) {
    const r = rows[idx];
    if (!r) continue;
    const x = ts.logicalToCoordinate(idx as any);
    if (x === null) continue;
    for (const price of [r.open, r.high, r.low, r.close]) {
      const y = series.priceToCoordinate(price);
      if (y === null) continue;
      const dist = Math.hypot(mouseX - x, mouseY - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = { time: Math.floor(new Date(r.timestamp).getTime() / 1000), price };
      }
    }
  }
  return best;
}

function hitTestDrawing(chart: any, series: any, d: Drawing, px: number, py: number): boolean {
  const a = drawPointToCssXY(chart, series, d.p1);
  if (!a) return false;
  const THRESH = 6;
  if (d.kind === "horizontal") return Math.abs(py - a.y) <= THRESH;
  if (d.kind === "horizontalray") return Math.abs(py - a.y) <= THRESH && px >= a.x - THRESH;
  if (d.kind === "text") return Math.hypot(px - a.x, py - a.y) <= 14;
  const b = d.p2 ? drawPointToCssXY(chart, series, d.p2) : null;
  if (!b) return false;
  if (d.kind === "fibext") {
    const c = d.p3 ? drawPointToCssXY(chart, series, d.p3) : null;
    if (!c) return distToSegment(px, py, a.x, a.y, b.x, b.y) <= THRESH;
    // No upper x bound — like fib below, every level extends right to the
    // pane edge. y-bounds cover the full projected range across
    // FIBEXT_LEVELS (up to 2.618x), not just the three anchors' own
    // y-range — the deep extension levels render well outside that range,
    // and clicking on them (the whole point of this drawing) was missing
    // the hitbox entirely.
    const priceAt0   = d.p3!.price;
    const priceAtMax = d.p3!.price + (d.p2!.price - d.p1.price) * FIBEXT_LEVELS[FIBEXT_LEVELS.length - 1];
    const y0 = series.priceToCoordinate(priceAt0);
    const yMax = series.priceToCoordinate(priceAtMax);
    if (y0 === null || yMax === null) return false;
    return px >= Math.min(a.x, b.x, c.x) - THRESH
        && py >= Math.min(y0, yMax) - THRESH && py <= Math.max(y0, yMax) + THRESH;
  }
  if (d.kind === "rectangle") {
    return px >= Math.min(a.x, b.x) - THRESH && px <= Math.max(a.x, b.x) + THRESH
        && py >= Math.min(a.y, b.y) - THRESH && py <= Math.max(a.y, b.y) + THRESH;
  }
  if (d.kind === "fib") {
    // No upper x bound — the levels extend right to the pane edge (like a
    // horizontal ray), not just to the later of the two anchor points.
    return px >= Math.min(a.x, b.x) - THRESH && py >= Math.min(a.y, b.y) - THRESH && py <= Math.max(a.y, b.y) + THRESH;
  }
  return distToSegment(px, py, a.x, a.y, b.x, b.y) <= THRESH;
}

// Any drawing's actual stored anchor point(s) — p1 always, p2/p3 when
// present — as opposed to hitTestRectHandle's derived midpoint handles.
// Used both to let the user drag a point to re-anchor a drawing after the
// fact, and (implicitly, via the same coordinates) for the always/selected
// anchor dots already drawn in DrawingRenderer.
type AnchorKey = "p1" | "p2" | "p3";
function hitTestAnchorPoint(chart: any, series: any, d: Drawing, px: number, py: number): AnchorKey | null {
  const THRESH = 8;
  for (const key of ["p1", "p2", "p3"] as const) {
    const pt = d[key];
    if (!pt) continue;
    const xy = drawPointToCssXY(chart, series, pt);
    if (!xy) continue;
    if (Math.hypot(px - xy.x, py - xy.y) <= THRESH) return key;
  }
  return null;
}

// Rectangle resize — 4 edge-midpoint handles (top/bottom move only the price
// of whichever corner is currently higher/lower, left/right move only the
// time of whichever corner is currently earlier/later), shown only while the
// rectangle is selected. CSS-pixel space throughout, same as hitTestDrawing.
type RectHandle = "top" | "bottom" | "left" | "right";
// Keeps opposite handles at least MIN_HALF px apart from center even when
// the box has near-zero width/height — e.g. drawing a rectangle by snapping
// to a candle's high then its low naturally puts both points at the same
// time, collapsing width to 0. Without this, "left" and "right" (or
// "top"/"bottom") would render and hit-test at the exact same pixel, making
// one of them permanently ungrabbable. Grabbing the handle still starts the
// drag from wherever the mouse actually is, so this only affects where the
// handle sits when idle, not how far you can drag it.
const RECT_HANDLE_MIN_HALF = 6;
function rectHandlePositions(a: { x: number; y: number }, b: { x: number; y: number }): Record<RectHandle, { x: number; y: number }> {
  const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
  const halfW = Math.max(Math.abs(a.x - b.x) / 2, RECT_HANDLE_MIN_HALF);
  const halfH = Math.max(Math.abs(a.y - b.y) / 2, RECT_HANDLE_MIN_HALF);
  return {
    top:    { x: midX, y: midY - halfH },
    bottom: { x: midX, y: midY + halfH },
    left:   { x: midX - halfW, y: midY },
    right:  { x: midX + halfW, y: midY },
  };
}
function hitTestRectHandle(chart: any, series: any, d: Drawing, px: number, py: number): RectHandle | null {
  if (d.kind !== "rectangle" || !d.p2) return null;
  const a = drawPointToCssXY(chart, series, d.p1);
  const b = drawPointToCssXY(chart, series, d.p2);
  if (!a || !b) return null;
  const handles = rectHandlePositions(a, b);
  for (const key of ["top", "bottom", "left", "right"] as const) {
    if (Math.hypot(px - handles[key].x, py - handles[key].y) <= 8) return key;
  }
  return null;
}

class DrawingRenderer {
  _p: DrawingPrimitive;
  constructor(p: DrawingPrimitive) { this._p = p; }
  draw(target: any) {
    const chart  = this._p._chart;
    const series = this._p._series;
    if (!chart || !series) return;
    // Same reasoning as ReversalMarkerRenderer above — a stale reference
    // mid-teardown must never be able to throw its way into blanking the
    // whole chart's render loop.
    try {
      target.useBitmapCoordinateSpace((scope: any) => {
        const ctx = scope.context;
        const hr = scope.horizontalPixelRatio;
        const vr = scope.verticalPixelRatio;
        const w  = scope.bitmapSize.width;
        ctx.font = `${Math.round(10 * vr)}px sans-serif`;
        ctx.textBaseline = "middle";
        ctx.lineWidth = 1.5 * vr;

        const shapes: { d: Drawing; selected: boolean }[] =
          this._p._drawings.filter(d => !d.hidden).map(d => ({ d, selected: d.id === this._p._selectedId }));
        if (this._p._pending && this._p._pending.cursor) {
          const pend = this._p._pending;
          // fibext is the only 3-click tool: pend.p2 set means B is already
          // confirmed and cursor is previewing C; otherwise cursor is still
          // previewing B itself, same shape every other 2-point tool takes.
          const previewShape: Drawing = pend.p2
            ? { id: "__pending__", kind: pend.kind, p1: pend.p1, p2: pend.p2, p3: pend.cursor!, color: "#eab308" }
            : { id: "__pending__", kind: pend.kind, p1: pend.p1, p2: pend.cursor!, color: "#eab308" };
          shapes.push({ d: previewShape, selected: false });
        }

        for (const { d, selected } of shapes) {
          const a = drawPointToXY(chart, series, hr, vr, d.p1);
          if (!a) continue;
          const b = d.p2 ? drawPointToXY(chart, series, hr, vr, d.p2) : null;
          ctx.strokeStyle = d.color;
          ctx.fillStyle = d.color;

          if (d.kind === "horizontal") {
            ctx.beginPath(); ctx.moveTo(0, a.y); ctx.lineTo(w, a.y); ctx.stroke();
            ctx.textAlign = "right";
            ctx.fillText(formatPrice(d.p1.price, decimalsForPair(this._p._pair, d.p1.price)), w - 6 * hr, a.y - 8 * vr);
          } else if (d.kind === "horizontalray") {
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(w, a.y); ctx.stroke();
            ctx.textAlign = "right";
            ctx.fillText(formatPrice(d.p1.price, decimalsForPair(this._p._pair, d.p1.price)), w - 6 * hr, a.y - 8 * vr);
          } else if (d.kind === "text") {
            ctx.textAlign = "left";
            ctx.fillText(d.text ?? "", a.x + 4 * hr, a.y);
          } else if (b) {
            if (d.kind === "trendline") {
              ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            } else if (d.kind === "ray") {
              const end = rayEndpoint(a.x, a.y, b.x, b.y, w);
              ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(end.x, end.y); ctx.stroke();
            } else if (d.kind === "rectangle") {
              const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
              const rw = Math.abs(b.x - a.x), rh = Math.abs(b.y - a.y);
              ctx.globalAlpha = 0.12; ctx.fillRect(x, y, rw, rh); ctx.globalAlpha = 1;
              ctx.strokeRect(x, y, rw, rh);
              // Dashed midpoint line — same convention as the auto zone
              // boxes' midLine (see TimeRangeBoxRenderer above).
              const yMid = y + rh / 2;
              ctx.save();
              ctx.setLineDash([4 * hr, 3 * hr]);
              ctx.beginPath();
              ctx.moveTo(x, yMid);
              ctx.lineTo(x + rw, yMid);
              ctx.stroke();
              ctx.restore();
            } else if (d.kind === "fib") {
              // Extends right to the pane edge (like a horizontal ray),
              // rather than stopping at the later of the two anchor points.
              const x0 = Math.min(a.x, b.x);
              ctx.textAlign = "right";
              for (let i = 0; i < FIB_LEVELS.length; i++) {
                const ratio = FIB_LEVELS[i];
                const price = d.p1.price + (d.p2!.price - d.p1.price) * ratio;
                const y = (series.priceToCoordinate(price) ?? 0) * vr;
                ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(w, y); ctx.stroke();
                ctx.fillText(`Fib ${ratio.toFixed(3)}  ${formatPrice(price, decimalsForPair(this._p._pair, price))}`, w - 6 * hr, y - 8 * vr);
              }
            } else if (d.kind === "gann") {
              const rays = GANN_RATIOS.map(g => {
                const dx = (b.x - a.x) * g.dxMul;
                const dy = (b.y - a.y) * g.dyMul;
                return { ...g, end: rayEndpoint(a.x, a.y, a.x + dx, a.y + dy, w) };
              });
              for (const g of rays) {
                ctx.strokeStyle = g.color;
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(g.end.x, g.end.y); ctx.stroke();

                // Label pinned to the pane's right edge — same idea as the
                // auto trend line labels, so it's always visible regardless
                // of how far you've scrolled from the anchor — found by
                // walking the ray from the anchor to wherever it crosses
                // x = (right edge inset), not g.end itself (rayEndpoint
                // overshoots ~50px past the edge so canvas clipping doesn't
                // cut off the line, which would clip the label too).
                // Only applies to a rightward-heading ray (the common case,
                // and the only one "the right edge" means anything for) —
                // a ray dragged toward the left falls back to sitting a
                // fixed distance out from the anchor instead.
                const rdx = g.end.x - a.x, rdy = g.end.y - a.y;
                let lx: number, ly: number;
                if (rdx > 0) {
                  const tEdge = (w - 6 * hr - a.x) / rdx;
                  lx = a.x + rdx * tEdge;
                  ly = a.y + rdy * tEdge;
                  ctx.textAlign = "right";
                } else {
                  const segLen = Math.hypot(rdx, rdy) || 1;
                  const t = Math.min(1, (90 * hr) / segLen);
                  lx = a.x + rdx * t;
                  ly = a.y + rdy * t;
                  ctx.textAlign = "center";
                }
                let angle = Math.atan2(g.end.y - a.y, g.end.x - a.x);
                if (angle > Math.PI / 2) angle -= Math.PI;
                else if (angle < -Math.PI / 2) angle += Math.PI;
                ctx.save();
                ctx.translate(lx, ly - 6 * vr);
                ctx.rotate(angle);
                ctx.fillStyle = g.color;
                ctx.fillText(g.label, 0, 0);
                ctx.restore();
              }
            } else if (d.kind === "fibext") {
              const c = d.p3 ? drawPointToXY(chart, series, hr, vr, d.p3) : null;
              if (!c) {
                // Still choosing B (C not placed yet) — just preview the A→B leg.
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
              } else {
                // Construction zigzag A→B→C, then the projected levels.
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.stroke();
                const x0 = Math.min(a.x, b.x, c.x);
                ctx.textAlign = "right";
                for (const ratio of FIBEXT_LEVELS) {
                  const price = d.p3!.price + (d.p2!.price - d.p1.price) * ratio;
                  const y = (series.priceToCoordinate(price) ?? 0) * vr;
                  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(w, y); ctx.stroke();
                  ctx.fillText(`Fib Ext ${(ratio * 100).toFixed(1)}%  ${formatPrice(price, decimalsForPair(this._p._pair, price))}`, w - 6 * hr, y - 8 * vr);
                }
              }
            }
          }

          // Trend line / ray / horizontal ray anchor points stay visible all
          // the time (not just while selected) so you can see exactly where
          // they're pinned — in the drawing's own color, small; selection
          // still gets its own bigger yellow dot on top so it's clear which
          // one is picked.
          const alwaysAnchored = d.kind === "trendline" || d.kind === "ray" || d.kind === "horizontalray";
          if (alwaysAnchored && !selected) {
            ctx.fillStyle = d.color;
            for (const pt of [a, b].filter((v): v is { x: number; y: number } => !!v)) {
              ctx.beginPath(); ctx.arc(pt.x, pt.y, 2.5 * vr, 0, Math.PI * 2); ctx.fill();
            }
          }
          if (selected) {
            // A rectangle is stored as two OPPOSITE corners (p1, p2) — dot
            // just those and the other two corners look unmarked, like the
            // selection is missing a corner. Dot all 4 actual corners of
            // the bounding box instead; fibext gets all 3 of its real
            // anchors (A/B/C); every other kind just gets its real point(s).
            const c = d.kind === "fibext" && d.p3 ? drawPointToXY(chart, series, hr, vr, d.p3) : null;
            const corners = d.kind === "rectangle" && b
              ? [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: a.x, y: b.y }, { x: b.x, y: b.y }]
              : [a, b, c].filter((v): v is { x: number; y: number } => !!v);
            ctx.fillStyle = "#eab308";
            for (const pt of corners) {
              ctx.beginPath(); ctx.arc(pt.x, pt.y, 3.5 * vr, 0, Math.PI * 2); ctx.fill();
            }
          }
          // Rectangle resize handles — square (vs. the round anchor/corner
          // dots) so they read as "drag to resize" rather than "vertex".
          if (selected && d.kind === "rectangle" && b) {
            const handles = rectHandlePositions(a, b);
            ctx.fillStyle = "#eab308";
            ctx.strokeStyle = "#0f1117";
            ctx.lineWidth = 1 * vr;
            const s = 3 * vr;
            for (const key of ["top", "bottom", "left", "right"] as const) {
              const p = handles[key];
              ctx.fillRect(p.x - s, p.y - s, s * 2, s * 2);
              ctx.strokeRect(p.x - s, p.y - s, s * 2, s * 2);
            }
          }
        }
      });
    } catch (_) { /* see comment above — never let a stale reference blank the chart */ }
  }
}
class DrawingPaneView {
  _p: DrawingPrimitive;
  constructor(p: DrawingPrimitive) { this._p = p; }
  update() {}
  zOrder() { return "top" as const; }
  renderer() { return new DrawingRenderer(this._p); }
}
class DrawingPrimitive {
  _chart: any = null;
  _series: any = null;
  _drawings: Drawing[];
  _selectedId: string | null = null;
  _pending: PendingDrawing | null = null;
  // Which instrument this chart is currently showing — DrawingRenderer
  // lives at module scope (no access to the component's pairRef), so this
  // is how it knows the right decimal precision (decimalsForPair) for
  // price labels instead of a hardcoded guess.
  _pair: string;
  _views: DrawingPaneView[] = [];
  constructor(drawings: Drawing[], pair: string) { this._drawings = drawings; this._pair = pair; }
  attached({ chart, series }: any) { this._chart = chart; this._series = series; this._views = [new DrawingPaneView(this)]; }
  detached() { this._chart = null; this._series = null; this._views = []; }
  updateAllViews() { this._views.forEach(v => v.update()); }
  paneViews() { return this._views; }
}

// ─── Economic news event lines ────────────────────────────────────────────────
// Vertical markers at the exact release time of selected economic-calendar
// event types — reuses the same calendarEvents already fetched for the
// Economic Calendar panel (one data source, no duplicate fetch/pipeline),
// filtered to whichever categories are enabled and to the charted pair's
// own two currencies.
type NewsCategoryKey =
  | "fomc" | "sep" | "fomc_presser" | "fomc_minutes"
  | "cpi" | "pce" | "jobs" | "gdp" | "ism" | "jolts" | "retail_sales" | "ppi" | "jobless_claims"
  | "auction";
type NewsCategoryGroup = "Monetary Policy" | "Inflation / Growth / Labor" | "Bond Market";
interface NewsCategoryDef { key: NewsCategoryKey; label: string; color: string; group: NewsCategoryGroup; keywords: string[] }
// Grouped to match the News settings popout's layout: a section header per
// group, categories listed underneath. fomc/cpi/jobs keep real keyword
// matching (used by the non-USD live-feed leg below); every other new
// category here is drawn by the separate SIMPLE_CATEGORY_DEFS pool-scan
// further down, which doesn't go through eventNewsCategory at all — their
// keywords stay empty, same reasoning as "auction" already had.
// Color is per-group, not per-category, so every marker's color on the
// chart tells you which group it belongs to at a glance: Monetary Policy
// red, Inflation/Growth/Labor yellow, Bond Market green.
const GROUP_COLORS: Record<NewsCategoryGroup, string> = {
  "Monetary Policy": "#ef4444",
  "Inflation / Growth / Labor": "#eab308",
  "Bond Market": "#10b981",
};
const NEWS_CATEGORY_DEFS: NewsCategoryDef[] = [
  { key: "fomc", label: "FOMC", color: GROUP_COLORS["Monetary Policy"], group: "Monetary Policy",
    keywords: ["fomc statement", "fomc press conference", "fomc meeting minutes", "federal funds rate"] },
  { key: "sep", label: "SEP / Dot Plot", color: GROUP_COLORS["Monetary Policy"], group: "Monetary Policy", keywords: [] },
  { key: "fomc_presser", label: "Fed Chair Press Conference", color: GROUP_COLORS["Monetary Policy"], group: "Monetary Policy", keywords: [] },
  { key: "fomc_minutes", label: "FOMC Minutes", color: GROUP_COLORS["Monetary Policy"], group: "Monetary Policy", keywords: [] },
  { key: "cpi", label: "CPI", color: GROUP_COLORS["Inflation / Growth / Labor"], group: "Inflation / Growth / Labor",
    keywords: ["cpi m/m", "cpi y/y", "core cpi m/m", "core cpi y/y", "cpi q/q"] },
  { key: "pce", label: "PCE / Core PCE", color: GROUP_COLORS["Inflation / Growth / Labor"], group: "Inflation / Growth / Labor", keywords: [] },
  { key: "jobs", label: "Jobs / NFP", color: GROUP_COLORS["Inflation / Growth / Labor"], group: "Inflation / Growth / Labor",
    keywords: ["non-farm employment change", "unemployment rate", "average hourly earnings", "employment change"] },
  { key: "gdp", label: "GDP", color: GROUP_COLORS["Inflation / Growth / Labor"], group: "Inflation / Growth / Labor", keywords: [] },
  { key: "ism", label: "ISM Manufacturing / Services", color: GROUP_COLORS["Inflation / Growth / Labor"], group: "Inflation / Growth / Labor", keywords: [] },
  { key: "jolts", label: "JOLTS", color: GROUP_COLORS["Inflation / Growth / Labor"], group: "Inflation / Growth / Labor", keywords: [] },
  { key: "retail_sales", label: "Retail Sales", color: GROUP_COLORS["Inflation / Growth / Labor"], group: "Inflation / Growth / Labor", keywords: [] },
  { key: "ppi", label: "PPI", color: GROUP_COLORS["Inflation / Growth / Labor"], group: "Inflation / Growth / Labor", keywords: [] },
  { key: "jobless_claims", label: "Initial Jobless Claims", color: GROUP_COLORS["Inflation / Growth / Labor"], group: "Inflation / Growth / Labor", keywords: [] },
  { key: "auction", label: "10Y/30Y Auction", color: GROUP_COLORS["Bond Market"], group: "Bond Market", keywords: [] },
];
// Which currencies' news are relevant to a given instrument. A genuine
// forex-style pair ("EUR/USD") is relevant to both of its own two
// currencies, same as before. Everything else this app lists — US indices
// (US30/US100/US500), USOIL, US stocks, US ETFs, and USD-quoted commodities/
// crypto (XAU/USD, BTC/USD, …) — is a USD-market instrument with no second
// currency of its own, so splitting the raw symbol on "/" either produces
// nothing that matches a real country code (leaving indices/stocks with no
// news at all, including the USD releases that actually move them) or, for
// XAU/BTC-style pairs, a harmless-but-meaningless non-USD "currency" that
// never matches anything. Falling back to USD-only for every non-forex
// instrument fixes both: relevant USD news (FOMC/CPI/Jobs) now shows on
// indices, and no unrelated foreign country's news gets pulled in.
function relevantNewsCurrencies(pair: string): string[] {
  const parts = pair.split("/").map(c => c.toUpperCase());
  return parts.length === 2 ? parts : ["USD"];
}
// The live calendar feed (ff_calendar_thisweek.json) only ever has the
// current Sun-Sat window — no historical archive endpoint exists (confirmed:
// every "lastweek"/date-range variant 404s). So all three US-release
// categories below get their own small reference tables instead, sourced
// from BLS/Fed's own published release archives, letting News plot across
// loaded chart history instead of only whatever happens to fall in the
// feed's current week. FOMC covers 2023–2026 (the Fed publishes its meeting
// calendar years ahead, easy to source reliably); CPI and Jobs Reports are
// deliberately scoped to 2025–2026 only — BLS's schedule pages block
// automated fetching, and reconstructing exact historical monthly dates by
// hand further back risks getting them wrong (these releases shift for
// holidays and, as 2025 showed, government shutdowns — e.g. the Oct 2025
// CPI was canceled outright, and the Sep/Oct/Nov 2025 jobs reports were
// delayed and partly merged). A wrong date here is worse than a missing
// one. All at 14:00 ET (FOMC) / 8:30 ET (CPI, Jobs).
const FOMC_STATEMENT_DATES: string[] = [
  "2023-02-01T14:00:00-05:00", "2023-03-22T14:00:00-04:00", "2023-05-03T14:00:00-04:00",
  "2023-06-14T14:00:00-04:00", "2023-07-26T14:00:00-04:00", "2023-09-20T14:00:00-04:00",
  "2023-11-01T14:00:00-04:00", "2023-12-13T14:00:00-05:00",
  "2024-01-31T14:00:00-05:00", "2024-03-20T14:00:00-04:00", "2024-05-01T14:00:00-04:00",
  "2024-06-12T14:00:00-04:00", "2024-07-31T14:00:00-04:00", "2024-09-18T14:00:00-04:00",
  "2024-11-07T14:00:00-05:00", "2024-12-18T14:00:00-05:00",
  "2025-01-29T14:00:00-05:00", "2025-03-19T14:00:00-04:00", "2025-05-07T14:00:00-04:00",
  "2025-06-18T14:00:00-04:00", "2025-07-30T14:00:00-04:00", "2025-09-17T14:00:00-04:00",
  "2025-10-29T14:00:00-04:00", "2025-12-10T14:00:00-05:00",
  "2026-01-28T14:00:00-05:00", "2026-03-18T14:00:00-04:00", "2026-04-29T14:00:00-04:00",
  "2026-06-17T14:00:00-04:00", "2026-07-29T14:00:00-04:00", "2026-09-16T14:00:00-04:00",
  "2026-10-28T14:00:00-04:00", "2026-12-09T14:00:00-05:00",
];

// Real Fed Funds target range actual/previous per meeting — used only as a
// fallback when neither the live feed nor persisted history has a real
// matching "Federal Funds Rate" event (every meeting before this feature
// started polling). Computed from FRED's daily DFEDTARU/DFEDTARL series
// (target range upper/lower limit), sampled a few days on either side of
// each meeting date to land on the correct pre/post-meeting constant value
// regardless of the series' own reporting lag around the exact decision
// date. No forecast: FRED has no consensus-estimate data, so this never
// drives a "vs forecast" surprise — only the real decision (hold/cut/hike),
// which interpretFomc already derives from actual vs previous alone.
// Source: https://fred.stlouisfed.org/series/DFEDTARU and DFEDTARL.
const FOMC_FRED_ACTUALS: { date: string; actual: string; previous: string }[] = [
  { date: "2023-02-01", actual: "4.50%-4.75%", previous: "4.25%-4.50%" },
  { date: "2023-03-22", actual: "4.75%-5.00%", previous: "4.50%-4.75%" },
  { date: "2023-05-03", actual: "5.00%-5.25%", previous: "4.75%-5.00%" },
  { date: "2023-06-14", actual: "5.00%-5.25%", previous: "5.00%-5.25%" },
  { date: "2023-07-26", actual: "5.25%-5.50%", previous: "5.00%-5.25%" },
  { date: "2023-09-20", actual: "5.25%-5.50%", previous: "5.25%-5.50%" },
  { date: "2023-11-01", actual: "5.25%-5.50%", previous: "5.25%-5.50%" },
  { date: "2023-12-13", actual: "5.25%-5.50%", previous: "5.25%-5.50%" },
  { date: "2024-01-31", actual: "5.25%-5.50%", previous: "5.25%-5.50%" },
  { date: "2024-03-20", actual: "5.25%-5.50%", previous: "5.25%-5.50%" },
  { date: "2024-05-01", actual: "5.25%-5.50%", previous: "5.25%-5.50%" },
  { date: "2024-06-12", actual: "5.25%-5.50%", previous: "5.25%-5.50%" },
  { date: "2024-07-31", actual: "5.25%-5.50%", previous: "5.25%-5.50%" },
  { date: "2024-09-18", actual: "4.75%-5.00%", previous: "5.25%-5.50%" },
  { date: "2024-11-07", actual: "4.50%-4.75%", previous: "4.75%-5.00%" },
  { date: "2024-12-18", actual: "4.25%-4.50%", previous: "4.50%-4.75%" },
  { date: "2025-01-29", actual: "4.25%-4.50%", previous: "4.25%-4.50%" },
  { date: "2025-03-19", actual: "4.25%-4.50%", previous: "4.25%-4.50%" },
  { date: "2025-05-07", actual: "4.25%-4.50%", previous: "4.25%-4.50%" },
  { date: "2025-06-18", actual: "4.25%-4.50%", previous: "4.25%-4.50%" },
  { date: "2025-07-30", actual: "4.25%-4.50%", previous: "4.25%-4.50%" },
  { date: "2025-09-17", actual: "4.00%-4.25%", previous: "4.25%-4.50%" },
  { date: "2025-10-29", actual: "3.75%-4.00%", previous: "4.00%-4.25%" },
  { date: "2025-12-10", actual: "3.50%-3.75%", previous: "3.75%-4.00%" },
  { date: "2026-01-28", actual: "3.50%-3.75%", previous: "3.50%-3.75%" },
  { date: "2026-03-18", actual: "3.50%-3.75%", previous: "3.50%-3.75%" },
  { date: "2026-04-29", actual: "3.50%-3.75%", previous: "3.50%-3.75%" },
  { date: "2026-06-17", actual: "3.50%-3.75%", previous: "3.50%-3.75%" },
  { date: "2026-07-29", actual: "3.50%-3.75%", previous: "3.50%-3.75%" },
];
function fomcFredFallback(dateIso: string): EventDetail | null {
  const row = FOMC_FRED_ACTUALS.find(r => r.date === dateIso.slice(0, 10));
  if (!row) return null;
  return interpretFomc({ title: "Federal Funds Rate", country: "USD", date: dateIso, impact: "High", forecast: "", previous: row.previous, actual: row.actual });
}

// FOMC Minutes — released 3 weeks after each meeting (always a Wednesday at
// 2pm ET, shifted a day earlier the few times that Wednesday would've
// landed on/next to Thanksgiving or New Year's Eve — both real, confirmed
// exceptions, not a fixed-offset guess). meetingDate ties each release back
// to the meeting it's the minutes OF, so the popup can reuse that meeting's
// real decision (via interpretFomc/fomcFredFallback) instead of showing
// nothing — minutes aren't their own numeric data release. Only includes
// meetings that have actually happened; a future meeting has no minutes
// date yet because none has been decided or scheduled.
// Source: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
const FOMC_MINUTES_DATES: { meetingDate: string; minutesDate: string }[] = [
  { meetingDate: "2023-02-01", minutesDate: "2023-02-22T14:00:00-05:00" },
  { meetingDate: "2023-03-22", minutesDate: "2023-04-12T14:00:00-04:00" },
  { meetingDate: "2023-05-03", minutesDate: "2023-05-24T14:00:00-04:00" },
  { meetingDate: "2023-06-14", minutesDate: "2023-07-05T14:00:00-04:00" },
  { meetingDate: "2023-07-26", minutesDate: "2023-08-16T14:00:00-04:00" },
  { meetingDate: "2023-09-20", minutesDate: "2023-10-11T14:00:00-04:00" },
  { meetingDate: "2023-11-01", minutesDate: "2023-11-21T14:00:00-05:00" },
  { meetingDate: "2023-12-13", minutesDate: "2024-01-03T14:00:00-05:00" },
  { meetingDate: "2024-01-31", minutesDate: "2024-02-21T14:00:00-05:00" },
  { meetingDate: "2024-03-20", minutesDate: "2024-04-10T14:00:00-04:00" },
  { meetingDate: "2024-05-01", minutesDate: "2024-05-22T14:00:00-04:00" },
  { meetingDate: "2024-06-12", minutesDate: "2024-07-03T14:00:00-04:00" },
  { meetingDate: "2024-07-31", minutesDate: "2024-08-21T14:00:00-04:00" },
  { meetingDate: "2024-09-18", minutesDate: "2024-10-09T14:00:00-04:00" },
  { meetingDate: "2024-11-07", minutesDate: "2024-11-26T14:00:00-05:00" },
  { meetingDate: "2024-12-18", minutesDate: "2025-01-08T14:00:00-05:00" },
  { meetingDate: "2025-01-29", minutesDate: "2025-02-19T14:00:00-05:00" },
  { meetingDate: "2025-03-19", minutesDate: "2025-04-09T14:00:00-04:00" },
  { meetingDate: "2025-05-07", minutesDate: "2025-05-28T14:00:00-04:00" },
  { meetingDate: "2025-06-18", minutesDate: "2025-07-09T14:00:00-04:00" },
  { meetingDate: "2025-07-30", minutesDate: "2025-08-20T14:00:00-04:00" },
  { meetingDate: "2025-09-17", minutesDate: "2025-10-08T14:00:00-04:00" },
  { meetingDate: "2025-10-29", minutesDate: "2025-11-19T14:00:00-05:00" },
  { meetingDate: "2025-12-10", minutesDate: "2025-12-30T14:00:00-05:00" },
  { meetingDate: "2026-01-28", minutesDate: "2026-02-18T14:00:00-05:00" },
  { meetingDate: "2026-03-18", minutesDate: "2026-04-08T14:00:00-04:00" },
  { meetingDate: "2026-04-29", minutesDate: "2026-05-20T14:00:00-04:00" },
  { meetingDate: "2026-06-17", minutesDate: "2026-07-08T14:00:00-04:00" },
  { meetingDate: "2026-07-29", minutesDate: "2026-08-19T14:00:00-04:00" },
];

// Summary of Economic Projections (dot plot) — only released at the four
// quarterly FOMC meetings (Mar/Jun/Sep/Dec), never every meeting. No free
// structured API publishes this directly (the Fed only releases it as a
// PDF table); these are the real published median federal-funds-rate
// projections per meeting, pulled from the St. Louis Fed's ALFRED vintage
// system — FRED series FEDTARMD (yearly path) and FEDTARMDLR (longer run),
// queried per meeting's vintage_date, e.g.:
// https://alfred.stlouisfed.org/graph/alfredgraph.csv?id=FEDTARMD&vintage_date=2025-12-10
// Not every meeting is present — only the ones actually verified against
// ALFRED. A meeting missing here just means no SEP section is shown; it's
// never inferred or estimated. Add newer meetings here once ALFRED has
// published that vintage (typically within a day or two of the release).
const SEP_PROJECTIONS: { date: string; projections: Record<string, number> }[] = [
  { date: "2023-03-22", projections: { "2023": 5.1, "2024": 4.3, "2025": 3.1, longerRun: 2.5 } },
  { date: "2023-06-14", projections: { "2023": 5.6, "2024": 4.6, "2025": 3.4, longerRun: 2.5 } },
  { date: "2023-09-20", projections: { "2023": 5.6, "2024": 5.1, "2025": 3.9, "2026": 2.9, longerRun: 2.5 } },
  { date: "2023-12-13", projections: { "2023": 5.4, "2024": 4.6, "2025": 3.6, "2026": 2.9, longerRun: 2.5 } },
  { date: "2024-03-20", projections: { "2024": 4.6, "2025": 3.9, "2026": 3.1, longerRun: 2.6 } },
  { date: "2024-06-12", projections: { "2024": 5.1, "2025": 4.1, "2026": 3.1, longerRun: 2.8 } },
  { date: "2024-09-18", projections: { "2024": 4.4, "2025": 3.4, "2026": 2.9, "2027": 2.9, longerRun: 2.9 } },
  { date: "2024-12-18", projections: { "2024": 4.4, "2025": 3.9, "2026": 3.4, "2027": 3.1, longerRun: 3.0 } },
  { date: "2025-03-19", projections: { "2025": 3.9, "2026": 3.4, "2027": 3.1, longerRun: 3.0 } },
  { date: "2025-06-18", projections: { "2025": 3.9, "2026": 3.6, "2027": 3.4, longerRun: 3.0 } },
  { date: "2025-09-17", projections: { "2025": 3.6, "2026": 3.4, "2027": 3.1, "2028": 3.1, longerRun: 3.0 } },
  { date: "2025-12-10", projections: { "2025": 3.6, "2026": 3.4, "2027": 3.1, "2028": 3.1, longerRun: 3.0 } },
  { date: "2026-03-18", projections: { "2026": 3.4, "2027": 3.1, "2028": 3.1, longerRun: 3.1 } },
  { date: "2026-06-17", projections: { "2026": 3.8, "2027": 3.6, "2028": 3.4, longerRun: 3.1 } },
];
// Consumer Price Index — released ~8:30 ET, generally the second week of
// the month covering the prior month's data. No entry for October 2025:
// that release was canceled outright by the government shutdown, not
// merely delayed, so there is genuinely nothing to plot there. Source:
// bls.gov CPI archive (news.release/archives/cpi_MMDDYYYY.htm) and
// usinflationcalculator.com's published 2025–2026 schedule.
const CPI_RELEASE_DATES: string[] = [
  "2025-01-15T08:30:00-05:00", "2025-02-12T08:30:00-05:00", "2025-03-12T08:30:00-04:00",
  "2025-04-10T08:30:00-04:00", "2025-05-13T08:30:00-04:00", "2025-06-11T08:30:00-04:00",
  "2025-07-15T08:30:00-04:00", "2025-08-12T08:30:00-04:00", "2025-09-11T08:30:00-04:00",
  "2025-10-24T08:30:00-04:00", /* Oct 2025 CPI: canceled, no release */
  "2025-12-18T08:30:00-05:00",
  "2026-01-13T08:30:00-05:00", "2026-02-13T08:30:00-05:00", "2026-03-11T08:30:00-05:00",
  "2026-04-10T08:30:00-04:00", "2026-05-12T08:30:00-04:00", "2026-06-10T08:30:00-04:00",
  "2026-07-14T08:30:00-04:00", "2026-08-12T08:30:00-04:00", "2026-09-11T08:30:00-04:00",
  "2026-10-14T08:30:00-04:00", "2026-11-10T08:30:00-05:00", "2026-12-10T08:30:00-05:00",
];

// Real historical CPI y/y and Core CPI y/y actual/previous values — used
// only as a fallback for a static-table release date when neither the live
// feed nor persisted history has a real matching event (which is every
// release before this feature started polling, i.e. effectively all of
// them right now). Computed here from FRED's raw CPI index series
// (fredgraph.csv's own units=pc1 percent-change param didn't take effect
// when tested against the live endpoint, so "y/y % change" is computed
// directly from consecutive index levels instead — same result, just
// computed client-side rather than server-side).
// Source: https://fred.stlouisfed.org/series/CPIAUCSL (headline) and
// https://fred.stlouisfed.org/series/CPILFESL (core).
// FRED has no consensus-forecast data, so forecast/surprise/tag are never
// populated from this table — only real published actual/previous, never
// invented. A release missing here (e.g. one after this table was last
// updated) just shows nothing extra; it's never estimated.
const CPI_FRED_ACTUALS: { date: string; actual: number; previous: number | null; coreActual: number | null; corePrevious: number | null }[] = [
  { date: "2025-01-15", actual: 2.9, previous: 2.7, coreActual: 3.2, corePrevious: 3.3 },
  { date: "2025-02-12", actual: 3, previous: 2.9, coreActual: 3.3, corePrevious: 3.2 },
  { date: "2025-03-12", actual: 2.8, previous: 3, coreActual: 3.1, corePrevious: 3.3 },
  { date: "2025-04-10", actual: 2.4, previous: 2.8, coreActual: 2.8, corePrevious: 3.1 },
  { date: "2025-05-13", actual: 2.3, previous: 2.4, coreActual: 2.8, corePrevious: 2.8 },
  { date: "2025-06-11", actual: 2.4, previous: 2.3, coreActual: 2.8, corePrevious: 2.8 },
  { date: "2025-07-15", actual: 2.7, previous: 2.4, coreActual: 2.9, corePrevious: 2.8 },
  { date: "2025-08-12", actual: 2.7, previous: 2.7, coreActual: 3.1, corePrevious: 2.9 },
  { date: "2025-09-11", actual: 2.9, previous: 2.7, coreActual: 3.1, corePrevious: 3.1 },
  // No Oct 2025 CPI (canceled) means Nov 2025 data has no real prior-month
  // comparison — left null, not estimated.
  { date: "2025-12-18", actual: 2.7, previous: null, coreActual: 2.6, corePrevious: null },
  { date: "2026-01-13", actual: 2.7, previous: 2.7, coreActual: 2.6, corePrevious: 2.6 },
  { date: "2026-02-13", actual: 2.4, previous: 2.7, coreActual: 2.5, corePrevious: 2.6 },
  { date: "2026-03-11", actual: 2.4, previous: 2.4, coreActual: 2.5, corePrevious: 2.5 },
  { date: "2026-04-10", actual: 3.3, previous: 2.4, coreActual: 2.6, corePrevious: 2.5 },
  { date: "2026-05-12", actual: 3.8, previous: 3.3, coreActual: 2.7, corePrevious: 2.6 },
  { date: "2026-06-10", actual: 4.2, previous: 3.8, coreActual: 2.8, corePrevious: 2.7 },
  { date: "2026-07-14", actual: 3.5, previous: 4.2, coreActual: 2.6, corePrevious: 2.8 },
  { date: "2026-08-12", actual: 3.3, previous: 3.5, coreActual: 2.5, corePrevious: 2.6 },
];
function cpiFredFallback(dateIso: string): EventDetail | null {
  const row = CPI_FRED_ACTUALS.find(r => r.date === dateIso.slice(0, 10));
  if (!row) return null;
  const detail: EventDetail = {
    title: "CPI",
    headline: { label: "CPI y/y", actual: `${row.actual}%`, previous: row.previous !== null ? `${row.previous}%` : undefined },
  };
  if (row.coreActual !== null) {
    detail.core = { label: "Core CPI y/y", actual: `${row.coreActual}%`, previous: row.corePrevious !== null ? `${row.corePrevious}%` : undefined };
  }
  return detail;
}
// Employment Situation (Non-Farm Payrolls / Jobs Report) — released 8:30 ET,
// normally the first Friday of the month covering the prior month's data.
// No separate October 2025 entry: that report was merged into the November
// release (Dec 16, 2025) rather than published on its own, another
// shutdown-driven irregularity. Source: bls.gov Employment Situation
// archive (news.release/archives/empsit_MMDDYYYY.htm) and
// financecalendar.com's published 2026 schedule.
const JOBS_RELEASE_DATES: string[] = [
  "2025-01-10T08:30:00-05:00", "2025-02-07T08:30:00-05:00", "2025-03-07T08:30:00-05:00",
  "2025-04-04T08:30:00-04:00", "2025-05-02T08:30:00-04:00", "2025-06-06T08:30:00-04:00",
  "2025-07-03T08:30:00-04:00", "2025-08-01T08:30:00-04:00", "2025-09-05T08:30:00-04:00",
  "2025-11-20T08:30:00-05:00", /* Sep 2025 jobs report, delayed */
  "2025-12-16T08:30:00-05:00", /* Nov 2025 jobs report — Oct+Nov combined */
  "2026-01-09T08:30:00-05:00", "2026-02-11T08:30:00-05:00", "2026-03-06T08:30:00-05:00",
  "2026-04-03T08:30:00-04:00", "2026-05-08T08:30:00-04:00", "2026-06-05T08:30:00-04:00",
  "2026-07-02T08:30:00-04:00", "2026-08-07T08:30:00-04:00", "2026-09-04T08:30:00-04:00",
  "2026-10-02T08:30:00-04:00", "2026-11-06T08:30:00-05:00", "2026-12-04T08:30:00-05:00",
];

// Real historical NFP change, Unemployment Rate, and Average Hourly
// Earnings m/m actual/previous — used only as a fallback when neither the
// live feed nor persisted history has a real matching event (every release
// before this feature started polling). Computed from FRED's raw series:
// PAYEMS (Total Nonfarm Payrolls level, NFP = month-over-month change),
// UNRATE (Unemployment Rate, used directly), and CES0500000003 (Average
// Hourly Earnings, % change computed the same way CPI's y/y is). null means
// genuinely no data that month (e.g. Oct 2025's unemployment rate — that
// report was delayed by the government shutdown, same gap already noted on
// JOBS_RELEASE_DATES above), never estimated.
// Source: https://fred.stlouisfed.org/series/PAYEMS, /UNRATE, and
// /CES0500000003.
const JOBS_FRED_ACTUALS: { date: string; nfp: number | null; prevNfp: number | null; unrate: number | null; prevUnrate: number | null; ahe: number | null; prevAhe: number | null }[] = [
  { date: "2025-01-10", nfp: 237, prevNfp: 134, unrate: 4.1, prevUnrate: 4.2, ahe: 0.3, prevAhe: 0.4 },
  { date: "2025-02-07", nfp: -48, prevNfp: 237, unrate: 4.0, prevUnrate: 4.1, ahe: 0.4, prevAhe: 0.3 },
  { date: "2025-03-07", nfp: 42, prevNfp: -48, unrate: 4.2, prevUnrate: 4.0, ahe: 0.3, prevAhe: 0.4 },
  { date: "2025-04-04", nfp: 67, prevNfp: 42, unrate: 4.2, prevUnrate: 4.2, ahe: 0.5, prevAhe: 0.3 },
  { date: "2025-05-02", nfp: 108, prevNfp: 67, unrate: 4.2, prevUnrate: 4.2, ahe: 0.0, prevAhe: 0.5 },
  { date: "2025-06-06", nfp: 13, prevNfp: 108, unrate: 4.3, prevUnrate: 4.2, ahe: 0.4, prevAhe: 0.0 },
  { date: "2025-07-03", nfp: -20, prevNfp: 13, unrate: 4.1, prevUnrate: 4.3, ahe: 0.2, prevAhe: 0.4 },
  { date: "2025-08-01", nfp: 64, prevNfp: -20, unrate: 4.3, prevUnrate: 4.1, ahe: 0.3, prevAhe: 0.2 },
  { date: "2025-09-05", nfp: -70, prevNfp: 64, unrate: 4.3, prevUnrate: 4.3, ahe: 0.4, prevAhe: 0.3 },
  { date: "2025-11-20", nfp: -140, prevNfp: 76, unrate: null, prevUnrate: 4.4, ahe: 0.4, prevAhe: 0.2 },
  { date: "2025-12-16", nfp: 41, prevNfp: -140, unrate: 4.5, prevUnrate: null, ahe: 0.4, prevAhe: 0.4 },
  { date: "2026-01-09", nfp: -17, prevNfp: 41, unrate: 4.4, prevUnrate: 4.5, ahe: 0.1, prevAhe: 0.4 },
  { date: "2026-02-11", nfp: 160, prevNfp: -17, unrate: 4.3, prevUnrate: 4.4, ahe: 0.4, prevAhe: 0.1 },
  { date: "2026-03-06", nfp: -156, prevNfp: 160, unrate: 4.4, prevUnrate: 4.3, ahe: 0.3, prevAhe: 0.4 },
  { date: "2026-04-03", nfp: 214, prevNfp: -156, unrate: 4.3, prevUnrate: 4.4, ahe: 0.2, prevAhe: 0.3 },
  { date: "2026-05-08", nfp: 148, prevNfp: 214, unrate: 4.3, prevUnrate: 4.3, ahe: 0.2, prevAhe: 0.2 },
  { date: "2026-06-05", nfp: 63, prevNfp: 148, unrate: 4.3, prevUnrate: 4.3, ahe: 0.2, prevAhe: 0.2 },
  { date: "2026-07-02", nfp: 20, prevNfp: 63, unrate: 4.2, prevUnrate: 4.3, ahe: 0.3, prevAhe: 0.2 },
  { date: "2026-08-07", nfp: -23, prevNfp: 20, unrate: 4.1, prevUnrate: 4.2, ahe: 0.1, prevAhe: 0.3 },
];
function jobsFredFallback(dateIso: string): EventDetail | null {
  const row = JOBS_FRED_ACTUALS.find(r => r.date === dateIso.slice(0, 10));
  if (!row) return null;
  const ev = (title: string, actual: number | null, previous: number | null, unit: string): EconomicEvent | undefined =>
    actual === null ? undefined : { title, country: "USD", date: dateIso, impact: "High", forecast: "", previous: previous !== null ? `${previous}${unit}` : "", actual: `${actual}${unit}` };
  return interpretJobs(
    ev("Non-Farm Employment Change", row.nfp, row.prevNfp, "K"),
    ev("Unemployment Rate", row.unrate, row.prevUnrate, "%"),
    ev("Average Hourly Earnings m/m", row.ahe, row.prevAhe, "%"),
  );
}

// ISM Manufacturing/Services PMI — unlike CPI/Jobs/FOMC, there is no free
// source for the actual index VALUES at all: ISM's PMI numbers are
// commercially licensed, and FRED's old free mirror of them (series NAPM)
// has been discontinued (confirmed: 404 on the live API, not guessed) —
// there's no legitimate free backfill for the numbers themselves. The
// RELEASE SCHEDULE, though, is real public information, not licensed
// content: Manufacturing releases the 1st business day of each month (2nd
// in January), Services the 3rd business day (4th in January), both
// 10:00am ET, both shifted a day when that would land on New Year's Day,
// Independence Day, or Labor Day — computed here, not guessed, and
// verified against ISM's own published rule (ismworld.org) plus the
// standard US federal holiday-observance shift. So these markers plot
// reliably on schedule, and their popup shows real data whenever a live or
// persisted release actually exists (which starts accumulating from now
// on) — but never a fabricated historical index value.
const ISM_MANUFACTURING_DATES: string[] = [
  "2025-01-03T10:00:00-05:00", "2025-02-03T10:00:00-05:00", "2025-03-03T10:00:00-05:00",
  "2025-04-01T10:00:00-04:00", "2025-05-01T10:00:00-04:00", "2025-06-02T10:00:00-04:00",
  "2025-07-01T10:00:00-04:00", "2025-08-01T10:00:00-04:00", "2025-09-02T10:00:00-04:00",
  "2025-10-01T10:00:00-04:00", "2025-11-03T10:00:00-05:00", "2025-12-01T10:00:00-05:00",
  "2026-01-05T10:00:00-05:00", "2026-02-02T10:00:00-05:00", "2026-03-02T10:00:00-05:00",
  "2026-04-01T10:00:00-04:00", "2026-05-01T10:00:00-04:00", "2026-06-01T10:00:00-04:00",
  "2026-07-01T10:00:00-04:00", "2026-08-03T10:00:00-04:00", "2026-09-01T10:00:00-04:00",
  "2026-10-01T10:00:00-04:00", "2026-11-02T10:00:00-05:00", "2026-12-01T10:00:00-05:00",
];
const ISM_SERVICES_DATES: string[] = [
  "2025-01-07T10:00:00-05:00", "2025-02-05T10:00:00-05:00", "2025-03-05T10:00:00-05:00",
  "2025-04-03T10:00:00-04:00", "2025-05-05T10:00:00-04:00", "2025-06-04T10:00:00-04:00",
  "2025-07-03T10:00:00-04:00", "2025-08-05T10:00:00-04:00", "2025-09-04T10:00:00-04:00",
  "2025-10-03T10:00:00-04:00", "2025-11-05T10:00:00-05:00", "2025-12-03T10:00:00-05:00",
  "2026-01-07T10:00:00-05:00", "2026-02-04T10:00:00-05:00", "2026-03-04T10:00:00-05:00",
  "2026-04-03T10:00:00-04:00", "2026-05-05T10:00:00-04:00", "2026-06-03T10:00:00-04:00",
  "2026-07-06T10:00:00-04:00", "2026-08-05T10:00:00-04:00", "2026-09-03T10:00:00-04:00",
  "2026-10-05T10:00:00-04:00", "2026-11-04T10:00:00-05:00", "2026-12-03T10:00:00-05:00",
];

// Retail Sales — unlike ISM, this IS free public government data (Census
// Bureau), so both the release schedule AND real historical actual/previous
// values are backfillable, same as CPI/Jobs/FOMC. The schedule is
// genuinely irregular (no fixed "Nth day" rule, unlike ISM), including a
// real gap around Sep–Oct 2025 (the government shutdown delayed that
// release by over two months, same disruption already documented on
// JOBS_RELEASE_DATES/CPI_RELEASE_DATES above) — pulled from ALFRED's own
// realized-release-date archive, not computed/guessed.
// Source: https://alfred.stlouisfed.org/release/downloaddates?rid=9&ff=txt
// (release dates) and https://fred.stlouisfed.org/series/RSAFS /
// RSFSXMV (headline / ex-motor-vehicle "core" level, m/m % computed here
// the same way CPI's y/y is).
const RETAIL_SALES_DATES: string[] = [
  "2025-01-16T08:30:00-05:00", "2025-02-14T08:30:00-05:00", "2025-03-17T08:30:00-04:00",
  "2025-04-16T08:30:00-04:00", "2025-05-15T08:30:00-04:00", "2025-06-17T08:30:00-04:00",
  "2025-07-17T08:30:00-04:00", "2025-08-15T08:30:00-04:00", "2025-09-16T08:30:00-04:00",
  "2025-11-25T08:30:00-05:00", /* Oct 2025 release didn't happen — shutdown delayed Sep 2025 data to Nov 25 */
  "2025-12-16T08:30:00-05:00",
  "2026-01-14T08:30:00-05:00", "2026-02-10T08:30:00-05:00", "2026-03-06T08:30:00-05:00",
  "2026-04-01T08:30:00-04:00", "2026-04-21T08:30:00-04:00", "2026-05-14T08:30:00-04:00",
  "2026-06-17T08:30:00-04:00", "2026-07-16T08:30:00-04:00", "2026-08-14T08:30:00-04:00",
  "2026-09-16T08:30:00-04:00", "2026-10-15T08:30:00-04:00", "2026-11-17T08:30:00-05:00",
  "2026-12-16T08:30:00-05:00",
];
const RETAIL_SALES_FRED_ACTUALS: { date: string; actual: number; previous: number | null; coreActual: number | null; corePrevious: number | null }[] = [
  { date: "2025-01-16", actual: 0.8, previous: 0.5, coreActual: 0.9, corePrevious: -0.1 },
  { date: "2025-02-14", actual: -0.8, previous: 0.8, coreActual: -0.5, corePrevious: 0.9 },
  { date: "2025-03-17", actual: 0.0, previous: -0.8, coreActual: 0.6, corePrevious: -0.5 },
  { date: "2025-04-16", actual: 1.7, previous: 0.0, coreActual: 0.6, corePrevious: 0.6 },
  { date: "2025-05-15", actual: -0.1, previous: 1.7, coreActual: 0.0, corePrevious: 0.6 },
  { date: "2025-06-17", actual: -1.1, previous: -0.1, coreActual: -0.2, corePrevious: 0.0 },
  { date: "2025-07-17", actual: 0.7, previous: -1.1, coreActual: 0.7, corePrevious: -0.2 },
  { date: "2025-08-15", actual: 1.1, previous: 0.7, coreActual: 0.7, corePrevious: 0.7 },
  { date: "2025-09-16", actual: 0.6, previous: 1.1, coreActual: 0.6, corePrevious: 0.7 },
  { date: "2025-11-25", actual: 0.1, previous: 0.6, coreActual: 0.1, corePrevious: 0.6 },
  { date: "2025-12-16", actual: -0.2, previous: 0.1, coreActual: 0.2, corePrevious: 0.1 },
  { date: "2026-01-14", actual: 0.5, previous: -0.2, coreActual: 0.4, corePrevious: 0.2 },
  { date: "2026-02-10", actual: 0.0, previous: 0.5, coreActual: 0.0, corePrevious: 0.4 },
  { date: "2026-03-06", actual: 0.0, previous: 0.0, coreActual: 0.1, corePrevious: 0.0 },
  { date: "2026-04-01", actual: 0.9, previous: 0.0, coreActual: 0.9, corePrevious: 0.1 },
  { date: "2026-04-21", actual: 1.7, previous: 0.9, coreActual: 2.0, corePrevious: 0.9 },
  { date: "2026-05-14", actual: 0.7, previous: 1.7, coreActual: 0.9, corePrevious: 2.0 },
  { date: "2026-06-17", actual: 0.9, previous: 0.7, coreActual: 0.9, corePrevious: 0.9 },
  { date: "2026-07-16", actual: 0.2, previous: 0.9, coreActual: -0.2, corePrevious: 0.9 },
  { date: "2026-08-14", actual: -0.6, previous: 0.2, coreActual: -0.3, corePrevious: -0.2 },
];
// Mirrors interpretCpi's shape: forecast-vs-actual when a live release has
// one, falling back to the real month-over-month trend (vs previous) when
// it doesn't — e.g. every FRED-backed historical entry here, which has no
// forecast at all since FRED doesn't publish consensus estimates.
function interpretRetailSales(headline?: EconomicEvent, core?: EconomicEvent): EventDetail | null {
  if (!headline) return null;
  const detail: EventDetail = { title: "Retail Sales", headline: fieldDetail("Retail Sales m/m", headline) };
  if (core) detail.core = fieldDetail("Core Retail Sales m/m", core);
  const a = parseEconValue(headline.actual);
  const f = parseEconValue(headline.forecast);
  if (a && f) {
    if (a.num > f.num)      { detail.tag = "STRONG";  detail.direction = "Hawkish"; }
    else if (a.num < f.num) { detail.tag = "WEAK";    detail.direction = "Dovish"; }
    else                    { detail.tag = "IN LINE"; detail.direction = "Neutral"; }
  } else {
    const p = parseEconValue(headline.previous);
    if (a && p) {
      if (a.num > p.num)      { detail.tag = "ACCELERATING"; detail.direction = "Hawkish"; }
      else if (a.num < p.num) { detail.tag = "SLOWING";      detail.direction = "Dovish"; }
      else                    { detail.tag = "STEADY";       detail.direction = "Neutral"; }
    }
  }
  return detail;
}
function retailSalesFredFallback(dateIso: string): EventDetail | null {
  const row = RETAIL_SALES_FRED_ACTUALS.find(r => r.date === dateIso.slice(0, 10));
  if (!row) return null;
  const ev = (title: string, actual: number | null, previous: number | null): EconomicEvent | undefined =>
    actual === null ? undefined : { title, country: "USD", date: dateIso, impact: "Medium", forecast: "", previous: previous !== null ? `${previous}%` : "", actual: `${actual}%` };
  return interpretRetailSales(
    ev("Retail Sales m/m", row.actual, row.previous),
    ev("Core Retail Sales m/m", row.coreActual, row.corePrevious),
  );
}

// Initial Jobless Claims — released weekly (every Thursday, 8:30am ET,
// shifted to Wednesday the handful of times Thursday itself is New Year's
// Day, July 4th, Juneteenth, Veterans Day, Christmas, or Thanksgiving —
// Thanksgiving is always a Thursday, so that shift happens every year).
// Both the schedule and the real historical values are free, public DOL
// data — computed here from FRED's ICSA series (Initial Claims, seasonally
// adjusted; the observation date is the week-ending Saturday, 5 days before
// the Thursday that reports it) — not guessed. Unlike ISM, nothing here is
// commercially restricted, so this covers the full range with no gaps.
// Source: https://fred.stlouisfed.org/series/ICSA.
const JOBLESS_CLAIMS_FRED_ACTUALS: { date: string; actual: number; previous: number | null }[] = [
  { date: "2025-01-02T08:30:00-05:00", actual: 212, previous: null },
  { date: "2025-01-09T08:30:00-05:00", actual: 206, previous: 212 },
  { date: "2025-01-16T08:30:00-05:00", actual: 219, previous: 206 },
  { date: "2025-01-23T08:30:00-05:00", actual: 223, previous: 219 },
  { date: "2025-01-30T08:30:00-05:00", actual: 212, previous: 223 },
  { date: "2025-02-06T08:30:00-05:00", actual: 220, previous: 212 },
  { date: "2025-02-13T08:30:00-05:00", actual: 216, previous: 220 },
  { date: "2025-02-20T08:30:00-05:00", actual: 223, previous: 216 },
  { date: "2025-02-27T08:30:00-05:00", actual: 241, previous: 223 },
  { date: "2025-03-06T08:30:00-05:00", actual: 224, previous: 241 },
  { date: "2025-03-13T08:30:00-04:00", actual: 222, previous: 224 },
  { date: "2025-03-20T08:30:00-04:00", actual: 225, previous: 222 },
  { date: "2025-03-27T08:30:00-04:00", actual: 224, previous: 225 },
  { date: "2025-04-03T08:30:00-04:00", actual: 220, previous: 224 },
  { date: "2025-04-10T08:30:00-04:00", actual: 223, previous: 220 },
  { date: "2025-04-17T08:30:00-04:00", actual: 217, previous: 223 },
  { date: "2025-04-24T08:30:00-04:00", actual: 224, previous: 217 },
  { date: "2025-05-01T08:30:00-04:00", actual: 239, previous: 224 },
  { date: "2025-05-08T08:30:00-04:00", actual: 228, previous: 239 },
  { date: "2025-05-15T08:30:00-04:00", actual: 226, previous: 228 },
  { date: "2025-05-22T08:30:00-04:00", actual: 225, previous: 226 },
  { date: "2025-05-29T08:30:00-04:00", actual: 236, previous: 225 },
  { date: "2025-06-05T08:30:00-04:00", actual: 244, previous: 236 },
  { date: "2025-06-12T08:30:00-04:00", actual: 246, previous: 244 },
  { date: "2025-06-18T08:30:00-04:00", actual: 243, previous: 246 },
  { date: "2025-06-26T08:30:00-04:00", actual: 236, previous: 243 },
  { date: "2025-07-03T08:30:00-04:00", actual: 231, previous: 236 },
  { date: "2025-07-10T08:30:00-04:00", actual: 228, previous: 231 },
  { date: "2025-07-17T08:30:00-04:00", actual: 221, previous: 228 },
  { date: "2025-07-24T08:30:00-04:00", actual: 218, previous: 221 },
  { date: "2025-07-31T08:30:00-04:00", actual: 219, previous: 218 },
  { date: "2025-08-07T08:30:00-04:00", actual: 226, previous: 219 },
  { date: "2025-08-14T08:30:00-04:00", actual: 224, previous: 226 },
  { date: "2025-08-21T08:30:00-04:00", actual: 233, previous: 224 },
  { date: "2025-08-28T08:30:00-04:00", actual: 229, previous: 233 },
  { date: "2025-09-04T08:30:00-04:00", actual: 236, previous: 229 },
  { date: "2025-09-11T08:30:00-04:00", actual: 259, previous: 236 },
  { date: "2025-09-18T08:30:00-04:00", actual: 233, previous: 259 },
  { date: "2025-09-25T08:30:00-04:00", actual: 219, previous: 233 },
  { date: "2025-10-02T08:30:00-04:00", actual: 225, previous: 219 },
  { date: "2025-10-09T08:30:00-04:00", actual: 233, previous: 225 },
  { date: "2025-10-16T08:30:00-04:00", actual: 222, previous: 233 },
  { date: "2025-10-23T08:30:00-04:00", actual: 231, previous: 222 },
  { date: "2025-10-30T08:30:00-04:00", actual: 221, previous: 231 },
  { date: "2025-11-06T08:30:00-05:00", actual: 228, previous: 221 },
  { date: "2025-11-13T08:30:00-05:00", actual: 228, previous: 228 },
  { date: "2025-11-20T08:30:00-05:00", actual: 222, previous: 228 },
  { date: "2025-11-26T08:30:00-05:00", actual: 218, previous: 222 },
  { date: "2025-12-04T08:30:00-05:00", actual: 216, previous: 218 },
  { date: "2025-12-11T08:30:00-05:00", actual: 235, previous: 216 },
  { date: "2025-12-18T08:30:00-05:00", actual: 224, previous: 235 },
  { date: "2025-12-24T08:30:00-05:00", actual: 215, previous: 224 },
  { date: "2025-12-31T08:30:00-05:00", actual: 203, previous: 215 },
  { date: "2026-01-08T08:30:00-05:00", actual: 207, previous: 203 },
  { date: "2026-01-15T08:30:00-05:00", actual: 201, previous: 207 },
  { date: "2026-01-22T08:30:00-05:00", actual: 210, previous: 201 },
  { date: "2026-01-29T08:30:00-05:00", actual: 211, previous: 210 },
  { date: "2026-02-05T08:30:00-05:00", actual: 230, previous: 211 },
  { date: "2026-02-12T08:30:00-05:00", actual: 230, previous: 230 },
  { date: "2026-02-19T08:30:00-05:00", actual: 208, previous: 230 },
  { date: "2026-02-26T08:30:00-05:00", actual: 211, previous: 208 },
  { date: "2026-03-05T08:30:00-05:00", actual: 214, previous: 211 },
  { date: "2026-03-12T08:30:00-04:00", actual: 213, previous: 214 },
  { date: "2026-03-19T08:30:00-04:00", actual: 205, previous: 213 },
  { date: "2026-03-26T08:30:00-04:00", actual: 211, previous: 205 },
  { date: "2026-04-02T08:30:00-04:00", actual: 203, previous: 211 },
  { date: "2026-04-09T08:30:00-04:00", actual: 218, previous: 203 },
  { date: "2026-04-16T08:30:00-04:00", actual: 208, previous: 218 },
  { date: "2026-04-23T08:30:00-04:00", actual: 215, previous: 208 },
  { date: "2026-04-30T08:30:00-04:00", actual: 190, previous: 215 },
  { date: "2026-05-07T08:30:00-04:00", actual: 199, previous: 190 },
  { date: "2026-05-14T08:30:00-04:00", actual: 212, previous: 199 },
  { date: "2026-05-21T08:30:00-04:00", actual: 210, previous: 212 },
  { date: "2026-05-28T08:30:00-04:00", actual: 212, previous: 210 },
  { date: "2026-06-04T08:30:00-04:00", actual: 225, previous: 212 },
  { date: "2026-06-11T08:30:00-04:00", actual: 230, previous: 225 },
  { date: "2026-06-18T08:30:00-04:00", actual: 227, previous: 230 },
  { date: "2026-06-25T08:30:00-04:00", actual: 216, previous: 227 },
  { date: "2026-07-02T08:30:00-04:00", actual: 217, previous: 216 },
  { date: "2026-07-09T08:30:00-04:00", actual: 217, previous: 217 },
  { date: "2026-07-16T08:30:00-04:00", actual: 209, previous: 217 },
  { date: "2026-07-23T08:30:00-04:00", actual: 189, previous: 209 },
  { date: "2026-07-30T08:30:00-04:00", actual: 198, previous: 189 },
  { date: "2026-08-06T08:30:00-04:00", actual: 200, previous: 198 },
  { date: "2026-08-13T08:30:00-04:00", actual: 209, previous: 200 },
];
function joblessClaimsFredFallback(dateIso: string): EventDetail | null {
  const row = JOBLESS_CLAIMS_FRED_ACTUALS.find(r => r.date.slice(0, 10) === dateIso.slice(0, 10));
  if (!row) return null;
  const def = SIMPLE_CATEGORY_DEFS.find(d => d.key === "jobless_claims")!;
  const ev: EconomicEvent = {
    title: "Unemployment Claims", country: "USD", date: dateIso, impact: "Medium",
    forecast: "", previous: row.previous !== null ? `${row.previous}K` : "", actual: `${row.actual}K`,
  };
  return interpretSimple(ev, def);
}

// PCE / Core PCE Price Index — free public BEA data (Personal Income and
// Outlays report), so both the release schedule and real historical
// actual/previous values are backfillable, same as CPI/Jobs/FOMC/Retail
// Sales/Jobless Claims. Real gap Oct–Nov 2025 (same government-shutdown
// disruption already documented elsewhere in this file), with two
// close-together catch-up releases in December 2025 — pulled from ALFRED's
// own realized-release-date archive, not computed/guessed. m/m % computed
// from consecutive index levels the same way CPI's is.
// Source: https://alfred.stlouisfed.org/release/downloaddates?rid=54&ff=txt
// (release dates) and https://fred.stlouisfed.org/series/PCEPI /
// PCEPILFE (headline / core index levels).
const PCE_FRED_ACTUALS: { date: string; actual: number; previous: number | null; coreActual: number | null; corePrevious: number | null }[] = [
  { date: "2025-01-31T08:30:00-05:00", actual: 0.3, previous: 0.1, coreActual: 0.2, corePrevious: 0.1 },
  { date: "2025-02-28T08:30:00-05:00", actual: 0.4, previous: 0.3, coreActual: 0.3, corePrevious: 0.2 },
  { date: "2025-03-28T08:30:00-04:00", actual: 0.4, previous: 0.4, coreActual: 0.4, corePrevious: 0.3 },
  { date: "2025-04-30T08:30:00-04:00", actual: 0.0, previous: 0.4, coreActual: 0.1, corePrevious: 0.4 },
  { date: "2025-05-30T08:30:00-04:00", actual: 0.2, previous: 0.0, coreActual: 0.2, corePrevious: 0.1 },
  { date: "2025-06-27T08:30:00-04:00", actual: 0.2, previous: 0.2, coreActual: 0.2, corePrevious: 0.2 },
  { date: "2025-07-31T08:30:00-04:00", actual: 0.3, previous: 0.2, coreActual: 0.3, corePrevious: 0.2 },
  { date: "2025-08-29T08:30:00-04:00", actual: 0.2, previous: 0.3, coreActual: 0.2, corePrevious: 0.3 },
  { date: "2025-09-26T08:30:00-04:00", actual: 0.3, previous: 0.2, coreActual: 0.2, corePrevious: 0.2 },
  { date: "2025-12-05T08:30:00-05:00", actual: 0.3, previous: 0.3, coreActual: 0.2, corePrevious: 0.2 },
  { date: "2025-12-23T08:30:00-05:00", actual: 0.2, previous: 0.3, coreActual: 0.2, corePrevious: 0.2 },
  { date: "2026-01-22T08:30:00-05:00", actual: 0.2, previous: 0.2, coreActual: 0.2, corePrevious: 0.2 },
  { date: "2026-02-20T08:30:00-05:00", actual: 0.3, previous: 0.2, coreActual: 0.3, corePrevious: 0.2 },
  { date: "2026-03-13T08:30:00-04:00", actual: 0.3, previous: 0.3, coreActual: 0.4, corePrevious: 0.3 },
  { date: "2026-04-09T08:30:00-04:00", actual: 0.4, previous: 0.3, coreActual: 0.4, corePrevious: 0.4 },
  { date: "2026-04-30T08:30:00-04:00", actual: 0.7, previous: 0.4, coreActual: 0.3, corePrevious: 0.4 },
  { date: "2026-05-28T08:30:00-04:00", actual: 0.4, previous: 0.7, coreActual: 0.2, corePrevious: 0.3 },
  { date: "2026-06-25T08:30:00-04:00", actual: 0.5, previous: 0.4, coreActual: 0.3, corePrevious: 0.2 },
  { date: "2026-07-30T08:30:00-04:00", actual: -0.1, previous: 0.5, coreActual: 0.1, corePrevious: 0.3 },
];
// Mirrors interpretCpi/interpretRetailSales: forecast-vs-actual when a live
// release has one, falling back to the real month-over-month trend when it
// doesn't (every FRED-backed entry here, since FRED has no forecasts).
function interpretPce(headline?: EconomicEvent, core?: EconomicEvent): EventDetail | null {
  if (!headline) return null;
  const detail: EventDetail = { title: "PCE", headline: fieldDetail("PCE Price Index m/m", headline) };
  if (core) detail.core = fieldDetail("Core PCE Price Index m/m", core);
  const a = parseEconValue(headline.actual);
  const f = parseEconValue(headline.forecast);
  if (a && f) {
    if (a.num > f.num)      { detail.tag = "HOT";      detail.direction = "Hawkish"; }
    else if (a.num < f.num) { detail.tag = "COOL";     detail.direction = "Dovish"; }
    else                    { detail.tag = "IN LINE";  detail.direction = "Neutral"; }
  } else {
    const p = parseEconValue(headline.previous);
    if (a && p) {
      if (a.num > p.num)      { detail.tag = "WARMING"; detail.direction = "Hawkish"; }
      else if (a.num < p.num) { detail.tag = "COOLING"; detail.direction = "Dovish"; }
      else                    { detail.tag = "STEADY";  detail.direction = "Neutral"; }
    }
  }
  return detail;
}
function pceFredFallback(dateIso: string): EventDetail | null {
  const row = PCE_FRED_ACTUALS.find(r => r.date.slice(0, 10) === dateIso.slice(0, 10));
  if (!row) return null;
  const ev = (title: string, actual: number | null, previous: number | null): EconomicEvent | undefined =>
    actual === null ? undefined : { title, country: "USD", date: dateIso, impact: "High", forecast: "", previous: previous !== null ? `${previous}%` : "", actual: `${actual}%` };
  return interpretPce(
    ev("PCE Price Index m/m", row.actual, row.previous),
    ev("Core PCE Price Index m/m", row.coreActual, row.corePrevious),
  );
}

// GDP (Advance/Second/Third estimate) — real BEA release dates from ALFRED,
// same as PCE (both ride the same release-schedule bundle, rid=53). Real
// data, with one deliberate simplification: BEA revises each quarter's
// growth rate across its three estimates, and getting the exact
// as-first-published Advance-vs-Second-vs-Third number would need a
// vintage-specific ALFRED query per release — this instead uses today's
// current (fully revised) growth rate for that quarter on all three of its
// releases. Real, sourced, never invented, just not vintage-precise about
// small in-quarter revisions.
// A stretch of 2026 dates (Jan 22 – Apr 9) is left out entirely rather than
// guessed — the government shutdown disrupted the normal one-release-per-
// month cadence badly enough there that which specific quarter each of
// those catch-up releases covered can't be confidently determined; the
// schedule resumes its normal pattern from Apr 30, 2026 (confirmed against
// PCE's own catch-up, which resolved on the same date).
// Source: https://alfred.stlouisfed.org/release/downloaddates?rid=53&ff=txt
// (release dates) and https://fred.stlouisfed.org/series/A191RL1Q225SBEA
// (real GDP, % change from preceding period, annualized).
const GDP_FRED_ACTUALS: { date: string; actual: number; previous: number | null }[] = [
  { date: "2025-01-30T08:30:00-05:00", actual: 1.9, previous: 3.3 },
  { date: "2025-02-27T08:30:00-05:00", actual: 1.9, previous: 3.3 },
  { date: "2025-03-27T08:30:00-04:00", actual: 1.9, previous: 3.3 },
  { date: "2025-04-30T08:30:00-04:00", actual: -0.6, previous: 1.9 },
  { date: "2025-05-29T08:30:00-04:00", actual: -0.6, previous: 1.9 },
  { date: "2025-06-26T08:30:00-04:00", actual: -0.6, previous: 1.9 },
  { date: "2025-07-30T08:30:00-04:00", actual: 3.8, previous: -0.6 },
  { date: "2025-08-28T08:30:00-04:00", actual: 3.8, previous: -0.6 },
  { date: "2025-09-25T08:30:00-04:00", actual: 3.8, previous: -0.6 },
  { date: "2025-12-23T08:30:00-05:00", actual: 4.4, previous: 3.8 },
  { date: "2026-04-30T08:30:00-04:00", actual: 2.1, previous: 4.4 },
  { date: "2026-05-28T08:30:00-04:00", actual: 2.1, previous: 4.4 },
  { date: "2026-06-25T08:30:00-04:00", actual: 2.1, previous: 4.4 },
  { date: "2026-07-30T08:30:00-04:00", actual: 1.5, previous: 2.1 },
];
function gdpFredFallback(dateIso: string): EventDetail | null {
  const row = GDP_FRED_ACTUALS.find(r => r.date.slice(0, 10) === dateIso.slice(0, 10));
  if (!row) return null;
  const def = SIMPLE_CATEGORY_DEFS.find(d => d.key === "gdp")!;
  const ev: EconomicEvent = {
    title: "GDP q/q", country: "USD", date: dateIso, impact: "High",
    forecast: "", previous: row.previous !== null ? `${row.previous}%` : "", actual: `${row.actual}%`,
  };
  return interpretSimple(ev, def);
}

// JOLTS Job Openings — free public BLS data, ~2-month reporting lag. Unlike
// GDP, these values are pulled directly from ALFRED's per-release vintage
// (querying JTSJOL as it stood on each real release date, via
// vintage_date), so both which month each release covered and its
// actual/previous are exactly what was published that day — not today's
// further-revised figure. Real gap Oct–Nov 2025 (same shutdown disruption
// as elsewhere), resolved by the Dec 9, 2025 release delivering both
// September and October data at once (confirmed via the vintage query, not
// assumed) before normal monthly cadence resumed.
// Source: https://alfred.stlouisfed.org/release/downloaddates?rid=192&ff=txt
// (release dates) and https://fred.stlouisfed.org/series/JTSJOL (vintaged
// via alfredgraph.csv?id=JTSJOL&vintage_date=...).
const JOLTS_FRED_ACTUALS: { date: string; actual: number; previous: number }[] = [
  { date: "2025-01-07T10:00:00-05:00", actual: 8.1,  previous: 7.84 },
  { date: "2025-02-04T10:00:00-05:00", actual: 7.6,  previous: 8.16 },
  { date: "2025-03-11T10:00:00-04:00", actual: 7.74, previous: 7.51 },
  { date: "2025-04-01T10:00:00-04:00", actual: 7.57, previous: 7.76 },
  { date: "2025-04-29T10:00:00-04:00", actual: 7.19, previous: 7.48 },
  { date: "2025-06-03T10:00:00-04:00", actual: 7.39, previous: 7.2 },
  { date: "2025-07-01T10:00:00-04:00", actual: 7.77, previous: 7.4 },
  { date: "2025-07-29T10:00:00-04:00", actual: 7.44, previous: 7.71 },
  { date: "2025-09-03T10:00:00-04:00", actual: 7.18, previous: 7.36 },
  { date: "2025-09-30T10:00:00-04:00", actual: 7.23, previous: 7.21 },
  { date: "2025-12-09T10:00:00-05:00", actual: 7.67, previous: 7.66 },
  { date: "2026-01-07T10:00:00-05:00", actual: 7.15, previous: 7.45 },
  { date: "2026-02-05T10:00:00-05:00", actual: 6.54, previous: 6.93 },
  { date: "2026-03-13T10:00:00-04:00", actual: 6.95, previous: 6.55 },
  { date: "2026-03-31T10:00:00-04:00", actual: 6.88, previous: 7.24 },
  { date: "2026-05-05T10:00:00-04:00", actual: 6.87, previous: 6.92 },
  { date: "2026-06-02T10:00:00-04:00", actual: 7.62, previous: 6.89 },
  { date: "2026-06-30T10:00:00-04:00", actual: 7.59, previous: 7.59 },
  { date: "2026-08-04T10:00:00-04:00", actual: 7.36, previous: 7.54 },
];
function joltsFredFallback(dateIso: string): EventDetail | null {
  const row = JOLTS_FRED_ACTUALS.find(r => r.date.slice(0, 10) === dateIso.slice(0, 10));
  if (!row) return null;
  const def = SIMPLE_CATEGORY_DEFS.find(d => d.key === "jolts")!;
  const ev: EconomicEvent = {
    title: "JOLTS Job Openings", country: "USD", date: dateIso, impact: "Medium",
    forecast: "", previous: `${row.previous}M`, actual: `${row.actual}M`,
  };
  return interpretSimple(ev, def);
}

// PPI / Core PPI (Final Demand) — free public BLS data. Same technique as
// JOLTS: both actual and previous are pulled from ALFRED's per-release
// vintage of the underlying index series (PPIFIS headline, PPIFES core —
// "Final Demand" is the BLS's current headline PPI methodology), so this is
// exactly what each release published that day, not today's revised
// figure. Real gap in Oct 2025 (same shutdown disruption as elsewhere),
// resolved by two close-together catch-up releases in Jan 2026.
// Source: https://alfred.stlouisfed.org/release/downloaddates?rid=46&ff=txt
// (release dates) and https://fred.stlouisfed.org/series/PPIFIS /
// PPIFES (vintaged via alfredgraph.csv?vintage_date=...).
const PPI_FRED_ACTUALS: { date: string; actual: number; previous: number; coreActual: number; corePrevious: number }[] = [
  { date: "2025-01-14T08:30:00-05:00", actual: 0.2, previous: 0.4, coreActual: 0.0, corePrevious: 0.2 },
  { date: "2025-02-13T08:30:00-05:00", actual: 0.4, previous: 0.5, coreActual: 0.3, corePrevious: 0.4 },
  { date: "2025-03-13T08:30:00-04:00", actual: 0.0, previous: 0.6, coreActual: -0.1, corePrevious: 0.5 },
  { date: "2025-04-11T08:30:00-04:00", actual: -0.4, previous: 0.1, coreActual: -0.1, corePrevious: 0.1 },
  { date: "2025-05-15T08:30:00-04:00", actual: -0.5, previous: 0.0, coreActual: -0.4, corePrevious: 0.4 },
  { date: "2025-06-12T08:30:00-04:00", actual: 0.1, previous: -0.2, coreActual: 0.1, corePrevious: -0.2 },
  { date: "2025-07-16T08:30:00-04:00", actual: 0.0, previous: 0.3, coreActual: 0.0, corePrevious: 0.4 },
  { date: "2025-08-14T08:30:00-04:00", actual: 0.9, previous: 0.0, coreActual: 0.9, corePrevious: 0.0 },
  { date: "2025-09-10T08:30:00-04:00", actual: -0.1, previous: 0.7, coreActual: -0.1, corePrevious: 0.7 },
  { date: "2025-11-25T08:30:00-05:00", actual: 0.3, previous: -0.1, coreActual: 0.1, corePrevious: -0.1 },
  { date: "2026-01-14T08:30:00-05:00", actual: 0.2, previous: 0.1, coreActual: 0.0, corePrevious: 0.3 },
  { date: "2026-01-30T08:30:00-05:00", actual: 0.5, previous: 0.2, coreActual: 0.7, corePrevious: 0.0 },
  { date: "2026-02-27T08:30:00-05:00", actual: 0.5, previous: 0.4, coreActual: 0.8, corePrevious: 0.6 },
  { date: "2026-03-18T08:30:00-04:00", actual: 0.7, previous: 0.5, coreActual: 0.5, corePrevious: 0.8 },
  { date: "2026-04-14T08:30:00-04:00", actual: 0.5, previous: 0.5, coreActual: 0.1, corePrevious: 0.3 },
  { date: "2026-05-13T08:30:00-04:00", actual: 1.4, previous: 0.7, coreActual: 1.0, corePrevious: 0.2 },
  { date: "2026-06-11T08:30:00-04:00", actual: 1.1, previous: 1.1, coreActual: 0.4, corePrevious: 0.7 },
  { date: "2026-07-15T08:30:00-04:00", actual: -0.3, previous: 0.6, coreActual: 0.2, corePrevious: 0.1 },
];
// Mirrors interpretCpi/interpretPce: forecast-vs-actual when a live release
// has one, falling back to the real month-over-month trend when it doesn't.
function interpretPpi(headline?: EconomicEvent, core?: EconomicEvent): EventDetail | null {
  if (!headline) return null;
  const detail: EventDetail = { title: "PPI", headline: fieldDetail("PPI m/m", headline) };
  if (core) detail.core = fieldDetail("Core PPI m/m", core);
  const a = parseEconValue(headline.actual);
  const f = parseEconValue(headline.forecast);
  if (a && f) {
    if (a.num > f.num)      { detail.tag = "HOT";      detail.direction = "Hawkish"; }
    else if (a.num < f.num) { detail.tag = "COOL";     detail.direction = "Dovish"; }
    else                    { detail.tag = "IN LINE";  detail.direction = "Neutral"; }
  } else {
    const p = parseEconValue(headline.previous);
    if (a && p) {
      if (a.num > p.num)      { detail.tag = "WARMING"; detail.direction = "Hawkish"; }
      else if (a.num < p.num) { detail.tag = "COOLING"; detail.direction = "Dovish"; }
      else                    { detail.tag = "STEADY";  detail.direction = "Neutral"; }
    }
  }
  return detail;
}
function ppiFredFallback(dateIso: string): EventDetail | null {
  const row = PPI_FRED_ACTUALS.find(r => r.date.slice(0, 10) === dateIso.slice(0, 10));
  if (!row) return null;
  const ev = (title: string, actual: number, previous: number): EconomicEvent => ({
    title, country: "USD", date: dateIso, impact: "Medium", forecast: "", previous: `${previous}%`, actual: `${actual}%`,
  });
  return interpretPpi(
    ev("PPI m/m", row.actual, row.previous),
    ev("Core PPI m/m", row.coreActual, row.corePrevious),
  );
}

function eventNewsCategory(ev: EconomicEvent): NewsCategoryDef | null {
  const title = ev.title.toLowerCase();
  for (const def of NEWS_CATEGORY_DEFS) {
    if (def.keywords.some(kw => title.includes(kw))) return def;
  }
  return null;
}

// ─── Economic event interpretation (News indicator upgrade — Phase 1) ────────
// Turns a marker from "CPI happened here" into "what the market learned from
// CPI here" — actual vs forecast/previous, a surprise magnitude, and a short
// interpretation tag. Every field is optional and degrades gracefully: this
// only ever reads real actual/forecast/previous already present on a matched
// EconomicEvent (from the live feed, or from the persisted economic_events
// table — see get_stored_economic_events — which is what keeps that data
// alive past the live feed's own current-week window). It never invents a
// value or forces a classification it doesn't have the data to support.
interface EventFieldDetail { label: string; actual?: string; forecast?: string; previous?: string; surprise?: string; }
interface EventDetail {
  title: string;
  headline: EventFieldDetail;
  core?: EventFieldDetail;
  components?: EventFieldDetail[];
  tag?: string;
  direction?: "Hawkish" | "Dovish" | "Neutral" | "Mixed" | null;
  // Free-text "→ ..." line for markers whose takeaway isn't a monetary-policy
  // bias (e.g. Treasury auctions' "Yield Pressure ↑/↓") — falls back to
  // `direction` in the tooltip when unset.
  arrowLabel?: string;
}

// "3.1%", "+265K", "151.4B", "10.6" → { num, unit }. Range values (FOMC's
// "4.25%-4.50%") aren't handled here — interpretFomc parses those separately
// since only the upper bound matters for surprise/decision purposes.
function parseEconValue(raw: string | undefined): { num: number; unit: string } | null {
  if (!raw) return null;
  const s = raw.trim();
  if (s === "") return null;
  const m = s.match(/^([+-]?[\d.]+)\s*([%KMB]?)$/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (Number.isNaN(num)) return null;
  return { num, unit: m[2].toUpperCase() };
}

// actual - forecast, formatted in the same unit. Undefined if either value is
// missing/unparseable or the two units disagree — never guesses at a diff.
function formatSurprise(actual: string | undefined, forecast: string | undefined): string | undefined {
  const a = parseEconValue(actual);
  const f = parseEconValue(forecast);
  if (!a || !f || a.unit !== f.unit) return undefined;
  const diff = Number((a.num - f.num).toFixed(2));
  return `${diff > 0 ? "+" : ""}${diff}${a.unit}`;
}

function fieldDetail(label: string, ev?: EconomicEvent): EventFieldDetail {
  return {
    label,
    actual:   ev?.actual   || undefined,
    forecast: ev?.forecast || undefined,
    previous: ev?.previous || undefined,
    surprise: ev ? formatSurprise(ev.actual, ev.forecast) : undefined,
  };
}

// CPI: actual > forecast = hotter inflation = generally hawkish.
function interpretCpi(headline?: EconomicEvent, core?: EconomicEvent): EventDetail | null {
  if (!headline) return null;
  const detail: EventDetail = { title: "CPI", headline: fieldDetail("CPI", headline) };
  if (core) detail.core = fieldDetail("Core CPI", core);
  const a = parseEconValue(headline.actual);
  const f = parseEconValue(headline.forecast);
  if (a && f) {
    if (a.num > f.num)      { detail.tag = "HOT";      detail.direction = "Hawkish"; }
    else if (a.num < f.num) { detail.tag = "COOL";     detail.direction = "Dovish"; }
    else                    { detail.tag = "IN LINE";  detail.direction = "Neutral"; }
  } else {
    // No forecast to compare against (e.g. the FRED-backed fallback for
    // historical releases) — still give a rating, based on the real month-
    // over-month trend (actual vs previous) instead of a forecast surprise,
    // rather than leaving the popup with no read at all.
    const p = parseEconValue(headline.previous);
    if (a && p) {
      if (a.num > p.num)      { detail.tag = "WARMING"; detail.direction = "Hawkish"; }
      else if (a.num < p.num) { detail.tag = "COOLING"; detail.direction = "Dovish"; }
      else                    { detail.tag = "STEADY";  detail.direction = "Neutral"; }
    }
  }
  return detail;
}

// Jobs: NFP actual > forecast = stronger labor = hawkish. Unemployment rate
// actual > forecast = weaker labor = dovish (inverse polarity of NFP).
// Average Hourly Earnings follows NFP's polarity (hotter wages = hawkish).
// Components that disagree report MIXED rather than forcing one conclusion.
function interpretJobs(nfp?: EconomicEvent, unemployment?: EconomicEvent, earnings?: EconomicEvent): EventDetail | null {
  if (!nfp && !unemployment && !earnings) return null;
  const components: EventFieldDetail[] = [];
  if (unemployment) components.push(fieldDetail("Unemployment Rate", unemployment));
  if (earnings)      components.push(fieldDetail("Avg Hourly Earnings", earnings));
  const detail: EventDetail = { title: "Jobs", headline: fieldDetail("NFP", nfp), components };

  const scores: number[] = [];
  // Falls back to actual-vs-previous (the real month-over-month trend) when
  // there's no forecast to compare against — e.g. the FRED-backed fallback
  // for historical releases — rather than silently contributing nothing.
  const score = (actual: string | undefined, forecast: string | undefined, previous: string | undefined, invert = false) => {
    const a = parseEconValue(actual);
    const compareTo = parseEconValue(forecast) ?? parseEconValue(previous);
    if (!a || !compareTo || a.num === compareTo.num) return;
    scores.push((invert ? a.num < compareTo.num : a.num > compareTo.num) ? 1 : -1);
  };
  score(nfp?.actual, nfp?.forecast, nfp?.previous);
  score(unemployment?.actual, unemployment?.forecast, unemployment?.previous, /* lower = stronger */ true);
  score(earnings?.actual, earnings?.forecast, earnings?.previous);

  if (scores.length === 0) return detail; // nothing to classify — degrade gracefully
  if (scores.every(s => s > 0))      { detail.tag = "STRONG LABOR"; detail.direction = "Hawkish"; }
  else if (scores.every(s => s < 0)) { detail.tag = "WEAK LABOR";   detail.direction = "Dovish"; }
  else                                { detail.tag = "MIXED";        detail.direction = "Mixed"; }
  return detail;
}

// Fed funds target range is quoted as "4.25%-4.50%" — the upper bound is what
// this pulls out; a bare number (rare) is used as-is.
function parseFomcRateUpper(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim();
  if (s === "") return null;
  const range = s.match(/([\d.]+)\s*%?\s*[-–]\s*([\d.]+)\s*%?/);
  if (range) return parseFloat(range[2]);
  const single = parseFloat(s);
  return Number.isNaN(single) ? null : single;
}

// FOMC: decision (hike/cut/hold, in bp) from actual vs previous; surprise
// (in line / hawkish / dovish) from actual vs consensus forecast.
function interpretFomc(ev?: EconomicEvent): EventDetail | null {
  if (!ev) return null;
  const detail: EventDetail = { title: "FOMC", headline: fieldDetail("Fed Funds Rate", ev) };
  const actual   = parseFomcRateUpper(ev.actual);
  const previous = parseFomcRateUpper(ev.previous);
  const forecast = parseFomcRateUpper(ev.forecast);
  if (actual === null) return detail; // decision not out yet

  let decision: string | null = null;
  if (previous !== null) {
    const bp = Math.round((actual - previous) * 100);
    decision = bp === 0 ? "HOLD" : bp > 0 ? `HIKE ${bp} bp` : `CUT ${Math.abs(bp)} bp`;
  }
  if (forecast !== null) {
    if (actual === forecast) { detail.tag = decision ? `${decision} — IN LINE` : "IN LINE"; detail.direction = null; }
    else {
      const hawkish = actual > forecast;
      detail.tag = `${decision ? decision + " — " : ""}${hawkish ? "HAWKISH SURPRISE" : "DOVISH SURPRISE"}`;
      detail.direction = hawkish ? "Hawkish" : "Dovish";
    }
  } else if (decision) {
    detail.tag = decision;
  }
  return detail;
}

// SEP: compares this meeting's median projections to the immediately prior
// SEP meeting's, year by year. The headline is whichever year moved the
// most (in bp) — the "most important visual comparison" the feature spec
// calls for — with every other year listed as a component row.
interface SepDetail { headline: EventFieldDetail; components?: EventFieldDetail[]; tag?: string; direction?: "Hawkish" | "Dovish" | null }
function interpretSep(dateIso: string): SepDetail | null {
  const day = dateIso.slice(0, 10);
  const idx = SEP_PROJECTIONS.findIndex(s => s.date === day);
  if (idx === -1) return null;
  const current = SEP_PROJECTIONS[idx].projections;
  const prior = idx > 0 ? SEP_PROJECTIONS[idx - 1].projections : undefined;

  const rows = Object.keys(current)
    .sort((a, b) => (a === "longerRun" ? 1 : b === "longerRun" ? -1 : a.localeCompare(b)))
    .map(key => ({
      label: key === "longerRun" ? "Longer Run" : `${key} Median Rate`,
      newV: current[key],
      prevV: prior?.[key],
    }));

  let headline = rows[0];
  let headlineBp = 0;
  for (const r of rows) {
    if (r.prevV === undefined) continue;
    const bp = Math.round((r.newV - r.prevV) * 100);
    if (Math.abs(bp) > Math.abs(headlineBp)) { headlineBp = bp; headline = r; }
  }

  const toField = (r: typeof rows[number]): EventFieldDetail => ({
    label: r.label,
    actual: `${r.newV.toFixed(2)}%`,
    previous: r.prevV !== undefined ? `${r.prevV.toFixed(2)}%` : undefined,
    surprise: r.prevV !== undefined
      ? `${Math.round((r.newV - r.prevV) * 100) > 0 ? "+" : ""}${Math.round((r.newV - r.prevV) * 100)} bp`
      : undefined,
  });

  const sep: SepDetail = {
    headline: toField(headline),
    components: rows.filter(r => r !== headline).map(toField),
  };
  if (headline.prevV !== undefined) {
    if (headlineBp > 0)      { sep.tag = "HAWKISH SHIFT"; sep.direction = "Hawkish"; }
    else if (headlineBp < 0) { sep.tag = "DOVISH SHIFT";  sep.direction = "Dovish"; }
    else                     { sep.tag = "NO CHANGE"; }
  }
  return sep;
}

// Dispatches a single live-feed event (any country) to the right interpreter
// by its News category — used for the non-USD leg, where each event is its
// own standalone marker rather than part of a grouped US release.
function interpretByCategory(key: NewsCategoryKey, ev: EconomicEvent): EventDetail | null {
  if (key === "cpi") return interpretCpi(ev);
  if (key === "fomc") return interpretFomc(ev);
  const t = ev.title.toLowerCase();
  if (t.includes("unemployment")) return interpretJobs(undefined, ev, undefined);
  if (t.includes("earnings"))     return interpretJobs(undefined, undefined, ev);
  return interpretJobs(ev, undefined, undefined);
}

// ─── Simple pool-driven categories (PCE, GDP, ISM, JOLTS, Retail Sales, PPI,
// Initial Jobless Claims, Fed Chair Press Conference, FOMC Minutes) ──────────
// Unlike FOMC/CPI/Jobs, none of these need a hand-maintained static date
// table — every one of them already arrives as its own dated event in the
// live/persisted feed, so a release simply appears once it's been polled
// (real data only, same graceful-degradation model: nothing shows for a
// release that predates this feature). match() runs against the event's own
// lowercased title; hotLabel/coolLabel are omitted for the two markers
// (press conference, minutes) that carry no numeric actual/forecast to
// compare, so they render as plain informational markers instead of forcing
// a hot/cool read that isn't there.
interface SimpleCategoryDef {
  key: NewsCategoryKey;
  match: (titleLower: string) => boolean;
  hotLabel?: string; coolLabel?: string;
  invert?: boolean; // true: actual < forecast is the "hot/strong" outcome
}
const SIMPLE_CATEGORY_DEFS: SimpleCategoryDef[] = [
  { key: "pce", match: t => t.includes("pce price index"), hotLabel: "HOT", coolLabel: "COOL" },
  { key: "gdp", match: t => t.includes("gdp") && t.includes("q/q") && !t.includes("price index"),
    hotLabel: "STRONG GROWTH", coolLabel: "WEAK GROWTH" },
  { key: "ism", match: t => t.includes("ism"), hotLabel: "STRONG", coolLabel: "WEAK" },
  { key: "jolts", match: t => t.includes("jolts"), hotLabel: "STRONG", coolLabel: "WEAK" },
  { key: "retail_sales", match: t => t.includes("retail sales"), hotLabel: "STRONG", coolLabel: "WEAK" },
  { key: "ppi", match: t => ["ppi m/m", "ppi y/y", "core ppi m/m", "core ppi y/y"].includes(t),
    hotLabel: "HOT", coolLabel: "COOL" },
  // More initial claims than expected = weaker labor market = inverted vs.
  // the usual "actual > forecast is the strong outcome" polarity.
  { key: "jobless_claims", match: t => t === "unemployment claims",
    hotLabel: "STRONG LABOR", coolLabel: "WEAK LABOR", invert: true },
];
function interpretSimple(ev: EconomicEvent, def: SimpleCategoryDef): EventDetail {
  const detail: EventDetail = { title: ev.title, headline: fieldDetail(ev.title, ev) };
  if (!def.hotLabel || !def.coolLabel) return detail; // informational-only marker
  const a = parseEconValue(ev.actual);
  // Falls back to actual-vs-previous (the real trend) when there's no
  // forecast to compare against — e.g. a FRED-backed historical fallback —
  // same reasoning as CPI/Jobs/Retail Sales, so a rating still shows
  // instead of nothing.
  const compareTo = parseEconValue(ev.forecast) ?? parseEconValue(ev.previous);
  if (a && compareTo && a.unit === compareTo.unit) {
    const hot  = def.invert ? a.num < compareTo.num : a.num > compareTo.num;
    const cool = def.invert ? a.num > compareTo.num : a.num < compareTo.num;
    if (hot)       { detail.tag = def.hotLabel;  detail.direction = "Hawkish"; }
    else if (cool) { detail.tag = def.coolLabel; detail.direction = "Dovish"; }
    else           { detail.tag = "IN LINE";     detail.direction = "Neutral"; }
  }
  return detail;
}

// Matches a News category's static release date to the real USD event(s)
// from the combined live+persisted event pool, by same calendar day (both
// the static date and the feed's own `date` field are ISO strings already in
// US Eastern offset, so comparing the first 10 characters is a same-day
// check with no timezone math needed).
function findCpiEvents(pool: EconomicEvent[], dateIso: string): { headline?: EconomicEvent; core?: EconomicEvent } {
  const day = dateIso.slice(0, 10);
  const usd = pool.filter(ev => ev.country?.toUpperCase() === "USD" && ev.date.slice(0, 10) === day);
  const isHeadline = (t: string) => t === "cpi m/m" || t === "cpi y/y" || t === "cpi q/q";
  const isCore      = (t: string) => t === "core cpi m/m" || t === "core cpi y/y";
  const headline = usd.find(ev => ev.title.toLowerCase() === "cpi y/y") ?? usd.find(ev => isHeadline(ev.title.toLowerCase()));
  const core      = usd.find(ev => ev.title.toLowerCase() === "core cpi y/y") ?? usd.find(ev => isCore(ev.title.toLowerCase()));
  return { headline, core };
}
function findJobsEvents(pool: EconomicEvent[], dateIso: string): { nfp?: EconomicEvent; unemployment?: EconomicEvent; earnings?: EconomicEvent } {
  const day = dateIso.slice(0, 10);
  const usd = pool.filter(ev => ev.country?.toUpperCase() === "USD" && ev.date.slice(0, 10) === day);
  const find = (t: string) => usd.find(ev => ev.title.toLowerCase() === t);
  return {
    nfp: find("non-farm employment change"),
    unemployment: find("unemployment rate"),
    earnings: find("average hourly earnings m/m") ?? find("average hourly earnings y/y"),
  };
}
function findFomcEvent(pool: EconomicEvent[], dateIso: string): EconomicEvent | undefined {
  const day = dateIso.slice(0, 10);
  return pool.find(ev => ev.country?.toUpperCase() === "USD" && ev.date.slice(0, 10) === day && ev.title.toLowerCase() === "federal funds rate");
}

// ─── Treasury auction interpretation ──────────────────────────────────────────
// TreasuryDirect's securityTerm for a 30-Year bond's *reopening* auctions is
// its remaining maturity at issuance ("29-Year 10-Month", "29-Year
// 11-Month", …), not "30-Year" — confirmed against the live API. Both count
// as 30Y auctions for this marker; 20-Year bonds ("20-Year", "19-Year
// Xx-Month") are excluded.
function auctionTermLabel(term: string): "10Y" | "30Y" | null {
  if (term === "10-Year" || term.startsWith("9-Year")) return "10Y";
  if (term === "30-Year" || term.startsWith("29-Year")) return "30Y";
  return null;
}
// US Eastern DST: 2nd Sunday of March through 1st Sunday of November (the
// rule since 2007) — good enough here without a timezone library, matching
// how the FOMC/CPI/Jobs date tables above already hand-encode ET offsets.
function isUsEasternDst(year: number, month0: number, day: number): boolean {
  const nthSundayOfMonth = (y: number, m0: number, n: number) => {
    const firstDow = new Date(Date.UTC(y, m0, 1)).getUTCDay(); // 0 = Sunday
    return 1 + ((7 - firstDow) % 7) + (n - 1) * 7;
  };
  const dstStartDay = nthSundayOfMonth(year, 2, 2);  // March
  const dstEndDay   = nthSundayOfMonth(year, 10, 1); // November
  const t = Date.UTC(year, month0, day);
  return t >= Date.UTC(year, 2, dstStartDay) && t < Date.UTC(year, 10, dstEndDay);
}
// auctionDate is date-only (midnight, no timezone) — parsing that directly
// put markers at midnight in whichever timezone the app happens to be
// running in, not the real ~1pm ET auction time (confirmed on the live
// data: "01:00 PM" on every recent 10Y/30Y record). Built as an explicit
// ET-offset ISO string instead, so parsing is deterministic regardless of
// the runtime's local timezone. Auctions before TreasuryDirect tracked
// closingTimeCompetitive fall back to 1:00 PM, the long-standing close time.
function auctionTimestamp(auction: TreasuryAuction): number | null {
  const dateStr = auction.auctionDate.slice(0, 10); // "YYYY-MM-DD", string-sliced — no Date parsing of the untimezoned original
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  const match = (auction.closingTimeCompetitive || "01:00 PM").match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  let hour = 13, minute = 0;
  if (match) {
    hour = parseInt(match[1], 10) % 12;
    minute = parseInt(match[2], 10);
    if (match[3].toUpperCase() === "PM") hour += 12;
  }
  const offset = isUsEasternDst(y, m - 1, d) ? "-04:00" : "-05:00";
  const t = Math.floor(new Date(`${dateStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${offset}`).getTime() / 1000);
  return Number.isNaN(t) ? null : t;
}
function acceptedPct(part: string, total: string): number | null {
  const p = parseFloat(part), t = parseFloat(total);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t === 0) return null;
  return (p / t) * 100;
}
// Treasury's own results have no "tail"/when-issued-yield field (that's a
// market-quoted figure, never published in the official results), so bid-
// to-cover is instead compared against the trailing average of the same
// term's last 6 auctions — the spec's own fallback basis ("evaluated
// relative to recent auctions when historical data is available").
function interpretAuction(current: TreasuryAuction, history: TreasuryAuction[]): EventDetail | null {
  const term = auctionTermLabel(current.securityTerm);
  if (!term) return null;

  const components: EventFieldDetail[] = [];
  if (current.bidToCoverRatio) components.push({ label: "Bid-to-Cover", actual: current.bidToCoverRatio });
  const indirectPct = acceptedPct(current.indirectBidderAccepted, current.totalAccepted);
  const directPct   = acceptedPct(current.directBidderAccepted, current.totalAccepted);
  const dealerPct   = acceptedPct(current.primaryDealerAccepted, current.totalAccepted);
  if (indirectPct !== null) components.push({ label: "Indirect Bidders", actual: `${indirectPct.toFixed(1)}%` });
  if (directPct   !== null) components.push({ label: "Direct Bidders",   actual: `${directPct.toFixed(1)}%` });
  if (dealerPct   !== null) components.push({ label: "Primary Dealers",  actual: `${dealerPct.toFixed(1)}%` });
  // Explicitly listed as unavailable rather than omitted — makes clear this
  // was checked, not forgotten, per the "never fabricate" requirement.
  components.push({ label: "Tail" }, { label: "WI Yield" });

  const detail: EventDetail = {
    title: `${term} Auction`,
    headline: { label: `${term} Auction`, actual: current.highYield ? `${current.highYield}%` : undefined },
    components,
  };

  const bidToCover = parseFloat(current.bidToCoverRatio);
  const priorSameTerm = history
    .filter(h => h.cusip !== current.cusip && auctionTermLabel(h.securityTerm) === term && Number.isFinite(parseFloat(h.bidToCoverRatio)))
    .sort((a, b) => b.auctionDate.localeCompare(a.auctionDate))
    .slice(0, 6);
  if (Number.isFinite(bidToCover) && priorSameTerm.length > 0) {
    const avg = priorSameTerm.reduce((s, h) => s + parseFloat(h.bidToCoverRatio), 0) / priorSameTerm.length;
    if (bidToCover > avg)      { detail.tag = "STRONG AUCTION"; detail.arrowLabel = "Yield Pressure ↓"; }
    else if (bidToCover < avg) { detail.tag = "WEAK AUCTION";   detail.arrowLabel = "Yield Pressure ↑"; }
    else                       { detail.tag = "IN LINE"; }
  }
  return detail;
}

// The News marker hover/click detail tooltip — a compact "quick take" card
// following the mouse: Actual/Forecast, then a bolded tag+surprise line
// ("HOT +0.2%"), condensed one-line components ("Core: +0.1% surprise"),
// then a closing "→ Hawkish"-style read. Degrades to a plain "unavailable"
// message when the marker has no matching structured data (mainly
// historical releases from before this feature started persisting events),
// and to a bare "unavailable" value when a specific field just isn't there
// — never fabricated.
function EventQuickLine({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>
      {label}: <span style={{ color: "var(--text-primary)", fontWeight: bold ? 700 : 600 }}>{value}</span>
    </div>
  );
}
// Condensed to whichever's more informative: the surprise (if this field
// has real forecast data to compare against, e.g. Jobs' Unemployment Rate)
// or the bare actual (e.g. an auction's Bid-to-Cover, which has no
// forecast/surprise concept at all).
function EventQuickComponent({ f }: { f: EventFieldDetail }) {
  const value = f.surprise !== undefined ? `${f.surprise} surprise` : f.actual ?? "unavailable";
  return <EventQuickLine label={f.label} value={value} />;
}
// Full Actual/Forecast/Previous block — used for the headline field and for
// Core, so a fallback-sourced field (e.g. CPI's FRED-backed historical
// entries, which have real Actual/Previous but no Forecast at all) still
// shows everything it does have instead of silently dropping lines.
// Forecast is always shown, explicitly as "unavailable" when absent, so
// it's clear that was checked rather than forgotten; Previous is only
// shown when present since its absence isn't as load-bearing.
function EventFieldBlock({ f, showLabel }: { f: EventFieldDetail; showLabel?: boolean }) {
  return (
    <div style={{ marginBottom: 2 }}>
      {showLabel && (
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginTop: 4, marginBottom: 2 }}>
          {f.label}
        </div>
      )}
      <EventQuickLine label="Actual" value={f.actual ?? "unavailable"} bold />
      <EventQuickLine label="Forecast" value={f.forecast ?? "unavailable"} />
      {f.previous !== undefined && <EventQuickLine label="Previous" value={f.previous} />}
    </div>
  );
}
function NewsMarkerTooltip({ x, y, label, color, detail }: { x: number; y: number; label: string; color: string; detail?: EventDetail }) {
  const directionColor = detail?.direction === "Hawkish" ? "#ef4444" : detail?.direction === "Dovish" ? "#3b82f6" : "var(--text-secondary)";
  return createPortal(
    <div style={{
      position: "fixed", left: x + 12, top: y + 12, zIndex: 1200, pointerEvents: "none",
      background: "var(--bg-panel)", border: `1px solid ${color}`, borderRadius: 10,
      padding: "10px 12px", width: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 800, color }}>{detail?.title ?? label}</span>
      </div>
      {!detail && (
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          No structured data available for this release yet.
        </div>
      )}
      {detail && (
        <>
          <EventFieldBlock f={detail.headline} />
          {detail.tag && (
            <div style={{ marginTop: 4, marginBottom: 2, fontSize: 12, fontWeight: 800, color: directionColor }}>
              {detail.tag}{detail.headline.surprise ? ` ${detail.headline.surprise}` : ""}
            </div>
          )}
          {detail.core && <EventFieldBlock f={detail.core} showLabel />}
          {detail.components?.map((c, i) => <EventQuickComponent key={i} f={c} />)}
          {(detail.arrowLabel || detail.direction) && (
            <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: directionColor }}>&rarr; {detail.arrowLabel ?? detail.direction}</div>
          )}
        </>
      )}
    </div>,
    document.body
  );
}

// A line is positioned either by its real time (resolved to the nearest
// loaded bar, for anything within the loaded candle range) or, for the one
// upcoming preview per category that hasn't happened yet, by a projected
// logical index past the last loaded bar — timeToIndex has no bar to
// resolve a future timestamp to, since none of the candles for it exist
// yet.
interface NewsLineData { time: UTCTimestamp | null; futureIndex?: number; label: string; color: string; detail?: EventDetail; }
class NewsLineRenderer {
  _p: NewsLinePrimitive;
  constructor(p: NewsLinePrimitive) { this._p = p; }
  draw(target: any) {
    const chart = this._p._chart;
    const series = this._p._series;
    const lines = this._p._lines;
    // Cleared here rather than left for the block below — that block never
    // runs when there's nothing to draw (News toggled off, or every line
    // filtered out), which otherwise left stale hit-test entries from the
    // last time it did, so a hover over where a line used to be kept
    // showing its tooltip even with the indicator switched off.
    if (!chart || !series || lines.length === 0) { this._p._hitTest = []; return; }
    try {
    target.useBitmapCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      const h  = scope.bitmapSize.height;
      const ts = chart.timeScale();

      // Resolve every line's x-coordinate first, then sort left-to-right —
      // lines arrive grouped by category (FOMC, then CPI, then Jobs, then
      // live-feed), not by time, so packing rows in that arrival order
      // could miss collisions between e.g. an earlier CPI date and a later
      // FOMC date that land close together. Same greedy row-packing as
      // ReversalMarkerRenderer's candle callouts: a label whose left edge
      // would land inside the previous label's already-claimed span on a
      // row drops to the next row down instead of overlapping it — this is
      // what happens when two static-table dates a year apart (e.g. two
      // Aug 12 CPI releases) sit close enough on screen that their text
      // would otherwise sit on top of each other.
      const resolved: { x: number; l: NewsLineData }[] = [];
      for (const l of lines) {
        let xRaw: number | null;
        if (l.futureIndex !== undefined) {
          // The one upcoming-per-category preview line — projected past the
          // last loaded bar (see the effect that builds _lines), so there's
          // no real bar to resolve via timeToIndex.
          xRaw = ts.logicalToCoordinate(l.futureIndex as any);
        } else {
          // timeToIndex(time, true) snaps the event's exact release
          // timestamp to whichever bar contains it (nearest-match), then
          // logicalToCoordinate centers the line on that bar — the same
          // "exact time → nearest bar" convention every other time-based
          // primitive in this file uses (zones, 8am box, sessions).
          let idx = ts.timeToIndex(l.time as UTCTimestamp, true);
          if (idx === null) continue;
          // Sub-daily bars (4H and finer) are labeled by their own bucket
          // start time, so nearest-match landing on a bucket that opens
          // after the event means it jumped over the bucket that should
          // have contained it (confirmed on US500 4H) — step back one bar.
          // Daily/Weekly bars are labeled differently: they open at 5pm ET,
          // which is *later* than a same-day afternoon event even with a
          // complete, gap-free series, so "opens after the event" is their
          // normal case, not an error — applying this same correction there
          // wrongly bumped a correct Jul 29 FOMC line back to Jul 28.
          // Confirmed correct pre-correction on 1D/1W, so they're excluded.
          if (this._p._applyBarCorrection) {
            const barTimes = this._p._barTimes;
            const i = idx as number;
            const barStart = barTimes[i];
            if (barStart !== undefined && barStart > (l.time as number) && i > 0) idx = i - 1;
          }
          xRaw = ts.logicalToCoordinate(idx as any);
        }
        if (xRaw === null) continue;
        resolved.push({ x: xRaw * hr, l });
      }
      resolved.sort((a, b) => a.x - b.x);

      // Hover hit-test targets, in CSS pixels (xRaw, pre-hr-scaling) — read
      // by the crosshair-move handler that drives the detail tooltip. Kept
      // even for lines with no resolved `detail` (pre-persistence historical
      // markers) so hovering them still surfaces a "data unavailable"
      // tooltip instead of doing nothing, per the graceful-degradation
      // requirement this feature was built around.
      this._p._hitTest = resolved.map(r => ({ xCss: r.x / hr, label: r.l.label, color: r.l.color, detail: r.l.detail }));

      ctx.font = `${Math.round(9 * vr)}px sans-serif`;
      const rowGap  = 12 * vr;
      const padding = 4 * hr;
      const rows: number[] = []; // rightmost pixel already claimed, per row

      for (const { x, l } of resolved) {
        ctx.save();
        ctx.strokeStyle = l.color;
        ctx.lineWidth = hr;
        ctx.setLineDash([4 * hr, 3 * hr]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.restore();

        const left  = x + 3 * hr;
        const right = left + ctx.measureText(l.label).width + padding;
        let row = 0;
        while (rows[row] !== undefined && left < rows[row]) row++;
        rows[row] = right;

        ctx.fillStyle = l.color;
        ctx.textBaseline = "top";
        ctx.fillText(l.label, left, 4 * vr + row * rowGap);
      }
    });
    } catch (_) { /* see IchiCloudRenderer above — never let this blank the chart */ }
  }
}
class NewsLinePaneView {
  _p: NewsLinePrimitive;
  constructor(p: NewsLinePrimitive) { this._p = p; }
  update() {}
  zOrder() { return "top" as const; }
  renderer() { return new NewsLineRenderer(this._p); }
}
class NewsLinePrimitive {
  _chart: any = null;
  _series: any = null;
  _lines: NewsLineData[];
  // Bar-start times (Unix seconds), index-aligned with the chart's own
  // logical indices — set alongside _lines. Used only by the renderer's
  // sub-daily bar-correction (see there for why it's gated off for 1D/1W).
  _barTimes: number[] = [];
  _applyBarCorrection: boolean = true;
  // Populated by the renderer on every draw — see there. Read by the
  // crosshair-move handler that drives the hover/click detail tooltip.
  _hitTest: { xCss: number; label: string; color: string; detail?: EventDetail }[] = [];
  _views: NewsLinePaneView[] = [];
  constructor(lines: NewsLineData[]) { this._lines = lines; }
  attached({ chart, series }: any) { this._chart = chart; this._series = series; this._views = [new NewsLinePaneView(this)]; }
  detached() { this._chart = null; this._series = null; this._views = []; }
  updateAllViews() { this._views.forEach(v => v.update()); }
  paneViews() { return this._views; }
}

// "My time" for time-of-day chart indicators (8am box, trading sessions) —
// matches the app's existing local-time convention used for FTMO
// time-of-day conversions (src/lib/ftmoTime.ts).
const SESSION_LOCAL_ZONE = "America/New_York";

// Chart time axis / crosshair — also rendered in SESSION_LOCAL_ZONE so the
// axis stays consistent with the 8am box and session boxes (lightweight-charts
// defaults to UTC on the axis, which previously made NY-time boxes look
// misaligned against UTC-labeled tick marks).
const NY_AXIS_TIME_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: SESSION_LOCAL_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const NY_AXIS_DATE_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: SESSION_LOCAL_ZONE, month: "short", day: "2-digit",
});
function formatNyTickMark(time: any, tickMarkType: TickMarkType): string {
  const d = new Date((time as number) * 1000);
  return tickMarkType === TickMarkType.Time || tickMarkType === TickMarkType.TimeWithSeconds
    ? NY_AXIS_TIME_FMT.format(d)
    : NY_AXIS_DATE_FMT.format(d);
}
function formatNyCrosshairTime(time: any): string {
  const d = new Date((time as number) * 1000);
  return `${NY_AXIS_DATE_FMT.format(d)} ${NY_AXIS_TIME_FMT.format(d)}`;
}

// ORB (Opening Range Breakout) boxes — one per market open, each anchored to
// the first 15M candle of that session in SESSION_LOCAL_ZONE wall-clock time.
interface OrbDef {
  key: "ny" | "tokyo" | "london" | "ny930";
  label: string;
  hour: number; minute: number;
  durationHours: number;
  fill: string; stroke: string;
}
const ORB_DEFS: OrbDef[] = [
  { key: "tokyo",  label: "Tokyo ORB",    hour: 19, minute: 0,  durationHours: 8, fill: "rgba(168,85,247,0.16)", stroke: "#a855f7" }, // purple
  { key: "london", label: "London ORB",   hour: 3,  minute: 0,  durationHours: 9, fill: "rgba(59,130,246,0.16)",  stroke: "#3b82f6" }, // blue — runs until 12:00
  { key: "ny",     label: "New York ORB", hour: 8,  minute: 0,  durationHours: 9, fill: "rgba(34,197,94,0.16)",   stroke: "#22c55e" }, // green — runs until 17:00
  { key: "ny930",  label: "9:30 ORB",     hour: 9,  minute: 30, durationHours: 8, fill: "rgba(234,179,8,0.16)",   stroke: "#eab308" }, // yellow
];

function computeOrbBoxes(candles: RawCandleTf[], defs: OrbDef[]): TimeRangeBox[] {
  if (defs.length === 0) return [];
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: SESSION_LOCAL_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const boxes: TimeRangeBox[] = [];
  for (const c of candles) {
    const d = new Date(c.timestamp);
    const parts = fmt.formatToParts(d);
    const hour   = Number(parts.find(p => p.type === "hour")?.value);
    const minute = Number(parts.find(p => p.type === "minute")?.value);
    for (const def of defs) {
      if (hour === def.hour && minute === def.minute) {
        const startTime = Math.floor(d.getTime() / 1000) as UTCTimestamp;
        boxes.push({
          low: c.low, high: c.high, startTime, endTime: (startTime + def.durationHours * 60 * 60) as UTCTimestamp,
          fill: def.fill, stroke: def.stroke, midLine: true,
          label: def.label,
        });
      }
    }
  }
  return boxes;
}

// ─── Trading session boxes (Tokyo / London / New York) ────────────────────────
// Hour boundaries are wall-clock in SESSION_LOCAL_ZONE (America/New_York).
// Tokyo wraps past midnight (19:00 → 03:00 next day).
type SessionKey = "tokyo" | "london" | "newyork";
interface SessionDef {
  key: SessionKey; label: string;
  startHour: number; endHour: number; // [startHour, endHour), wraps if startHour > endHour
  fill: string; stroke: string;
}
const SESSION_DEFS: SessionDef[] = [
  { key: "tokyo",   label: "Tokyo",    startHour: 19, endHour: 3,  fill: "rgba(168,85,247,0.14)", stroke: "#a855f7" },
  { key: "london",  label: "London",   startHour: 3,  endHour: 12, fill: "rgba(59,130,246,0.14)",  stroke: "#3b82f6" },
  { key: "newyork", label: "New York", startHour: 8,  endHour: 17, fill: "rgba(34,197,94,0.14)",   stroke: "#22c55e" },
];

function hourInSession(hour: number, def: SessionDef): boolean {
  return def.startHour < def.endHour
    ? hour >= def.startHour && hour < def.endHour
    : hour >= def.startHour || hour < def.endHour;
}

interface SessionInstance { high: number; low: number; startTime: UTCTimestamp; endTime: UTCTimestamp; isCurrent: boolean; }

// Groups a chronological 1H candle array into contiguous runs that fall
// inside `def`'s hour window, tracking the session high/low across the run.
// A run still open at the end of the loaded candles (i.e. "now" is inside
// the session) is returned last, flagged isCurrent — its box grows live as
// new candles arrive rather than stopping at the theoretical session end.
function computeSessionInstances(candles: RawCandleTf[], def: SessionDef): SessionInstance[] {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: SESSION_LOCAL_ZONE, hour: "2-digit", hourCycle: "h23" });
  const hourOf = (c: RawCandleTf) => {
    const raw = fmt.formatToParts(new Date(c.timestamp)).find(p => p.type === "hour")?.value;
    return Number(raw) % 24; // hourCycle h23 can format midnight as "24"
  };
  const instances: SessionInstance[] = [];
  let run: { startIdx: number; high: number; low: number } | null = null;
  const barSeconds = 3600;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (hourInSession(hourOf(c), def)) {
      if (!run) run = { startIdx: i, high: c.high, low: c.low };
      else { run.high = Math.max(run.high, c.high); run.low = Math.min(run.low, c.low); }
    } else if (run) {
      const startC = candles[run.startIdx];
      const endC   = candles[i - 1];
      instances.push({
        high: run.high, low: run.low,
        startTime: Math.floor(new Date(startC.timestamp).getTime() / 1000) as UTCTimestamp,
        endTime:   (Math.floor(new Date(endC.timestamp).getTime() / 1000) + barSeconds) as UTCTimestamp,
        isCurrent: false,
      });
      run = null;
    }
  }
  if (run) {
    const startC = candles[run.startIdx];
    const lastC  = candles[candles.length - 1];
    instances.push({
      high: run.high, low: run.low,
      startTime: Math.floor(new Date(startC.timestamp).getTime() / 1000) as UTCTimestamp,
      endTime:   (Math.floor(new Date(lastC.timestamp).getTime() / 1000) + barSeconds) as UTCTimestamp,
      isCurrent: true,
    });
  }
  return instances;
}

function computeMarketSessionBoxes(
  candles: RawCandleTf[],
  visibility: Record<SessionKey, boolean>,
  backCount: number,
): TimeRangeBox[] {
  const boxes: TimeRangeBox[] = [];
  for (const def of SESSION_DEFS) {
    if (!visibility[def.key]) continue;
    const instances = computeSessionInstances(candles, def);
    const last      = instances[instances.length - 1];
    const current   = last && last.isCurrent ? last : null;
    const completed = current ? instances.slice(0, -1) : instances;
    const picked    = [...completed.slice(-Math.max(0, backCount)), ...(current ? [current] : [])];
    for (const inst of picked) {
      boxes.push({
        low: inst.low, high: inst.high, startTime: inst.startTime, endTime: inst.endTime,
        fill: def.fill, stroke: def.stroke, label: def.label, midLine: true,
      });
    }
  }
  return boxes;
}

// Pivot Points — classic formula from the prior completed period's H/L/C,
// applied to the current (most recent) period only, matching what the
// Pivot Points panel below the chart already shows (not a full stepped
// history — that's both far more visual clutter and far more boxes than
// this reuses TimeRangeBoxPrimitive well for).
const PIVOT_COLOR = "#f59e0b";

// Candle color schemes — "default" is this app's own blue/purple up/down
// convention (used elsewhere for price/change coloring too); "tradingview"
// is the classic green/red TradingView ships with by default.
const CANDLE_COLOR_SCHEMES = {
  default:     { up: "#60a5fa", down: "#a78bfa" },
  tradingview: { up: "#22c55e", down: "#ef4444" },
} as const;
const PIVOT_LEVEL_KEYS = ["r3", "r2", "r1", "pp", "s1", "s2", "s3"] as const;

function computePivotLevels(high: number, low: number, close: number) {
  const pp = (high + low + close) / 3;
  return {
    pp,
    r1: 2 * pp - low,  r2: pp + (high - low),      r3: high + 2 * (pp - low),
    s1: 2 * pp - high, s2: pp - (high - low),       s3: low - 2 * (high - pp),
  };
}

// Extends the line this many multiples of the period's own duration past
// the start of the current bar, so it reads as a forward-looking reference
// level rather than stopping dead at the latest candle.
const PIVOT_FORWARD_PERIODS = 20;

function computeCurrentPivotBoxes(candles: RawCandleTf[], tfLabel: string): TimeRangeBox[] {
  if (candles.length < 2) return [];
  const prev = candles[candles.length - 2];
  const cur  = candles[candles.length - 1];
  const prevTs = Math.floor(new Date(prev.timestamp).getTime() / 1000);
  const curTs  = Math.floor(new Date(cur.timestamp).getTime() / 1000);
  const periodDur = Math.max(1, curTs - prevTs);
  const startTime = curTs as UTCTimestamp;
  const endTime = (curTs + periodDur * PIVOT_FORWARD_PERIODS) as UTCTimestamp;
  const levels = computePivotLevels(prev.high, prev.low, prev.close);
  return PIVOT_LEVEL_KEYS.map(key => ({
    low: levels[key], high: levels[key], startTime, endTime,
    fill: "transparent", stroke: PIVOT_COLOR, label: `${key.toUpperCase()} (${tfLabel})`, labelAlign: "right" as const,
  }));
}

// Auto trendline overlay — diagonal support/resistance lines connecting the
// two most recent qualifying swing pivots, extended to the last candle.
// Color is per-timeframe, set on each TrendlineSegment when it's built (see
// trendColors state + the recompute effect below).
const TRENDLINE_COLOR = "#3b82f6";
// Preset swatches offered in the per-timeframe trendline color picker.
const TRENDLINE_COLOR_PRESETS = ["#3b82f6", "#a855f7", "#22c55e", "#eab308", "#ef4444", "#ec4899", "#06b6d4", "#f97316"];

class TrendlineRenderer {
  _p: TrendlinePrimitive;
  constructor(p: TrendlinePrimitive) { this._p = p; }
  draw(target: any) {
    const chart = this._p._chart;
    const series = this._p._series;
    const lines = this._p._lines;
    if (!chart || !series || lines.length === 0) return;
    try {
    target.useBitmapCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      const w  = scope.bitmapSize.width;
      const ts = chart.timeScale();
      const loaded = this._p._loadedCandles;
      const n = loaded.length;
      if (n < 2) return;

      // Real chart x-coordinate of the loaded bar at array position i —
      // looked up via the bar's own time rather than assumed to equal its
      // array index, so it stays correct however the chart numbers logical
      // indices internally.
      const xOfLoadedBar = (i: number): number | null => {
        const idx = ts.timeToIndex(loaded[i].t, true);
        if (idx === null) return null;
        return ts.logicalToCoordinate(idx as any);
      };

      // Maps ANY unix-second timestamp to a pixel x-coordinate on the
      // chart's actual (gap-aware) time scale — linearly interpolated
      // between the two real loaded bars bracketing it (or extrapolated
      // from the two bars nearest whichever edge it's beyond). This is the
      // whole fix: earlier versions tried to guess which specific loaded
      // bar "really" produced a source-timeframe pivot (by nearest price,
      // then by local pixel-per-second rate) and both were wrong in
      // different ways once the displayed timeframe got much finer than the
      // pivot's source timeframe (e.g. a Weekly pivot shown on a 1H chart).
      // Interpolating against the chart's own real bar positions sidesteps
      // that guessing game entirely — it's exact by construction, and
      // naturally accounts for weekend/holiday gaps because it's built from
      // the actual pixel spacing between real bars, not an assumed rate.
      const timeToX = (t: number): number | null => {
        let loIdx: number, hiIdx: number;
        if (t <= loaded[0].t) { loIdx = 0; hiIdx = 1; }
        else if (t >= loaded[n - 1].t) { loIdx = n - 2; hiIdx = n - 1; }
        else {
          let lo = 0, hi = n - 1;
          while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (loaded[mid].t <= t) lo = mid; else hi = mid;
          }
          loIdx = lo; hiIdx = hi;
        }
        const xLo = xOfLoadedBar(loIdx);
        const xHi = xOfLoadedBar(hiIdx);
        if (xLo === null || xHi === null) return null;
        const dt = loaded[hiIdx].t - loaded[loIdx].t;
        if (dt === 0) return xLo;
        return xLo + (xHi - xLo) * ((t - loaded[loIdx].t) / dt);
      };

      // Finds the loaded bar that IS the true local extreme (highest high /
      // lowest low) within the pivot's own source bar span [t, t+srcDur) —
      // i.e. the actual bar the wick happened on, found by definition
      // rather than by closest-price guessing (which breaks down near
      // re-tested support/resistance levels, where several bars can share a
      // near-identical price). Returns -1 if that span isn't covered by the
      // loaded window at all.
      const findWickBarIdx = (t: number, type: "support" | "resistance", srcDur: number): number => {
        if (srcDur <= 0) return -1;
        let bestVal = type === "resistance" ? -Infinity : Infinity;
        let bestI = -1;
        for (let i = 0; i < n; i++) {
          const c = loaded[i];
          if (c.t < t || c.t >= t + srcDur) continue;
          const val = type === "resistance" ? c.h : c.l;
          const better = type === "resistance" ? val > bestVal : val < bestVal;
          if (better) { bestVal = val; bestI = i; }
        }
        return bestI;
      };

      // Resolves a pivot's x-coordinate: the exact wick bar when its source
      // span is covered by the loaded window (the common case — this is
      // what makes the line actually touch the candle that set the level),
      // falling back to the gap-aware interpolation above (using the
      // pivot's own bar-open time) only when that span predates everything
      // that's loaded, since then there's no real bar to point to at all.
      const anchorX = (t: number, type: "support" | "resistance", srcDur: number)
        : { x: number | null; wickIdx: number } => {
        const wickIdx = findWickBarIdx(t, type, srcDur);
        return wickIdx >= 0 ? { x: xOfLoadedBar(wickIdx), wickIdx } : { x: timeToX(t), wickIdx: -1 };
      };

      for (const l of lines) {
        if (l.t2 === l.t1) continue;
        const y1Raw = series.priceToCoordinate(l.p1);
        const y2Raw = series.priceToCoordinate(l.p2);
        if (y1Raw === null || y2Raw === null) continue;

        const a1 = anchorX(l.t1, l.type, l.srcDurationSec);
        const a2 = anchorX(l.t2, l.type, l.srcDurationSec);
        if (a1.x === null || a2.x === null) continue;

        const circle1X = a1.wickIdx >= 0 ? a1.x : null;
        const circle2X = a2.wickIdx >= 0 ? a2.x : null;

        const x1 = a1.x * hr, x2 = a2.x * hr;
        const y1 = y1Raw * vr, y2 = y2Raw * vr;

        // Extend as a ray from the most recent anchor to the right edge of
        // the pane, rather than stopping there.
        let xEnd = w, yEnd = y2;
        const dx = x2 - x1;
        if (dx !== 0) yEnd = y2 + ((y2 - y1) / dx) * (w - x2);

        const lineColor = l.color || TRENDLINE_COLOR;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(xEnd, yEnd);
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = hr;
        ctx.stroke();

        // Right-edge label — which timeframe this ray was computed on, and
        // that it's an auto-detected trend line (as opposed to one of the
        // user's own manually-drawn trend lines/rays). Rotated to run
        // parallel to the ray itself: xEnd is always > x1 (the ray only
        // ever extends rightward, toward the pane edge), so the x1→xEnd
        // angle is always within ±90° of horizontal and reads upright with
        // no separate upside-down correction needed.
        if (l.tfLabel) {
          const angle = Math.atan2(yEnd - y1, xEnd - x1);
          ctx.save();
          ctx.translate(w - 6 * hr, yEnd - 8 * vr);
          ctx.rotate(angle);
          ctx.font = `${Math.round(10 * vr)}px sans-serif`;
          ctx.textAlign = "right";
          ctx.textBaseline = "middle";
          ctx.fillStyle = lineColor;
          ctx.fillText(`Auto Trendline (${l.tfLabel})`, 0, 0);
          ctx.restore();
        }

        for (const [cxRaw, cyRaw] of [[circle1X, y1Raw], [circle2X, y2Raw]] as [number | null, number | null][]) {
          if (cxRaw === null || cyRaw === null) continue;
          ctx.beginPath();
          ctx.arc(cxRaw * hr, cyRaw * vr, 3 * hr, 0, Math.PI * 2);
          ctx.fillStyle = lineColor;
          ctx.fill();
        }
      }
    });
    } catch (_) { /* see IchiCloudRenderer above — never let this blank the chart */ }
  }
}
class TrendlinePaneView {
  _p: TrendlinePrimitive;
  constructor(p: TrendlinePrimitive) { this._p = p; }
  update() {}
  zOrder() { return "top" as const; }
  renderer() { return new TrendlineRenderer(this._p); }
}
class TrendlinePrimitive {
  _chart: any = null;
  _series: any = null;
  _lines: TrendlineSegment[];
  _oldestLoadedTime = 0;
  _loadedCandles: { t: number; h: number; l: number }[] = [];
  _views: TrendlinePaneView[] = [];
  constructor(lines: TrendlineSegment[]) { this._lines = lines; }
  attached({ chart, series }: any) { this._chart = chart; this._series = series; this._views = [new TrendlinePaneView(this)]; }
  detached() { this._chart = null; this._series = null; this._views = []; }
  updateAllViews() { this._views.forEach(v => v.update()); }
  paneViews() { return this._views; }
}

// Ghosted instrument-name watermark — Quad View only (see PriceHistoryChart's
// createSeries), large low-opacity text centered behind the candles so each
// tile is identifiable at a glance without reading its small toolbar label.
// zOrder "bottom" (same as ZoneBoxPrimitive) draws it under the candle series.
class WatermarkRenderer {
  _p: WatermarkPrimitive;
  constructor(p: WatermarkPrimitive) { this._p = p; }
  draw(target: any) {
    const text = this._p._text;
    if (!text) return;
    try {
    target.useBitmapCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      const w = scope.bitmapSize.width;
      const h = scope.bitmapSize.height;
      if (w === 0 || h === 0) return;
      const fontSize = Math.max(9, Math.min(h * 0.17, (w / text.length) * 0.775));
      ctx.save();
      ctx.fillStyle = "rgba(148,163,184,0.12)";
      ctx.font = `800 ${Math.round(fontSize)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, w / 2, h / 2);
      ctx.restore();
    });
    } catch (_) { /* see IchiCloudRenderer above — never let this blank the chart */ }
  }
}
class WatermarkPaneView {
  _p: WatermarkPrimitive;
  constructor(p: WatermarkPrimitive) { this._p = p; }
  update() {}
  zOrder() { return "bottom" as const; }
  renderer() { return new WatermarkRenderer(this._p); }
}
class WatermarkPrimitive {
  _chart: any = null;
  _series: any = null;
  _text: string;
  _views: WatermarkPaneView[] = [];
  constructor(text: string) { this._text = text; }
  attached({ chart, series }: any) { this._chart = chart; this._series = series; this._views = [new WatermarkPaneView(this)]; }
  detached() { this._chart = null; this._series = null; this._views = []; }
  updateAllViews() { this._views.forEach(v => v.update()); }
  paneViews() { return this._views; }
}

// ─── Quad Chart — condensed dropdown controls ─────────────────────────────────
// Single-select (e.g. chart timeframe) and multi-select (e.g. Supply/Demand
// or Trend Lines per-timeframe toggles) collapsed into one button + portaled
// popover, so the equivalent full button row fits in a quarter-width tile.

function TfDropdown<T extends string>({ value, options, onChange }: {
  value: T; options: readonly T[]; onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!btnRef.current?.contains(target) && !popRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <button
        ref={btnRef}
        onClick={() => { const r = btnRef.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 6, left: r.left }); setOpen(v => !v); }}
        style={{
          fontSize: 9, fontWeight: 700, padding: "4px 6px",
          textTransform: "uppercase", letterSpacing: "0.06em",
          background: "var(--bg-panel-alt)", border: "1px solid var(--border-medium)",
          color: "var(--text-secondary)", borderRadius: 8, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 3, whiteSpace: "nowrap",
        }}
      >
        {value}
        <ChevronDown size={10} />
      </button>
      {open && pos && createPortal(
        <div ref={popRef} style={{
          position: "fixed", top: pos.top, left: pos.left, zIndex: 1000,
          background: "var(--bg-panel)", border: "1px solid var(--border-medium)",
          borderRadius: 10, padding: 5, boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          display: "flex", flexDirection: "column", gap: 2, minWidth: 68,
        }}>
          {options.map(opt => (
            <button key={opt} onClick={() => { onChange(opt); setOpen(false); }} style={{
              fontSize: 10, fontWeight: 700, padding: "4px 8px", textAlign: "left",
              background: opt === value ? "var(--accent-dim)" : "transparent",
              border: "none", color: opt === value ? "var(--accent-text)" : "var(--text-secondary)",
              borderRadius: 6, cursor: "pointer",
            }}>{opt}</button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

function MultiTfDropdown({ label, options, active, onToggle, accentColor = "var(--accent-text)" }: {
  label: string; options: readonly string[]; active: Record<string, boolean>; onToggle: (key: string) => void; accentColor?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!btnRef.current?.contains(target) && !popRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const activeCount = options.filter(o => active[o]).length;
  return (
    <div style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <button
        ref={btnRef}
        onClick={() => { const r = btnRef.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 6, left: r.left }); setOpen(v => !v); }}
        style={{
          fontSize: 9, fontWeight: 700, padding: "4px 6px",
          textTransform: "uppercase", letterSpacing: "0.06em",
          background: activeCount > 0 ? "var(--accent-dim)" : "var(--bg-panel-alt)",
          border:     activeCount > 0 ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
          color:      activeCount > 0 ? "var(--accent-text)" : "var(--text-secondary)",
          borderRadius: 8, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 3, whiteSpace: "nowrap",
        }}
      >
        {label}
        <ChevronDown size={10} />
      </button>
      {open && pos && createPortal(
        <div ref={popRef} style={{
          position: "fixed", top: pos.top, left: pos.left, zIndex: 1000,
          background: "var(--bg-panel)", border: "1px solid var(--border-medium)",
          borderRadius: 10, padding: "8px 10px", boxShadow: "0 8px 24px rgba(0,0,0,0.45)", minWidth: 130,
        }}>
          {options.map(opt => (
            <button key={opt} onClick={() => onToggle(opt)} style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              background: "none", border: "none", padding: "4px 2px", cursor: "pointer", textAlign: "left",
            }}>
              <span style={{
                width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                border: `2px solid ${accentColor}`, background: active[opt] ? accentColor : "transparent",
              }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: active[opt] ? "var(--text-primary)" : "var(--text-secondary)" }}>
                {opt}
              </span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Instrument picker (compact) ──────────────────────────────────────────
// A small searchable pair-picker button, used by each Quad View tile (each
// PriceHistoryChart instance in compact mode) to let the user change that
// tile's instrument independently. Reuses the same ALL_ASSETS list as the
// page-level PairSelector.
function InstrumentPicker({ pair, onChange }: { pair: string; onChange: (p: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!btnRef.current?.contains(target) && !popRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const norm = (s: string) => s.replace(/[\s/]/g, "").toLowerCase();
  const results = (query.trim() ? ALL_ASSETS.filter(a => norm(a.pair).includes(norm(query))) : ALL_ASSETS).slice(0, 30);
  return (
    <div style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <button
        ref={btnRef}
        onClick={() => { const r = btnRef.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 6, left: r.left }); setQuery(""); setOpen(v => !v); }}
        title="Change this chart's instrument"
        style={{
          fontSize: 11, fontWeight: 800, padding: "4px 7px",
          background: "var(--bg-panel-alt)", border: "1px solid var(--border-medium)",
          color: "var(--text-primary)", borderRadius: 8, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
        }}
      >
        {pair}
        <ChevronDown size={10} />
      </button>
      {open && pos && createPortal(
        <div ref={popRef} style={{
          position: "fixed", top: pos.top, left: pos.left, zIndex: 1000,
          background: "var(--bg-panel)", border: "1px solid var(--border-medium)",
          borderRadius: 10, padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.45)", width: 180,
        }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search instrument…"
            style={{
              width: "100%", fontSize: 11, padding: "5px 7px", marginBottom: 4, boxSizing: "border-box",
              background: "var(--bg-panel-alt)", border: "1px solid var(--border-medium)",
              color: "var(--text-primary)", borderRadius: 6, outline: "none",
            }}
          />
          <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
            {results.length === 0 ? (
              <span style={{ fontSize: 10, color: "var(--text-muted)", padding: "4px 6px" }}>No matches</span>
            ) : results.map(a => (
              <button key={a.pair} onClick={() => { onChange(a.pair); setOpen(false); }} style={{
                fontSize: 11, fontWeight: 600, padding: "4px 7px", textAlign: "left",
                background: a.pair === pair ? "var(--accent-dim)" : "transparent",
                border: "none", color: a.pair === pair ? "var(--accent-text)" : "var(--text-secondary)",
                borderRadius: 6, cursor: "pointer",
              }}>{a.pair}</button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// A single icon button for the drawing-tool rail, with a custom hover label
// instead of relying on the native `title` tooltip — the rail's icons are
// small and some look alike (a rotated vs. plain "Minus" for trend line vs.
// horizontal line), and native tooltips are inconsistent inside the Tauri
// webview (slow to appear, easy to miss), so this shows immediately and uses
// the same floating-panel styling as the chart's other popovers.
function ToolbarIconButton({ label, active, disabled, onClick, children, rootRef, style }: {
  label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode;
  rootRef?: React.Ref<HTMLDivElement>; style?: React.CSSProperties;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div ref={rootRef} style={{ position: "relative", ...style }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
          background: active ? "var(--accent-dim)" : "transparent",
          border: active ? "1px solid var(--accent-border)" : "1px solid transparent",
          borderRadius: 6, color: disabled ? "var(--text-muted)" : (active ? "var(--accent-text)" : "var(--text-secondary)"),
          cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
          fontSize: 9, fontWeight: 700, padding: 0,
        }}
      >
        {children}
      </button>
      {hover && (
        <div style={{
          position: "absolute", left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)",
          background: "var(--bg-panel)", border: "1px solid var(--border-medium)", borderRadius: 6,
          padding: "4px 8px", fontSize: 10, fontWeight: 600, color: "var(--text-primary)",
          whiteSpace: "nowrap", boxShadow: "0 8px 24px rgba(0,0,0,0.45)", zIndex: 20, pointerEvents: "none",
        }}>
          {label}
        </div>
      )}
    </div>
  );
}

// ─── Price history chart ────────────────────────────────────────────────────────

function PriceHistoryChart({
  rows, pair, onPairChange, chartTf: chartTfProp, setChartTf: setChartTfProp, livePrice, expandWidth, expandHeight, heightBoost,
  allPanelsCollapsed, onToggleAllPanels, rightOfChartCollapsed, onHeightChange, calendarEvents, storedEconomicEvents, treasuryAuctions,
  compact = false, quadView, onToggleQuadView, showSnapshotAndExpand = true, snapshotTargetRef,
  quadLocked = false, onToggleQuadLocked,
}: {
  rows: SheetRow[]; pair: string; onPairChange?: (pair: string) => void;
  chartTf?: "1W" | "1D" | "4H" | "1H" | "15M" | "5M" | "1M"; setChartTf?: (tf: "1W" | "1D" | "4H" | "1H" | "15M" | "5M" | "1M") => void;
  livePrice: number | null; expandWidth: boolean; expandHeight: boolean; heightBoost: number;
  allPanelsCollapsed: boolean; onToggleAllPanels: () => void; rightOfChartCollapsed: boolean; onHeightChange: (h: number) => void;
  calendarEvents: EconomicEvent[]; storedEconomicEvents: EconomicEvent[]; treasuryAuctions: TreasuryAuction[];
  compact?: boolean; quadView: boolean; onToggleQuadView: () => void;
  // Quad View shows only one Snapshot + Expand pair (on the designated tile)
  // rather than one per tile. When snapshotTargetRef is given, Snapshot
  // captures that element (the whole grid) instead of this tile's own chart.
  showSnapshotAndExpand?: boolean; snapshotTargetRef?: React.RefObject<HTMLDivElement | null>;
  // Quad View lock — when on, the primary tile (showSnapshotAndExpand===true)
  // broadcasts its toolbar settings via quadSyncEvents and the other 3 apply
  // them; onToggleQuadLocked only needs to be wired up on the primary tile,
  // since that's the only one rendering the lock button.
  quadLocked?: boolean; onToggleQuadLocked?: () => void;
}) {
  // Quad View tiles (compact=true) each need their own independent
  // timeframe — the page only owns one chartTf/setChartTf pair (for the
  // single-chart view), so compact instances fall back to local state
  // instead of the prop. Every other reference to chartTf/setChartTf below
  // stays unchanged thanks to this shadowing.
  const [compactChartTf, setCompactChartTf] = useState<"1W" | "1D" | "4H" | "1H" | "15M" | "5M" | "1M">("15M");
  const chartTf    = compact ? compactChartTf    : chartTfProp!;
  const setChartTf = compact ? setCompactChartTf : setChartTfProp!;

  // Which indicators/overlays are on and how the chart is styled — a
  // standing display preference (see getChartViewSettings), not tied to any
  // one instrument, so it's read once here rather than per-pair like
  // drawings are. Quad View tiles (compact) don't participate — 4 of them
  // sharing one stored toggle set would clobber each other constantly.
  const [initialChartView] = useState(() => compact ? null : getChartViewSettings());

  const [viewMode,   setViewMode]   = useState<"candles" | "line">(initialChartView?.viewMode ?? "candles");
  const [tfRows,     setTfRows]     = useState<RawCandleTf[]>([]);
  const [tfLoading,  setTfLoading]  = useState(false);
  const [activeInds, setActiveInds] = useState<Set<IndKey>>(
    () => new Set((initialChartView?.activeInds ?? ["volume"]) as IndKey[])
  );

  // Open positions on the currently viewed instrument, from the Trade Log —
  // an "open" trade is one with no closedAt yet. Plotted as full-width
  // entry/SL/TP price lines, same mechanism as the live last-price line.
  const [openTrades, setOpenTrades] = useState<TradeWithJournal[]>([]);

  // Candle color scheme — "default" is this app's existing blue/purple
  // up/down scheme; "tradingview" is the classic green/red TradingView
  // ships with out of the box. Read via a ref inside createSeries (which
  // can otherwise hold a stale closure across renders) so switching the
  // view mode back to "candles" later still honors the current choice.
  const [candleColorScheme, setCandleColorScheme] = useState<"default" | "tradingview">(initialChartView?.candleColorScheme ?? "tradingview");
  const candleColorSchemeRef = useRef(candleColorScheme);
  useEffect(() => { candleColorSchemeRef.current = candleColorScheme; }, [candleColorScheme]);
  // Read via ref inside createSeries/addIndSeries (stable-identity callbacks
  // with empty/unrelated dep arrays — see candleColorSchemeRef above) so
  // switching instruments still picks up the right decimal precision.
  const pairRef = useRef(pair);
  useEffect(() => { pairRef.current = pair; }, [pair]);
  // Quad View tiles can change instrument in place (InstrumentPicker) without
  // remounting the chart, so the watermark primitive's text needs its own
  // sync effect rather than only being set once at createSeries time.
  useEffect(() => {
    if (watermarkPrimRef.current) {
      watermarkPrimRef.current._text = pair;
      chartRef.current?.applyOptions({});
    }
  }, [pair]);
  const [showCandleSettings, setShowCandleSettings] = useState(false);
  const [candleSettingsPos, setCandleSettingsPos] = useState<{ top: number; left: number } | null>(null);
  const viewModeBtnRef = useRef<HTMLButtonElement>(null);
  const candleSettingsPopoverRef = useRef<HTMLDivElement>(null);

  // Supply/demand zone toggles — all opt-in, none on by default
  const [showDailyZones, setShowDailyZones] = useState(initialChartView?.showDailyZones ?? false);
  const [show4HZones,    setShow4HZones]    = useState(initialChartView?.show4HZones ?? false);
  const [show1HZones,    setShow1HZones]    = useState(initialChartView?.show1HZones ?? false);
  const [show15MZones,   setShow15MZones]   = useState(initialChartView?.show15MZones ?? false);
  const [show5MZones,    setShow5MZones]    = useState(initialChartView?.show5MZones ?? false);
  // Polled every 10s so each zone timeframe's still-forming candle keeps
  // tracking live price (see useLiveCandles).
  const dailyZoneCandles = useLiveCandles(pair, "1D",  showDailyZones,  10_000);
  const h4ZoneCandles    = useLiveCandles(pair, "4H",  show4HZones,     10_000);
  const h1ZoneCandles    = useLiveCandles(pair, "1H",  show1HZones,     10_000);
  const m15ZoneCandles   = useLiveCandles(pair, "15M", show15MZones,    10_000);
  const m5ZoneCandles    = useLiveCandles(pair, "5M",  show5MZones,     10_000);

  // Auto trendline toggles — Weekly on by default, Daily/4H/1H/15M/5M/1M off
  const [showWeeklyTrend, setShowWeeklyTrend] = useState(initialChartView?.showWeeklyTrend ?? true);
  const [showDailyTrend,  setShowDailyTrend]  = useState(initialChartView?.showDailyTrend ?? false);
  const [show4HTrend,     setShow4HTrend]     = useState(initialChartView?.show4HTrend ?? false);
  const [show1HTrend,     setShow1HTrend]     = useState(initialChartView?.show1HTrend ?? false);
  const [show15MTrend,    setShow15MTrend]    = useState(initialChartView?.show15MTrend ?? false);
  const [show5MTrend,     setShow5MTrend]     = useState(initialChartView?.show5MTrend ?? false);
  const [show1MTrend,     setShow1MTrend]     = useState(initialChartView?.show1MTrend ?? false);
  // Fetched once per toggle/pair change — no polling (see useLiveCandles;
  // this predates it and is intentional, unlike the zone candles above).
  const weeklyTrendCandles = useLiveCandles(pair, "1W",  showWeeklyTrend);
  const dailyTrendCandles  = useLiveCandles(pair, "1D",  showDailyTrend);
  const h4TrendCandles     = useLiveCandles(pair, "4H",  show4HTrend);
  const h1TrendCandles     = useLiveCandles(pair, "1H",  show1HTrend);
  const m15TrendCandles    = useLiveCandles(pair, "15M", show15MTrend);
  const m5TrendCandles     = useLiveCandles(pair, "5M",  show5MTrend);
  const m1TrendCandles     = useLiveCandles(pair, "1M",  show1MTrend);

  // Pivot Points toggles — master on/off lives on activeInds ("pivots"),
  // same as Reversal/8AM Box; these four control which timeframe(s) render
  // once the indicator itself is active. Weekly/Daily on by default, rest opt-in.
  const [showPivotWeekly, setShowPivotWeekly] = useState(true);
  const [showPivotDaily,  setShowPivotDaily]  = useState(true);
  const [showPivot4H,     setShowPivot4H]     = useState(false);
  const [showPivot1H,     setShowPivot1H]     = useState(false);
  // One-shot per toggle/pair change, same as the trendline candles above.
  const pivotWeeklyCandles = useLiveCandles(pair, "1W", showPivotWeekly);
  const pivotDailyCandles  = useLiveCandles(pair, "1D", showPivotDaily);
  const pivot4HCandles     = useLiveCandles(pair, "4H", showPivot4H);
  const pivot1HCandles     = useLiveCandles(pair, "1H", showPivot1H);
  const [showPivotSettings, setShowPivotSettings] = useState(false);
  const [pivotSettingsPos, setPivotSettingsPos] = useState<{ top: number; left: number } | null>(null);
  const pivotBtnRef = useRef<HTMLButtonElement>(null);
  const pivotSettingsPopoverRef = useRef<HTMLDivElement>(null);

  // Economic news event lines — its own toolbar button + settings popout,
  // driven by the calendarEvents already fetched for the Economic Calendar
  // panel (no separate fetch).
  const [showNews, setShowNews] = useState(initialChartView?.showNews ?? false);
  const [newsCategoryVisibility, setNewsCategoryVisibility] = useState<Record<NewsCategoryKey, boolean>>({
    fomc: true, sep: true, fomc_presser: true, fomc_minutes: true,
    cpi: true, pce: true, jobs: true, gdp: true, ism: true, jolts: true, retail_sales: true, ppi: true, jobless_claims: true,
    auction: true,
  });
  // Per-category, per-currency sub-filter — CPI and Jobs Reports both
  // release under multiple countries (e.g. EUR/USD's own CPI plus every
  // Eurozone country's CPI all match the "cpi" category), so the category
  // toggle alone can't isolate just one side. Keyed "key:CURRENCY", true
  // unless explicitly turned off — absent entries default to visible so
  // switching pairs doesn't require re-enabling currencies never touched.
  const [newsCurrencyVisibility, setNewsCurrencyVisibility] = useState<Record<string, boolean>>({});
  const isNewsCurrencyVisible = useCallback(
    (key: NewsCategoryKey, currency: string) => newsCurrencyVisibility[`${key}:${currency}`] !== false,
    [newsCurrencyVisibility]
  );
  const [showNewsSettings, setShowNewsSettings] = useState(false);
  const [newsSettingsPos, setNewsSettingsPos] = useState<{ top: number; left: number } | null>(null);
  const newsBtnRef = useRef<HTMLButtonElement>(null);
  const newsSettingsPopoverRef = useRef<HTMLDivElement>(null);
  // Hover/click detail tooltip for a News marker — driven by the chart's
  // native crosshair-move subscription (see the chart-init effect), matched
  // against NewsLinePrimitive._hitTest (set by the renderer on every draw).
  const [newsHover, setNewsHover] = useState<{ x: number; y: number; label: string; color: string; detail?: EventDetail } | null>(null);

  // OHLC readout for whichever candle the crosshair is over (TradingView-style
  // legend), set from the same crosshair-move subscription below via
  // param.seriesData — that gives the exact bar the chart itself is hovering,
  // so it stays correct across candle vs. area viewMode without a manual
  // time-to-row lookup. null (mouse left the chart) falls back to the latest
  // loaded bar at render time so the legend never goes blank.
  const [hoverBar, setHoverBar] = useState<{ open: number; high: number; low: number; close: number } | null>(null);

  // Manual drawing-tool rail (trend line / ray / horizontal / rectangle /
  // fib / gann / text) — see DrawingPrimitive above. Persisted per
  // pair+timeframe via getChartDrawings/setChartDrawings, same pattern as
  // getReversalSettings. activeDrawToolRef mirrors activeDrawTool for the
  // chart's native click/crosshair subscriptions (set up once on mount,
  // so they close over refs rather than stale state).
  const [activeDrawTool, setActiveDrawTool] = useState<DrawTool>("cursor");
  const [drawings, setDrawingsState] = useState<Drawing[]>([]);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [textPrompt, setTextPrompt] = useState<{ x: number; y: number; point: DrawPoint } | null>(null);
  useEffect(() => { activeDrawToolRef.current = activeDrawTool; }, [activeDrawTool]);
  // Magnet mode — like TradingView's, snaps a placed point's price to the
  // nearest of that bar's O/H/L/C instead of the raw cursor position. Applied
  // in onChartClick (final placement) and the crosshair-move handler (the
  // rubber-band preview) below, both via snapPriceToOHLC.
  const [magnetMode, setMagnetMode] = useState(false);
  useEffect(() => { magnetModeRef.current = magnetMode; }, [magnetMode]);
  // Layers panel — lists every drawing on the current chart with a per-item
  // show/hide toggle (see toggleDrawingHidden). Same popover pattern as the
  // rest of the toolbar (button ref + pos + outside-click close below).
  const [showLayersPanel, setShowLayersPanel] = useState(false);
  const [layersPanelPos, setLayersPanelPos] = useState<{ bottom: number; left: number } | null>(null);
  const layersBtnRef = useRef<HTMLDivElement>(null);
  const layersPopoverRef = useRef<HTMLDivElement>(null);
  useEffect(() => { drawingsRef.current = drawings; if (drawingPrimRef.current) drawingPrimRef.current._drawings = drawings; }, [drawings]);
  useEffect(() => {
    selectedDrawingIdRef.current = selectedDrawingId;
    if (drawingPrimRef.current) drawingPrimRef.current._selectedId = selectedDrawingId;
  }, [selectedDrawingId]);
  // Persist on every change, and reload whenever the chart switches
  // pair/timeframe (drawings are scoped per-chart, like TradingView's).
  const persistDrawings = useCallback((next: Drawing[]) => {
    // Sync the ref synchronously (not just via the state-mirror effect below)
    // so two clicks in quick succession — e.g. placing two horizontal lines
    // back to back — each see the other's just-added drawing rather than
    // racing the effect's next-render timing and clobbering one another.
    drawingsRef.current = next;
    if (drawingPrimRef.current) drawingPrimRef.current._drawings = next;
    setDrawingsState(next);
    setChartDrawings(pairRef.current, next);
    // Mutating the primitive's data directly (above) doesn't itself make
    // lightweight-charts repaint — it only picks the change up on whatever
    // next repaint happens to occur for some unrelated reason (a crosshair
    // move, a live price tick's setData). Toggling/deleting/clearing a
    // drawing from the Layers panel or toolbar has nothing else forcing a
    // repaint, so without this the change sits invisible until the mouse
    // happens to move over the chart. applyOptions({}) is the same
    // no-op-options nudge marketSessionPrim's update effect already uses to
    // force one immediately.
    chartRef.current?.applyOptions({});
  }, []);
  const cancelPendingDrawing = useCallback(() => {
    pendingPointRef.current = null;
    pendingSecondPointRef.current = null;
    if (drawingPrimRef.current) drawingPrimRef.current._pending = null;
    setActiveDrawTool("cursor");
    setTextPrompt(null);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cancelPendingDrawing(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelPendingDrawing]);
  const deleteSelectedDrawing = useCallback(() => {
    if (!selectedDrawingId) return;
    persistDrawings(drawingsRef.current.filter(d => d.id !== selectedDrawingId));
    setSelectedDrawingId(null);
  }, [selectedDrawingId, persistDrawings]);
  // Delete/Backspace removes the selected drawing — skipped while an input
  // (e.g. the text-drawing prompt, or any other text field in the app) has
  // focus, so Backspace still edits text normally there.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (!selectedDrawingId) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      deleteSelectedDrawing();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedDrawingId, deleteSelectedDrawing]);
  const clearAllDrawings = useCallback(() => {
    if (drawingsRef.current.length === 0) return;
    if (!window.confirm("Clear all drawings on this chart?")) return;
    persistDrawings([]);
    setSelectedDrawingId(null);
  }, [persistDrawings]);
  const toggleDrawingHidden = useCallback((id: string) => {
    persistDrawings(drawingsRef.current.map(d => d.id === id ? { ...d, hidden: !d.hidden } : d));
  }, [persistDrawings]);

  // Trendline count per timeframe — how many support + resistance rays to
  // draw for each, configurable from the Lines settings panel.
  const [trendCounts, setTrendCounts] = useState<{ W: number; D: number; H4: number; H1: number; M15: number; M5: number; M1: number }>({
    W: 1, D: 1, H4: 1, H1: 1, M15: 1, M5: 1, M1: 1,
  });
  // Trendline color per timeframe, configurable from the same Lines settings
  // panel — all default to the original blue.
  const [trendColors, setTrendColors] = useState<{ W: string; D: string; H4: string; H1: string; M15: string; M5: string; M1: string }>({
    W: TRENDLINE_COLOR, D: TRENDLINE_COLOR, H4: TRENDLINE_COLOR, H1: TRENDLINE_COLOR,
    M15: TRENDLINE_COLOR, M5: TRENDLINE_COLOR, M1: TRENDLINE_COLOR,
  });
  // Which timeframe row (if any) has its color swatch picker expanded —
  // hidden by default, opened per-row via the swatch button beside the count.
  const [openTrendColorKey, setOpenTrendColorKey] = useState<string | null>(null);
  const [showTrendSettings, setShowTrendSettings] = useState(false);
  const [trendSettingsPos, setTrendSettingsPos] = useState<{ top: number; left: number } | null>(null);
  const trendSettingsGroupRef = useRef<HTMLDivElement>(null);
  const trendSettingsPopoverRef = useRef<HTMLDivElement>(null);

  // Supply & Demand zone settings
  const [showZoneSettings, setShowZoneSettings] = useState(false);
  const [zoneSettingsPos, setZoneSettingsPos] = useState<{ top: number; left: number } | null>(null);
  const zoneSettingsGroupRef = useRef<HTMLDivElement>(null);
  const zoneSettingsPopoverRef = useRef<HTMLDivElement>(null);
  const [showTappedZone, setShowTappedZone] = useState(initialChartView?.showTappedZone ?? true);
  const [tapFadeCandles, setTapFadeCandles] = useState(DEFAULT_TAP_FADE_CANDLES);

  // Quad View toggle button — quadView/onToggleQuadView are owned by the
  // page (it decides whether to render this one chart or a 2x2 grid of 4),
  // this component just renders the button on every instance so it's always
  // reachable to switch modes.
  const quadBtnRef = useRef<HTMLButtonElement>(null);

  // Chart + toolbar screenshot → save to a trade's Entry/Exit/Additional slot
  const captureRef = useRef<HTMLDivElement>(null);

  // Reports this component's actual rendered height (toolbar + canvas) up to
  // the parent, so the news/calendar panel beside it can be sized to
  // bottom-align with the chart regardless of chartTf/heightBoost/expand mode.
  useEffect(() => {
    if (!captureRef.current) return;
    const ro = new ResizeObserver(([entry]) => onHeightChange(entry.contentRect.height));
    ro.observe(captureRef.current);
    return () => ro.disconnect();
  }, [onHeightChange]);
  const snapshotBtnRef = useRef<HTMLButtonElement>(null);
  const snapshotPopoverRef = useRef<HTMLDivElement>(null);
  const [showSnapshotPicker, setShowSnapshotPicker] = useState(false);
  const [snapshotPos, setSnapshotPos] = useState<{ top: number; left: number } | null>(null);
  const [snapshotDataUrl, setSnapshotDataUrl] = useState<string | null>(null);
  const [snapshotTrades, setSnapshotTrades] = useState<TradeWithJournal[]>([]);
  const [snapshotTradeId, setSnapshotTradeId] = useState<string | null>(null);
  const [snapshotKind, setSnapshotKind] = useState<"entry" | "exit" | "additional">("entry");
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const [snapshotSaved, setSnapshotSaved] = useState(false);

  // Reversal candle settings — location filters (default off = show every
  // detected reversal candle, no location gating) and which pattern types
  // count as a "reversal candle" at all.
  const [showReversalSettings, setShowReversalSettings] = useState(false);
  const [reversalSettingsPos, setReversalSettingsPos] = useState<{ top: number; left: number } | null>(null);
  const reversalBtnRef = useRef<HTMLButtonElement>(null);
  const reversalSettingsPopoverRef = useRef<HTMLDivElement>(null);
  const [reversalZoneFilter, setReversalZoneFilter] = useState(() => getReversalSettings(DEFAULT_REVERSAL_GROUPS).zoneFilter);
  const [reversalEightAmBoxFilter, setReversalEightAmBoxFilter] = useState(() => getReversalSettings(DEFAULT_REVERSAL_GROUPS).eightAmBoxFilter);
  const [reversalTrendlineFilter, setReversalTrendlineFilter] = useState(() => getReversalSettings(DEFAULT_REVERSAL_GROUPS).trendlineFilter);
  const [reversalGannFilter, setReversalGannFilter] = useState(() => getReversalSettings(DEFAULT_REVERSAL_GROUPS).gannFilter);
  const [reversalFibFilter, setReversalFibFilter] = useState(() => getReversalSettings(DEFAULT_REVERSAL_GROUPS).fibFilter);
  // How many of the most recent qualifying reversal candles to actually
  // show, counting back from the latest — null shows every one.
  const [reversalMaxCount, setReversalMaxCount] = useState<number | null>(() => getReversalSettings(DEFAULT_REVERSAL_GROUPS).maxCount);
  // Stores selected GROUP labels (one toggle per candle shape, covering both
  // its bullish and bearish variant) — expanded to raw pattern names for
  // computeReversalFlags via the mirroring effect below.
  const [reversalPatternGroups, setReversalPatternGroups] = useState<Set<string>>(() => new Set(getReversalSettings(DEFAULT_REVERSAL_GROUPS).patternGroups));
  // Label text on/off — the red/green arrows always stay, only the
  // pattern-name text beside them is hidden.
  const [showReversalLabels, setShowReversalLabels] = useState(() => getReversalSettings(DEFAULT_REVERSAL_GROUPS).showLabels);
  const reversalZoneFilterRef = useRef(false);
  const reversalEightAmBoxFilterRef = useRef(false);
  const reversalTrendlineFilterRef = useRef(false);
  const reversalGannFilterRef = useRef(false);
  const reversalFibFilterRef = useRef(false);
  const reversalMaxCountRef = useRef<number | null>(null);
  const reversalPatternTypesRef = useRef<Set<string>>(expandReversalGroups(reversalPatternGroups));
  useEffect(() => { reversalZoneFilterRef.current = reversalZoneFilter; }, [reversalZoneFilter]);
  useEffect(() => { reversalEightAmBoxFilterRef.current = reversalEightAmBoxFilter; }, [reversalEightAmBoxFilter]);
  useEffect(() => { reversalTrendlineFilterRef.current = reversalTrendlineFilter; }, [reversalTrendlineFilter]);
  useEffect(() => { reversalGannFilterRef.current = reversalGannFilter; }, [reversalGannFilter]);
  useEffect(() => { reversalFibFilterRef.current = reversalFibFilter; }, [reversalFibFilter]);
  useEffect(() => { reversalMaxCountRef.current = reversalMaxCount; }, [reversalMaxCount]);
  useEffect(() => { reversalPatternTypesRef.current = expandReversalGroups(reversalPatternGroups); }, [reversalPatternGroups]);
  useEffect(() => {
    setReversalSettings({
      zoneFilter: reversalZoneFilter,
      eightAmBoxFilter: reversalEightAmBoxFilter,
      trendlineFilter: reversalTrendlineFilter,
      gannFilter: reversalGannFilter,
      fibFilter: reversalFibFilter,
      patternGroups: [...reversalPatternGroups],
      showLabels: showReversalLabels,
      maxCount: reversalMaxCount,
    });
  }, [reversalZoneFilter, reversalEightAmBoxFilter, reversalTrendlineFilter, reversalGannFilter, reversalFibFilter,
      reversalPatternGroups, showReversalLabels, reversalMaxCount]);
  // Label visibility doesn't change which candles are flagged as reversals
  // (unlike the filters above, which do and go through the heavier
  // applyData/setData path) — just push the flag onto the already-attached
  // primitive and force a repaint.
  const showReversalLabelsRef = useRef(showReversalLabels);
  useEffect(() => {
    showReversalLabelsRef.current = showReversalLabels;
    if (reversalMarkerPrimRef.current) reversalMarkerPrimRef.current._showLabels = showReversalLabels;
    chartRef.current?.applyOptions({});
  }, [showReversalLabels]);

  const containerRef  = useRef<HTMLDivElement>(null);
  const chartRef      = useRef<IChartApi | null>(null);
  const seriesRef     = useRef<any>(null);
  const priceLineRef  = useRef<any>(null);
  const openTradePriceLinesRef = useRef<any[]>([]);
  const indSeriesRef  = useRef<Partial<Record<IndKey, any[]>>>({});
  const bbFillPrimRef   = useRef<any>(null);
  const ichiCloudPrimRef = useRef<any>(null);
  const tfRowsRef     = useRef<RawCandleTf[]>([]);
  const viewModeRef   = useRef(viewMode);
  const activeIndsRef = useRef<Set<IndKey>>(new Set(["volume"]));
  const zonePrimRef   = useRef<ZoneBoxPrimitive | null>(null);
  const zoneBoxesRef  = useRef<ZoneBox[]>([]);
  const trendPrimRef  = useRef<TrendlinePrimitive | null>(null);
  const trendLinesRef = useRef<TrendlineSegment[]>([]);
  const watermarkPrimRef = useRef<WatermarkPrimitive | null>(null);
  const eightAmBoxPrimRef = useRef<TimeRangeBoxPrimitive | null>(null);
  const eightAmBoxesRef   = useRef<TimeRangeBox[]>([]);
  const marketSessionPrimRef  = useRef<TimeRangeBoxPrimitive | null>(null);
  const marketSessionBoxesRef = useRef<TimeRangeBox[]>([]);
  const reversalMarkerPrimRef = useRef<ReversalMarkerPrimitive | null>(null);
  const pivotPrimRef = useRef<TimeRangeBoxPrimitive | null>(null);
  const newsLinePrimRef = useRef<NewsLinePrimitive | null>(null);
  const drawingPrimRef = useRef<DrawingPrimitive | null>(null);
  const drawingsRef = useRef<Drawing[]>([]);
  const selectedDrawingIdRef = useRef<string | null>(null);
  const activeDrawToolRef = useRef<DrawTool>("cursor");
  const pendingPointRef = useRef<DrawPoint | null>(null);
  // Only "fibext" (the one 3-click tool) ever populates this — it holds the
  // already-confirmed B point while the 3rd click (C) is still pending.
  const pendingSecondPointRef = useRef<DrawPoint | null>(null);
  const magnetModeRef = useRef(false);
  // Which handle (if any) is currently being dragged — "anchor" re-anchors
  // one of a drawing's real stored points (any kind), "rectResize" is a
  // rectangle's derived edge-midpoint (moves only one axis of whichever
  // corner it represents). See the native mousedown listener in the
  // chart-init effect below. Native DOM events (not lightweight-charts' own
  // click/crosshair subscriptions) because a drag gesture needs continuous
  // mousemove/mouseup tracking, and stopPropagation on mousedown is how the
  // chart's own pan-on-drag gets suppressed only when a handle is actually
  // grabbed.
  const draggingHandleRef = useRef<
    | { mode: "anchor"; id: string; point: AnchorKey }
    | { mode: "rectResize"; id: string; handle: "top" | "bottom" | "left" | "right" }
    | null
  >(null);
  // The active drag's own window-level mousemove/mouseup handlers, so the
  // chart-init effect's cleanup (full component unmount, e.g. navigating
  // away mid-drag) can remove them — they otherwise only get removed by
  // their own mouseup firing, which never happens if the component is torn
  // down first, leaking the listeners and letting a subsequent stray
  // mouseup call persistDrawings (a React state update) after unmount.
  const activeDragListenersRef = useRef<{ onMove: () => void; onUp: () => void } | null>(null);
  // Last mouse position lightweight-charts itself reported via
  // onCrosshairMove (param.point), in the chart's own pane-relative CSS
  // pixel space. The rectangle-handle drag below reads this instead of
  // recomputing x/y from a native event's clientX/Y minus
  // getBoundingClientRect() — that manual math is a separate coordinate
  // pipeline from the one logicalToCoordinate/priceToCoordinate (and every
  // existing hit-test) use, and any small discrepancy between the two would
  // make an 8px handle impossible to hit reliably. mousemove keeps firing
  // (and this keeps updating) throughout a drag regardless of button state.
  const lastMouseXYRef = useRef<{ x: number; y: number } | null>(null);
  // Whether the next tfRows-driven applyData call should reset the visible
  // range/autoscale. True only for a genuine new instrument/timeframe load;
  // false for the background live-candle poll below, so the forming bar's
  // O/H/L/C can refresh without yanking the user's view.
  const shouldResetViewRef = useRef(true);

  // ORB (Opening Range Breakout) boxes — independent 15M candle fetch,
  // mirrors the zone-candle fetch pattern below, only active while the
  // indicator toggle is on. NY defaults on (matches the tool's prior 8AM
  // Box behavior); Tokyo/London/9:30 are opt-in.
  // 4H/1D/1W have no bar sitting exactly on the session-open minute, so the
  // box can't anchor to a real candle at those timeframes — hide it above 1H.
  const eightAmBoxEligibleTf = chartTf === "1H" || chartTf === "15M" || chartTf === "5M" || chartTf === "1M";
  const showEightAmBox = activeInds.has("session8am") && eightAmBoxEligibleTf;
  const eightAmCandles = useLiveCandles(pair, "15M", showEightAmBox, 10_000);
  const [showOrbNY,     setShowOrbNY]     = useState(true);
  const [showOrbTokyo,  setShowOrbTokyo]  = useState(true);
  const [showOrbLondon, setShowOrbLondon] = useState(true);
  const [showOrb930,    setShowOrb930]    = useState(false);
  const [showOrbSettings, setShowOrbSettings] = useState(false);
  const [orbSettingsPos, setOrbSettingsPos] = useState<{ top: number; left: number } | null>(null);
  const orbBtnRef = useRef<HTMLButtonElement>(null);
  const orbSettingsPopoverRef = useRef<HTMLDivElement>(null);
  const activeOrbDefs = useMemo(() => ORB_DEFS.filter(d =>
    (d.key === "ny" && showOrbNY) ||
    (d.key === "tokyo" && showOrbTokyo) ||
    (d.key === "london" && showOrbLondon) ||
    (d.key === "ny930" && showOrb930)
  ), [showOrbNY, showOrbTokyo, showOrbLondon, showOrb930]);
  const eightAmBoxes = useMemo(
    () => showEightAmBox ? computeOrbBoxes(eightAmCandles, activeOrbDefs) : [],
    [showEightAmBox, eightAmCandles, activeOrbDefs]
  );
  useEffect(() => {
    eightAmBoxesRef.current = eightAmBoxes;
    if (eightAmBoxPrimRef.current) eightAmBoxPrimRef.current._boxes = eightAmBoxes;
    chartRef.current?.applyOptions({});
  }, [eightAmBoxes]);

  // Trading session boxes (Tokyo/London/New York) — its own toolbar button +
  // settings popout, not part of the Indicators dropdown. Independent 1H
  // candle fetch (hour boundaries all align to whole UTC hours), only active
  // while the Sessions button is toggled on.
  const [showSessions, setShowSessions] = useState(initialChartView?.showSessions ?? false);
  const [sessionVisibility, setSessionVisibility] = useState<Record<SessionKey, boolean>>(
    initialChartView?.sessionVisibility ?? { tokyo: true, london: true, newyork: true }
  );
  const [sessionBackCount, setSessionBackCount] = useState(initialChartView?.sessionBackCount ?? 5);
  // Persist the toolbar view state (see initialChartView above) whenever any
  // of it changes, so leaving Sessions (or any other overlay) on carries
  // over across an instrument switch, a trip to another page, or a full app
  // restart instead of needing to be turned back on every time.
  useEffect(() => {
    if (compact) return;
    setChartViewSettings({
      viewMode, activeInds: [...activeInds], candleColorScheme,
      showDailyZones, show4HZones, show1HZones, show15MZones, show5MZones,
      showWeeklyTrend, showDailyTrend, show4HTrend, show1HTrend, show15MTrend, show5MTrend, show1MTrend,
      showNews, showTappedZone, showSessions, sessionVisibility, sessionBackCount,
    });
  }, [compact, viewMode, activeInds, candleColorScheme,
      showDailyZones, show4HZones, show1HZones, show15MZones, show5MZones,
      showWeeklyTrend, showDailyTrend, show4HTrend, show1HTrend, show15MTrend, show5MTrend, show1MTrend,
      showNews, showTappedZone, showSessions, sessionVisibility, sessionBackCount]);
  // 4H/1D/1W hour boundaries don't align to the session start/end hours, so
  // session boxes can't anchor to a real candle above 1H — hide them there.
  const sessionBoxEligibleTf = chartTf === "1H" || chartTf === "15M" || chartTf === "5M" || chartTf === "1M";
  const sessionsActive = showSessions && sessionBoxEligibleTf;
  const sessionCandles = useLiveCandles(pair, "1H", sessionsActive, 10_000);
  const marketSessionBoxes = useMemo(
    () => sessionsActive ? computeMarketSessionBoxes(sessionCandles, sessionVisibility, sessionBackCount) : [],
    [sessionsActive, sessionCandles, sessionVisibility, sessionBackCount]
  );
  useEffect(() => {
    marketSessionBoxesRef.current = marketSessionBoxes;
    if (marketSessionPrimRef.current) marketSessionPrimRef.current._boxes = marketSessionBoxes;
    chartRef.current?.applyOptions({});
  }, [marketSessionBoxes]);

  useEffect(() => { tfRowsRef.current    = tfRows;     }, [tfRows]);
  useEffect(() => { viewModeRef.current  = viewMode;   }, [viewMode]);
  useEffect(() => { activeIndsRef.current = activeInds; }, [activeInds]);

  // Fetch on tf / pair change — also clears stale indicator series
  useEffect(() => {
    setTfLoading(true);
    setTfRows([]);
    if (chartRef.current)
      activeIndsRef.current.forEach(key => removeIndSeries(key));
    shouldResetViewRef.current = true;
    // Guards against a switch back to the previous pair/tf before this
    // fetch resolves — without it, a superseded fetch's late resolution
    // could overwrite tfRows with the WRONG instrument's candles.
    let cancelled = false;
    getLiveCandles(pair, chartTf)
      .then(candles => { if (!cancelled) setTfRows(candles); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTfLoading(false); });
    return () => { cancelled = true; };
  }, [chartTf, pair]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drawings are scoped per INSTRUMENT only, not timeframe (see
  // DrawingPrimitive / getChartDrawings) — a fib retracement's (time, price)
  // point is just as meaningful on the 1H chart as the Daily chart it was
  // drawn on, and TradingView itself keeps a symbol's drawings visible
  // across every timeframe rather than hiding them on a resolution switch.
  // So this reloads (and drops stale tool/selection state) only when the
  // instrument itself changes, not on every tf switch.
  useEffect(() => {
    const loaded = getChartDrawings(pair);
    drawingsRef.current = loaded;
    if (drawingPrimRef.current) drawingPrimRef.current._pair = pair;
    setDrawingsState(loaded);
    setSelectedDrawingId(null);
    cancelPendingDrawing();
  }, [pair]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll the main chart's candles every 10s (same cadence as the zone/session
  // candle fetches above) so the forming bar's O/H/L/C tracks live price.
  // resetView stays false here — only the initial tf/pair load above resets
  // the visible range/autoscale.
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      shouldResetViewRef.current = false;
      getLiveCandles(pair, chartTf)
        .then(candles => { if (!cancelled) setTfRows(candles); })
        .catch(() => {});
    };
    const id = setInterval(poll, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [chartTf, pair]);

  // Zone/session/trend/pivot candle fetching now lives in useLiveCandles
  // (see its definition, and where dailyZoneCandles etc. are declared above).

  // Fair-value-gap zone detection is O(n^2)-ish over the candle series — run
  // it once per timeframe whenever that timeframe's candles actually change,
  // not on every 5s live-price tick (the zone-box effect below only needs a
  // cheap price comparison against this already-computed list).
  const dailyZonesAll = useMemo(() => computeSupplyDemandZones(dailyZoneCandles), [dailyZoneCandles]);
  const h4ZonesAll    = useMemo(() => computeSupplyDemandZones(h4ZoneCandles),    [h4ZoneCandles]);
  const h1ZonesAll    = useMemo(() => computeSupplyDemandZones(h1ZoneCandles),    [h1ZoneCandles]);
  const m15ZonesAll   = useMemo(() => computeSupplyDemandZones(m15ZoneCandles),   [m15ZoneCandles]);
  const m5ZonesAll    = useMemo(() => computeSupplyDemandZones(m5ZoneCandles),    [m5ZoneCandles]);


  // Recompute trendline segments + repaint the primitive whenever inputs change
  useEffect(() => {
    let lines: TrendlineSegment[] = [];
    if (showWeeklyTrend) lines = lines.concat(computeAutoTrendlines(weeklyTrendCandles, 2, trendCounts.W,   trendColors.W,   "W"));
    if (showDailyTrend)  lines = lines.concat(computeAutoTrendlines(dailyTrendCandles,  2, trendCounts.D,   trendColors.D,   "D"));
    if (show4HTrend)     lines = lines.concat(computeAutoTrendlines(h4TrendCandles,     2, trendCounts.H4,  trendColors.H4,  "4H"));
    if (show1HTrend)     lines = lines.concat(computeAutoTrendlines(h1TrendCandles,     2, trendCounts.H1,  trendColors.H1,  "1H"));
    if (show15MTrend)    lines = lines.concat(computeAutoTrendlines(m15TrendCandles,    2, trendCounts.M15, trendColors.M15, "15M"));
    if (show5MTrend)     lines = lines.concat(computeAutoTrendlines(m5TrendCandles,     2, trendCounts.M5,  trendColors.M5,  "5M"));
    if (show1MTrend)     lines = lines.concat(computeAutoTrendlines(m1TrendCandles,     2, trendCounts.M1,  trendColors.M1,  "1M"));
    trendLinesRef.current = lines;
    if (trendPrimRef.current) trendPrimRef.current._lines = lines;
    chartRef.current?.applyOptions({});
  }, [showWeeklyTrend, showDailyTrend, show4HTrend, show1HTrend, show15MTrend, show5MTrend, show1MTrend,
      weeklyTrendCandles, dailyTrendCandles, h4TrendCandles, h1TrendCandles, m15TrendCandles, m5TrendCandles, m1TrendCandles,
      trendCounts, trendColors]);

  // Recompute pivot boxes + repaint whenever the master toggle, a
  // per-timeframe toggle, or the underlying candles change.
  useEffect(() => {
    const pivotsActive = activeInds.has("pivots");
    let boxes: TimeRangeBox[] = [];
    if (pivotsActive) {
      if (showPivotWeekly) boxes = boxes.concat(computeCurrentPivotBoxes(pivotWeeklyCandles, "W"));
      if (showPivotDaily)  boxes = boxes.concat(computeCurrentPivotBoxes(pivotDailyCandles, "D"));
      if (showPivot4H)     boxes = boxes.concat(computeCurrentPivotBoxes(pivot4HCandles, "4H"));
      if (showPivot1H)     boxes = boxes.concat(computeCurrentPivotBoxes(pivot1HCandles, "1H"));
    }
    if (pivotPrimRef.current) pivotPrimRef.current._boxes = boxes;
    chartRef.current?.applyOptions({});
  }, [activeInds, showPivotWeekly, showPivotDaily, showPivot4H, showPivot1H,
      pivotWeeklyCandles, pivotDailyCandles, pivot4HCandles, pivot1HCandles]);

  // Recompute news event lines + repaint whenever the toggle, enabled
  // categories, the shared calendar feed, the charted pair, or the loaded
  // candle range changes. Restricted to the charted pair's own two
  // currencies — an EUR/USD chart has no use for a GBP jobs report line.
  useEffect(() => {
    const lines: NewsLineData[] = [];
    if (showNews && tfRows.length > 0) {
      // Static-table dates (FOMC/CPI/Jobs) span years, but the chart only
      // ever has whatever candle range is currently loaded (e.g. a handful
      // of days on 15M). A date outside that range has no real bar to sit
      // on — lightweight-charts' timeToIndex(time, true) would otherwise
      // silently snap it to the nearest loaded edge bar instead of just
      // not drawing it, which is what made every out-of-range future FOMC
      // date pile up on the single most-recent candle. Bound to the
      // loaded range (with one bar's slack past the last candle so a
      // same-day event on the still-forming bar isn't excluded); dates
      // outside that range — including upcoming/future releases — are
      // simply not drawn.
      const firstT = Math.floor(new Date(tfRows[0].timestamp).getTime() / 1000);
      const lastRow = tfRows[tfRows.length - 1];
      const lastRowT = Math.floor(new Date(lastRow.timestamp).getTime() / 1000);
      const barSeconds = tfRows.length > 1
        ? lastRowT - Math.floor(new Date(tfRows[tfRows.length - 2].timestamp).getTime() / 1000)
        : 0;
      const lastT = lastRowT + barSeconds;
      const inRange = (t: number) => t >= firstT && t <= lastT;

      const currencies = relevantNewsCurrencies(pair);
      // Combined lookup pool for the surprise/interpretation tooltip: the
      // live feed first (freshest copy of whatever's currently in view),
      // then everything ever persisted (see get_stored_economic_events) —
      // which is what makes a release's actual/forecast/previous still
      // resolvable once it's scrolled out of the live feed's own
      // current-week window.
      const eventPool = [...calendarEvents, ...storedEconomicEvents];
      // Same pool, deduplicated by title+date (live feed wins over its own
      // persisted copy) — needed for the simple-category loop below since
      // that one draws a line per matching event rather than just looking
      // up a single match, so an event present in both arrays would
      // otherwise double-draw.
      const dedupedEventPool = [...new Map(
        [...storedEconomicEvents, ...calendarEvents].map(ev => [`${ev.title}|${ev.date}`, ev])
      ).values()];

      // FOMC/CPI/Jobs all come from the static tables above, not the live
      // feed, so they can plot across the whole loaded chart history
      // instead of only whatever happens to fall in the feed's current
      // week. All three are USD-only releases (the Fed and BLS), so they
      // only apply when USD is one of the charted pair's two currencies.
      const addStatic = (key: NewsCategoryKey, isoDates: string[]) => {
        if (!newsCategoryVisibility[key] || !currencies.includes("USD")) return;
        if (!isNewsCurrencyVisible(key, "USD")) return;
        const def = NEWS_CATEGORY_DEFS.find(d => d.key === key)!;
        for (const iso of isoDates) {
          const t = Math.floor(new Date(iso).getTime() / 1000);
          if (Number.isNaN(t)) continue;
          // FOMC never collides with a same-category live-feed line (it's
          // always skipped from the live feed in favor of this table) and
          // rarely has two dates close enough on screen to need a year
          // suffix, so it just reads "FOMC". CPI/Jobs keep the "USD (year)"
          // tag — those DO share the category with a live-feed EUR/GBP/etc
          // line, and CPI in particular has landed on the same day-of-month
          // in different years (e.g. Aug 12, 2025 and 2026).
          const year = iso.slice(0, 4);
          const label = key === "fomc" ? def.label : `${def.label} USD (${year})`;
          const detail = key === "fomc" ? interpretFomc(findFomcEvent(eventPool, iso)) ?? fomcFredFallback(iso)
            : key === "cpi" ? (({ headline, core }) => interpretCpi(headline, core))(findCpiEvents(eventPool, iso)) ?? cpiFredFallback(iso)
            : (({ nfp, unemployment, earnings }) => interpretJobs(nfp, unemployment, earnings))(findJobsEvents(eventPool, iso)) ?? jobsFredFallback(iso);
          if (inRange(t)) lines.push({ time: t as UTCTimestamp, label, color: def.color, detail: detail ?? undefined });
        }
      };
      addStatic("fomc", FOMC_STATEMENT_DATES);
      addStatic("cpi",  CPI_RELEASE_DATES);
      addStatic("jobs", JOBS_RELEASE_DATES);

      // SEP / Dot Plot — its own independent marker on whichever FOMC
      // meeting dates actually released one, gated only on its own toggle
      // (previously nested inside the "fomc" block above, which meant it
      // silently did nothing whenever the base FOMC toggle was off — SEP is
      // listed as its own independent item in the settings popout, so it
      // needs to behave like one).
      if (newsCategoryVisibility.sep && currencies.includes("USD")) {
        const sepDef = NEWS_CATEGORY_DEFS.find(d => d.key === "sep")!;
        for (const iso of FOMC_STATEMENT_DATES) {
          const t = Math.floor(new Date(iso).getTime() / 1000);
          if (Number.isNaN(t) || !inRange(t)) continue;
          const sep = interpretSep(iso);
          if (!sep) continue; // this particular meeting had no SEP release
          lines.push({ time: t as UTCTimestamp, label: sepDef.label, color: sepDef.color, detail: { title: sepDef.label, ...sep } });
        }
      }

      // Fed Chair Press Conference — every FOMC meeting has held one since
      // Feb 2019 (which covers this entire static table), so it's drawn
      // from FOMC_STATEMENT_DATES directly rather than depending on the
      // live feed ever having its own distinct "FOMC Press Conference"
      // entry, which — like the base rate decision — only exists in the
      // feed's current ~1-week window and is otherwise unrecoverable. A
      // press conference isn't its own data release (no actual/forecast of
      // its own), it's a live Q&A about that same rate decision, so its
      // popup reuses the real FOMC decision detail (via the same
      // interpretFomc/fomcFredFallback pair "fomc" itself uses) instead of
      // showing nothing.
      if (newsCategoryVisibility.fomc_presser && currencies.includes("USD")) {
        const presserDef = NEWS_CATEGORY_DEFS.find(d => d.key === "fomc_presser")!;
        for (const iso of FOMC_STATEMENT_DATES) {
          const t = Math.floor(new Date(iso).getTime() / 1000) + 30 * 60; // presser starts ~30 min after the statement
          if (Number.isNaN(t) || !inRange(t)) continue;
          const decision = interpretFomc(findFomcEvent(eventPool, iso)) ?? fomcFredFallback(iso);
          const detail: EventDetail = decision
            ? { title: presserDef.label, headline: decision.headline, tag: decision.tag, direction: decision.direction }
            : { title: presserDef.label, headline: fieldDetail("Fed Funds Rate", undefined) };
          lines.push({ time: t as UTCTimestamp, label: presserDef.label, color: presserDef.color, detail });
        }
      }

      // FOMC Minutes — 3 weeks after the meeting they're the minutes OF, on
      // its own real schedule (see FOMC_MINUTES_DATES above), not the live
      // feed's own current-week window. Same reasoning as the press
      // conference: minutes aren't a numeric data release, they're a
      // (delayed) account of that same meeting's decision, so the popup
      // reuses that meeting's real decision detail via meetingDate rather
      // than showing nothing.
      if (newsCategoryVisibility.fomc_minutes && currencies.includes("USD")) {
        const minutesDef = NEWS_CATEGORY_DEFS.find(d => d.key === "fomc_minutes")!;
        for (const { meetingDate, minutesDate } of FOMC_MINUTES_DATES) {
          const t = Math.floor(new Date(minutesDate).getTime() / 1000);
          if (Number.isNaN(t) || !inRange(t)) continue;
          const decision = interpretFomc(findFomcEvent(eventPool, meetingDate)) ?? fomcFredFallback(meetingDate);
          const detail: EventDetail = decision
            ? { title: minutesDef.label, headline: decision.headline, tag: decision.tag, direction: decision.direction }
            : { title: minutesDef.label, headline: fieldDetail("Fed Funds Rate", undefined) };
          lines.push({ time: t as UTCTimestamp, label: minutesDef.label, color: minutesDef.color, detail });
        }
      }

      // Live feed still covers the non-USD leg (e.g. EUR CPI on a EUR/USD
      // chart) — just the current week, same limitation as the Economic
      // Calendar panel itself. Labeled with the actual event title (e.g.
      // "German Prelim CPI m/m") rather than the generic category name —
      // a bare "CPI EUR" answers "what category" but not "which specific
      // release", which is the question that actually needs answering
      // when a country other than the one you expected shows up.
      for (const ev of calendarEvents) {
        const def = eventNewsCategory(ev);
        if (!def || !newsCategoryVisibility[def.key]) continue;
        const country = ev.country?.toUpperCase();
        if (!currencies.includes(country)) continue;
        if (country === "USD") continue; // covered by the static tables above
        if (!isNewsCurrencyVisible(def.key, country)) continue;
        const t = Math.floor(new Date(ev.date).getTime() / 1000);
        if (Number.isNaN(t)) continue;
        const detail = interpretByCategory(def.key, ev);
        if (inRange(t)) lines.push({ time: t as UTCTimestamp, label: `${ev.title} (${ev.country})`, color: def.color, detail: detail ?? undefined });
      }

      // Treasury auctions — own pipeline (TreasuryDirect, not the
      // ForexFactory calendar feed), always USD, so gated the same way as
      // FOMC/CPI/Jobs on the charted pair actually involving USD.
      const auctionDef = NEWS_CATEGORY_DEFS.find(d => d.key === "auction")!;
      if (newsCategoryVisibility.auction && currencies.includes("USD")) {
        for (const auction of treasuryAuctions) {
          const term = auctionTermLabel(auction.securityTerm);
          if (!term) continue;
          const t = auctionTimestamp(auction);
          if (t === null || !inRange(t)) continue;
          const detail = interpretAuction(auction, treasuryAuctions);
          lines.push({ time: t as UTCTimestamp, label: `${term} Auction`, color: auctionDef.color, detail: detail ?? undefined });
        }
      }

      // Fed Chair Press Conference, FOMC Minutes — pool-driven, no static
      // date table (see SIMPLE_CATEGORY_DEFS above). Any currency relevant
      // to the charted pair, same as CPI/Jobs' non-USD leg — a GBP/USD
      // chart should see UK Retail Sales/GDP/PPI too, not just the US
      // release (which is why USD Retail Sales/Jobless Claims/GDP/PPI alone
      // are excluded here — they have their own static-schedule blocks
      // below, same reasoning as ISM, except these four also have real
      // historical values to backfill). PCE/JOLTS are excluded outright,
      // same as ISM — both are US-only with no non-USD leg to still serve
      // here.
      for (const ev of dedupedEventPool) {
        const country = ev.country?.toUpperCase();
        if (!country || !currencies.includes(country)) continue;
        const titleLower = ev.title.toLowerCase();
        const scDef = SIMPLE_CATEGORY_DEFS.find(d =>
          d.key !== "ism" && d.key !== "pce" && d.key !== "jolts"
          && !(d.key === "retail_sales" && country === "USD")
          && !(d.key === "jobless_claims" && country === "USD")
          && !(d.key === "gdp" && country === "USD")
          && !(d.key === "ppi" && country === "USD")
          && d.match(titleLower)
        );
        if (!scDef || !newsCategoryVisibility[scDef.key]) continue;
        if (!isNewsCurrencyVisible(scDef.key, country)) continue;
        const t = Math.floor(new Date(ev.date).getTime() / 1000);
        if (Number.isNaN(t) || !inRange(t)) continue;
        const catDef = NEWS_CATEGORY_DEFS.find(d => d.key === scDef.key)!;
        lines.push({ time: t as UTCTimestamp, label: `${ev.title} (${country})`, color: catDef.color, detail: interpretSimple(ev, scDef) });
      }

      // ISM Manufacturing/Services PMI — drawn from the real release
      // schedule (ISM_MANUFACTURING_DATES/ISM_SERVICES_DATES above) rather
      // than only the pool scan above, since there's no free source for
      // historical index values to backfill (ISM's data is commercially
      // licensed, and FRED's old free mirror is discontinued) — a
      // pool-only match would only ever plot in the rare week the live
      // feed happens to carry one, exactly the problem CPI/Jobs/FOMC had
      // before their real backfills. The schedule itself is real, so it
      // plots reliably; the popup shows real actual/forecast whenever a
      // live/persisted match exists (via the same USD event pool) and
      // "unavailable" otherwise — never a fabricated index value.
      if (newsCategoryVisibility.ism && currencies.includes("USD")) {
        const ismCatDef = NEWS_CATEGORY_DEFS.find(d => d.key === "ism")!;
        const ismSimpleDef = SIMPLE_CATEGORY_DEFS.find(d => d.key === "ism")!;
        const drawIsm = (title: string, dates: string[]) => {
          for (const iso of dates) {
            const t = Math.floor(new Date(iso).getTime() / 1000);
            if (Number.isNaN(t) || !inRange(t)) continue;
            const day = iso.slice(0, 10);
            const ev = dedupedEventPool.find(e => e.country?.toUpperCase() === "USD" && e.date.slice(0, 10) === day && e.title.toLowerCase() === title.toLowerCase());
            const detail: EventDetail = ev ? interpretSimple(ev, ismSimpleDef) : { title, headline: fieldDetail(title, undefined) };
            lines.push({ time: t as UTCTimestamp, label: title, color: ismCatDef.color, detail });
          }
        };
        drawIsm("ISM Manufacturing PMI", ISM_MANUFACTURING_DATES);
        drawIsm("ISM Services PMI", ISM_SERVICES_DATES);
      }

      // Retail Sales (USD leg) — drawn from the real Census Bureau release
      // schedule (RETAIL_SALES_DATES above), with real FRED-backed
      // actual/previous (RETAIL_SALES_FRED_ACTUALS) as a fallback whenever
      // there's no live/persisted match — same reasoning and pattern as
      // CPI/Jobs/FOMC, unlike ISM which only has the schedule.
      if (newsCategoryVisibility.retail_sales && currencies.includes("USD")) {
        const rsCatDef = NEWS_CATEGORY_DEFS.find(d => d.key === "retail_sales")!;
        for (const iso of RETAIL_SALES_DATES) {
          const t = Math.floor(new Date(iso).getTime() / 1000);
          if (Number.isNaN(t) || !inRange(t)) continue;
          const day = iso.slice(0, 10);
          const headline = dedupedEventPool.find(e => e.country?.toUpperCase() === "USD" && e.date.slice(0, 10) === day && e.title.toLowerCase() === "retail sales m/m");
          const core = dedupedEventPool.find(e => e.country?.toUpperCase() === "USD" && e.date.slice(0, 10) === day && e.title.toLowerCase() === "core retail sales m/m");
          const detail = interpretRetailSales(headline, core) ?? retailSalesFredFallback(iso);
          lines.push({ time: t as UTCTimestamp, label: rsCatDef.label, color: rsCatDef.color, detail: detail ?? undefined });
        }
      }

      // Initial Jobless Claims (USD leg) — drawn from the real weekly DOL
      // release schedule (JOBLESS_CLAIMS_FRED_ACTUALS' own dates double as
      // the schedule, since that table has full real coverage with no
      // gaps), with real FRED-backed actual/previous as a fallback whenever
      // there's no live/persisted match — same pattern as CPI/Jobs/FOMC/
      // Retail Sales.
      if (newsCategoryVisibility.jobless_claims && currencies.includes("USD")) {
        const jcCatDef = NEWS_CATEGORY_DEFS.find(d => d.key === "jobless_claims")!;
        const jcSimpleDef = SIMPLE_CATEGORY_DEFS.find(d => d.key === "jobless_claims")!;
        for (const row of JOBLESS_CLAIMS_FRED_ACTUALS) {
          const iso = row.date;
          const t = Math.floor(new Date(iso).getTime() / 1000);
          if (Number.isNaN(t) || !inRange(t)) continue;
          const day = iso.slice(0, 10);
          const ev = dedupedEventPool.find(e => e.country?.toUpperCase() === "USD" && e.date.slice(0, 10) === day && e.title.toLowerCase() === "unemployment claims");
          const detail = (ev ? interpretSimple(ev, jcSimpleDef) : null) ?? joblessClaimsFredFallback(iso);
          lines.push({ time: t as UTCTimestamp, label: jcCatDef.label, color: jcCatDef.color, detail: detail ?? undefined });
        }
      }

      // PCE / Core PCE (USD leg) — drawn from the real BEA release schedule
      // (PCE_FRED_ACTUALS' own dates double as the schedule, same as
      // Jobless Claims), with real FRED-backed actual/previous as a
      // fallback whenever there's no live/persisted match — same pattern
      // as CPI/Jobs/FOMC/Retail Sales/Jobless Claims.
      if (newsCategoryVisibility.pce && currencies.includes("USD")) {
        const pceCatDef = NEWS_CATEGORY_DEFS.find(d => d.key === "pce")!;
        for (const row of PCE_FRED_ACTUALS) {
          const iso = row.date;
          const t = Math.floor(new Date(iso).getTime() / 1000);
          if (Number.isNaN(t) || !inRange(t)) continue;
          const day = iso.slice(0, 10);
          const headline = dedupedEventPool.find(e => e.country?.toUpperCase() === "USD" && e.date.slice(0, 10) === day && e.title.toLowerCase() === "pce price index m/m");
          const core = dedupedEventPool.find(e => e.country?.toUpperCase() === "USD" && e.date.slice(0, 10) === day && e.title.toLowerCase() === "core pce price index m/m");
          const detail = interpretPce(headline, core) ?? pceFredFallback(iso);
          lines.push({ time: t as UTCTimestamp, label: pceCatDef.label, color: pceCatDef.color, detail: detail ?? undefined });
        }
      }

      // GDP (USD leg) — drawn from the real BEA release schedule
      // (GDP_FRED_ACTUALS' own dates), with real FRED-backed actual/
      // previous as a fallback whenever there's no live/persisted match —
      // same pattern as CPI/Jobs/FOMC/Retail Sales/Jobless Claims/PCE.
      if (newsCategoryVisibility.gdp && currencies.includes("USD")) {
        const gdpCatDef = NEWS_CATEGORY_DEFS.find(d => d.key === "gdp")!;
        const gdpSimpleDef = SIMPLE_CATEGORY_DEFS.find(d => d.key === "gdp")!;
        for (const row of GDP_FRED_ACTUALS) {
          const iso = row.date;
          const t = Math.floor(new Date(iso).getTime() / 1000);
          if (Number.isNaN(t) || !inRange(t)) continue;
          const day = iso.slice(0, 10);
          const ev = dedupedEventPool.find(e => e.country?.toUpperCase() === "USD" && e.date.slice(0, 10) === day && e.title.toLowerCase().includes("gdp") && e.title.toLowerCase().includes("q/q") && !e.title.toLowerCase().includes("price index"));
          const detail = (ev ? interpretSimple(ev, gdpSimpleDef) : null) ?? gdpFredFallback(iso);
          lines.push({ time: t as UTCTimestamp, label: gdpCatDef.label, color: gdpCatDef.color, detail: detail ?? undefined });
        }
      }

      // JOLTS Job Openings (USD leg) — drawn from the real BLS release
      // schedule (JOLTS_FRED_ACTUALS' own dates), with real vintage-exact
      // actual/previous as a fallback whenever there's no live/persisted
      // match — same pattern as CPI/Jobs/FOMC/Retail Sales/Jobless Claims/
      // PCE/GDP.
      if (newsCategoryVisibility.jolts && currencies.includes("USD")) {
        const joltsCatDef = NEWS_CATEGORY_DEFS.find(d => d.key === "jolts")!;
        const joltsSimpleDef = SIMPLE_CATEGORY_DEFS.find(d => d.key === "jolts")!;
        for (const row of JOLTS_FRED_ACTUALS) {
          const iso = row.date;
          const t = Math.floor(new Date(iso).getTime() / 1000);
          if (Number.isNaN(t) || !inRange(t)) continue;
          const day = iso.slice(0, 10);
          const ev = dedupedEventPool.find(e => e.country?.toUpperCase() === "USD" && e.date.slice(0, 10) === day && e.title.toLowerCase().includes("jolts"));
          const detail = (ev ? interpretSimple(ev, joltsSimpleDef) : null) ?? joltsFredFallback(iso);
          lines.push({ time: t as UTCTimestamp, label: joltsCatDef.label, color: joltsCatDef.color, detail: detail ?? undefined });
        }
      }

      // PPI / Core PPI (USD leg) — drawn from the real BLS release schedule
      // (PPI_FRED_ACTUALS' own dates), with real vintage-exact
      // actual/previous as a fallback whenever there's no live/persisted
      // match — same pattern as everything else above.
      if (newsCategoryVisibility.ppi && currencies.includes("USD")) {
        const ppiCatDef = NEWS_CATEGORY_DEFS.find(d => d.key === "ppi")!;
        for (const row of PPI_FRED_ACTUALS) {
          const iso = row.date;
          const t = Math.floor(new Date(iso).getTime() / 1000);
          if (Number.isNaN(t) || !inRange(t)) continue;
          const day = iso.slice(0, 10);
          const headline = dedupedEventPool.find(e => e.country?.toUpperCase() === "USD" && e.date.slice(0, 10) === day && e.title.toLowerCase() === "ppi m/m");
          const core = dedupedEventPool.find(e => e.country?.toUpperCase() === "USD" && e.date.slice(0, 10) === day && e.title.toLowerCase() === "core ppi m/m");
          const detail = interpretPpi(headline, core) ?? ppiFredFallback(iso);
          lines.push({ time: t as UTCTimestamp, label: ppiCatDef.label, color: ppiCatDef.color, detail: detail ?? undefined });
        }
      }
    }
    if (newsLinePrimRef.current) {
      newsLinePrimRef.current._lines = lines;
      newsLinePrimRef.current._barTimes = tfRows.map(r => Math.floor(new Date(r.timestamp).getTime() / 1000));
      newsLinePrimRef.current._applyBarCorrection = chartTf !== "1D" && chartTf !== "1W";
    }
    chartRef.current?.applyOptions({});
  }, [showNews, newsCategoryVisibility, newsCurrencyVisibility, isNewsCurrencyVisible, calendarEvents, storedEconomicEvents, treasuryAuctions, pair, tfRows, chartTf]);

  // Open positions for the currently viewed instrument — polled every 30s
  // (trades are logged manually, not high-frequency, so this is just to
  // pick up a newly-logged or closed trade without a full page reload).
  // instrument is stored WITH the "/" (e.g. "NZD/CHF"), matching pair as-is.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const settings = await getSettings();
        const accountId = settings?.selectedAccountId ?? "acc-1";
        const trades = await getAllTradesWithJournal(accountId);
        const open = trades.filter(t => t.closedAt == null && t.instrument.toUpperCase() === pair.toUpperCase());
        if (!cancelled) setOpenTrades(open);
      } catch (err) {
        console.error("[PriceHistoryChart] failed to load open trades:", err);
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [pair]);

  // Recompute zone boxes + repaint the primitive whenever inputs change.
  // Ties zones to the live price ticker: a zone that's still "fresh" per
  // the candle-based tap history but currently contains the live price is
  // treated as tapped right away, instead of waiting for the next candle
  // poll to catch up.
  useEffect(() => {
    const toBox = (tfLabel: string, z: SupplyDemandZone, tapped: boolean, insideTapped = false, tapFade = 0): ZoneBox => ({
      type: z.type, low: z.zoneLow, high: z.zoneHigh,
      originTime: Math.floor(new Date(z.originTimestamp).getTime() / 1000) as UTCTimestamp,
      label: `${tfLabel} ${z.type === "supply" ? "Supply" : "Demand"}${tapped ? " (Tapped)" : insideTapped ? " (Inside Tapped)" : ""} ${z.zoneLow.toFixed(5)}–${z.zoneHigh.toFixed(5)}`,
      tapped,
      tapFade,
      insideTapped,
    });
    const currentPrice = livePrice ?? (tfRows.length > 0 ? tfRows[tfRows.length - 1].close : null);

    // zonesAll is precomputed (useMemo, keyed on the candle array) — derive
    // both fresh and tapped from that single pass instead of recomputing the
    // FVG scan twice per timeframe.
    const processTf = (tfLabel: string, zonesAll: SupplyDemandZone[], candles: RawCandleTf[]): { fresh: ZoneBox[]; tapped: ZoneBox[] } => {
      const freshZones = zonesAll.filter(z => z.fresh);
      let liveTapped: SupplyDemandZone | null = null;
      if (currentPrice !== null) {
        const idx = freshZones.findIndex(z => currentPrice >= z.zoneLow && currentPrice <= z.zoneHigh);
        if (idx !== -1) [liveTapped] = freshZones.splice(idx, 1);
      }
      let tapped = liveTapped ?? (() => {
        const tappedZones = zonesAll.filter(z => !z.fresh && z.tapIndex !== null);
        if (tappedZones.length === 0) return null;
        return tappedZones.reduce((a, b) => (b.tapIndex! > a.tapIndex! ? b : a));
      })();
      // Once a candle CLOSES all the way through the tapped zone — on the
      // zone's own timeframe, not just an intrabar wick or live tick — it's
      // no longer relevant context, so hide it. Uses the last fully closed
      // candle (the array's final entry is still forming while the toggle
      // polls live).
      if (tapped && candles.length >= 2) {
        const lastClosedClose = candles[candles.length - 2].close;
        const brokenThrough = tapped.type === "demand"
          ? lastClosedClose < tapped.zoneLow
          : lastClosedClose > tapped.zoneHigh;
        if (brokenThrough) tapped = null;
      }
      let freshBoxes = freshZones.map(z => {
        // Yellow if the zone is fully nested inside the tapped zone, OR
        // merely overlaps it (lives on/touches it) — any price intersection
        // between the two ranges.
        const insideTapped = !!tapped && z.zoneLow <= tapped.zoneHigh && z.zoneHigh >= tapped.zoneLow;
        return toBox(tfLabel, z, false, insideTapped);
      });

      // Keep only the 4 closest fresh zones of each type, per timeframe, to
      // the current price — otherwise stale zones from further back clutter
      // the chart.
      if (currentPrice !== null) {
        const closest4 = (t: "supply" | "demand") =>
          freshBoxes.filter(z => z.type === t)
            .sort((a, b) => Math.abs((a.low + a.high) / 2 - currentPrice) - Math.abs((b.low + b.high) / 2 - currentPrice))
            .slice(0, 4);
        freshBoxes = [...closest4("supply"), ...closest4("demand")];
      }

      // Fade ramps from 0 (just tapped) to 1 (fully grey) over
      // tapFadeCandles candles on the zone's own timeframe. A zone tapped
      // this instant by the live price (tapIndex still null) starts the
      // ramp fresh at 0.
      let tapFade = 0;
      if (tapped && tapped.tapIndex !== null) {
        const candlesSinceTap = (candles.length - 1) - tapped.tapIndex;
        tapFade = Math.min(1, Math.max(0, candlesSinceTap / Math.max(1, tapFadeCandles)));
      }

      return {
        fresh: freshBoxes,
        tapped: tapped ? [toBox(tfLabel, tapped, true, false, tapFade)] : [],
      };
    };

    let freshBoxes: ZoneBox[] = [];
    let tappedBoxes: ZoneBox[] = [];
    if (showDailyZones) { const r = processTf("D",   dailyZonesAll, dailyZoneCandles); freshBoxes = freshBoxes.concat(r.fresh); tappedBoxes = tappedBoxes.concat(r.tapped); }
    if (show4HZones)    { const r = processTf("4H",  h4ZonesAll,    h4ZoneCandles);    freshBoxes = freshBoxes.concat(r.fresh); tappedBoxes = tappedBoxes.concat(r.tapped); }
    if (show1HZones)    { const r = processTf("1H",  h1ZonesAll,    h1ZoneCandles);    freshBoxes = freshBoxes.concat(r.fresh); tappedBoxes = tappedBoxes.concat(r.tapped); }
    if (show15MZones)   { const r = processTf("15M", m15ZonesAll,   m15ZoneCandles);   freshBoxes = freshBoxes.concat(r.fresh); tappedBoxes = tappedBoxes.concat(r.tapped); }
    if (show5MZones)    { const r = processTf("5M",  m5ZonesAll,    m5ZoneCandles);    freshBoxes = freshBoxes.concat(r.fresh); tappedBoxes = tappedBoxes.concat(r.tapped); }

    const boxes = showTappedZone ? [...freshBoxes, ...tappedBoxes] : freshBoxes;
    zoneBoxesRef.current = boxes;
    if (zonePrimRef.current) zonePrimRef.current._zones = boxes;
    chartRef.current?.applyOptions({});
  }, [showDailyZones, show4HZones, show1HZones, show15MZones, show5MZones,
      dailyZoneCandles, h4ZoneCandles, h1ZoneCandles, m15ZoneCandles, m5ZoneCandles,
      dailyZonesAll, h4ZonesAll, h1ZonesAll, m15ZonesAll, m5ZonesAll, tfRows, livePrice, showTappedZone, tapFadeCandles]);

  // ── Indicator series helpers ────────────────────────────────────────────────

  const removeIndSeries = useCallback((key: IndKey) => {
    const existing = indSeriesRef.current[key];
    if (existing && chartRef.current) {
      existing.forEach((s: any) => { try { chartRef.current!.removeSeries(s); } catch (_) {} });
    }
    delete indSeriesRef.current[key];
    if (key === "bb") bbFillPrimRef.current = null;
    if (key === "ichi") ichiCloudPrimRef.current = null;
  }, []);

  // On the 10s live-candle poll tfRows gets a new array reference with the
  // same pair/tf, and this used to unconditionally destroy + recreate every
  // active indicator's chart series (removeIndSeries + addSeries) on top of
  // recomputing them — needless series churn on every tick since only the
  // data changes, not the indicator set or the instrument's price precision.
  // Reusing the existing series via setData() when one is already present
  // for this key (only true on a same-pair/tf live tick — a genuine
  // pair/tf change clears indSeriesRef via removeIndSeries first, see the
  // chartTf/pair effect above) keeps the chart-object churn to new-load and
  // toggle-on/off only.
  const addIndSeries = useCallback((key: IndKey, candles: RawCandleTf[]) => {
    if (key === "reversal" || key === "session8am" || key === "pivots") return; // driven by their own effects, not a line series
    const chart = chartRef.current;
    if (!chart || candles.length === 0) return;

    const times  = candles.map(r => Math.floor(new Date(r.timestamp).getTime() / 1000) as UTCTimestamp);
    const closes = candles.map(r => r.close);
    const toData = (vals: (number | null)[]) =>
      vals.reduce<{ time: UTCTimestamp; value: number }[]>((acc, v, i) => {
        if (v !== null) acc.push({ time: times[i], value: v });
        return acc;
      }, []);
    const indDecimals = decimalsForPair(pairRef.current, closes[closes.length - 1]);
    const indOpts = { lastValueVisible: false, priceLineVisible: false,
                      priceFormat: { type: "price" as const, precision: indDecimals, minMove: 1 / 10 ** indDecimals } };

    if (key === "bb") {
      const { upper, middle, lower } = computeBB(closes);
      const upperData = toData(upper);
      const lowerData = toData(lower);
      const middleData = toData(middle);

      const existing = indSeriesRef.current.bb;
      if (existing && existing.length === 3 && bbFillPrimRef.current) {
        existing[0].setData(upperData); existing[1].setData(middleData); existing[2].setData(lowerData);
        bbFillPrimRef.current._upper = upperData;
        bbFillPrimRef.current._lower = lowerData;
        return;
      }
      removeIndSeries(key);

      // Border lines
      const mk = (color: string, style: LineStyle) => {
        const s = chart.addSeries(LineSeries, { color, lineWidth: 1, lineStyle: style });
        s.applyOptions(indOpts); return s;
      };
      const uS = mk("rgba(100,181,246,0.85)", LineStyle.Solid);
      const mS = mk("rgba(100,181,246,0.5)",  LineStyle.Dashed);
      const lS = mk("rgba(100,181,246,0.85)", LineStyle.Solid);
      uS.setData(upperData); mS.setData(middleData); lS.setData(lowerData);

      // Light-blue fill between upper and lower bands — drawn behind candles
      const fillPrim = new BBFillPrimitive(upperData, lowerData);
      (uS as any).attachPrimitive(fillPrim);
      bbFillPrimRef.current = fillPrim;

      indSeriesRef.current.bb = [uS, mS, lS];

    } else if (key === "ichi") {
      const highs = candles.map(r => r.high);
      const lows  = candles.map(r => r.low);
      const { tenkan, kijun, spanA, spanB } = computeIchimoku(highs, lows);
      const OFFSET = 26;
      const n = candles.length;
      const candleDur = n > 1
        ? (Math.floor(new Date(candles[n - 1].timestamp).getTime() / 1000)
         - Math.floor(new Date(candles[n - 2].timestamp).getTime() / 1000))
        : 86400;

      // Senkou A & B — shifted +26 bars forward (project future cloud past last bar)
      const spanAData: { time: UTCTimestamp; value: number }[] = [];
      const spanBData: { time: UTCTimestamp; value: number }[] = [];
      for (let i = 0; i < n; i++) {
        if (spanA[i] === null || spanB[i] === null) continue;
        const t = (i + OFFSET < n
          ? times[i + OFFSET]
          : (times[n - 1] + (i + OFFSET - n + 1) * candleDur)) as UTCTimestamp;
        spanAData.push({ time: t, value: spanA[i]! });
        spanBData.push({ time: t, value: spanB[i]! });
      }
      // Chikou — close shifted -26 bars backward
      const chikouData: { time: UTCTimestamp; value: number }[] = [];
      for (let i = OFFSET; i < n; i++)
        chikouData.push({ time: times[i - OFFSET], value: closes[i] });

      const existing = indSeriesRef.current.ichi;
      if (existing && existing.length === 5 && ichiCloudPrimRef.current) {
        const [tenkanS, kijunS, spanAS, spanBS, chikouS] = existing;
        tenkanS.setData(toData(tenkan));
        kijunS.setData(toData(kijun));
        spanAS.setData(spanAData);
        spanBS.setData(spanBData);
        chikouS.setData(chikouData);
        ichiCloudPrimRef.current._spanA = spanAData;
        ichiCloudPrimRef.current._spanB = spanBData;
        return;
      }
      removeIndSeries(key);

      const mkLine = (color: string, width: 1 | 2, style: LineStyle) => {
        const s = chart.addSeries(LineSeries, { color, lineWidth: width, lineStyle: style });
        s.applyOptions(indOpts);
        return s;
      };

      // Tenkan & Kijun — current bar
      const tenkanS = mkLine("#60a5fa", 1, LineStyle.Solid);
      const kijunS  = mkLine("#f472b6", 1, LineStyle.Solid);
      tenkanS.setData(toData(tenkan));
      kijunS.setData(toData(kijun));

      const spanAS = mkLine("#60a5fa", 1, LineStyle.Dashed);
      const spanBS = mkLine("#a78bfa", 1, LineStyle.Dashed);
      spanAS.setData(spanAData);
      spanBS.setData(spanBData);
      const cloudPrim = new IchiCloudPrimitive(spanAData, spanBData);
      (spanAS as any).attachPrimitive(cloudPrim);
      ichiCloudPrimRef.current = cloudPrim;

      const chikouS = mkLine("#a78bfa", 1, LineStyle.Dashed);
      chikouS.setData(chikouData);

      indSeriesRef.current.ichi = [tenkanS, kijunS, spanAS, spanBS, chikouS];

    } else if (key === "volume") {
      const { up, down } = VOLUME_COLOR_SCHEMES[candleColorSchemeRef.current];
      const volData = candles.map((r, i) => ({
        time: times[i], value: r.volume,
        color: r.close >= r.open ? up : down,
      }));

      const existing = indSeriesRef.current.volume;
      if (existing && existing.length === 1) {
        existing[0].setData(volData);
        return;
      }
      removeIndSeries(key);

      const s = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
        lastValueVisible: false, priceLineVisible: false,
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 }, // pinned to the bottom ~18% of the pane
        visible: false, // own axis labels would just clutter the price scale
      });
      s.setData(volData);
      indSeriesRef.current.volume = [s];

    } else {
      const MA_PERIODS: Record<string, { period: number; fn: (c: number[], p: number) => (number | null)[] }> = {
        ema9: { period: 9,   fn: computeEMA }, ema20:  { period: 20,  fn: computeEMA },
        ema50: { period: 50, fn: computeEMA }, ema200: { period: 200, fn: computeEMA },
        sma200: { period: 200, fn: computeSMA }, sma400: { period: 400, fn: computeSMA },
      };
      const { period, fn } = MA_PERIODS[key]!;
      const maData = toData(fn(closes, period));

      const existing = indSeriesRef.current[key];
      if (existing && existing.length === 1) {
        existing[0].setData(maData);
        return;
      }
      removeIndSeries(key);

      const color = IND_DEFS.find(d => d.key === key)!.color;
      const s = chart.addSeries(LineSeries, { color, lineWidth: 1 });
      s.applyOptions(indOpts);
      s.setData(maData);
      indSeriesRef.current[key] = [s];
    }
  }, [removeIndSeries]);

  // ── Price series helpers ────────────────────────────────────────────────────

  // resetView must only be true for a genuine new instrument/timeframe load
  // (see the tfRows-changed effect below) — NOT for routine recolors
  // (reversal-candle toggle, zone-sync recolor, viewMode toggle). Those call
  // applyData with the SAME underlying candles just to refresh point colors,
  // and resetting the visible time range / price autoscale on every one of
  // those (e.g. every 5s live-price tick while zones are showing) yanked the
  // chart back to its default view out from under the user mid-look.
  const applyData = useCallback((candles: RawCandleTf[], mode: string, resetView: boolean) => {
    const chart  = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || candles.length === 0) return;
    if (resetView) {
      // Re-enable price-axis autoscale on a fresh load — a prior manual drag
      // of the price axis (on whatever instrument was showing before)
      // otherwise pins the old fixed range, which is meaningless once the
      // data switches to a different instrument that trades at a completely
      // different price magnitude (e.g. sub-1 vs. several thousand).
      chart.priceScale("right").applyOptions({ autoScale: true });
    }
    if (mode === "candles") {
      const showReversals = activeIndsRef.current.has("reversal");
      const reversalFlags = showReversals ? computeReversalFlags(
        candles, zoneBoxesRef.current, eightAmBoxesRef.current, trendLinesRef.current, drawingsRef.current,
        reversalPatternTypesRef.current, reversalZoneFilterRef.current,
        reversalEightAmBoxFilterRef.current, reversalTrendlineFilterRef.current,
        reversalGannFilterRef.current, reversalFibFilterRef.current, reversalMaxCountRef.current,
      ) : null;
      series.setData(candles.map((r, i) => {
        const point: any = {
          time:  Math.floor(new Date(r.timestamp).getTime() / 1000) as UTCTimestamp,
          open: r.open, high: r.high, low: r.low, close: r.close,
        };
        if (reversalFlags && reversalFlags[i]) {
          point.color = "#eab308"; point.borderColor = "#eab308"; point.wickColor = "#eab308";
        }
        return point;
      }));
      if (reversalMarkerPrimRef.current) {
        reversalMarkerPrimRef.current._markers = reversalFlags
          ? candles.flatMap((r, i): ReversalMarkerData[] => {
              const info = reversalFlags[i];
              if (!info) return [];
              const bullish = info.bias === "bullish";
              return [{
                time: Math.floor(new Date(r.timestamp).getTime() / 1000) as UTCTimestamp,
                anchorPrice: bullish ? r.low : r.high,
                bias: info.bias,
                text: `${info.name} (${bullish ? "Bullish" : "Bearish"})`,
              }];
            })
          : [];
      }
    } else {
      if (reversalMarkerPrimRef.current) reversalMarkerPrimRef.current._markers = [];
      series.setData(candles.map(r => ({
        time:  Math.floor(new Date(r.timestamp).getTime() / 1000) as UTCTimestamp,
        value: r.close,
      })));
    }
    if (priceLineRef.current) {
      try { series.removePriceLine(priceLineRef.current); } catch (_) {}
      priceLineRef.current = null;
    }
    const last = candles[candles.length - 1];
    if (last) {
      const isUp = candles.length > 1 ? last.close >= candles[candles.length - 2].close : true;
      const { up: upColor, down: downColor } = CANDLE_COLOR_SCHEMES[candleColorSchemeRef.current];
      priceLineRef.current = series.createPriceLine({ price: last.close, color: isUp ? upColor : downColor,
        lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });
    }
    if (resetView) {
      // Zoom to the most recent 120 candles rather than fitting the full
      // (up to 5000-bar) loaded history.
      const n = candles.length;
      if (n > 120) {
        chart.timeScale().setVisibleLogicalRange({ from: n - 120, to: n + 2 });
      } else {
        chart.timeScale().fitContent();
      }
    }
  }, []);

  // Reversal-candle highlighting is gated by which supply/demand zones and
  // the 8am box are currently visible (see computeReversalFlags), but those
  // changes normally only repaint their own primitive, not the candle
  // series. Re-run applyData whenever the qualifying context could have
  // changed so the yellow highlights stay in sync.
  //
  // drawings changes on every edit anywhere on the chart (draw, drag,
  // hide/show, delete) — only the Gann/Fib reversal filters actually care
  // about it, so this collapses to a stable `null` reference whenever both
  // are off, instead of forcing a full computeReversalFlags + series.setData
  // over the whole loaded candle array on every unrelated drawing edit.
  const reversalRelevantDrawings = useMemo(
    () => (reversalGannFilter || reversalFibFilter) ? drawings : null,
    [drawings, reversalGannFilter, reversalFibFilter]
  );
  useEffect(() => {
    if (activeInds.has("reversal") && tfRows.length > 0) applyData(tfRows, viewModeRef.current, false);
  }, [showDailyZones, show4HZones, show1HZones, show15MZones, show5MZones,
      dailyZonesAll, h4ZonesAll, h1ZonesAll, m15ZonesAll, m5ZonesAll,
      dailyZoneCandles, h4ZoneCandles, h1ZoneCandles, m15ZoneCandles, m5ZoneCandles,
      livePrice, activeInds, tfRows, applyData,
      showEightAmBox, eightAmBoxes,
      showWeeklyTrend, showDailyTrend, show4HTrend, show1HTrend, show15MTrend,
      weeklyTrendCandles, dailyTrendCandles, h4TrendCandles, h1TrendCandles, m15TrendCandles, trendCounts,
      reversalZoneFilter, reversalEightAmBoxFilter, reversalTrendlineFilter, reversalGannFilter, reversalFibFilter,
      reversalMaxCount, reversalPatternGroups, showTappedZone, reversalRelevantDrawings]);

  const toggleInd = useCallback((key: IndKey) => {
    const next = new Set(activeIndsRef.current);
    if (next.has(key)) { next.delete(key); removeIndSeries(key); }
    else               { next.add(key);    addIndSeries(key, tfRowsRef.current); }
    activeIndsRef.current = next;
    setActiveInds(next);
    if (key === "reversal") applyData(tfRowsRef.current, viewModeRef.current, false);
  }, [addIndSeries, removeIndSeries, applyData]);

  const createSeries = useCallback((chart: IChartApi, mode: string) => {
    if (seriesRef.current) { chart.removeSeries(seriesRef.current); seriesRef.current = null; priceLineRef.current = null; zonePrimRef.current = null; trendPrimRef.current = null; eightAmBoxPrimRef.current = null; marketSessionPrimRef.current = null; reversalMarkerPrimRef.current = null; pivotPrimRef.current = null; newsLinePrimRef.current = null; watermarkPrimRef.current = null; drawingPrimRef.current = null; }
    if (mode === "candles") {
      const { up, down } = CANDLE_COLOR_SCHEMES[candleColorSchemeRef.current];
      const s = chart.addSeries(CandlestickSeries, {
        upColor: up, downColor: down,
        borderUpColor: up, borderDownColor: down,
        wickUpColor:   up, wickDownColor:   down,
      });
      const mainDecimals = decimalsForPair(pairRef.current, tfRowsRef.current[tfRowsRef.current.length - 1]?.close);
      s.applyOptions({ priceFormat: { type: "price", precision: mainDecimals, minMove: 1 / 10 ** mainDecimals } });
      seriesRef.current = s;
    } else {
      const s = chart.addSeries(AreaSeries, {
        lineColor: "#60a5fa", lineWidth: 2,
        topColor: "rgba(96,165,250,0.18)", bottomColor: "rgba(96,165,250,0)",
      });
      const mainDecimals = decimalsForPair(pairRef.current, tfRowsRef.current[tfRowsRef.current.length - 1]?.close);
      s.applyOptions({ priceFormat: { type: "price", precision: mainDecimals, minMove: 1 / 10 ** mainDecimals } });
      seriesRef.current = s;
    }
    const zonePrim = new ZoneBoxPrimitive(zoneBoxesRef.current);
    (seriesRef.current as any).attachPrimitive(zonePrim);
    zonePrimRef.current = zonePrim;
    const trendPrim = new TrendlinePrimitive(trendLinesRef.current);
    (seriesRef.current as any).attachPrimitive(trendPrim);
    trendPrimRef.current = trendPrim;
    const eightAmBoxPrim = new TimeRangeBoxPrimitive(eightAmBoxesRef.current);
    (seriesRef.current as any).attachPrimitive(eightAmBoxPrim);
    eightAmBoxPrimRef.current = eightAmBoxPrim;
    const marketSessionPrim = new TimeRangeBoxPrimitive(marketSessionBoxesRef.current);
    (seriesRef.current as any).attachPrimitive(marketSessionPrim);
    marketSessionPrimRef.current = marketSessionPrim;
    const reversalMarkerPrim = new ReversalMarkerPrimitive([]);
    // The class default (_showLabels = true) is only a fallback for the
    // very first primitive ever created — createSeries also reruns on
    // every viewMode toggle (candles/line) and recreates this primitive
    // from scratch each time, which was silently resetting the user's
    // label preference back to "on" regardless of what they'd set it to.
    reversalMarkerPrim._showLabels = showReversalLabelsRef.current;
    (seriesRef.current as any).attachPrimitive(reversalMarkerPrim);
    reversalMarkerPrimRef.current = reversalMarkerPrim;
    const pivotPrim = new TimeRangeBoxPrimitive([]);
    (seriesRef.current as any).attachPrimitive(pivotPrim);
    pivotPrimRef.current = pivotPrim;
    const newsLinePrim = new NewsLinePrimitive([]);
    (seriesRef.current as any).attachPrimitive(newsLinePrim);
    newsLinePrimRef.current = newsLinePrim;
    const drawingPrim = new DrawingPrimitive(drawingsRef.current, pairRef.current);
    drawingPrim._selectedId = selectedDrawingIdRef.current;
    (seriesRef.current as any).attachPrimitive(drawingPrim);
    drawingPrimRef.current = drawingPrim;
    // Ghosted instrument watermark — Quad View tiles only.
    if (compact) {
      const watermarkPrim = new WatermarkPrimitive(pairRef.current);
      (seriesRef.current as any).attachPrimitive(watermarkPrim);
      watermarkPrimRef.current = watermarkPrim;
    }
    // False: this fires on mount (no data yet, so a no-op) and on viewMode
    // toggle (candles/line) — the series is recreated, but the user's
    // existing pan/zoom on this same instrument's data shouldn't reset.
    if (tfRowsRef.current.length > 0) applyData(tfRowsRef.current, mode, false);
  }, [applyData, compact]);

  // Live color-scheme swap for the already-attached candlestick series —
  // no need to tear down/recreate the series (that would reset zoom/pan)
  // just to change colors. createSeries (above) reads the same scheme via
  // a ref for when the series gets recreated some other way (e.g. the
  // candles/line view-mode toggle).
  useEffect(() => {
    if (!seriesRef.current || viewMode !== "candles") return;
    const { up, down } = CANDLE_COLOR_SCHEMES[candleColorScheme];
    seriesRef.current.applyOptions({
      upColor: up, downColor: down,
      borderUpColor: up, borderDownColor: down,
      wickUpColor:   up, wickDownColor:   down,
    });
    if (priceLineRef.current) {
      const rows = tfRowsRef.current;
      const last = rows[rows.length - 1];
      if (last) {
        const isUp = rows.length > 1 ? last.close >= rows[rows.length - 2].close : true;
        priceLineRef.current.applyOptions({ color: isUp ? up : down });
      }
    }
    // Volume bars are colored per-point (not via series-level up/down
    // options like candlesticks), so a scheme change needs a re-setData.
    const volSeries = indSeriesRef.current.volume?.[0];
    if (volSeries) {
      const { up: volUp, down: volDown } = VOLUME_COLOR_SCHEMES[candleColorScheme];
      const rows = tfRowsRef.current;
      volSeries.setData(rows.map(r => ({
        time: Math.floor(new Date(r.timestamp).getTime() / 1000) as UTCTimestamp,
        value: r.volume, color: r.close >= r.open ? volUp : volDown,
      })));
    }
  }, [candleColorScheme, viewMode]);

  // Init chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      height: 480,
      layout: { background: { type: ColorType.Solid, color: "#0f1117" }, textColor: "#94a3b8", fontSize: 11 },
      grid: { vertLines: { color: "rgba(148,163,184,0.06)" }, horzLines: { color: "rgba(148,163,184,0.06)" } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: {
        borderColor: "rgba(148,163,184,0.15)", timeVisible: true, secondsVisible: false,
        tickMarkFormatter: formatNyTickMark,
      },
      localization: { timeFormatter: formatNyCrosshairTime, priceFormatter: (p: number) => formatPrice(p, decimalsForPair(pairRef.current, p)) },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.15)", scaleMargins: { top: 0.08, bottom: 0.08 } },
    });
    chartRef.current = chart;
    createSeries(chart, viewModeRef.current);
    let prevWidth = 0;
    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (w === 0 || h === 0) return;
      chart.applyOptions({ width: w, height: h });
      if (prevWidth === 0) {
        // Same "most recent 120 candles" default as applyData — this first
        // resize can land after data has already loaded (async panels above
        // the chart reflow layout), which would otherwise stomp that zoom
        // with a full-history fitContent() and land on the whole multi-year
        // range instead of a recent window.
        const n = tfRowsRef.current.length;
        if (n > 120) chart.timeScale().setVisibleLogicalRange({ from: n - 120, to: n + 2 });
        else         chart.timeScale().fitContent();
      }
      prevWidth = w;
    });
    ro.observe(containerRef.current);

    // News marker hover/click detail — hit-tests the mouse's chart-pane x
    // against NewsLinePrimitive._hitTest (CSS-pixel positions the renderer
    // records on every draw). Reads newsLinePrimRef.current dynamically
    // rather than closing over one primitive instance, since the viewMode
    // effect below can recreate the series (and its attached primitive).
    const onCrosshairMove = (param: any) => {
      lastMouseXYRef.current = (param?.point?.x !== undefined && param?.point?.y !== undefined)
        ? { x: param.point.x, y: param.point.y } : null;

      const hitTest = newsLinePrimRef.current?._hitTest ?? [];
      const x = param?.point?.x;
      if (x === undefined || hitTest.length === 0) { setNewsHover(null); }
      else {
        const hit = hitTest.find(h => Math.abs(h.xCss - x) <= 4);
        const rect = containerRef.current?.getBoundingClientRect();
        if (!hit || !rect) setNewsHover(null);
        else setNewsHover({ x: rect.left + x, y: rect.top + (param.point.y ?? 0), label: hit.label, color: hit.color, detail: hit.detail });
      }

      const bar = param?.time !== undefined && seriesRef.current
        ? param.seriesData?.get(seriesRef.current)
        : null;
      // Keep the same object reference when the hovered bar's O/H/L/C
      // hasn't actually changed — this fires on every mouse-pixel move, and
      // a fresh object literal each time would fail React's Object.is
      // bail-out and re-render this (large) component on every pixel even
      // while still hovering the same candle.
      setHoverBar(prev => {
        if (!bar || bar.open === undefined) return prev === null ? prev : null;
        if (prev && prev.open === bar.open && prev.high === bar.high && prev.low === bar.low && prev.close === bar.close) return prev;
        return { open: bar.open, high: bar.high, low: bar.low, close: bar.close };
      });

      // Rubber-band preview for an in-progress 2-point drawing — mutating
      // the primitive directly (not React state) since this fires on every
      // mouse pixel and a repaint is already about to happen for the
      // crosshair itself.
      if (pendingPointRef.current && drawingPrimRef.current) {
        const px = param?.point?.x, py = param?.point?.y;
        if (px !== undefined && py !== undefined && param.time !== undefined && seriesRef.current && chartRef.current) {
          const snap = magnetModeRef.current ? findMagnetSnap(chartRef.current, seriesRef.current, px, py, tfRowsRef.current) : null;
          const price = snap ? snap.price : seriesRef.current.coordinateToPrice(py);
          if (price !== null) {
            drawingPrimRef.current._pending = {
              kind: activeDrawToolRef.current as Exclude<DrawTool, "cursor">,
              p1: pendingPointRef.current,
              p2: pendingSecondPointRef.current ?? undefined,
              cursor: snap ?? { time: param.time as number, price },
            };
          }
        }
      }
    };
    chart.subscribeCrosshairMove(onCrosshairMove);

    // Drawing-tool placement + selection — a tool other than "cursor" places
    // points (1 click for horizontal/text, 2 for the rest); "cursor" instead
    // hit-tests the click against existing drawings to select/deselect one
    // for deletion. Reads activeDrawToolRef/pendingPointRef rather than
    // closing over state so this subscription (set up once, on mount) always
    // sees the current tool.
    const onChartClick = (param: any) => {
      const series = seriesRef.current;
      const x = param?.point?.x, y = param?.point?.y;
      if (!series || x === undefined || y === undefined) return;
      const tool = activeDrawToolRef.current;

      if (tool === "cursor") {
        const chart = chartRef.current;
        if (!chart) return;
        let hitId: string | null = null;
        for (let i = drawingsRef.current.length - 1; i >= 0; i--) {
          const d = drawingsRef.current[i];
          if (!d.hidden && hitTestDrawing(chart, series, d, x, y)) { hitId = d.id; break; }
        }
        setSelectedDrawingId(hitId);
        return;
      }

      if (param.time === undefined) return; // clicked past the loaded data — nothing to anchor to
      const chart = chartRef.current;
      const snap = (magnetModeRef.current && tool !== "text" && chart)
        ? findMagnetSnap(chart, series, x, y, tfRowsRef.current) : null;
      const price = snap ? snap.price : series.coordinateToPrice(y);
      if (price === null) return;
      const point: DrawPoint = snap ?? { time: param.time as number, price };

      if (tool === "horizontal" || tool === "horizontalray" || tool === "text") {
        if (tool === "text") {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) setTextPrompt({ x: rect.left + x, y: rect.top + y, point });
        } else {
          persistDrawings([...drawingsRef.current, { id: crypto.randomUUID(), kind: tool, p1: point, color: "#60a5fa" }]);
          setActiveDrawTool("cursor");
        }
        return;
      }

      if (!pendingPointRef.current) {
        pendingPointRef.current = point;
        if (drawingPrimRef.current) drawingPrimRef.current._pending = { kind: tool, p1: point, cursor: point };
        return;
      }
      // fibext is the only 3-click tool — its 2nd click confirms B and
      // waits on a 3rd (C) instead of completing here.
      if (tool === "fibext" && !pendingSecondPointRef.current) {
        pendingSecondPointRef.current = point;
        if (drawingPrimRef.current) drawingPrimRef.current._pending = { kind: tool, p1: pendingPointRef.current, p2: point, cursor: point };
        return;
      }
      const newDrawing: Drawing = tool === "fibext"
        ? { id: crypto.randomUUID(), kind: "fibext", p1: pendingPointRef.current, p2: pendingSecondPointRef.current!, p3: point, color: "#eab308" }
        : { id: crypto.randomUUID(), kind: tool, p1: pendingPointRef.current, p2: point, color: tool === "fib" ? "#eab308" : "#60a5fa" };
      persistDrawings([...drawingsRef.current, newDrawing]);
      pendingPointRef.current = null;
      pendingSecondPointRef.current = null;
      if (drawingPrimRef.current) drawingPrimRef.current._pending = null;
      setActiveDrawTool("cursor");
    };
    chart.subscribeClick(onChartClick);

    // Drag-to-readjust for the selected drawing — native DOM events, not a
    // lightweight-charts subscription, since a drag needs continuous
    // mousemove/mouseup tracking that subscribeClick/subscribeCrosshairMove
    // don't provide. Coordinates come from lastMouseXYRef (lightweight-charts'
    // own onCrosshairMove-reported point), NOT a manual clientX/Y minus
    // getBoundingClientRect() — that would be a second, independent
    // coordinate pipeline, and any small discrepancy between it and the
    // logicalToCoordinate/priceToCoordinate space every hit-test in this file
    // already relies on would make an 8px handle unhittable. Registered with
    // `capture: true` on the container (the div lightweight-charts renders
    // its own canvas into) so this runs BEFORE the chart's own mousedown
    // handler — only then does stopPropagation actually suppress its
    // pan-on-drag for this gesture, rather than the chart having already
    // started panning by the time a bubble-phase listener would fire.
    //
    // Two kinds of handle, checked in this order: a drawing's own real
    // anchor point(s) (p1/p2/p3, any kind — moves both time and price of
    // that exact point, letting you re-anchor a trend line, ray, gann fan,
    // fibext leg, etc. after the fact) take priority over a rectangle's
    // derived edge-midpoint handles (resize — moves only one axis).
    const onContainerMouseDown = (e: MouseEvent) => {
      if (activeDrawToolRef.current !== "cursor") return;
      const id = selectedDrawingIdRef.current;
      if (!id) return;
      const drawing = drawingsRef.current.find(d => d.id === id);
      if (!drawing) return;
      const chart = chartRef.current, series = seriesRef.current;
      const xy = lastMouseXYRef.current;
      if (!chart || !series || !xy) return;
      const anchorHit = hitTestAnchorPoint(chart, series, drawing, xy.x, xy.y);
      const rectHandle = !anchorHit ? hitTestRectHandle(chart, series, drawing, xy.x, xy.y) : null;
      if (!anchorHit && !rectHandle) return;
      e.preventDefault();
      e.stopPropagation();
      draggingHandleRef.current = anchorHit
        ? { mode: "anchor", id, point: anchorHit }
        : { mode: "rectResize", id, handle: rectHandle! };

      const onMove = () => {
        const dh = draggingHandleRef.current;
        const mxy = lastMouseXYRef.current;
        if (!dh || !mxy) return;
        const { x: mx, y: my } = mxy;
        const cur = drawingsRef.current.find(d => d.id === dh.id);
        if (!cur) return;

        let next: Drawing;
        if (dh.mode === "anchor") {
          let price = series.coordinateToPrice(my);
          let time = chart.timeScale().coordinateToTime(mx) as number | null;
          if (price === null || time === null) return;
          if (magnetModeRef.current) {
            const snap = findMagnetSnap(chart, series, mx, my, tfRowsRef.current);
            if (snap) { price = snap.price; time = snap.time; }
          }
          next = {
            ...cur,
            p1: { ...cur.p1 }, p2: cur.p2 ? { ...cur.p2 } : undefined, p3: cur.p3 ? { ...cur.p3 } : undefined,
          };
          (next as any)[dh.point] = { time, price };
        } else {
          if (!cur.p2) return;
          next = { ...cur, p1: { ...cur.p1 }, p2: { ...cur.p2 } };
          if (dh.handle === "top" || dh.handle === "bottom") {
            let price = series.coordinateToPrice(my);
            if (price === null) return;
            if (magnetModeRef.current) {
              const snap = findMagnetSnap(chart, series, mx, my, tfRowsRef.current);
              if (snap) price = snap.price;
            }
            const p1IsHigher = cur.p1.price >= cur.p2.price;
            const movingP1 = (dh.handle === "top") === p1IsHigher;
            if (movingP1) next.p1!.price = price; else next.p2!.price = price;
          } else {
            const time = chart.timeScale().coordinateToTime(mx) as number | null;
            if (time === null) return;
            const p1IsEarlier = cur.p1.time <= cur.p2.time;
            const movingP1 = (dh.handle === "left") === p1IsEarlier;
            if (movingP1) next.p1!.time = time; else next.p2!.time = time;
          }
        }
        const updated = drawingsRef.current.map(d => d.id === dh.id ? next : d);
        drawingsRef.current = updated;
        if (drawingPrimRef.current) drawingPrimRef.current._drawings = updated;
      };
      const onUp = () => {
        draggingHandleRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        activeDragListenersRef.current = null;
        persistDrawings(drawingsRef.current);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      activeDragListenersRef.current = { onMove, onUp };
    };
    containerRef.current.addEventListener("mousedown", onContainerMouseDown, { capture: true });

    return () => {
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chart.unsubscribeClick(onChartClick);
      containerRef.current?.removeEventListener("mousedown", onContainerMouseDown, { capture: true });
      // Drop an in-flight handle drag rather than leak its window listeners
      // or let its eventual mouseup call persistDrawings after unmount —
      // the drag's live preview only ever lived in the primitive, so
      // there's nothing to persist, just a partial gesture to abandon.
      if (activeDragListenersRef.current) {
        window.removeEventListener("mousemove", activeDragListenersRef.current.onMove);
        window.removeEventListener("mouseup", activeDragListenersRef.current.onUp);
        activeDragListenersRef.current = null;
      }
      ro.disconnect(); chart.remove();
      chartRef.current = null; seriesRef.current = null; indSeriesRef.current = {}; bbFillPrimRef.current = null; ichiCloudPrimRef.current = null; zonePrimRef.current = null; trendPrimRef.current = null; eightAmBoxPrimRef.current = null; marketSessionPrimRef.current = null; newsLinePrimRef.current = null; watermarkPrimRef.current = null; drawingPrimRef.current = null; openTradePriceLinesRef.current = [];
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Recreate price series on viewMode change (indicator series survive)
  useEffect(() => {
    if (!chartRef.current) return;
    createSeries(chartRef.current, viewMode);
  }, [viewMode, createSeries]);

  // Draw open-position entry/SL/TP lines — full-width price lines, same
  // mechanism as the live last-price line, since an open position is still
  // active now rather than bound to a historical time range. Runs after the
  // viewMode series-recreation effect above so it always targets the
  // current series, not one about to be torn down.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const line of openTradePriceLinesRef.current) {
      try { series.removePriceLine(line); } catch (_) {}
    }
    openTradePriceLinesRef.current = [];
    for (const t of openTrades) {
      const isLong = t.side === "long";
      if (t.entryPrice != null) {
        openTradePriceLinesRef.current.push(series.createPriceLine({
          price: t.entryPrice, color: "#eab308", lineWidth: 2, lineStyle: LineStyle.Solid,
          axisLabelVisible: true, title: isLong ? "LONG Entry" : "SHORT Entry",
        }));
      }
      if (t.stopPrice != null) {
        openTradePriceLinesRef.current.push(series.createPriceLine({
          price: t.stopPrice, color: "#ef4444", lineWidth: 1, lineStyle: LineStyle.Dashed,
          axisLabelVisible: true, title: "SL",
        }));
      }
      if (t.targetPrice != null) {
        openTradePriceLinesRef.current.push(series.createPriceLine({
          price: t.targetPrice, color: "#22c55e", lineWidth: 1, lineStyle: LineStyle.Dashed,
          axisLabelVisible: true, title: "TP",
        }));
      }
    }
  }, [openTrades, viewMode]);

  // Apply price data + refresh all active indicators when data arrives.
  // tfRows changes on the initial [chartTf, pair] load and on the 10s live
  // poll; shouldResetViewRef distinguishes the two so only the former resets
  // the visible range and price autoscale.
  useEffect(() => {
    if (tfRows.length === 0) return;
    applyData(tfRows, viewModeRef.current, shouldResetViewRef.current);
    activeIndsRef.current.forEach(key => addIndSeries(key, tfRows));
    // Track the oldest loaded bar's time and the loaded high/low series
    // itself, so the trendline primitive can resolve each pivot anchor to
    // whichever loaded bar actually touched that price (for the anchor
    // circle markers), and knows when an anchor is within the loaded window
    // at all.
    if (trendPrimRef.current && tfRows.length >= 2) {
      trendPrimRef.current._oldestLoadedTime = Math.floor(new Date(tfRows[0].timestamp).getTime() / 1000);
      trendPrimRef.current._loadedCandles = tfRows.map(r => ({
        t: Math.floor(new Date(r.timestamp).getTime() / 1000), h: r.high, l: r.low,
      }));
    }
  }, [tfRows, applyData, addIndSeries]);

  const [showIndPanel, setShowIndPanel] = useState(false);
  const indBtnRef = useRef<HTMLButtonElement>(null);
  const indPanelPopoverRef = useRef<HTMLDivElement>(null);
  const [indPanelPos, setIndPanelPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!showIndPanel) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideButton  = indBtnRef.current?.contains(target);
      const insidePopover = indPanelPopoverRef.current?.contains(target);
      if (!insideButton && !insidePopover) setShowIndPanel(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showIndPanel]);

  useEffect(() => {
    if (!showTrendSettings) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideGroup   = trendSettingsGroupRef.current?.contains(target);
      const insidePopover = trendSettingsPopoverRef.current?.contains(target);
      if (!insideGroup && !insidePopover) setShowTrendSettings(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showTrendSettings]);

  useEffect(() => {
    if (!showReversalSettings) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideButton  = reversalBtnRef.current?.contains(target);
      const insidePopover = reversalSettingsPopoverRef.current?.contains(target);
      if (!insideButton && !insidePopover) setShowReversalSettings(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showReversalSettings]);

  useEffect(() => {
    if (!showLayersPanel) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideButton  = layersBtnRef.current?.contains(target);
      const insidePopover = layersPopoverRef.current?.contains(target);
      if (!insideButton && !insidePopover) setShowLayersPanel(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showLayersPanel]);

  useEffect(() => {
    if (!showPivotSettings) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideButton  = pivotBtnRef.current?.contains(target);
      const insidePopover = pivotSettingsPopoverRef.current?.contains(target);
      if (!insideButton && !insidePopover) setShowPivotSettings(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showPivotSettings]);

  useEffect(() => {
    if (!showOrbSettings) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideButton  = orbBtnRef.current?.contains(target);
      const insidePopover = orbSettingsPopoverRef.current?.contains(target);
      if (!insideButton && !insidePopover) setShowOrbSettings(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showOrbSettings]);

  useEffect(() => {
    if (!showNewsSettings) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideButton  = newsBtnRef.current?.contains(target);
      const insidePopover = newsSettingsPopoverRef.current?.contains(target);
      if (!insideButton && !insidePopover) setShowNewsSettings(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showNewsSettings]);

  useEffect(() => {
    if (!showCandleSettings) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideButton  = viewModeBtnRef.current?.contains(target);
      const insidePopover = candleSettingsPopoverRef.current?.contains(target);
      if (!insideButton && !insidePopover) setShowCandleSettings(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showCandleSettings]);

  useEffect(() => {
    if (!showZoneSettings) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideGroup   = zoneSettingsGroupRef.current?.contains(target);
      const insidePopover = zoneSettingsPopoverRef.current?.contains(target);
      if (!insideGroup && !insidePopover) setShowZoneSettings(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showZoneSettings]);

  useEffect(() => {
    if (!showSnapshotPicker) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideButton  = snapshotBtnRef.current?.contains(target);
      const insidePopover = snapshotPopoverRef.current?.contains(target);
      if (!insideButton && !insidePopover) setShowSnapshotPicker(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showSnapshotPicker]);

  const handleSnapshotClick = useCallback(async () => {
    const rect = snapshotBtnRef.current?.getBoundingClientRect();
    if (rect) {
      const popoverWidth = 260;
      const left = Math.min(rect.left, window.innerWidth - popoverWidth - 12);
      setSnapshotPos({ top: rect.bottom + 6, left: Math.max(8, left) });
    }
    setSnapshotSaved(false);
    setSnapshotTradeId(null);
    setSnapshotKind("entry");
    setSnapshotDataUrl(null);
    setShowSnapshotPicker(true);
    const target = snapshotTargetRef?.current ?? captureRef.current;
    if (target) {
      try {
        const dataUrl = await toPng(target, { pixelRatio: 2, backgroundColor: "#0f1117" });
        setSnapshotDataUrl(dataUrl);
      } catch (err) {
        console.error("[PriceHistoryChart] screenshot capture failed:", err);
      }
    }
    try {
      const settings = await getSettings();
      const trades = await getAllTradesWithJournal(settings?.selectedAccountId ?? "acc-1");
      const todayStr = localDateStr();
      setSnapshotTrades(trades.filter(t => t.openedAt.slice(0, 10) === todayStr));
    } catch (err) {
      console.error("[PriceHistoryChart] failed to load trades for snapshot picker:", err);
    }
  }, []);

  const handleSaveSnapshot = useCallback(async () => {
    if (!snapshotDataUrl || !snapshotTradeId) return;
    setSnapshotSaving(true);
    try {
      const base64 = snapshotDataUrl.split(",")[1] ?? "";
      const savedPath = await invoke<string>("save_chart_screenshot", { dataBase64: base64, kind: snapshotKind });
      await addTradeImage(snapshotTradeId, snapshotKind, savedPath);
      setSnapshotSaved(true);
      setTimeout(() => setShowSnapshotPicker(false), 1000);
    } catch (err) {
      console.error("[PriceHistoryChart] failed to save snapshot:", err);
    } finally {
      setSnapshotSaving(false);
    }
  }, [snapshotDataUrl, snapshotTradeId, snapshotKind]);

  const [showSessionSettings, setShowSessionSettings] = useState(false);
  const [sessionSettingsPos, setSessionSettingsPos] = useState<{ top: number; left: number } | null>(null);
  const sessionSettingsBtnRef = useRef<HTMLButtonElement>(null);
  const sessionSettingsPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSessionSettings) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideButton  = sessionSettingsBtnRef.current?.closest("[data-sessions-panel]")?.contains(target);
      const insidePopover = sessionSettingsPopoverRef.current?.contains(target);
      if (!insideButton && !insidePopover) setShowSessionSettings(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showSessionSettings]);

  // Count only indicators actually listed in the Indicators dropdown —
  // Reversal and 8AM Box are standalone toolbar buttons that happen to share
  // the same activeInds Set, but shouldn't inflate this badge.
  const activeIndDefsCount = IND_DEFS.filter((d) => activeInds.has(d.key)).length;
  const anyActive = activeIndDefsCount > 0;

  // Quad View lock — this tile is "remote-controlled" (and its toolbar
  // greyed out) whenever it's a non-primary tile and the primary has locked.
  const quadDisabled = compact && quadLocked && !showSnapshotAndExpand;

  // Primary tile broadcasts its toolbar settings whenever any of them change
  // while locked. Deliberately re-broadcasts on every relevant change rather
  // than diffing — cheap (a handful of tiles, plain object), and guarantees
  // followers can't drift out of sync.
  useEffect(() => {
    if (!compact || !quadLocked || !showSnapshotAndExpand) return;
    quadSyncEvents.publish({
      chartTf, activeInds: [...activeInds],
      showDailyZones, show4HZones, show1HZones, show15MZones, show5MZones,
      showWeeklyTrend, showDailyTrend, show4HTrend, show1HTrend, show15MTrend, show5MTrend, show1MTrend,
      showOrbNY, showOrbTokyo, showOrbLondon, showOrb930,
      showSessions, showNews, viewMode, candleColorScheme,
    });
  }, [compact, quadLocked, showSnapshotAndExpand, chartTf, activeInds,
      showDailyZones, show4HZones, show1HZones, show15MZones, show5MZones,
      showWeeklyTrend, showDailyTrend, show4HTrend, show1HTrend, show15MTrend, show5MTrend, show1MTrend,
      showOrbNY, showOrbTokyo, showOrbLondon, showOrb930,
      showSessions, showNews, viewMode, candleColorScheme]);

  // Non-primary tiles apply whatever the primary broadcasts while locked.
  // activeInds specifically needs toggleInd (not a plain setter) since it
  // also attaches/detaches the corresponding chart series.
  useEffect(() => {
    if (!compact || showSnapshotAndExpand) return;
    return quadSyncEvents.subscribe((settings) => {
      if (!quadLocked) return;
      setChartTf(settings.chartTf);
      setShowDailyZones(settings.showDailyZones);
      setShow4HZones(settings.show4HZones);
      setShow1HZones(settings.show1HZones);
      setShow15MZones(settings.show15MZones);
      setShow5MZones(settings.show5MZones);
      setShowWeeklyTrend(settings.showWeeklyTrend);
      setShowDailyTrend(settings.showDailyTrend);
      setShow4HTrend(settings.show4HTrend);
      setShow1HTrend(settings.show1HTrend);
      setShow15MTrend(settings.show15MTrend);
      setShow5MTrend(settings.show5MTrend);
      setShow1MTrend(settings.show1MTrend);
      setShowOrbNY(settings.showOrbNY);
      setShowOrbTokyo(settings.showOrbTokyo);
      setShowOrbLondon(settings.showOrbLondon);
      setShowOrb930(settings.showOrb930);
      setShowSessions(settings.showSessions);
      setShowNews(settings.showNews);
      setViewMode(settings.viewMode);
      setCandleColorScheme(settings.candleColorScheme);
      const incoming = new Set(settings.activeInds);
      for (const key of activeIndsRef.current) if (!incoming.has(key)) toggleInd(key);
      for (const key of incoming) if (!activeIndsRef.current.has(key)) toggleInd(key);
    });
  }, [compact, showSnapshotAndExpand, quadLocked, toggleInd]);

  // Mirrors the instrument/price header in the (now-collapsed) panel right
  // of the chart, so identity + price stay visible in the toolbar.
  const latestRow = rows[rows.length - 1];

  // Which currencies are relevant to the charted pair, for the News
  // settings popover's per-currency CPI/Jobs sub-filter.
  const pairCurrencies = relevantNewsCurrencies(pair);

  // Snapshot — same relocate-when-expanded treatment as the master
  // collapse button below; sits just to its left in the expanded spot.
  const snapshotButton = (
    <button
      ref={snapshotBtnRef}
      onClick={handleSnapshotClick}
      title="Save a snapshot of the chart + toolbar to a trade"
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 22, height: 22, padding: 0, flexShrink: 0,
        background: showSnapshotPicker ? "var(--accent-dim)" : "var(--bg-panel-alt)",
        border:     showSnapshotPicker ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
        borderRadius: 8, color: showSnapshotPicker ? "var(--accent-text)" : "var(--text-secondary)", cursor: "pointer",
      }}
    >
      <Camera size={12} />
    </button>
  );

  // Master collapse/expand — rendered in one of two spots depending on
  // rightOfChartCollapsed: its usual place in the button cluster, or (once
  // the chart is expanded and the instrument/price label appears in the
  // toolbar) to the right of that label instead.
  const masterCollapseButton = (
    <button
      onClick={onToggleAllPanels}
      title={allPanelsCollapsed ? "Expand panels around chart" : "Collapse panels around chart"}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 22, height: 22, padding: 0, flexShrink: 0,
        background: "var(--bg-panel-alt)", border: "1px solid var(--border-medium)",
        borderRadius: 8, color: "var(--text-secondary)", cursor: "pointer",
      }}
    >
      {allPanelsCollapsed ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
    </button>
  );

  return (
    <div ref={captureRef} style={{
      // width is the flex-basis (flex-basis:auto defers to it); flexShrink
      // must stay 1 whenever expandWidth is true so the row can still make
      // room for the divider next to it instead of overflowing past it and
      // under the page's scrollbar. Deliberately no flex-grow here (even
      // when expandHeight is true) — this width must stay constant whether
      // or not the panels below the chart are collapsed; height still
      // stretches to fill via the parent row's alignItems:stretch — except
      // in compact (Quad View tile) mode, where the parent is a grid cell,
      // not a stretching flex row, so it needs an explicit height:100%.
      width: expandWidth ? "100%" : "76%", marginBottom: 10,
      flexShrink: expandWidth ? 1 : 0,
      ...(expandHeight ? { display: "flex", flexDirection: "column", minHeight: 0 } : {}),
      ...(compact ? { height: "100%" } : {}),
    }}>
      {/* Toolbar: timeframes · Indicators button · view mode */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 4, flexShrink: 0, overflowX: "auto", minHeight: 34, paddingLeft: compact ? 10 : 0 }}>
        {/* Compact mode (each Quad View tile is its own PriceHistoryChart
            instance) — instrument picker + condensed Chart-TF/Supply-Demand/
            Trend-Lines dropdowns instead of the full button rows below, so a
            quarter-width tile still has every control, just collapsed. */}
        {compact && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
            <InstrumentPicker pair={pair} onChange={(p) => onPairChange?.(p)} />
            {/* Timeframe/Supply-Demand/Trend Lines are synced while locked
                (see quadSyncEvents) — greyed out + non-interactive on the
                non-primary tiles receiving that sync, since they're being
                driven by the primary tile's toolbar instead. Instrument stays
                independently editable either way (see InstrumentPicker above). */}
            <div style={{
              display: "flex", gap: 6, alignItems: "center", flexShrink: 0,
              opacity: quadDisabled ? 0.35 : 1, pointerEvents: quadDisabled ? "none" : "auto",
            }}>
            <TfDropdown value={chartTf} options={["1W","1D","4H","1H","15M","5M","1M"] as const} onChange={setChartTf} />
            <MultiTfDropdown
              label="Supply / Demand"
              options={["D", "4H", "1H", "15M", "5M"]}
              active={{ D: showDailyZones, "4H": show4HZones, "1H": show1HZones, "15M": show15MZones, "5M": show5MZones }}
              onToggle={(k) => {
                if (k === "D") setShowDailyZones(v => !v);
                else if (k === "4H") setShow4HZones(v => !v);
                else if (k === "1H") setShow1HZones(v => !v);
                else if (k === "15M") setShow15MZones(v => !v);
                else if (k === "5M") setShow5MZones(v => !v);
              }}
            />
            <MultiTfDropdown
              label="Trend Lines"
              options={["W", "D", "4H", "1H", "15M", "5M", "1M"]}
              active={{ W: showWeeklyTrend, D: showDailyTrend, "4H": show4HTrend, "1H": show1HTrend, "15M": show15MTrend, "5M": show5MTrend, "1M": show1MTrend }}
              onToggle={(k) => {
                if (k === "W") setShowWeeklyTrend(v => !v);
                else if (k === "D") setShowDailyTrend(v => !v);
                else if (k === "4H") setShow4HTrend(v => !v);
                else if (k === "1H") setShow1HTrend(v => !v);
                else if (k === "15M") setShow15MTrend(v => !v);
                else if (k === "5M") setShow5MTrend(v => !v);
                else if (k === "1M") setShow1MTrend(v => !v);
              }}
              accentColor="#3b82f6"
            />
            </div>
          </div>
        )}
        {!compact && (
          <div style={{ display: "flex", gap: 3, alignItems: "center", flexShrink: 0 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
              color: "var(--text-muted)", marginRight: 2, whiteSpace: "nowrap",
            }}>
              Chart
            </span>
            {(["1W","1D","4H","1H","15M","5M","1M"] as const).map(tf => (
              <button key={tf} onClick={() => setChartTf(tf)} style={{
                fontSize: 9, fontWeight: 700, padding: "4px 3px",
                textTransform: "uppercase", letterSpacing: "0.08em",
                background: chartTf === tf ? "var(--accent-dim)"    : "var(--bg-panel-alt)",
                border:     chartTf === tf ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
                color:      chartTf === tf   ? "var(--accent-text)"   : "var(--text-secondary)",
                borderRadius: 8, cursor: "pointer",
              }}>{tf}</button>
            ))}
          </div>
        )}
        {!compact && <div style={{ width: 1, height: 18, background: "var(--border-medium)", flexShrink: 0, margin: "0 6px" }} />}
        {!compact && (
        <div style={{ display: "flex", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
            <div ref={zoneSettingsGroupRef} style={{ display: "flex", gap: 3, alignItems: "center", flexShrink: 0 }} data-zone-settings-panel>
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
                color: "var(--text-muted)", marginRight: 2, whiteSpace: "nowrap",
              }}>
                Supply / Demand
              </span>
              {([
                ["D",   showDailyZones,  setShowDailyZones],
                ["4H",  show4HZones,     setShow4HZones],
                ["1H",  show1HZones,     setShow1HZones],
                ["15M", show15MZones,    setShow15MZones],
                ["5M",  show5MZones,     setShow5MZones],
              ] as const).map(([label, active, setter]) => (
                <button
                  key={label}
                  onClick={() => setter(v => !v)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setZoneSettingsPos({ top: rect.bottom + 6, left: rect.left });
                    setShowZoneSettings(v => !v);
                  }}
                  title="Click to toggle, right-click for settings"
                  style={{
                    fontSize: 9, fontWeight: 700, padding: "4px 5px",
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    background: active ? "var(--accent-dim)"    : "var(--bg-panel-alt)",
                    border:     active ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
                    color:      active ? "var(--accent-text)"   : "var(--text-secondary)",
                    borderRadius: 8, cursor: "pointer",
                  }}>{label}</button>
              ))}
              {showZoneSettings && zoneSettingsPos && createPortal(
                <div ref={zoneSettingsPopoverRef} style={{
                  position: "fixed", top: zoneSettingsPos.top, left: zoneSettingsPos.left, zIndex: 1000,
                  background: "var(--bg-panel)", border: "1px solid var(--border-medium)",
                  borderRadius: 10, padding: "10px 12px", width: 220,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 6 }}>
                    Settings:
                  </div>
                  <button
                    onClick={() => setShowTappedZone(v => !v)}
                    style={{
                      fontSize: 9, fontWeight: 700, padding: "4px 6px", width: "100%",
                      textTransform: "uppercase", letterSpacing: "0.06em",
                      background: showTappedZone ? "var(--accent-dim)" : "var(--bg-panel-alt)",
                      border:     showTappedZone ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
                      color:      showTappedZone ? "var(--accent-text)" : "var(--text-secondary)",
                      borderRadius: 6, cursor: "pointer",
                    }}
                  >
                    Show Most Recently Tapped Zone
                  </button>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border-subtle)",
                  }}>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Fade over (candles)</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button
                        onClick={() => setTapFadeCandles(n => Math.max(1, n - 1))}
                        style={{
                          width: 18, height: 18, borderRadius: 4, cursor: "pointer",
                          background: "var(--bg-panel-alt)", border: "1px solid var(--border-medium)",
                          color: "var(--text-secondary)", fontSize: 11, lineHeight: 1,
                        }}
                      >−</button>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", width: 18, textAlign: "center" }}>
                        {tapFadeCandles}
                      </span>
                      <button
                        onClick={() => setTapFadeCandles(n => Math.min(50, n + 1))}
                        style={{
                          width: 18, height: 18, borderRadius: 4, cursor: "pointer",
                          background: "var(--bg-panel-alt)", border: "1px solid var(--border-medium)",
                          color: "var(--text-secondary)", fontSize: 11, lineHeight: 1,
                        }}
                      >+</button>
                    </div>
                  </div>
                </div>,
                document.body
              )}
            </div>
            <div style={{ width: 1, height: 18, background: "var(--border-medium)", flexShrink: 0 }} />
            <div ref={trendSettingsGroupRef} style={{ display: "flex", gap: 3, alignItems: "center", flexShrink: 0 }} data-trend-settings-panel>
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
                color: "var(--text-muted)", marginRight: 2, whiteSpace: "nowrap",
              }}>
                Trend Lines
              </span>
              {([
                ["W",  showWeeklyTrend, setShowWeeklyTrend],
                ["D",  showDailyTrend,  setShowDailyTrend],
                ["4H", show4HTrend,     setShow4HTrend],
                ["1H", show1HTrend,     setShow1HTrend],
                ["15M", show15MTrend,   setShow15MTrend],
                ["5M", show5MTrend,     setShow5MTrend],
                ["1M", show1MTrend,     setShow1MTrend],
              ] as const).map(([label, active, setter]) => (
                <button
                  key={label}
                  onClick={() => setter(v => !v)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTrendSettingsPos({ top: rect.bottom + 6, left: rect.left });
                    setShowTrendSettings(v => !v);
                  }}
                  title="Click to toggle, right-click for settings"
                  style={{
                    fontSize: 9, fontWeight: 700, padding: "4px 5px",
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    background: active ? "rgba(59,130,246,0.16)" : "var(--bg-panel-alt)",
                    border:     active ? "1px solid #3b82f6" : "1px solid var(--border-medium)",
                    color:      active ? "#3b82f6" : "var(--text-secondary)",
                    borderRadius: 8, cursor: "pointer",
                  }}>{label}</button>
              ))}
              {showTrendSettings && trendSettingsPos && createPortal(
                <div ref={trendSettingsPopoverRef} style={{
                  position: "fixed", top: trendSettingsPos.top, left: trendSettingsPos.left, zIndex: 1000,
                  background: "var(--bg-panel)", border: "1px solid var(--border-medium)",
                  borderRadius: 10, padding: "10px 12px", minWidth: 190,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
                }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase",
                    letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 8 }}>
                    Trendlines per timeframe
                  </div>
                  {([
                    ["W",   "Weekly"] as const,
                    ["D",   "Daily"]  as const,
                    ["H4",  "4H"]     as const,
                    ["H1",  "1H"]     as const,
                    ["M15", "15M"]    as const,
                    ["M5",  "5M"]     as const,
                    ["M1",  "1M"]     as const,
                  ]).map(([key, label]) => (
                    <div key={key} style={{ padding: "4px 0", borderBottom: "1px solid var(--border-medium)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button
                            onClick={() => setTrendCounts(c => ({ ...c, [key]: Math.max(0, c[key] - 1) }))}
                            style={{
                              width: 18, height: 18, borderRadius: 4, cursor: "pointer",
                              background: "var(--bg-panel-alt)", border: "1px solid var(--border-medium)",
                              color: "var(--text-secondary)", fontSize: 11, lineHeight: 1,
                            }}
                          >−</button>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", width: 14, textAlign: "center" }}>
                            {trendCounts[key]}
                          </span>
                          <button
                            onClick={() => setTrendCounts(c => ({ ...c, [key]: Math.min(10, c[key] + 1) }))}
                            style={{
                              width: 18, height: 18, borderRadius: 4, cursor: "pointer",
                              background: "var(--bg-panel-alt)", border: "1px solid var(--border-medium)",
                              color: "var(--text-secondary)", fontSize: 11, lineHeight: 1,
                            }}
                          >+</button>
                          <button
                            onClick={() => setOpenTrendColorKey(k => k === key ? null : key)}
                            title="Change color"
                            style={{
                              width: 14, height: 14, borderRadius: "50%", cursor: "pointer", padding: 0, marginLeft: 2,
                              background: trendColors[key],
                              border: openTrendColorKey === key ? "2px solid var(--text-primary)" : "1px solid var(--border-medium)",
                            }}
                          />
                        </div>
                      </div>
                      {openTrendColorKey === key && (
                        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                          {TRENDLINE_COLOR_PRESETS.map(c => (
                            <button
                              key={c}
                              onClick={() => { setTrendColors(prev => ({ ...prev, [key]: c })); setOpenTrendColorKey(null); }}
                              title={c}
                              style={{
                                width: 14, height: 14, borderRadius: "50%", cursor: "pointer",
                                background: c, padding: 0,
                                border: trendColors[key] === c ? "2px solid var(--text-primary)" : "1px solid var(--border-medium)",
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>,
                document.body
              )}
            </div>
          </div>
        </div>
        )}
        <div style={{ width: 1, height: 18, background: "var(--border-medium)", flexShrink: 0, margin: "0 6px" }} />
        {/* Reversal through Candles — all synced while Quad View is locked;
            greyed out + non-interactive on non-primary tiles receiving that
            sync (see quadDisabled / quadSyncEvents). */}
        <div style={{
          display: "flex", gap: 5, alignItems: "center", flexShrink: 0,
          opacity: quadDisabled ? 0.35 : 1, pointerEvents: quadDisabled ? "none" : "auto",
        }}>
          {/* Reversal Candles toggle — right-click for settings */}
          <button
            ref={reversalBtnRef}
            onClick={() => toggleInd("reversal")}
            onContextMenu={(e) => {
              e.preventDefault();
              const rect = reversalBtnRef.current?.getBoundingClientRect();
              if (rect) setReversalSettingsPos({ top: rect.bottom + 6, left: rect.left });
              setShowReversalSettings(v => !v);
            }}
            title="Click to toggle, right-click for settings"
            style={{
              fontSize: 9, fontWeight: 700, padding: "4px 5px",
              textTransform: "uppercase", letterSpacing: "0.08em",
              background: activeInds.has("reversal") ? "var(--accent-dim)"    : "var(--bg-panel-alt)",
              border:     activeInds.has("reversal") ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
              color:      activeInds.has("reversal") ? "var(--accent-text)"   : "var(--text-secondary)",
              borderRadius: 8, cursor: "pointer",
            }}
          >
            Reversal
          </button>
          {showReversalSettings && reversalSettingsPos && createPortal(
            <div ref={reversalSettingsPopoverRef} style={{
              position: "fixed", top: reversalSettingsPos.top, left: reversalSettingsPos.left, zIndex: 1000,
              background: "var(--bg-panel)", border: "1px solid var(--border-medium)",
              borderRadius: 10, padding: "10px 12px", width: 280,
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 6 }}>
                Filter By:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                <button
                  onClick={() => setReversalZoneFilter(v => !v)}
                  title="Bearish reversals inside/on a supply zone, bullish inside/on a demand zone — no cross-bias"
                  style={{
                    fontSize: 9, fontWeight: 700, padding: "4px 6px", flex: "1 1 30%",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    background: reversalZoneFilter ? "var(--accent-dim)" : "var(--bg-panel-alt)",
                    border:     reversalZoneFilter ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
                    color:      reversalZoneFilter ? "var(--accent-text)" : "var(--text-secondary)",
                    borderRadius: 6, cursor: "pointer",
                  }}
                >
                  Zone
                </button>
                <button
                  onClick={() => setReversalEightAmBoxFilter(v => !v)}
                  title="Either bias, inside/on an active ORB box"
                  style={{
                    fontSize: 9, fontWeight: 700, padding: "4px 6px", flex: "1 1 30%",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    background: reversalEightAmBoxFilter ? "var(--accent-dim)" : "var(--bg-panel-alt)",
                    border:     reversalEightAmBoxFilter ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
                    color:      reversalEightAmBoxFilter ? "var(--accent-text)" : "var(--text-secondary)",
                    borderRadius: 6, cursor: "pointer",
                  }}
                >
                  ORB
                </button>
                <button
                  onClick={() => setReversalTrendlineFilter(v => !v)}
                  style={{
                    fontSize: 9, fontWeight: 700, padding: "4px 6px", flex: "1 1 30%",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    background: reversalTrendlineFilter ? "var(--accent-dim)" : "var(--bg-panel-alt)",
                    border:     reversalTrendlineFilter ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
                    color:      reversalTrendlineFilter ? "var(--accent-text)" : "var(--text-secondary)",
                    borderRadius: 6, cursor: "pointer",
                  }}
                >
                  Trend Line
                </button>
                <button
                  onClick={() => setReversalGannFilter(v => !v)}
                  title="Either bias, on any of a drawn Gann Fan's 9 ratio lines"
                  style={{
                    fontSize: 9, fontWeight: 700, padding: "4px 6px", flex: "1 1 30%",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    background: reversalGannFilter ? "var(--accent-dim)" : "var(--bg-panel-alt)",
                    border:     reversalGannFilter ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
                    color:      reversalGannFilter ? "var(--accent-text)" : "var(--text-secondary)",
                    borderRadius: 6, cursor: "pointer",
                  }}
                >
                  Gann Fan
                </button>
                <button
                  onClick={() => setReversalFibFilter(v => !v)}
                  title="Either bias, on any level of a drawn Fibonacci Retracement or Extension"
                  style={{
                    fontSize: 9, fontWeight: 700, padding: "4px 6px", flex: "1 1 30%",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    background: reversalFibFilter ? "var(--accent-dim)" : "var(--bg-panel-alt)",
                    border:     reversalFibFilter ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
                    color:      reversalFibFilter ? "var(--accent-text)" : "var(--text-secondary)",
                    borderRadius: 6, cursor: "pointer",
                  }}
                >
                  Fibonacci
                </button>
              </div>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0 0 10px",
              }}>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Show last</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    onClick={() => setReversalMaxCount(n => Math.max(1, (n ?? 10) - 5))}
                    disabled={reversalMaxCount === null}
                    style={{
                      width: 18, height: 18, borderRadius: 4, cursor: reversalMaxCount === null ? "not-allowed" : "pointer",
                      background: "var(--bg-panel-alt)", border: "1px solid var(--border-medium)",
                      color: "var(--text-secondary)", fontSize: 11, lineHeight: 1,
                      opacity: reversalMaxCount === null ? 0.4 : 1,
                    }}
                  >−</button>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", width: 24, textAlign: "center" }}>
                    {reversalMaxCount ?? "All"}
                  </span>
                  <button
                    onClick={() => setReversalMaxCount(n => (n ?? 10) + 5)}
                    disabled={reversalMaxCount === null}
                    style={{
                      width: 18, height: 18, borderRadius: 4, cursor: reversalMaxCount === null ? "not-allowed" : "pointer",
                      background: "var(--bg-panel-alt)", border: "1px solid var(--border-medium)",
                      color: "var(--text-secondary)", fontSize: 11, lineHeight: 1,
                      opacity: reversalMaxCount === null ? 0.4 : 1,
                    }}
                  >+</button>
                  <button
                    onClick={() => setReversalMaxCount(v => v === null ? 10 : null)}
                    title={reversalMaxCount === null ? "Showing every qualifying reversal candle" : `Showing only the last ${reversalMaxCount}`}
                    style={{
                      fontSize: 9, fontWeight: 700, padding: "3px 6px", marginLeft: 2,
                      textTransform: "uppercase", letterSpacing: "0.06em",
                      background: reversalMaxCount === null ? "var(--accent-dim)" : "var(--bg-panel-alt)",
                      border:     reversalMaxCount === null ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
                      color:      reversalMaxCount === null ? "var(--accent-text)" : "var(--text-secondary)",
                      borderRadius: 6, cursor: "pointer",
                    }}
                  >
                    All
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 6 }}>
                Candle Type:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {REVERSAL_PATTERN_GROUPS.map(({ label }) => {
                  const on = reversalPatternGroups.has(label);
                  return (
                    <button
                      key={label}
                      onClick={() => setReversalPatternGroups(prev => {
                        const next = new Set(prev);
                        if (next.has(label)) next.delete(label); else next.add(label);
                        return next;
                      })}
                      style={{
                        fontSize: 9, fontWeight: 600, padding: "3px 6px",
                        background: on ? "rgba(234,179,8,0.16)" : "var(--bg-panel-alt)",
                        border:     on ? "1px solid #eab308" : "1px solid var(--border-medium)",
                        color:      on ? "#eab308" : "var(--text-secondary)",
                        borderRadius: 6, cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div style={{ height: 1, background: "var(--border-medium)", margin: "10px 0 8px" }} />
              <button
                onClick={() => setShowReversalLabels(v => !v)}
                title="Arrows always stay — this only hides the pattern-name text beside them"
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  background: "none", border: "none", padding: "4px 2px", cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                  border: "2px solid #eab308", background: showReversalLabels ? "#eab308" : "transparent",
                }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: showReversalLabels ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  Show Labels
                </span>
              </button>
            </div>,
            document.body
          )}
          {/* ORB toggle — standalone button, not part of the Indicators dropdown.
              Click toggles the feature on/off; right-click opens the settings
              popover to pick which session opens (Tokyo/London/NY/9:30) draw. */}
          <button
            ref={orbBtnRef}
            onClick={() => toggleInd("session8am")}
            onContextMenu={(e) => {
              e.preventDefault();
              const rect = orbBtnRef.current?.getBoundingClientRect();
              if (rect) setOrbSettingsPos({ top: rect.bottom + 6, left: rect.left });
              setShowOrbSettings(v => !v);
            }}
            title="Click to toggle, right-click for settings"
            style={{
              fontSize: 9, fontWeight: 700, padding: "4px 5px",
              textTransform: "uppercase", letterSpacing: "0.08em",
              background: activeInds.has("session8am") ? "var(--accent-dim)"    : "var(--bg-panel-alt)",
              border:     activeInds.has("session8am") ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
              color:      activeInds.has("session8am") ? "var(--accent-text)"   : "var(--text-secondary)",
              borderRadius: 8, cursor: "pointer",
            }}
          >
            ORB
          </button>
          {showOrbSettings && orbSettingsPos && createPortal(
            <div ref={orbSettingsPopoverRef} style={{
              position: "fixed", top: orbSettingsPos.top, left: orbSettingsPos.left, zIndex: 1000,
              background: "var(--bg-panel)", border: "1px solid var(--border-medium)",
              borderRadius: 10, padding: "10px 12px", width: 170,
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em",
                color: "var(--text-muted)", marginBottom: 8 }}>
                ORB Sessions
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {([
                  ["New York (8:00)",  showOrbNY,     setShowOrbNY,     "#22c55e"],
                  ["Tokyo (19:00)",    showOrbTokyo,  setShowOrbTokyo,  "#a855f7"],
                  ["London (3:00)",    showOrbLondon, setShowOrbLondon, "#3b82f6"],
                  ["9:30",             showOrb930,    setShowOrb930,    "#eab308"],
                ] as const).map(([label, on, setter, color]) => (
                  <button key={label} onClick={() => setter(v => !v)} style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    background: "none", border: "none", padding: "4px 2px", cursor: "pointer", textAlign: "left",
                  }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                      border: `2px solid ${color}`, background: on ? color : "transparent",
                    }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: on ? "var(--text-primary)" : "var(--text-secondary)" }}>
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </div>,
            document.body
          )}
          {/* Sessions button — right-click for settings */}
          <div style={{ position: "relative", display: "flex", gap: 3, alignItems: "center" }} data-sessions-panel>
            <button
              ref={sessionSettingsBtnRef}
              onClick={() => setShowSessions(v => !v)}
              onContextMenu={(e) => {
                e.preventDefault();
                const rect = sessionSettingsBtnRef.current?.getBoundingClientRect();
                if (rect) setSessionSettingsPos({ top: rect.bottom + 6, left: rect.left });
                setShowSessionSettings(v => !v);
              }}
              title="Click to toggle, right-click for settings"
              style={{
                fontSize: 9, fontWeight: 700, padding: "4px 5px",
                textTransform: "uppercase", letterSpacing: "0.08em",
                background: showSessions ? "var(--accent-dim)"    : "var(--bg-panel-alt)",
                border:     showSessions ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
                color:      showSessions ? "var(--accent-text)"   : "var(--text-secondary)",
                borderRadius: 8, cursor: "pointer",
              }}
            >
              Sessions
            </button>
            {showSessionSettings && sessionSettingsPos && createPortal(
              <div ref={sessionSettingsPopoverRef} style={{
                position: "fixed", top: sessionSettingsPos.top, left: sessionSettingsPos.left, zIndex: 1000,
                background: "var(--bg-panel)", border: "1px solid var(--border-medium)",
                borderRadius: 10, padding: "10px 12px", minWidth: 190,
                boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
              }}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase",
                  letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 8 }}>
                  Sessions
                </div>
                {SESSION_DEFS.map(def => (
                  <div key={def.key} onClick={() => setSessionVisibility(v => ({ ...v, [def.key]: !v[def.key] }))} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "5px 0", cursor: "pointer",
                  }}>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 18, height: 2, background: def.stroke, borderRadius: 1, flexShrink: 0 }} />
                      {def.label}
                    </span>
                    <span style={{
                      width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                      border: `2px solid ${def.stroke}`,
                      background: sessionVisibility[def.key] ? def.stroke : "transparent",
                    }} />
                  </div>
                ))}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 0 0", marginTop: 4, borderTop: "1px solid var(--border-subtle)",
                }}>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Back sessions</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      onClick={() => setSessionBackCount(n => Math.max(0, n - 1))}
                      style={{
                        width: 18, height: 18, borderRadius: 4, cursor: "pointer",
                        background: "var(--bg-panel-alt)", border: "1px solid var(--border-medium)",
                        color: "var(--text-secondary)", fontSize: 11, lineHeight: 1,
                      }}
                    >−</button>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", width: 14, textAlign: "center" }}>
                      {sessionBackCount}
                    </span>
                    <button
                      onClick={() => setSessionBackCount(n => Math.min(20, n + 1))}
                      style={{
                        width: 18, height: 18, borderRadius: 4, cursor: "pointer",
                        background: "var(--bg-panel-alt)", border: "1px solid var(--border-medium)",
                        color: "var(--text-secondary)", fontSize: 11, lineHeight: 1,
                      }}
                    >+</button>
                  </div>
                </div>
              </div>,
              document.body
            )}
          </div>
          {/* Pivots toggle — right-click for settings, same pattern as Reversal */}
          <button
            ref={pivotBtnRef}
            onClick={() => toggleInd("pivots")}
            onContextMenu={(e) => {
              e.preventDefault();
              const rect = pivotBtnRef.current?.getBoundingClientRect();
              if (rect) setPivotSettingsPos({ top: rect.bottom + 6, left: rect.left });
              setShowPivotSettings(v => !v);
            }}
            title="Click to toggle, right-click for settings"
            style={{
              fontSize: 9, fontWeight: 700, padding: "4px 5px",
              textTransform: "uppercase", letterSpacing: "0.08em",
              background: activeInds.has("pivots") ? "var(--accent-dim)"    : "var(--bg-panel-alt)",
              border:     activeInds.has("pivots") ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
              color:      activeInds.has("pivots") ? "var(--accent-text)"   : "var(--text-secondary)",
              borderRadius: 8, cursor: "pointer",
            }}
          >
            Pivots
          </button>
          {showPivotSettings && pivotSettingsPos && createPortal(
            <div ref={pivotSettingsPopoverRef} style={{
              position: "fixed", top: pivotSettingsPos.top, left: pivotSettingsPos.left, zIndex: 1000,
              background: "var(--bg-panel)", border: "1px solid var(--border-medium)",
              borderRadius: 10, padding: "10px 12px", width: 160,
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em",
                color: "var(--text-muted)", marginBottom: 8 }}>
                Pivot Timeframes
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {([
                  ["Weekly", showPivotWeekly, setShowPivotWeekly],
                  ["Daily",  showPivotDaily,  setShowPivotDaily],
                  ["4H",     showPivot4H,     setShowPivot4H],
                  ["1H",     showPivot1H,     setShowPivot1H],
                ] as const).map(([label, on, setter]) => (
                  <button key={label} onClick={() => setter(v => !v)} style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    background: "none", border: "none", padding: "4px 2px", cursor: "pointer", textAlign: "left",
                  }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                      border: `2px solid ${PIVOT_COLOR}`, background: on ? PIVOT_COLOR : "transparent",
                    }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: on ? "var(--text-primary)" : "var(--text-secondary)" }}>
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </div>,
            document.body
          )}
          {/* News toggle — right-click for settings, same pattern as Reversal/Pivots */}
          <button
            ref={newsBtnRef}
            onClick={() => setShowNews(v => !v)}
            onContextMenu={(e) => {
              e.preventDefault();
              const rect = newsBtnRef.current?.getBoundingClientRect();
              if (rect) setNewsSettingsPos({ top: rect.bottom + 6, left: rect.left });
              setShowNewsSettings(v => !v);
            }}
            title="Click to toggle, right-click for settings"
            style={{
              fontSize: 9, fontWeight: 700, padding: "4px 5px",
              textTransform: "uppercase", letterSpacing: "0.08em",
              background: showNews ? "var(--accent-dim)"    : "var(--bg-panel-alt)",
              border:     showNews ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
              color:      showNews ? "var(--accent-text)"   : "var(--text-secondary)",
              borderRadius: 8, cursor: "pointer",
            }}
          >
            News
          </button>
          {showNewsSettings && newsSettingsPos && createPortal(
            <div ref={newsSettingsPopoverRef} style={{
              position: "fixed", top: newsSettingsPos.top, left: newsSettingsPos.left, zIndex: 1000,
              background: "var(--bg-panel)", border: "1px solid var(--border-medium)",
              borderRadius: 10, padding: "10px 12px", width: 340,
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em",
                  color: "var(--text-muted)" }}>
                  News Event Types
                </div>
                <button
                  onClick={() => {
                    const allOn = NEWS_CATEGORY_DEFS.every(d => newsCategoryVisibility[d.key]);
                    const next = {} as Record<NewsCategoryKey, boolean>;
                    for (const d of NEWS_CATEGORY_DEFS) next[d.key] = !allOn;
                    setNewsCategoryVisibility(next);
                  }}
                  style={{
                    fontSize: 9, fontWeight: 700, padding: "2px 8px",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    background: NEWS_CATEGORY_DEFS.every(d => newsCategoryVisibility[d.key]) ? "var(--accent-dim)" : "var(--bg-panel-alt)",
                    border:     NEWS_CATEGORY_DEFS.every(d => newsCategoryVisibility[d.key]) ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
                    color:      NEWS_CATEGORY_DEFS.every(d => newsCategoryVisibility[d.key]) ? "var(--accent-text)" : "var(--text-secondary)",
                    borderRadius: 6, cursor: "pointer",
                  }}
                >
                  All
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(["Monetary Policy", "Inflation / Growth / Labor", "Bond Market"] as const satisfies readonly NewsCategoryGroup[]).map(group => (
                  <div key={group}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em",
                      color: GROUP_COLORS[group], marginBottom: 6, paddingBottom: 4,
                      borderBottom: `1px solid ${GROUP_COLORS[group]}` }}>
                      {group}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 10px" }}>
                      {NEWS_CATEGORY_DEFS.filter(d => d.group === group).map(def => {
                        const on = newsCategoryVisibility[def.key];
                        // CPI and Jobs Reports both release under multiple
                        // countries (a EUR/USD chart's own USD releases plus
                        // whatever the live feed has for EUR that week) — FOMC
                        // is USD-only, so it never needs this. Only worth
                        // showing when the charted pair actually has two
                        // currencies to choose between (a real forex pair, not
                        // an index/stock/ETF, which only ever has USD anyway).
                        const showCurrencyChips = (def.key === "cpi" || def.key === "jobs") && pairCurrencies.length === 2;
                        return (
                          <div key={def.key}>
                            <button
                              onClick={() => setNewsCategoryVisibility(v => ({ ...v, [def.key]: !v[def.key] }))}
                              style={{
                                display: "flex", alignItems: "center", gap: 8, width: "100%",
                                background: "none", border: "none", padding: "4px 2px", cursor: "pointer", textAlign: "left",
                              }}
                            >
                              <span style={{
                                width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                                border: `2px solid ${def.color}`, background: on ? def.color : "transparent",
                              }} />
                              <span style={{ fontSize: 11, fontWeight: 600, color: on ? "var(--text-primary)" : "var(--text-secondary)" }}>
                                {def.label}
                              </span>
                            </button>
                            {showCurrencyChips && (
                              <div style={{ display: "flex", gap: 4, marginLeft: 22, marginTop: 2, marginBottom: 2 }}>
                                {pairCurrencies.map(cur => {
                                  const curOn = isNewsCurrencyVisible(def.key, cur);
                                  return (
                                    <button
                                      key={cur}
                                      onClick={() => setNewsCurrencyVisibility(v => ({ ...v, [`${def.key}:${cur}`]: !curOn }))}
                                      style={{
                                        fontSize: 9, fontWeight: 700, padding: "2px 6px",
                                        textTransform: "uppercase", letterSpacing: "0.04em",
                                        background: curOn ? "var(--accent-dim)" : "var(--bg-panel-alt)",
                                        border:     curOn ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
                                        color:      curOn ? "var(--accent-text)" : "var(--text-muted)",
                                        borderRadius: 6, cursor: "pointer",
                                      }}
                                    >
                                      {cur}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-subtle)" }}>
                <HoverTooltip tip={`Only shows events relevant to ${pair} — its two currencies if it's a forex pair, USD only otherwise (indices, stocks, ETFs, commodities, crypto). FOMC, CPI, Jobs Reports, Retail Sales, Initial Jobless Claims, PCE/Core PCE, GDP, JOLTS, and PPI/Core PPI all have real actual/previous backfilled from FRED for their full static history (no forecast/surprise on those older entries — FRED has no consensus data; each still gets a real read — hold/cut/hike, strong/weak, accelerating/slowing, warming/cooling — from actual vs previous alone) until a live release is captured, which then takes over. Jobless Claims is weekly (every Thursday, shifted a day around New Year's/July 4th/Juneteenth/Veterans Day/Christmas/Thanksgiving) rather than monthly like the others. GDP's Advance/Second/Third estimates each show that quarter's current published growth rate rather than the exact as-first-published vintage number, and a stretch of early-2026 dates is left out where the shutdown made which quarter a catch-up release covered too uncertain to plot confidently. JOLTS and PPI instead use exact per-release vintage data, so they're precise about which month and value each release actually published. 10Y/30Y Auctions cover TreasuryDirect's full history back to 1979, SEP/Dot Plot covers all 14 quarterly releases 2023–2026. Fed Chair Press Conference and FOMC Minutes reuse that same meeting's real decision. ISM Manufacturing/Services plot on their real release schedule (2025–2026, computed from ISM's own publication rule) but can't show historical index values — ISM's data is commercially licensed and FRED's old free mirror is discontinued — so older ISM markers show "unavailable" until a live release is captured. Non-USD releases everywhere are limited to the live feed's current calendar week. Only events within the currently loaded candle range are shown. Hover a marker for actual/forecast/surprise where available.`}>
                  <Info size={13} style={{ color: "var(--text-muted)", cursor: "help" }} />
                </HoverTooltip>
              </div>
            </div>,
            document.body
          )}
          {newsHover && (
            <NewsMarkerTooltip x={newsHover.x} y={newsHover.y} label={newsHover.label} color={newsHover.color} detail={newsHover.detail} />
          )}
          {/* Indicators button + dropdown — portaled + fixed-positioned (like the
              Reversal settings popover) so it floats over everything instead of
              being clipped by the toolbar's small scroll container. */}
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <button
              ref={indBtnRef}
              onClick={() => {
                const rect = indBtnRef.current?.getBoundingClientRect();
                if (rect) setIndPanelPos({ top: rect.bottom + 6, left: rect.left });
                setShowIndPanel(v => !v);
              }}
              style={{
                fontSize: 9, fontWeight: 700, padding: "4px 5px",
                textTransform: "uppercase", letterSpacing: "0.08em",
                background: anyActive ? "var(--accent-dim)"    : "var(--bg-panel-alt)",
                border:     anyActive ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
                color:      anyActive ? "var(--accent-text)"   : "var(--text-secondary)",
                borderRadius: 8, cursor: "pointer",
              }}
            >
              Indicators
            </button>
            {showIndPanel && indPanelPos && createPortal(
              <div ref={indPanelPopoverRef} style={{
                position: "fixed", top: indPanelPos.top, left: indPanelPos.left, zIndex: 1000,
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
              </div>,
              document.body
            )}
          </div>
          {/* View mode toggle — right-click for candle color settings */}
          <button
            ref={viewModeBtnRef}
            onClick={() => setViewMode(v => v === "candles" ? "line" : "candles")}
            onContextMenu={(e) => {
              e.preventDefault();
              const rect = viewModeBtnRef.current?.getBoundingClientRect();
              if (rect) setCandleSettingsPos({ top: rect.bottom + 6, left: rect.left });
              setShowCandleSettings(v => !v);
            }}
            title="Click to toggle candles/line, right-click for settings"
            style={{
              fontSize: 9, fontWeight: 700, padding: "4px 5px",
              textTransform: "uppercase", letterSpacing: "0.08em",
              background: "var(--bg-panel-alt)", border: "1px solid var(--border-medium)",
              borderRadius: 8, color: "var(--text-secondary)", cursor: "pointer",
            }}
          >{viewMode}</button>
          {showCandleSettings && candleSettingsPos && createPortal(
            <div ref={candleSettingsPopoverRef} style={{
              position: "fixed", top: candleSettingsPos.top, left: candleSettingsPos.left, zIndex: 1000,
              background: "var(--bg-panel)", border: "1px solid var(--border-medium)",
              borderRadius: 10, padding: "10px 12px", width: 200,
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em",
                color: "var(--text-muted)", marginBottom: 8 }}>
                Candle Colors
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {([
                  ["default",     "Default (Blue / Purple)"],
                  ["tradingview", "TradingView (Green / Red)"],
                ] as const).map(([key, label]) => {
                  const on = candleColorScheme === key;
                  const { up, down } = CANDLE_COLOR_SCHEMES[key];
                  return (
                    <button key={key} onClick={() => setCandleColorScheme(key)} style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      background: on ? "var(--accent-dim)" : "none",
                      border: on ? "1px solid var(--accent-border)" : "1px solid transparent",
                      borderRadius: 6, padding: "4px 6px", cursor: "pointer", textAlign: "left",
                    }}>
                      <span style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                        <span style={{ width: 8, height: 14, borderRadius: 1, background: up }} />
                        <span style={{ width: 8, height: 14, borderRadius: 1, background: down }} />
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: on ? "var(--text-primary)" : "var(--text-secondary)" }}>
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body
          )}
          {showSnapshotPicker && snapshotPos && createPortal(
            <div ref={snapshotPopoverRef} style={{
              position: "fixed", top: snapshotPos.top, left: snapshotPos.left, zIndex: 1000,
              background: "var(--bg-panel)", border: "1px solid var(--border-medium)",
              borderRadius: 10, padding: "10px 12px", width: 260,
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            }}>
              {snapshotDataUrl ? (
                <img src={snapshotDataUrl} alt="Chart snapshot preview" style={{
                  width: "100%", borderRadius: 6, marginBottom: 10,
                  border: "1px solid var(--border-subtle)", display: "block",
                }} />
              ) : (
                <div style={{
                  height: 100, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, color: "var(--text-muted)", marginBottom: 10,
                  background: "var(--bg-panel-alt)", borderRadius: 6,
                }}>
                  Capturing…
                </div>
              )}

              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 6 }}>
                Trade:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 140, overflowY: "auto", marginBottom: 10 }}>
                {snapshotTrades.length === 0 ? (
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>No trades found</span>
                ) : snapshotTrades.map(t => {
                  const active = t.id === snapshotTradeId;
                  const when = (t.closedAt ?? t.openedAt).slice(0, 16).replace("T", " ");
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSnapshotTradeId(t.id)}
                      style={{
                        fontSize: 11, fontWeight: 600, padding: "5px 8px", textAlign: "left",
                        background: active ? "var(--accent-dim)" : "var(--bg-panel-alt)",
                        border:     active ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
                        color:      active ? "var(--accent-text)" : "var(--text-secondary)",
                        borderRadius: 6, cursor: "pointer",
                      }}
                    >
                      {t.instrument} {t.side.toUpperCase()} — {when}
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 6 }}>
                Slot:
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {(["entry", "exit", "additional"] as const).map(kind => {
                  const active = kind === snapshotKind;
                  return (
                    <button
                      key={kind}
                      onClick={() => setSnapshotKind(kind)}
                      style={{
                        fontSize: 9, fontWeight: 700, padding: "4px 6px", flex: 1,
                        textTransform: "uppercase", letterSpacing: "0.06em",
                        background: active ? "var(--accent-dim)" : "var(--bg-panel-alt)",
                        border:     active ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
                        color:      active ? "var(--accent-text)" : "var(--text-secondary)",
                        borderRadius: 6, cursor: "pointer",
                      }}
                    >
                      {kind}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleSaveSnapshot}
                disabled={!snapshotDataUrl || !snapshotTradeId || snapshotSaving}
                style={{
                  fontSize: 10, fontWeight: 700, padding: "6px 8px", width: "100%",
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  background: snapshotSaved ? "rgba(34,197,94,0.16)" : "var(--accent-dim)",
                  border:     snapshotSaved ? "1px solid #22c55e" : "1px solid var(--accent-border)",
                  color:      snapshotSaved ? "#22c55e" : "var(--accent-text)",
                  borderRadius: 6,
                  cursor: (!snapshotDataUrl || !snapshotTradeId || snapshotSaving) ? "not-allowed" : "pointer",
                  opacity: (!snapshotDataUrl || !snapshotTradeId) && !snapshotSaved ? 0.5 : 1,
                }}
              >
                {snapshotSaved ? "Saved" : snapshotSaving ? "Saving…" : "Save to Trade"}
              </button>
            </div>,
            document.body
          )}
        </div>
        {rightOfChartCollapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: "auto", marginRight: 30, paddingLeft: 10, borderLeft: "1px solid var(--border-medium)" }}>
            <span style={{ fontSize: 20, lineHeight: 1, fontWeight: 800, color: "#ffffff", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
              {pair}
            </span>
            {latestRow && (() => {
              const display = livePrice ?? latestRow.close;
              const isUp = display >= latestRow.open;
              const pct = (latestRow.close - latestRow.open) / latestRow.open * 100;
              return (
                <>
                  <span style={{ fontSize: 18, lineHeight: 1, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: isUp ? "#60a5fa" : "#a78bfa", whiteSpace: "nowrap" }}>
                    {formatPrice(display, decimalsForPair(pair, display))}
                  </span>
                  <span style={{ fontSize: 10, lineHeight: 1, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: pct >= 0 ? "#60a5fa" : "#a78bfa", whiteSpace: "nowrap" }}>
                    {pct >= 0 ? "+" : ""}{pct.toFixed(3)}%
                  </span>
                </>
              );
            })()}
          </div>
        )}
        {/* Snapshot + master collapse/expand — stay in the toolbar row (so
            they're never over the candles/data), pinned to its right edge,
            which sits directly above the chart's price scale below. */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, marginLeft: rightOfChartCollapsed ? 0 : "auto" }}>
          <div style={{ width: 1, height: 18, background: "var(--border-medium)", flexShrink: 0 }} />
          {/* Quad View lock — this tile's toolbar (timeframe, overlays, view
              mode, candle colors) drives the other 3 while locked; only
              shown on the primary tile, and only in Quad View. */}
          {compact && showSnapshotAndExpand && (
            <button
              onClick={onToggleQuadLocked}
              title={quadLocked ? "Unlock — let each tile's toolbar control itself again" : "Lock — this toolbar controls all 4 charts"}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 22, height: 22, padding: 0, flexShrink: 0,
                background: quadLocked ? "var(--accent-dim)" : "var(--bg-panel-alt)",
                border:     quadLocked ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
                borderRadius: 8, color: quadLocked ? "var(--accent-text)" : "var(--text-secondary)", cursor: "pointer",
              }}
            >
              {quadLocked ? <Lock size={12} /> : <Unlock size={12} />}
            </button>
          )}
          {showSnapshotAndExpand && snapshotButton}
          {/* Quad View toggle — 2x2 grid of 4 independent charts, each with
              its own instrument, timeframe, and full toolbar (this same
              component, rendered 4x with compact=true by the page). Shown
              only on the designated tile (same one as Snapshot/Expand) once
              in Quad View, rather than on all 4. */}
          {showSnapshotAndExpand && (
            <button
              ref={quadBtnRef}
              onClick={onToggleQuadView}
              title={quadView ? "Exit Quad View" : "Quad View — 4 independent charts"}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 22, height: 22, padding: 0, flexShrink: 0,
                background: quadView ? "var(--accent-dim)" : "var(--bg-panel-alt)",
                border:     quadView ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
                borderRadius: 8, color: quadView ? "var(--accent-text)" : "var(--text-secondary)", cursor: "pointer",
              }}
            >
              <LayoutGrid size={12} />
            </button>
          )}
          {/* Quad View already forces every panel around the chart hidden
              (see effectiveAisRowCollapsed etc. in the page component) and
              manages its own collapse behavior on entry, so this button —
              redundant there, and previously a source of layout bugs when
              clicked mid-Quad-View — is only shown outside Quad View. */}
          {!quadView && masterCollapseButton}
        </div>
      </div>
      <div style={{ borderRadius: compact ? 0 : 14, overflow: "hidden", position: "relative", display: "flex", ...((expandHeight || compact) ? { flex: 1, minHeight: 0 } : {}) }}>
        {/* Drawing-tool rail — TradingView puts this on the chart's left
            edge, so it does too. Hidden in Quad View tiles (compact) same as
            Snapshot/Expand/Quad above — a 2x2 grid of charts has no room for
            a full tool rail on each one. */}
        {!compact && (
          <div style={{
            width: 34, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center",
            gap: 3, padding: "8px 0", background: "var(--bg-panel)", borderRight: "1px solid var(--border-subtle)",
          }}>
            {([
              ["cursor",     "Cursor (select / deselect a drawing)",  <MousePointer2 size={14} />],
              ["trendline",  "Trend Line",                            <Minus size={14} style={{ transform: "rotate(-45deg)" }} />],
              ["ray",        "Ray (extends right)",                   <ArrowUpRight size={14} />],
              ["horizontal", "Horizontal Line",                       <Minus size={14} />],
              ["horizontalray", "Horizontal Ray",                     <ArrowRight size={14} />],
              ["rectangle",  "Rectangle",                             <Square size={14} />],
              ["fib",        "Fibonacci Retracement",                 "Fib"],
              ["fibext",     "Fibonacci Extension (3 clicks: A, B, C)", "FibX"],
              ["gann",       "Gann Fan",                              "Gann"],
              ["text",       "Text",                                  <Type size={14} />],
            ] as [DrawTool, string, React.ReactNode][]).map(([tool, label, content]) => (
              <ToolbarIconButton
                key={tool}
                label={label}
                active={activeDrawTool === tool}
                onClick={() => { cancelPendingDrawing(); setActiveDrawTool(tool); }}
              >
                {content}
              </ToolbarIconButton>
            ))}
            <div style={{ width: 20, height: 1, background: "var(--border-subtle)", margin: "4px 0" }} />
            <ToolbarIconButton
              label={magnetMode ? "Magnet: on (snapping to O/H/L/C)" : "Magnet: off (snap points to O/H/L/C)"}
              active={magnetMode}
              onClick={() => setMagnetMode(v => !v)}
            >
              <Magnet size={14} />
            </ToolbarIconButton>
            <div style={{ width: 20, height: 1, background: "var(--border-subtle)", margin: "4px 0" }} />
            <ToolbarIconButton
              label="Delete selected drawing (Del)"
              disabled={!selectedDrawingId}
              onClick={deleteSelectedDrawing}
            >
              <Trash2 size={14} />
            </ToolbarIconButton>
            <ToolbarIconButton label="Clear all drawings on this chart" onClick={clearAllDrawings}>
              <Eraser size={14} />
            </ToolbarIconButton>
            {/* Layers sits alone at the bottom of the rail, pinned there via
                marginTop: auto (the column is a flex container) rather than
                just being last in source order, so it stays put regardless
                of how many tool buttons are added above it later. */}
            <ToolbarIconButton
              rootRef={layersBtnRef}
              label="Layers — show/hide drawings"
              active={showLayersPanel}
              onClick={() => {
                const chartRect = containerRef.current?.getBoundingClientRect();
                if (chartRect) {
                  // Anchored to the chart's own bottom-left corner via a
                  // `bottom` offset (not `top` with an estimated height) so
                  // the panel's bottom edge stays pinned there and it grows
                  // upward as the drawing list gets longer, instead of
                  // guessing a height up front and clamping against it.
                  const MARGIN = 8;
                  setLayersPanelPos({ bottom: window.innerHeight - chartRect.bottom + MARGIN, left: chartRect.left + MARGIN });
                }
                setShowLayersPanel(v => !v);
              }}
              style={{ marginTop: "auto" }}
            >
              <Layers size={14} />
            </ToolbarIconButton>
          </div>
        )}
        {textPrompt && createPortal(
          <div style={{
            position: "fixed", top: textPrompt.y, left: textPrompt.x, zIndex: 1000,
            background: "var(--bg-panel)", border: "1px solid var(--accent-border)", borderRadius: 6, padding: 4,
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          }}>
            <input
              autoFocus
              placeholder="Text…"
              onKeyDown={(e) => {
                if (e.key === "Escape") { cancelPendingDrawing(); return; }
                if (e.key !== "Enter") return;
                const text = e.currentTarget.value.trim();
                if (text) persistDrawings([...drawingsRef.current, { id: crypto.randomUUID(), kind: "text", p1: textPrompt.point, text, color: "#eab308" }]);
                cancelPendingDrawing();
              }}
              onBlur={() => cancelPendingDrawing()}
              style={{
                fontSize: 11, padding: "4px 6px", width: 140, boxSizing: "border-box",
                background: "var(--bg-panel-alt)", border: "1px solid var(--border-medium)",
                color: "var(--text-primary)", borderRadius: 4, outline: "none",
              }}
            />
          </div>,
          document.body
        )}
        {showLayersPanel && layersPanelPos && createPortal(
          <div ref={layersPopoverRef} style={{
            position: "fixed", bottom: layersPanelPos.bottom, left: layersPanelPos.left, zIndex: 1000,
            background: "var(--bg-panel)", border: "1px solid var(--border-medium)",
            borderRadius: 10, padding: "8px 0", width: 220, maxHeight: "70%",
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)", display: "flex", flexDirection: "column",
          }}>
            <div style={{ padding: "4px 12px 8px", fontSize: 9, fontWeight: 800,
              textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>
              Layers
            </div>
            {drawings.length === 0 ? (
              <div style={{ padding: "4px 12px 8px", fontSize: 11, color: "var(--text-muted)" }}>
                No drawings on this chart
              </div>
            ) : (
              <div style={{ maxHeight: 260, overflowY: "auto" }}>
                {drawings.map((d, i) => {
                  const isSelected = d.id === selectedDrawingId;
                  // Numbered within its own kind (1st rectangle, 2nd
                  // rectangle, ...), not by overall position in a mixed-kind
                  // list — otherwise two rectangles with a trend line drawn
                  // between them show up as "Rectangle 1" / "Rectangle 3".
                  const sameKindIndex = drawings.slice(0, i).filter(x => x.kind === d.kind).length + 1;
                  const label = d.kind === "text" && d.text ? d.text : `${DRAWING_KIND_LABELS[d.kind]} ${sameKindIndex}`;
                  return (
                    <div
                      key={d.id}
                      onClick={() => setSelectedDrawingId(d.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer",
                        background: isSelected ? "var(--accent-dim)" : "transparent",
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                      <span style={{
                        flex: 1, minWidth: 0, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
                        overflow: "hidden", textOverflow: "ellipsis",
                        color: isSelected ? "var(--accent-text)" : "var(--text-primary)",
                        opacity: d.hidden ? 0.5 : 1,
                      }}>
                        {label}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleDrawingHidden(d.id); }}
                        title={d.hidden ? "Show" : "Hide"}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          width: 20, height: 20, padding: 0, flexShrink: 0,
                          background: "none", border: "none", cursor: "pointer",
                          color: d.hidden ? "var(--text-muted)" : "var(--text-secondary)",
                        }}
                      >
                        {d.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>,
          document.body
        )}
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
        {tfLoading && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, pointerEvents: "none" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.05em" }}>Loading…</span>
          </div>
        )}
        {viewMode === "candles" && tfRows.length > 0 && (() => {
          const latest = tfRows[tfRows.length - 1];
          const bar = hoverBar ?? { open: latest.open, high: latest.high, low: latest.low, close: latest.close };
          const dec = decimalsForPair(pairRef.current, bar.close);
          const up = bar.close >= bar.open;
          const { up: upColor, down: downColor } = CANDLE_COLOR_SCHEMES[candleColorScheme];
          const color = up ? upColor : downColor;
          const chgAbs = bar.close - bar.open;
          const chgPct = bar.open !== 0 ? (chgAbs / bar.open) * 100 : 0;
          return (
            <div style={{
              position: "absolute", top: 8, left: 12, zIndex: 5, pointerEvents: "none",
              display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "3px 8px", maxWidth: "90%",
              fontSize: 10, fontWeight: 600, letterSpacing: "0.02em", color, textShadow: "0 1px 2px rgba(0,0,0,0.6)",
            }}>
              <span>O <b>{formatPrice(bar.open, dec)}</b></span>
              <span>H <b>{formatPrice(bar.high, dec)}</b></span>
              <span>L <b>{formatPrice(bar.low, dec)}</b></span>
              <span>C <b>{formatPrice(bar.close, dec)}</b></span>
              <span>{up ? "+" : ""}{formatPrice(chgAbs, dec)} ({up ? "+" : ""}{chgPct.toFixed(2)}%)</span>
            </div>
          );
        })()}
        {anyActive && (
          <div style={{
            position: "absolute", top: 24, left: 12, zIndex: 5, pointerEvents: "none",
            display: "flex", flexDirection: "column", gap: 2, maxWidth: "70%",
          }}>
            {IND_DEFS.filter(d => activeInds.has(d.key)).map(({ key, label, color }) => (
              <span key={key} style={{
                fontSize: 10, fontWeight: 600, color, letterSpacing: "0.02em",
                textShadow: "0 1px 2px rgba(0,0,0,0.6)",
              }}>
                {label}
              </span>
            ))}
          </div>
        )}
        <div ref={containerRef} style={{ height: (expandHeight || compact) ? "100%" : 480 + heightBoost, opacity: tfLoading ? 0.3 : 1 }} />
        </div>
      </div>
    </div>
  );
}

function PricePanelBodyImpl({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
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

interface MacdRow { date: string; macd: number; macdSignal: number; macdHistogram: number; }
interface MaRow { date: string; open: number; high: number; low: number; close: number; ema9: number; ema20: number; ema50: number; ema100: number; ema200: number; sma20: number; sma50: number; sma200: number; }
interface AdxRow { date: string; diPlus: number; diMinus: number; adx: number; }

const MACD_WINDOW = 20;

function buildMacdAnalysis(rows: MacdRow[]): { headline: string; bullets: string[]; description: string } {
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

function MacdPanelBodyImpl({ pair, indicatorTf, expanded }: { pair: string; indicatorTf: string; expanded?: boolean }) {
  const [liveRows, setLiveRows] = useState<MacdRow[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    setLoading(true);
    setLiveRows([]);
    getStackCandles(pair, indicatorTf)
      .then(candles => setLiveRows(candles.map(c => ({
        date: c.date, macd: c.macd, macdSignal: c.macd_signal, macdHistogram: c.macd_histogram,
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pair, indicatorTf]);

  const rows = liveRows;
  const windowSize = expanded ? 40 : MACD_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [indicatorTf, pair]);
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

  if (loading) return (
    <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>
  );

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

interface Rsi9Row { rsi9: number; stochRsiK: number; stochRsiD: number; }
function buildRsiAnalysis(rows: Rsi9Row[]): { headline: string; bullets: string[]; description: string } {
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

function RsiPanelBodyImpl({ pair, indicatorTf, expanded }: { pair: string; indicatorTf: string; expanded?: boolean }) {
  const [liveRows, setLiveRows] = useState<{ date: string; rsi9: number; stochRsiK: number; stochRsiD: number }[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    setLoading(true);
    setLiveRows([]);
    getStackCandles(pair, indicatorTf)
      .then(candles => setLiveRows(candles.map(c => ({
        date:      c.date,
        rsi9:      c.rsi9,
        stochRsiK: c.stoch_rsi_k,
        stochRsiD: c.stoch_rsi_d,
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pair, indicatorTf]);

  const rows = liveRows;
  const windowSize = expanded ? 40 : RSI_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [indicatorTf, pair]);
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

  if (loading) return (
    <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>
  );

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

interface Rsi14Row { rsi14: number; close: number; sma50: number; sma200: number; }
function buildRsi14Analysis(rows: Rsi14Row[]): { headline: string; bullets: string[]; description: string } {
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

function Rsi14PanelBodyImpl({ pair, indicatorTf, expanded }: { pair: string; indicatorTf: string; expanded?: boolean }) {
  const [liveRows, setLiveRows] = useState<{ date: string; rsi14: number; close: number; sma50: number; sma200: number }[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    setLoading(true);
    setLiveRows([]);
    getStackCandles(pair, indicatorTf)
      .then(candles => setLiveRows(candles.map(c => ({
        date:   c.date,
        rsi14:  c.rsi14,
        close:  c.close,
        sma50:  c.sma50,
        sma200: c.sma200,
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pair, indicatorTf]);

  const rows = liveRows;
  const windowSize = expanded ? 40 : RSI_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [indicatorTf, pair]);
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

  if (loading) return (
    <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>
  );

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

function buildMaAnalysis(rows: MaRow[]): { headline: string; bullets: string[]; description: string } {
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

function buildAdxAnalysis(rows: AdxRow[]): { headline: string; bullets: string[]; description: string } {
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
interface KeltRow { date: string; open: number; high: number; low: number; close: number; keltnerUpper: number; keltnerMiddle: number; keltnerLower: number; }
function buildKeltAnalysis(rows: KeltRow[]): { headline: string; bullets: string[]; description: string } {
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

function MaPanelBodyImpl({ pair, indicatorTf, expanded }: { pair: string; indicatorTf: string; expanded?: boolean }) {
  const [liveRows, setLiveRows] = useState<MaRow[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    setLoading(true);
    setLiveRows([]);
    getStackCandles(pair, indicatorTf)
      .then(candles => setLiveRows(candles.map(c => ({
        date: c.date, open: c.open, high: c.high, low: c.low, close: c.close,
        ema9: c.ema9, ema20: c.ema20, ema50: c.ema50, ema100: c.ema100, ema200: c.ema200,
        sma20: c.sma20, sma50: c.sma50, sma200: c.sma200,
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pair, indicatorTf]);

  const rows = liveRows;
  const windowSize = expanded ? 40 : MA_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [indicatorTf, pair]);
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
  }, [loading]);

  if (loading) return (
    <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>
  );

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

function AdxPanelBodyImpl({ pair, indicatorTf, expanded }: { pair: string; indicatorTf: string; expanded?: boolean }) {
  const [liveRows, setLiveRows] = useState<AdxRow[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    setLoading(true);
    setLiveRows([]);
    getStackCandles(pair, indicatorTf)
      .then(candles => setLiveRows(candles.map(c => ({
        date: c.date, diPlus: c.di_plus, diMinus: c.di_minus, adx: c.adx,
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pair, indicatorTf]);

  const rows = liveRows;
  const windowSize = expanded ? 40 : ADX_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [indicatorTf, pair]);
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

  if (loading) return (
    <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>
  );

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

function IchiPanelBodyImpl({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
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
  const [showCandles, setShowCandles] = useState(() => localStorage.getItem("tm_ichi_show_candles") !== "0");
  const chartRef  = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const handler = () => setShowCandles(localStorage.getItem("tm_ichi_show_candles") !== "0");
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
            {/* Senkou spans drawn in the overlay SVG below so they share exact coords with the cloud fill */}
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
          const xAxisH     = expanded ? 34 : 0;
          const plotLeft   = yAxisWidth;
          const plotTop    = 4;
          const plotWidth  = chartSize.w - yAxisWidth - 6;
          const plotHeight = chartSize.h - plotTop - xAxisH;
          const [yMin, yMax] = yDomain as [number, number];
          if (typeof yMin !== 'number' || typeof yMax !== 'number' || yMax === yMin) return null;
          const bandW = plotWidth / totalPoints;
          const xPx = (idx: number) => plotLeft + bandW / 2 + idx * bandW;
          const yPx = (val: number) => plotTop + ((yMax - val) / (yMax - yMin)) * plotHeight;

          type Pt = { idx: number; top: number; bot: number };
          const bullSegs: Pt[][] = [];
          const bearSegs: Pt[][] = [];
          let curBull: Pt[] = [];
          let curBear: Pt[] = [];
          if (showSenkouA || showSenkouB) {
            const valid = (d: typeof data[number]) =>
              d.senkouA != null && d.senkouB != null;
            let prev: typeof data[number] | null = null;
            data.forEach(d => {
              if (!valid(d)) {
                if (curBull.length) { bullSegs.push(curBull); curBull = []; }
                if (curBear.length) { bearSegs.push(curBear); curBear = []; }
                prev = null;
                return;
              }
              const a  = d.senkouA as number;
              const b  = d.senkouB as number;
              const isBull = a >= b;

              if (prev) {
                const pa = prev.senkouA as number;
                const pb = prev.senkouB as number;
                const wasBull = pa >= pb;
                if (wasBull !== isBull) {
                  const denom = (a - b) - (pa - pb);
                  if (denom !== 0) {
                    const t = (pb - pa) / denom;
                    if (t >= 0 && t <= 1) {
                      const xIdx = prev.idx + t * (d.idx - prev.idx);
                      const yVal = pa + t * (a - pa);
                      const tip: Pt = { idx: xIdx, top: yVal, bot: yVal };
                      if (wasBull) {
                        curBull.push(tip);
                        bullSegs.push(curBull); curBull = [];
                        curBear.push(tip);
                      } else {
                        curBear.push(tip);
                        bearSegs.push(curBear); curBear = [];
                        curBull.push(tip);
                      }
                    }
                  }
                }
              }

              const top = Math.max(a, b);
              const bot = Math.min(a, b);
              if (isBull) curBull.push({ idx: d.idx, top, bot });
              else        curBear.push({ idx: d.idx, top, bot });
              prev = d;
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

          // Build polyline paths for Senkou A and Senkou B using the same
          // coordinate math as the fill, so the lines and fill cannot drift.
          const buildLine = (key: "senkouA" | "senkouB") => {
            const segs: string[] = [];
            let cur: string[] = [];
            data.forEach(d => {
              const v = d[key];
              if (v == null) {
                if (cur.length) { segs.push("M " + cur.join(" L ")); cur = []; }
                return;
              }
              cur.push(`${xPx(d.idx).toFixed(1)},${yPx(v as number).toFixed(1)}`);
            });
            if (cur.length) segs.push("M " + cur.join(" L "));
            return segs.join(" ");
          };
          const senkouAPath = showSenkouA ? buildLine("senkouA") : "";
          const senkouBPath = showSenkouB ? buildLine("senkouB") : "";

          const candleW = Math.max(2, Math.floor(bandW * 0.6));
          const senkouW = expanded ? 1.5 : 1;

          return (
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "hidden" }}>
              {bullSegs.map((seg, i) => <path key={`bull${i}`} d={makePath(seg)} fill="rgba(96,165,250,0.22)"  stroke="none" />)}
              {bearSegs.map((seg, i) => <path key={`bear${i}`} d={makePath(seg)} fill="rgba(167,139,250,0.22)" stroke="none" />)}
              {senkouBPath && <path d={senkouBPath} fill="none" stroke="#a78bfa" strokeWidth={senkouW} strokeDasharray="3 2" />}
              {senkouAPath && <path d={senkouAPath} fill="none" stroke="#60a5fa" strokeWidth={senkouW} strokeDasharray="3 2" /> }
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

function SessionPanelBodyImpl({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
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

interface WrRow { date: string; high: number; low: number; close: number; }
interface RocRow { date: string; close: number; }
function computeWR(rows: WrRow[], idx: number, period = 14): number {
  const start = Math.max(0, idx - period + 1);
  const slice = rows.slice(start, idx + 1);
  const hh = Math.max(...slice.map(r => r.high));
  const ll = Math.min(...slice.map(r => r.low));
  return hh === ll ? -50 : ((hh - rows[idx].close) / (hh - ll)) * -100;
}

interface CciRow { date: string; cci: number; close: number; }
function computeMom10(rows: CciRow[], idx: number): number {
  if (idx < 10) return 0;
  const base = rows[idx - 10].close;
  return base > 0 ? ((rows[idx].close - base) / base) * 100 : 0;
}

interface AvgPriceRow { date: string; high: number; low: number; close: number; }
interface MsRow { date: string; open: number; high: number; low: number; close: number; atr14: number; }
interface RegimeRow { date: string; open: number; high: number; low: number; close: number; adx: number; diPlus: number; diMinus: number; atr14: number; bbUpper: number; bbLower: number; }

function buildAvgPriceAnalysis(rows: AvgPriceRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 6) return { headline: "—", bullets: [], description: "—" };
  const idx  = rows.length - 1;
  const cur  = rows[idx];

  const typical   = (r: AvgPriceRow) => (r.high + r.low + r.close) / 3;
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

function buildRocAnalysis(rows: RocRow[]): { headline: string; bullets: string[]; description: string } {
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

function AvgPricePanelBodyImpl({ pair, indicatorTf, expanded }: { pair: string; indicatorTf: string; expanded?: boolean }) {
  const [liveRows, setLiveRows] = useState<AvgPriceRow[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    setLoading(true);
    setLiveRows([]);
    getStackCandles(pair, indicatorTf)
      .then(candles => setLiveRows(candles.map(c => ({
        date: c.date, high: c.high, low: c.low, close: c.close,
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pair, indicatorTf]);

  const rows = liveRows;
  const windowSize = expanded ? 40 : AVGP_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [indicatorTf, pair]);
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

  if (loading) return (
    <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>
  );

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

function RocPanelBodyImpl({ pair, indicatorTf, expanded }: { pair: string; indicatorTf: string; expanded?: boolean }) {
  const [liveRows, setLiveRows] = useState<RocRow[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    setLoading(true);
    setLiveRows([]);
    getStackCandles(pair, indicatorTf)
      .then(candles => setLiveRows(candles.map(c => ({ date: c.date, close: c.close }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pair, indicatorTf]);

  const rows = liveRows;
  const windowSize = expanded ? 40 : ROC_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [indicatorTf, pair]);

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

  if (loading) return (
    <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>
  );

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

interface VolaRow { date: string; open: number; high: number; low: number; close: number; bbUpper: number; bbMiddle: number; bbLower: number; histVol: number; }
function buildVolatilityAnalysis(rows: VolaRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 2) return { headline: "—", bullets: [], description: "—" };
  const cur  = rows[rows.length - 1];
  const { close, bbUpper, bbMiddle, bbLower, histVol } = cur;

  const bandwidth  = bbUpper - bbLower;
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

interface AtrRow { date: string; atr14: number; }
function buildAtrAnalysis(rows: AtrRow[]): { headline: string; bullets: string[]; description: string } {
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

function AtrPanelBodyImpl({ pair, indicatorTf, expanded }: { pair: string; indicatorTf: string; expanded?: boolean }) {
  const [liveRows, setLiveRows] = useState<AtrRow[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    setLoading(true);
    setLiveRows([]);
    getStackCandles(pair, indicatorTf)
      .then(candles => setLiveRows(candles.map(c => ({ date: c.date, atr14: c.atr14 }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pair, indicatorTf]);

  const rows = liveRows;
  const windowSize = expanded ? 40 : ATR_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [indicatorTf, pair]);
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
        atr:    r.atr14,
        atrSma: atrSma,
        rising: i > 0 ? r.atr14 >= slice[i - 1].atr14 : true,
      };
    });
  }, [rows, offset, windowSize]);

  const tickStyle  = { fill: "var(--text-muted)", fontSize: expanded ? 12 : 9 };
  const yAxisWidth = expanded ? 52 : 52;
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

  if (loading) return (
    <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>
  );

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
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={yDomain} tickFormatter={v => v < 1 ? v.toFixed(4) : v.toFixed(1)} />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }}
              position={{ x: 60, y: 10 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as typeof data[0];
                const diff = d.atr - d.atrSma;
                return (
                  <div className="rounded-lg px-3 py-2 text-[10px]" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-medium)", color: "var(--text-secondary)" }}>
                    <div style={{ color: "#a78bfa", fontWeight: 700 }}>ATR: {d.atr.toFixed(5)}</div>
                    <div>SMA20: {d.atrSma.toFixed(5)}</div>
                    <div style={{ color: diff >= 0 ? "#60a5fa" : "#a78bfa" }}>{diff >= 0 ? "+" : ""}{diff.toFixed(5)} vs avg</div>
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

interface SqzRow { date: string; bbUpper: number; bbLower: number; keltnerUpper: number; keltnerLower: number; close: number; sma20: number; high: number; low: number; }
function buildSqueezeAnalysis(rows: SqzRow[]): { headline: string; bullets: string[]; description: string } {
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

function SqueezePanelBodyImpl({ pair, indicatorTf, expanded }: { pair: string; indicatorTf: string; expanded?: boolean }) {
  const [liveRows, setLiveRows] = useState<SqzRow[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    setLoading(true);
    setLiveRows([]);
    getStackCandles(pair, indicatorTf)
      .then(candles => setLiveRows(candles.map(c => ({
        date: c.date, high: c.high, low: c.low, close: c.close, sma20: c.sma20,
        bbUpper: c.bb_upper, bbLower: c.bb_lower,
        keltnerUpper: c.keltner_upper, keltnerLower: c.keltner_lower,
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pair, indicatorTf]);

  const rows = liveRows;
  const windowSize = expanded ? 40 : SQZ_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [indicatorTf, pair]);

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

  if (loading) return (
    <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>
  );

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

// ─── Failure Swing ────────────────────────────────────────────────────────────
// Forex pairs are quoted with a pip convention (1 pip = 0.0001), so the wick
// is scaled to pip units. Everything else (indices, commodities, crypto,
// stocks) has no such convention — scaling a non-forex wick by 10000 anyway
// turned a normal few-point US500/US100/US30 wick into a "pip" value in the
// hundreds of thousands, which then made buildFsCdf's one-tick-per-pip loop
// iterate that many times (a UI hang, reading as "not working"). Non-forex
// pairs use the raw price difference instead.
const FOREX_PAIRS = new Set(ALL_ASSETS.filter(a => a.category === "Forex").map(a => a.pair));
function computeFsWick(r: SheetRow, pair: string): number | null {
  const scale = FOREX_PAIRS.has(pair) ? 10000 : 1;
  if (r.close > r.open) {
    const v = Math.round((r.open - r.low) * scale);
    return v >= 0 ? v : null;
  }
  if (r.close < r.open) {
    const v = Math.round((r.high - r.open) * scale);
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

function FailureSwingPanelBodyImpl({ rows, pair, expanded }: { rows: SheetRow[]; pair: string; expanded?: boolean }) {
  const showCdf   = true;
  const showToday = true;
  const showPercs = true;

  const stats = useMemo(() => {
    const all: number[] = [];
    let nUp = 0, nDown = 0;
    for (const r of rows) {
      const v = computeFsWick(r, pair);
      if (v !== null) { all.push(v); if (r.close > r.open) nUp++; else nDown++; }
    }
    const sorted = [...all].sort((a, b) => a - b);
    const n = sorted.length;
    if (!n) return null;
    const cur       = rows[rows.length - 1];
    const todayFs   = cur ? computeFsWick(cur, pair) : null;
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
//
// Algorithm mirrors src-tauri/src/scoring/structure.rs. Keep both in sync.
//
// Key behaviours:
//   • ATR displacement filter (0.25×ATR) for HH/HL/LH/LL classification — micro
//     swings classify as Equal and do not trigger events.
//   • All fractal swings are kept; no same-type collapsing. Each swing is
//     classified relative to the prior same-type swing.
//   • Real-time event detection on the current bar's close vs the highest
//     unbroken SH / lowest unbroken SL — events fire on the break bar, not N
//     bars later.
//   • Six state tiers: Strong Bullish, Bullish, Shifting, Range, Bearish,
//     Strong Bearish.
//   • Break confirmation uses CLOSE, not wick.

const MS_WINDOW   = 20;
const MS_LOOKBACK = 3;
const MS_DISPLACEMENT_ATR_MULT = 0.25;

type MsRelative = "HH" | "HL" | "LH" | "LL" | "Equal" | "FirstOfKind";
type MsState    = "Strong Bullish" | "Bullish" | "Shifting" | "Range" | "Bearish" | "Strong Bearish";

type MsSwing = { idx: number; type: "SH" | "SL"; price: number; relative: MsRelative };
type MsEvent = { idx: number; type: "BOS" | "CHOCH"; direction: "bull" | "bear"; isLive?: boolean };

function computeMarketStructure(rows: MsRow[], N = MS_LOOKBACK): {
  swings: MsSwing[]; events: MsEvent[]; state: MsState;
} {
  if (rows.length < N * 2 + 1) return { swings: [], events: [], state: "Range" };

  // 1. Fractal swing detection (strict).
  const raw: { idx: number; type: "SH" | "SL"; price: number }[] = [];
  for (let i = N; i < rows.length - N; i++) {
    let sh = true, sl = true;
    for (let k = 1; k <= N; k++) {
      if (rows[i - k].high >= rows[i].high || rows[i + k].high >= rows[i].high) sh = false;
      if (rows[i - k].low  <= rows[i].low  || rows[i + k].low  <= rows[i].low)  sl = false;
    }
    if (sh) raw.push({ idx: i, type: "SH", price: rows[i].high });
    if (sl) raw.push({ idx: i, type: "SL", price: rows[i].low  });
  }
  raw.sort((a, b) => a.idx - b.idx);

  // 2. Classify each swing relative to the prior same-type swing, with ATR filter.
  const swings: MsSwing[] = [];
  for (const s of raw) {
    const atr = Math.max(rows[s.idx]?.atr14 ?? 0.0005, 0.0001);
    const minDisp = MS_DISPLACEMENT_ATR_MULT * atr;
    const prior = [...swings].reverse().find(p => p.type === s.type);
    let relative: MsRelative;
    if (!prior) {
      relative = "FirstOfKind";
    } else if (s.type === "SH") {
      if      (s.price > prior.price + minDisp) relative = "HH";
      else if (s.price < prior.price - minDisp) relative = "LH";
      else                                       relative = "Equal";
    } else {
      if      (s.price > prior.price + minDisp) relative = "HL";
      else if (s.price < prior.price - minDisp) relative = "LL";
      else                                       relative = "Equal";
    }
    swings.push({ ...s, relative });
  }

  // 3. State determination from the most recent classifications.
  const highs = swings.filter(s => s.type === "SH");
  const lows  = swings.filter(s => s.type === "SL");
  let state: MsState = "Range";
  if (highs.length >= 1 && lows.length >= 1) {
    const lastH = highs[highs.length - 1].relative;
    const lastL = lows [lows.length  - 1].relative;
    const prevH = highs.length >= 2 ? highs[highs.length - 2].relative : "FirstOfKind";
    const prevL = lows.length  >= 2 ? lows [lows.length  - 2].relative : "FirstOfKind";

    const isBullPair = (h: MsRelative, l: MsRelative) => h === "HH" && l === "HL";
    const isBearPair = (h: MsRelative, l: MsRelative) => h === "LH" && l === "LL";

    if (isBullPair(lastH, lastL) && isBullPair(prevH, prevL)) state = "Strong Bullish";
    else if (isBearPair(lastH, lastL) && isBearPair(prevH, prevL)) state = "Strong Bearish";
    else if (isBullPair(lastH, lastL)) state = "Bullish";
    else if (isBearPair(lastH, lastL)) state = "Bearish";
    else if ((isBullPair(prevH, prevL) || prevL === "HL")
             && (lastL === "LL" || lastH === "LH")) state = "Shifting";
    else if ((isBearPair(prevH, prevL) || prevH === "LH")
             && (lastH === "HH" || lastL === "HL")) state = "Shifting";
  }

  // 4. Historical events from HH (bullish) and LL (bearish) classifications.
  const events: MsEvent[] = [];
  let trend: "bull" | "bear" | null = null;
  for (const s of swings) {
    if (s.relative === "HH") {
      events.push({ idx: s.idx, type: trend === "bear" ? "CHOCH" : "BOS", direction: "bull" });
      trend = "bull";
    } else if (s.relative === "LL") {
      events.push({ idx: s.idx, type: trend === "bull" ? "CHOCH" : "BOS", direction: "bear" });
      trend = "bear";
    }
  }

  // 5. Real-time event detection: check current close vs highest unbroken SH /
  //    lowest unbroken SL using only the bars PRIOR to the current bar.
  if (rows.length >= 2) {
    const cur = rows[rows.length - 1];
    const priorEnd = rows.length - 1; // exclusive

    const unbrokenSH = swings
      .filter(s => s.type === "SH" && s.idx < priorEnd)
      .filter(s => rows.slice(s.idx + 1, priorEnd).every(r => r.close <= s.price));
    const highestUnbroken = unbrokenSH.length > 0
      ? unbrokenSH.reduce((a, b) => (a.price >= b.price ? a : b))
      : null;
    if (highestUnbroken && cur.close > highestUnbroken.price) {
      const priorTrend = trend;
      events.push({
        idx: rows.length - 1,
        type: priorTrend === "bear" ? "CHOCH" : "BOS",
        direction: "bull",
        isLive: true,
      });
      trend = "bull";
    } else {
      const unbrokenSL = swings
        .filter(s => s.type === "SL" && s.idx < priorEnd)
        .filter(s => rows.slice(s.idx + 1, priorEnd).every(r => r.close >= s.price));
      const lowestUnbroken = unbrokenSL.length > 0
        ? unbrokenSL.reduce((a, b) => (a.price <= b.price ? a : b))
        : null;
      if (lowestUnbroken && cur.close < lowestUnbroken.price) {
        const priorTrend = trend;
        events.push({
          idx: rows.length - 1,
          type: priorTrend === "bull" ? "CHOCH" : "BOS",
          direction: "bear",
          isLive: true,
        });
        trend = "bear";
      }
    }
  }

  return { swings, events, state };
}

function buildMarketStructureAnalysis(rows: MsRow[]): { bullets: string[]; description: string } {
  const { swings, events, state } = computeMarketStructure(rows);
  const SHs      = swings.filter(s => s.type === "SH");
  const SLs      = swings.filter(s => s.type === "SL");
  const lastEv   = events[events.length - 1];

  const lastH = SHs.length > 0 ? SHs[SHs.length - 1].relative : "—";
  const lastL = SLs.length > 0 ? SLs[SLs.length - 1].relative : "—";
  const liveTag = lastEv?.isLive ? " [live break on current bar]" : "";
  const bullets = [
    `State: ${state}`,
    `Swing Highs: ${SHs.length}  ·  Swing Lows: ${SLs.length}`,
    `Latest SH: ${lastH}  ·  Latest SL: ${lastL}`,
    lastEv
      ? `Last signal: ${lastEv.type} ${lastEv.direction === "bull" ? "↑ Bullish" : "↓ Bearish"}${liveTag}`
      : "No BOS / CHOCH detected",
  ];
  const description =
    state === "Strong Bullish"
      ? "Two consecutive HH+HL pairs — strong bullish structure. The path of least resistance is up; pullbacks to recent HLs are high-edge buy zones until structure shifts."
      : state === "Bullish"
      ? "Latest swing pair is HH+HL — bullish structure confirmed. Watch for a BOS above the most recent SH to confirm continuation, or a CHOCH below the most recent SL as the first reversal warning."
      : state === "Shifting"
      ? "The most recent swing contradicts the prior trend pair — earliest structural warning of a reversal. Reduce conviction in the prior direction until a fresh structural break confirms the new bias."
      : state === "Bearish"
      ? "Latest swing pair is LH+LL — bearish structure confirmed. Distribution is dominating at each rally; a BOS to the downside continues the move, a CHOCH above the most recent SH flags reversal."
      : state === "Strong Bearish"
      ? "Two consecutive LH+LL pairs — strong bearish structure. The path of least resistance is down; rallies into recent LHs are high-edge sell zones until structure shifts."
      : "No consistent HH/HL or LH/LL pattern in the recent swing sequence. Range conditions — avoid directional bias until a structural break establishes a new trend.";
  return { bullets, description };
}

function MarketStructurePanelBodyImpl({ pair, indicatorTf, expanded }: { pair: string; indicatorTf: string; expanded?: boolean }) {
  const [liveRows, setLiveRows] = useState<MsRow[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    setLoading(true);
    setLiveRows([]);
    getStackCandles(pair, indicatorTf)
      .then(candles => setLiveRows(candles.map(c => ({
        date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, atr14: c.atr14,
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pair, indicatorTf]);

  const rows = liveRows;
  const windowSize = expanded ? 40 : MS_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [indicatorTf, pair]);
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
  }, [loading]);

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

  const analysis   = useMemo(() => expanded ? buildMarketStructureAnalysis(rows) : null, [rows, expanded]);

  if (loading) return (
    <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>
  );

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

function VolatilityPanelBodyImpl({ pair, indicatorTf, expanded }: { pair: string; indicatorTf: string; expanded?: boolean }) {
  const [liveRows, setLiveRows] = useState<VolaRow[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    setLoading(true);
    setLiveRows([]);
    getStackCandles(pair, indicatorTf)
      .then(candles => setLiveRows(candles.map(c => ({
        date: c.date, open: c.open, high: c.high, low: c.low, close: c.close,
        bbUpper: c.bb_upper, bbMiddle: c.bb_middle, bbLower: c.bb_lower, histVol: c.hist_vol,
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pair, indicatorTf]);

  const rows = liveRows;
  const windowSize = expanded ? 40 : VOLA_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [indicatorTf, pair]);
  const [showClose]   = useState(true);
  const [showUpper]   = useState(true);
  const [showMid]     = useState(true);
  const [showLower]   = useState(true);
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
  }, [loading]);

  if (loading) return (
    <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>
  );

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

function buildMomentumAnalysis(rows: CciRow[]): { headline: string; bullets: string[]; description: string } {
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

function CciPanelBodyImpl({ pair, indicatorTf, expanded }: { pair: string; indicatorTf: string; expanded?: boolean }) {
  const [liveRows, setLiveRows] = useState<CciRow[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    setLoading(true);
    setLiveRows([]);
    getStackCandles(pair, indicatorTf)
      .then(candles => setLiveRows(candles.map(c => ({
        date:  c.date,
        cci:   c.cci,
        close: c.close,
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pair, indicatorTf]);

  const rows = liveRows;
  const windowSize = expanded ? 40 : MOM_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [indicatorTf, pair]);

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

  if (loading) return (
    <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>
  );

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

function buildWrAnalysis(rows: WrRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 14) return { headline: "—", bullets: [], description: "—" };
  const idx     = rows.length - 1;
  const wr      = computeWR(rows, idx);
  const prev5   = Array.from({ length: 5 }, (_, i) => computeWR(rows, Math.max(0, idx - i - 1)));
  const trend   = wr > prev5[0] ? "rising" : wr < prev5[0] ? "falling" : "flat";
  const wrR     = Math.round(wr * 10) / 10;
  const overbought = wr > -20;
  const oversold   = wr < -80;
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

function WrPanelBodyImpl({ pair, indicatorTf, expanded }: { pair: string; indicatorTf: string; expanded?: boolean }) {
  const [liveRows, setLiveRows] = useState<WrRow[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    setLoading(true);
    setLiveRows([]);
    getStackCandles(pair, indicatorTf)
      .then(candles => setLiveRows(candles.map(c => ({ date: c.date, high: c.high, low: c.low, close: c.close }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pair, indicatorTf]);

  const rows = liveRows;
  const windowSize = expanded ? 40 : MOM_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [indicatorTf, pair]);

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

  if (loading) return (
    <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>
  );

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

function PivotPanelBodyImpl({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
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

interface VolumeRow { date: string; open: number; close: number; volume: number; volumeSma20: number; }

function buildVolumeAnalysis(rows: VolumeRow[]): { headline: string; bullets: string[]; description: string } {
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

function VolumePanelBodyImpl({ pair, indicatorTf, expanded }: { pair: string; indicatorTf: string; expanded?: boolean }) {
  const [liveRows, setLiveRows] = useState<VolumeRow[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    setLoading(true);
    setLiveRows([]);
    getStackCandles(pair, indicatorTf)
      .then(candles => setLiveRows(candles.map(c => ({
        date: c.date, open: c.open, close: c.close, volume: c.volume, volumeSma20: c.volume_sma20,
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pair, indicatorTf]);

  const rows = liveRows;
  const windowSize = expanded ? 40 : VOL_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [indicatorTf, pair]);
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

  if (loading) return (
    <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>
  );

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

function KeltPanelBodyImpl({ pair, indicatorTf, expanded }: { pair: string; indicatorTf: string; expanded?: boolean }) {
  const [liveRows, setLiveRows] = useState<KeltRow[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    setLoading(true);
    setLiveRows([]);
    getStackCandles(pair, indicatorTf)
      .then(candles => setLiveRows(candles.map(c => ({
        date: c.date, open: c.open, high: c.high, low: c.low, close: c.close,
        keltnerUpper: c.keltner_upper, keltnerMiddle: c.keltner_middle, keltnerLower: c.keltner_lower,
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pair, indicatorTf]);

  const rows = liveRows;
  const windowSize = expanded ? 40 : KELT_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [indicatorTf, pair]);
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
  }, [loading]);

  if (loading) return (
    <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>
  );

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

function buildSynthesisNarrative(result: AnalysisResult, pair: string): {
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
    ? `${pair} is presenting a ${confLabel} long opportunity at ${confidence}% confidence. `
    : `${pair} is presenting a ${confLabel} short opportunity at ${confidence}% confidence. `;

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

function AiSynthesisPanelBodyImpl({ result, pair, expanded }: { result: AnalysisResult; pair: string; expanded?: boolean }) {
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

  const { bullets, summary, narrative } = buildSynthesisNarrative(result, pair);

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

interface CandleCtxRow { date: string; open: number; high: number; low: number; close: number; }

const _bTop = (r: CandleCtxRow) => Math.max(r.open, r.close);
const _bBot = (r: CandleCtxRow) => Math.min(r.open, r.close);
const _bMid = (r: CandleCtxRow) => (r.open + r.close) / 2;
const _bull = (r: CandleCtxRow) => r.close >= r.open;
const _bear = (r: CandleCtxRow) => r.close <  r.open;
const _isDojiBody  = (r: CandleCtxRow) => { const b = Math.abs(r.close - r.open); const rng = r.high - r.low; return rng > 0 && b / rng < 0.10; };
const _isSmallBody = (r: CandleCtxRow) => { const b = Math.abs(r.close - r.open); const rng = r.high - r.low; return rng > 0 && b / rng < 0.30; };
const _priorTrendDown = (cs: CandleCtxRow[], endIdx: number, lookback: number): boolean => {
  const startIdx = endIdx - lookback;
  if (startIdx < 0 || endIdx < 0 || endIdx >= cs.length) return false;
  return cs[endIdx].close < cs[startIdx].close;
};
const _priorTrendUp = (cs: CandleCtxRow[], endIdx: number, lookback: number): boolean => {
  const startIdx = endIdx - lookback;
  if (startIdx < 0 || endIdx < 0 || endIdx >= cs.length) return false;
  return cs[endIdx].close > cs[startIdx].close;
};
const _bodyInUpperThird = (r: CandleCtxRow): boolean => {
  const rng = r.high - r.low;
  if (rng <= 0) return false;
  return (_bBot(r) - r.low) >= rng * 0.6;
};
const _bodyInLowerThird = (r: CandleCtxRow): boolean => {
  const rng = r.high - r.low;
  if (rng <= 0) return false;
  return (r.high - _bTop(r)) >= rng * 0.6;
};

function detectCandlePatterns(candles: CandleCtxRow[]): CandlePattern[] {
  if (candles.length < 2) return [];
  const out: CandlePattern[] = [];
  const n  = candles.length;
  const i0 = n - 1, i1 = n - 2, i2 = n - 3;
  const c0 = candles[i0];
  const c1 = candles[i1];
  const c2 = n >= 3 ? candles[i2] : null;
  const c0Body = Math.abs(c0.close - c0.open);
  const c1Body = Math.abs(c1.close - c1.open);

  // ── Tier 1: multi-candle ──────────────────────────────────────────────────
  // Engulfing requires strict body engulf AND c0 body materially larger than c1
  const bullEngulf = _bear(c1) && _bull(c0)
                  && c0.open < c1.close && c0.close > c1.open
                  && c0Body > c1Body * 1.2;
  if (bullEngulf)
    out.push({ name: "Bullish Engulfing", bias: "bullish", tier: 1, description: "A large bullish candle fully engulfs the prior bearish body. Sellers lost control — buyers absorbed all selling pressure and closed near the high. Strong reversal signal at support." });

  const bearEngulf = _bull(c1) && _bear(c0)
                  && c0.open > c1.close && c0.close < c1.open
                  && c0Body > c1Body * 1.2;
  if (bearEngulf)
    out.push({ name: "Bearish Engulfing", bias: "bearish", tier: 1, description: "A large bearish candle fully engulfs the prior bullish body. Buyers exhausted — sellers took complete control and closed the session near the low." });

  // Engulfing Variants — wick breaks beyond prior, body closes past prior body, but not a clean full engulf
  if (!bullEngulf && _bear(c1) && _bull(c0) && c0.low < c1.low && c0.close > c1.open)
    out.push({ name: "Bullish Engulfing Variant", bias: "bullish", tier: 1, description: "The market probed below the prior session's low then closed higher. Failed bearish pressure with bullish close — watch for follow-through confirmation." });

  if (!bearEngulf && _bull(c1) && _bear(c0) && c0.high > c1.high && c0.close < c1.open)
    out.push({ name: "Bearish Engulfing Variant", bias: "bearish", tier: 1, description: "The session spiked above the prior high but sellers drove price back below the prior open. Buyers were absorbed — sellers now in control." });

  // Piercing Line — body-relative gap (relaxed from prior-low gap for FX)
  if (_bear(c1) && _bull(c0) && c0.open < c1.close && c0.close > _bMid(c1) && c0.close < _bTop(c1))
    out.push({ name: "Piercing Line", bias: "bullish", tier: 1, description: "Price gapped below the prior body then rallied to close above the midpoint of the prior bearish candle. Strong demand below — potential bottom forming." });

  // Dark Cloud Cover — body-relative gap
  if (_bull(c1) && _bear(c0) && c0.open > c1.close && c0.close < _bMid(c1) && c0.close > _bBot(c1))
    out.push({ name: "Dark Cloud Cover", bias: "bearish", tier: 1, description: "Price gapped above the prior body then reversed to close below the midpoint of the prior bullish candle. Distribution at the top — potential decline ahead." });

  if (c2) {
    const c2Body   = Math.abs(c2.close - c2.open);
    const c0Strong = c0Body >= c2Body * 0.5;

    if (_bear(c2) && _isSmallBody(c1) && _bull(c0) && c0Strong
        && c1.open < c2.close && c0.open > c1.close && c0.close > _bMid(c2))
      out.push({ name: "Morning Star", bias: "bullish", tier: 1, description: "A three-candle reversal: bearish session, small-body pause gapping lower, then strong bullish recovery above the prior midpoint. Classic bottom formation." });

    if (_bear(c2) && _isDojiBody(c1) && _bull(c0) && c0Strong
        && c1.open < c2.close && c0.open > c1.close && c0.close > _bMid(c2))
      out.push({ name: "Doji Morning Star", bias: "bullish", tier: 1, description: "A doji-gapped-down followed by a bullish recovery. The doji's indecision is confirmed by buyers seizing control on the third candle — strong reversal signal." });

    if (_bull(c2) && _isSmallBody(c1) && _bear(c0) && c0Strong
        && c1.open > c2.close && c0.open < c1.close && c0.close < _bMid(c2))
      out.push({ name: "Evening Star", bias: "bearish", tier: 1, description: "A three-candle top: bullish session, small-body pause gapping higher, then strong bearish reversal below the prior midpoint. Buyers lost control." });

    if (_bull(c2) && _isDojiBody(c1) && _bear(c0) && c0Strong
        && c1.open > c2.close && c0.open < c1.close && c0.close < _bMid(c2))
      out.push({ name: "Doji Evening Star", bias: "bearish", tier: 1, description: "A doji-gapped-up followed by bearish follow-through. Failed upside and doji indecision confirmed by sellers — reliable top formation." });
  }

  // ── Tier 2: single-candle (requires prior trend + body position) ──────────
  const c0UW = c0.high - _bTop(c0);
  const c0LW = _bBot(c0) - c0.low;
  const trendDownBeforeC0 = _priorTrendDown(candles, i1, 3);
  const trendUpBeforeC0   = _priorTrendUp(candles,   i1, 3);

  // Hammer / Hanging Man — long lower wick, body pinned to upper third
  if (c0Body > 0 && c0LW >= 2 * c0Body && c0UW <= c0Body && _bodyInUpperThird(c0)) {
    if (trendDownBeforeC0)
      out.push({ name: "Hammer", bias: "bullish", tier: 2, description: "Long lower wick after a downtrend — sellers pushed price far down but buyers aggressively rejected lower levels. A bullish reversal signal awaiting confirmation." });
    else if (trendUpBeforeC0)
      out.push({ name: "Hanging Man", bias: "bearish", tier: 2, description: "Same shape as a hammer but after an uptrend. Sellers briefly overwhelmed buyers intraday — a warning the rally may be losing steam." });
  }

  // Dragonfly Doji — doji-bodied hammer: near-zero body pinned to the top of
  // the range, negligible upper wick, long lower wick after a downtrend.
  const c0Range = c0.high - c0.low;
  if (c0Range > 0 && _isDojiBody(c0) && (c0UW / c0Range) <= 0.10 && (c0LW / c0Range) >= 0.60 && trendDownBeforeC0)
    out.push({ name: "Dragonfly Doji", bias: "bullish", tier: 2, description: "A doji with a long lower wick and virtually no upper wick after a downtrend — sellers drove price down but buyers reclaimed it entirely by the close. A bullish reversal signal awaiting confirmation." });

  // Inverted Hammer / Shooting Star — long upper wick, body pinned to lower third
  if (c0Body > 0 && c0UW >= 2 * c0Body && c0LW <= c0Body && _bodyInLowerThird(c0)) {
    if (trendDownBeforeC0)
      out.push({ name: "Inverted Hammer", bias: "bullish", tier: 2, description: "A spike above the open with a close near the low after a downtrend. Buyers made a push — if the next session confirms with a bullish open, a reversal may be developing." });
    else if (trendUpBeforeC0)
      out.push({ name: "Shooting Star", bias: "bearish", tier: 2, description: "Buyers drove price sharply higher intraday but sellers took control and closed near the low after an uptrend. A bearish reversal warning at the top of an advance." });
  }

  // ── Tier 3: needs confirmation ────────────────────────────────────────────
  // Instrument-agnostic tolerance — fraction of the candles' own ranges (works for JPY, gold, BTC)
  const TOL      = Math.max(c0.high - c0.low, c1.high - c1.low) * 0.08;
  const prevBody = c1Body;
  const trendDownBeforeTw = _priorTrendDown(candles, i2, 2);
  const trendUpBeforeTw   = _priorTrendUp(candles,   i2, 2);

  // Tweezers Bottom — bear→bull, matching lows, after a downtrend
  if (_bear(c1) && _bull(c0) && Math.abs(c0.low - c1.low) <= TOL && trendDownBeforeTw)
    out.push({ name: "Tweezers Bottom", bias: "bullish", tier: 3, description: "Two sessions defending the same low after a downtrend — buyers absorbed selling pressure at this level twice. Strong support zone confirmed, but a bullish close on the next bar is needed." });

  // Tweezers Top — bull→bear, matching highs, after an uptrend
  if (_bull(c1) && _bear(c0) && Math.abs(c0.high - c1.high) <= TOL && trendUpBeforeTw)
    out.push({ name: "Tweezers Top", bias: "bearish", tier: 3, description: "Two sessions rejecting the same high after an uptrend — sellers absorbed buying pressure twice. Strong resistance confirmed, but bearish follow-through on the next bar is required." });

  if (prevBody > 0 && c0Body < prevBody * 0.50 && _bTop(c0) < _bTop(c1) && _bBot(c0) > _bBot(c1)) {
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

// Flags every candle that is the final bar of a detected reversal pattern,
// using the same sliding window the tail-only callers already use (slice(-12)).
// Which pattern names count as a "reversal candle" for chart highlighting is
// user-configurable from the Reversal button's settings popup — the other
// detectCandlePatterns() types (stars, tweezers, harami, etc.) still exist
// for the panel's signal badge elsewhere regardless of this selection.
// Grouped by candle SHAPE rather than by bias — a bullish and bearish
// pattern that are the same shape in opposite trend context (Hammer /
// Hanging Man, Inverted Hammer / Shooting Star, etc.) share one toggle
// instead of forcing the user to pick each bias separately.
const REVERSAL_PATTERN_GROUPS: { label: string; patterns: string[] }[] = [
  { label: "Engulfing",                        patterns: ["Bullish Engulfing", "Bearish Engulfing"] },
  { label: "Engulfing Variant",                patterns: ["Bullish Engulfing Variant", "Bearish Engulfing Variant"] },
  { label: "Piercing / Dark Cloud",             patterns: ["Piercing Line", "Dark Cloud Cover"] },
  { label: "Star",                              patterns: ["Morning Star", "Evening Star"] },
  { label: "Doji Star",                         patterns: ["Doji Morning Star", "Doji Evening Star"] },
  { label: "Hammer / Hanging Man",              patterns: ["Hammer", "Hanging Man"] },
  { label: "Dragonfly Doji",                    patterns: ["Dragonfly Doji"] },
  { label: "Inverted Hammer / Shooting Star",   patterns: ["Inverted Hammer", "Shooting Star"] },
  { label: "Tweezers",                          patterns: ["Tweezers Bottom", "Tweezers Top"] },
  { label: "Harami",                            patterns: ["Bullish Harami", "Bearish Harami"] },
  { label: "Harami Cross",                      patterns: ["Bullish Harami Cross", "Bearish Harami Cross"] },
];
const DEFAULT_REVERSAL_GROUPS = [
  "Engulfing", "Engulfing Variant", "Hammer / Hanging Man", "Dragonfly Doji", "Inverted Hammer / Shooting Star",
];
function expandReversalGroups(groupLabels: Set<string>): Set<string> {
  const names = new Set<string>();
  for (const g of REVERSAL_PATTERN_GROUPS) if (groupLabels.has(g.label)) for (const n of g.patterns) names.add(n);
  return names;
}

// A candle "lives inside or on" a zone if its high/low range touches the
// zone's price band at all, and the zone had already originated by that
// candle's time (a zone can't gate a candle that predates it).
function candleTouchesZone(low: number, high: number, time: number, zone: ZoneBox): boolean {
  return time >= zone.originTime && low <= zone.high && high >= zone.low;
}

// Same idea for a time-and-price-bounded box (the 8am box) — the candle must
// also fall within the box's own time window, since unlike a zone it doesn't
// stay open-ended to the right.
function candleTouchesTimeRangeBox(low: number, high: number, time: number, box: TimeRangeBox): boolean {
  return time >= box.startTime && time < box.endTime && low <= box.high && high >= box.low;
}

// A candle "lives on" a trend line if the line's price at that candle's time
// (same slope equation the chart renderer extends past its anchors with)
// falls within the candle's own high/low range. Only valid from the line's
// earlier anchor (t1) forward — it doesn't exist before that.
function candleTouchesTrendline(low: number, high: number, time: number, line: TrendlineSegment): boolean {
  if (time < line.t1 || line.t2 === line.t1) return false;
  const slope = (line.p2 - line.p1) / (line.t2 - line.t1);
  const price = line.p1 + slope * (time - line.t1);
  return low <= price && high >= price;
}

// Same idea, against a user-drawn Gann Fan's 9 ratio rays — pure time/price
// arithmetic (no chart/pixel space involved), each ray's slope scaled off
// the p1→p2 baseline exactly as GannRenderer draws it, valid only forward
// from the anchor (p1) like a trend line's own t1 cutoff.
function candleTouchesGannFan(low: number, high: number, time: number, gann: Drawing): boolean {
  if (!gann.p2 || time < gann.p1.time) return false;
  const dtBase = gann.p2.time - gann.p1.time;
  if (dtBase === 0) return false;
  const dpBase = gann.p2.price - gann.p1.price;
  return GANN_RATIOS.some(g => {
    const dt = dtBase * g.dxMul;
    if (dt === 0) return false;
    const dp = dpBase * g.dyMul;
    const price = gann.p1.price + (dp / dt) * (time - gann.p1.time);
    return low <= price && high >= price;
  });
}

// Same idea against a user-drawn Fibonacci Retracement or Extension's
// horizontal levels — valid from whichever of the drawing's own points is
// earliest forward, matching how DrawingRenderer draws each one starting at
// that same x.
function candleTouchesFibLevels(low: number, high: number, time: number, fib: Drawing): boolean {
  if (!fib.p2) return false;
  if (fib.kind === "fibext") {
    if (!fib.p3) return false;
    if (time < Math.min(fib.p1.time, fib.p2.time, fib.p3.time)) return false;
    return FIBEXT_LEVELS.some(ratio => {
      const price = fib.p3!.price + (fib.p2!.price - fib.p1.price) * ratio;
      return low <= price && high >= price;
    });
  }
  if (fib.kind !== "fib") return false;
  if (time < Math.min(fib.p1.time, fib.p2.time)) return false;
  return FIB_LEVELS.some(ratio => {
    const price = fib.p1.price + (fib.p2!.price - fib.p1.price) * ratio;
    return low <= price && high >= price;
  });
}

interface ReversalInfo { name: string; bias: "bullish" | "bearish" }

function computeReversalFlags(
  rows: { date: string; timestamp: string; open: number; high: number; low: number; close: number }[],
  zones: ZoneBox[],
  eightAmBoxes: TimeRangeBox[],
  trendlines: TrendlineSegment[],
  drawings: Drawing[],
  enabledPatterns: Set<string>,
  zoneFilterOn: boolean,
  eightAmBoxFilterOn: boolean,
  trendlineFilterOn: boolean,
  gannFilterOn: boolean,
  fibFilterOn: boolean,
  maxCount: number | null,
): (ReversalInfo | null)[] {
  const flags: (ReversalInfo | null)[] = new Array(rows.length).fill(null);
  if (enabledPatterns.size === 0) return flags;
  const demandZones = zones.filter(z => z.type === "demand");
  const supplyZones = zones.filter(z => z.type === "supply");
  const gannDrawings = gannFilterOn ? drawings.filter(d => d.kind === "gann" && !d.hidden) : [];
  const fibDrawings  = fibFilterOn  ? drawings.filter(d => (d.kind === "fib" || d.kind === "fibext") && !d.hidden) : [];
  const anyFilterOn = zoneFilterOn || eightAmBoxFilterOn || trendlineFilterOn || gannFilterOn || fibFilterOn;
  // rows' final entry is still the forming candle (live poll updates it in
  // place until the bar closes) — its O/H/L/C can still change, so it must
  // never be flagged as a reversal even if it currently matches a pattern's
  // shape. Stopping one short of rows.length leaves flags[rows.length - 1]
  // at its untouched `null` default.
  for (let i = 1; i < rows.length - 1; i++) {
    const window = rows.slice(Math.max(0, i - 11), i + 1);
    const patterns = detectCandlePatterns(window).filter(p => enabledPatterns.has(p.name));
    if (patterns.length === 0) continue;
    const r = rows[i];
    const t = Math.floor(new Date(r.timestamp).getTime() / 1000);
    // No filter active (default): every detected + enabled pattern qualifies
    // regardless of location. With a filter active: Zone strictly requires
    // bullish reversals inside/on a currently-viewed demand zone and bearish
    // inside/on supply (no cross-bias); every other filter (8AM Box, Trend
    // Line, Gann Fan, Fibonacci) counts either bias, per whichever are on.
    const qualifying = !anyFilterOn
      ? patterns[0]
      : patterns.find(p => {
          const zoneMatch = zoneFilterOn && (p.bias === "bullish"
            ? demandZones.some(z => candleTouchesZone(r.low, r.high, t, z))
            : supplyZones.some(z => candleTouchesZone(r.low, r.high, t, z)));
          const boxMatch   = eightAmBoxFilterOn && eightAmBoxes.some(b => candleTouchesTimeRangeBox(r.low, r.high, t, b));
          const trendMatch = trendlineFilterOn && trendlines.some(l => candleTouchesTrendline(r.low, r.high, t, l));
          const gannMatch  = gannFilterOn && gannDrawings.some(g => candleTouchesGannFan(r.low, r.high, t, g));
          const fibMatch   = fibFilterOn && fibDrawings.some(f => candleTouchesFibLevels(r.low, r.high, t, f));
          return zoneMatch || boxMatch || trendMatch || gannMatch || fibMatch;
        });
    if (qualifying) flags[i] = { name: qualifying.name, bias: qualifying.bias as "bullish" | "bearish" };
  }
  // Keep only the most recent `maxCount` qualifying candles — a long history
  // of them buries the ones that still matter under a wall of older ones.
  if (maxCount !== null && maxCount > 0) {
    let kept = 0;
    for (let i = flags.length - 1; i >= 0; i--) {
      if (flags[i] === null) continue;
      kept++;
      if (kept > maxCount) flags[i] = null;
    }
  }
  return flags;
}

// ─── Regime Detection Panel ───────────────────────────────────────────────────
const REGIME_WINDOW = 20;

// Algorithm mirrors src-tauri/src/scoring/volatility.rs. Keep both in sync.
//
// Priority:
//   1. StrongTrending (ADX >= 40 AND DI dominance)
//   2. Trending       (ADX >= 25 AND DI dominance)
//   3. Compression    (joint BB+ATR contraction AND no trend)
//   4. Expansion      (joint BB+ATR expansion AND no trend)
//   5. Ranging        (default)
type RegimeState     = "StrongTrending" | "Trending" | "Expansion" | "Ranging" | "Compression";
type VolatilityState = "Expanding" | "Contracting" | "Neutral";

const REGIME_ADX_TRENDING   = 25.0;
const REGIME_ADX_STRONG     = 40.0;
const REGIME_DI_DOMINANCE   = 5.0;
const REGIME_BB_COMPRESSION = 0.65;
const REGIME_BB_EXPANSION   = 1.50;
const REGIME_VOL_EXPANDING  = 1.20;
const REGIME_VOL_CONTRACT   = 0.85;

function computeRegime(rows: RegimeRow[], idx: number): RegimeState {
  if (idx < 0 || idx >= rows.length) return "Ranging";
  const r       = rows[idx];
  const adx     = r.adx ?? 0;
  const diDiff  = Math.abs((r.diPlus ?? 0) - (r.diMinus ?? 0));
  const diConf  = diDiff >= REGIME_DI_DOMINANCE;
  const bbWidth = ((r.bbUpper ?? 0) - (r.bbLower ?? 0)) * 10000;
  const slice   = rows.slice(Math.max(0, idx - 19), idx + 1);
  const bbAvg   = slice.reduce((s, rr) => s + ((rr.bbUpper ?? 0) - (rr.bbLower ?? 0)) * 10000, 0) / (slice.length || 1);
  const atr     = r.atr14 ?? 0;
  const atrAvg  = slice.reduce((s, rr) => s + (rr.atr14 ?? 0), 0) / (slice.length || 1);
  const bbRatio = bbAvg > 0 ? bbWidth / bbAvg : 1;
  const atrRatio = atrAvg > 0 ? atr / atrAvg : 1;

  if (adx >= REGIME_ADX_STRONG   && diConf) return "StrongTrending";
  if (adx >= REGIME_ADX_TRENDING && diConf) return "Trending";
  if (bbAvg > 0 && bbRatio < REGIME_BB_COMPRESSION
      && atrRatio < REGIME_VOL_CONTRACT
      && adx < REGIME_ADX_TRENDING) return "Compression";
  if (bbAvg > 0 && bbRatio > REGIME_BB_EXPANSION
      && atrRatio > REGIME_VOL_EXPANDING
      && adx < REGIME_ADX_TRENDING) return "Expansion";
  return "Ranging";
}

const REGIME_MIN_HOLD = 5;
const REGIME_CONFIRM  = 3;

function computeRegimeSequence(rows: RegimeRow[]): RegimeState[] {
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

function computeRegimeVolatility(rows: RegimeRow[], idx: number): VolatilityState {
  if (idx < 0 || idx >= rows.length) return "Neutral";
  const slice = rows.slice(Math.max(0, idx - 19), idx + 1);
  const sma   = slice.reduce((s, r) => s + (r.atr14 ?? 0), 0) / (slice.length || 1);
  const atr   = rows[idx].atr14 ?? 0;
  if (sma === 0) return "Neutral";
  if (atr > sma * REGIME_VOL_EXPANDING) return "Expanding";
  if (atr < sma * REGIME_VOL_CONTRACT)  return "Contracting";
  return "Neutral";
}

function buildRegimeAnalysis(rows: RegimeRow[]): { headline: string; bullets: string[]; description: string } {
  if (rows.length < 5) return { headline: "—", bullets: [], description: "—" };
  const cur      = rows[rows.length - 1];
  const adx      = cur.adx      ?? 0;
  const atr14    = cur.atr14    ?? 0;
  const bbWidth  = ((cur.bbUpper ?? 0) - (cur.bbLower ?? 0)) * 10000;
  const slice20  = rows.slice(-20);
  const bbAvg    = slice20.reduce((s, r) => s + ((r.bbUpper ?? 0) - (r.bbLower ?? 0)) * 10000, 0) / slice20.length;
  const atrSma   = slice20.reduce((s, r) => s + (r.atr14 ?? 0), 0) / slice20.length;
  // Use the canonical classifier so badge and bullets agree.
  const regime: RegimeState     = computeRegime(rows, rows.length - 1);
  const volatility: VolatilityState = computeRegimeVolatility(rows, rows.length - 1);
  const diDiff   = Math.abs((cur.diPlus ?? 0) - (cur.diMinus ?? 0));
  const adxR     = Math.round(adx * 10) / 10;
  const bwPips   = Math.round(bbWidth);
  const bwAvgP   = Math.round(bbAvg);
  const atrPips  = Math.round(atr14 * 10000);
  const atrSmaP  = Math.round(atrSma * 10000);
  const adxLabel = adx >= 40 ? "Strong trend"
                : adx >= 25 ? "Trend confirmed"
                : adx >= 15 ? "Weak momentum"
                : "No trend";
  const bullets = [
    `Regime: ${regime} · Volatility: ${volatility}`,
    `ADX: ${adxR} · ${adxLabel} · |+DI − −DI| = ${diDiff.toFixed(1)}`,
    `BB Width: ${bwPips} pips · 20-bar avg: ${bwAvgP} pips (ratio ${(bbWidth / Math.max(bbAvg, 1)).toFixed(2)})`,
    `ATR(14): ${atrPips} pips · Avg: ${atrSmaP} pips (ratio ${(atr14 / Math.max(atrSma, 1e-6)).toFixed(2)})`,
  ];
  const dir = (cur.diPlus ?? 0) > (cur.diMinus ?? 0) ? "bullish" : "bearish";
  let description = "";
  if (regime === "StrongTrending") {
    description = `ADX at ${adxR} confirms a strong ${dir} trend with directional pressure dominating (|+DI − −DI| = ${diDiff.toFixed(1)}). Trend-following strategies carry the highest edge; counter-trend trades are low-probability in this environment.`;
  } else if (regime === "Trending") {
    const volNote = volatility === "Expanding" ? "Volatility is expanding — the trend may be accelerating."
                  : volatility === "Contracting" ? "Volatility is contracting despite the trend — watch for momentum fatigue."
                  : "Volatility is neutral — trend conditions remain stable.";
    description = `ADX at ${adxR} confirms an active ${dir} trend (|+DI − −DI| = ${diDiff.toFixed(1)} > 5). Trend-following strategies carry higher edge in this environment. ${volNote}`;
  } else if (regime === "Compression") {
    const pctBelow = Math.round((1 - bbWidth / bbAvg) * 100);
    description = `Joint compression: Bollinger Band width is ${pctBelow}% below its 20-bar average AND ATR is ${Math.round((1 - atr14 / Math.max(atrSma, 1e-6)) * 100)}% below its average, with ADX (${adxR}) below trend threshold. True squeeze. Watch for volatility expansion — the initial breakout direction often sets the short-term bias.`;
  } else if (regime === "Expansion") {
    description = `Volatility expansion: BB width is ${Math.round((bbWidth / bbAvg - 1) * 100)}% above its 20-bar average AND ATR ${Math.round((atr14 / Math.max(atrSma, 1e-6) - 1) * 100)}% above its average — but ADX (${adxR}) hasn't confirmed a trend yet. High-volatility post-breakout phase; momentum strategies have edge, trend strategies require confirmation.`;
  } else {
    // Ranging — ADX below 25 OR DI not dominant.
    const diReason = adx >= 25 && diDiff < 5
      ? ` ADX is above 25 but +DI and −DI are too close (|diff| = ${diDiff.toFixed(1)}) — directionless volatility, not a real trend.`
      : "";
    const volNote = volatility === "Expanding" ? " Expanding volatility may signal an emerging breakout."
                  : volatility === "Contracting" ? " Contracting volatility suggests continued consolidation."
                  : "";
    description = `ADX at ${adxR} indicates a directionless, ranging market.${diReason} Price is oscillating without sustained momentum and mean reversion strategies are favoured. Avoid trend entries until ADX rises above 25 with directional confirmation.${volNote}`;
  }
  const headline =
      regime === "StrongTrending" ? `Strong ${dir.charAt(0).toUpperCase() + dir.slice(1)} Trend`
    : regime === "Trending"       ? `${dir.charAt(0).toUpperCase() + dir.slice(1)} Trend Confirmed`
    : regime === "Compression"    ? "Compression — Breakout Watch"
    : regime === "Expansion"      ? "Expansion — Volatility Up, Direction Pending"
    :                                "Ranging — Low Edge Environment";
  return { headline, bullets, description };
}

function RegimePanelBodyImpl({ pair, indicatorTf, expanded, showCandles, onToggleCandles }: { pair: string; indicatorTf: string; expanded?: boolean; showCandles: boolean; onToggleCandles: () => void }) {
  const [liveRows, setLiveRows] = useState<RegimeRow[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    setLoading(true);
    setLiveRows([]);
    getStackCandles(pair, indicatorTf)
      .then(candles => setLiveRows(candles.map(c => ({
        date: c.date, open: c.open, high: c.high, low: c.low, close: c.close,
        adx: c.adx, diPlus: c.di_plus, diMinus: c.di_minus,
        atr14: c.atr14, bbUpper: c.bb_upper, bbLower: c.bb_lower,
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pair, indicatorTf]);

  const rows = liveRows;
  const windowSize = expanded ? 40 : REGIME_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [indicatorTf, pair]);
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
  }, [loading]);

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

  if (loading) return (
    <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>
  );

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
                const rc = d.regime === "StrongTrending" ? "#34d399"
                         : d.regime === "Trending"       ? "#60a5fa"
                         : d.regime === "Compression"    ? "#f59e0b"
                         : d.regime === "Expansion"      ? "#f87171"
                         : "#94a3b8";
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
                  seg.regime === "StrongTrending" ? "rgba(52,211,153,0.10)" :
                  seg.regime === "Trending"       ? "rgba(96,165,250,0.10)" :
                  seg.regime === "Compression"    ? "rgba(245,158,11,0.10)" :
                  seg.regime === "Expansion"      ? "rgba(248,113,113,0.10)" :
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

function CandleContextPanelBodyImpl({ pair, indicatorTf, expanded }: { pair: string; indicatorTf: string; expanded?: boolean }) {
  const [liveRows, setLiveRows] = useState<CandleCtxRow[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    setLoading(true);
    setLiveRows([]);
    getStackCandles(pair, indicatorTf)
      .then(candles => setLiveRows(candles.map(c => ({
        date: c.date, open: c.open, high: c.high, low: c.low, close: c.close,
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pair, indicatorTf]);

  if (loading) return (
    <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>
  );

  const rows = liveRows;
  const candles = rows.slice(-5);
  const patterns = detectCandlePatterns(rows.slice(-12));
  const pipFactor = pair.includes("JPY") ? 100 : 10000;

  const BULL = "#60a5fa";
  const BEAR = "#a78bfa";
  const biasColor = (b: string) => b === "bullish" ? BULL : BEAR;
  const tierColor = (t: number) => t === 1 ? "#fbbf24" : t === 2 ? "#60a5fa" : "#94a3b8";

  const yHigh  = candles.length ? Math.max(...candles.map(c => c.high)) : 1;
  const yLow   = candles.length ? Math.min(...candles.map(c => c.low))  : 0;
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

  const pipOverlay = (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {candles.map((c, i) => {
        const bodyTop = Math.min(c.open, c.close);
        const bodyBot = Math.max(c.open, c.close);
        const upper   = Math.round((c.high   - bodyBot) * pipFactor);
        const lower   = Math.round((bodyTop  - c.low ) * pipFactor);
        const body    = Math.round(Math.abs(c.close - c.open) * pipFactor);
        const leftPct = ((SLOT * i + SLOT / 2) / VB_W) * 100;
        const hPct    = (yPx(c.high) / VB_H) * 100;
        const lPct    = (yPx(c.low ) / VB_H) * 100;
        const bMidPct = ((yPx(c.open) + yPx(c.close)) / 2 / VB_H) * 100;
        const fs      = expanded ? 11 : 8;
        const base: React.CSSProperties = {
          position:   "absolute",
          left:       `${leftPct}%`,
          fontSize:   fs,
          fontWeight: 700,
          whiteSpace: "nowrap",
          lineHeight: 1,
          textShadow: "0 0 3px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,0.95)",
          color:      "var(--text-secondary)",
        };
        return (
          <div key={`pip-${i}`} style={{ display: "contents" }}>
            {upper > 0 && (
              <div style={{ ...base, top: `${hPct}%`, transform: "translate(-50%, -115%)" }}>
                {upper}
              </div>
            )}
            {body > 0 && (
              <div style={{ ...base, top: `${bMidPct}%`, transform: "translate(-50%, -50%)", color: "#ffffff" }}>
                {body}
              </div>
            )}
            {lower > 0 && (
              <div style={{ ...base, top: `${lPct}%`, transform: "translate(-50%, 15%)" }}>
                {lower}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const candleVisual = (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {candleSvg}
      {pipOverlay}
    </div>
  );

  if (!expanded) {
    return (
      <div className="h-full flex overflow-hidden">
        {/* Candles */}
        <div className="flex flex-col" style={{ flex: 1, minWidth: 0, position: "relative" }}>
          <div className="flex-1 min-h-0 px-1 py-1" style={{ position: "relative" }}>{candleVisual}</div>
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
          <div className="flex-1 min-h-0" style={{ position: "relative" }}>{candleVisual}</div>
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

// Deduplicated, briefly cached raw-candle fetch shared by the chart/zone/
// session/8am-box/trendline/pivot live-polling effects in PriceHistoryChart.
// Several of those poll the exact same (pair, tf) on the same cadence (e.g.
// Sessions and 1H Zones both poll 1H every 10s) — without sharing, each is
// an independent uncached OANDA call fired every tick. Same pattern as
// stackCandleCache below, just for the raw (non-indicator) candle command.
const rawCandleCache = new Map<string, { ts: number; promise: Promise<RawCandleTf[]> }>();
// Must exceed the 10s poll cadence used by every consumer above — otherwise
// two effects polling the same (pair, tf) a few seconds apart (mount-time
// drift) each miss the other's cache entry and both fire their own
// uncached OANDA fetch + full candle-array rebuild every cycle, which is
// exactly the sustained per-tick memory/CPU churn this cache exists to
// avoid (see WebView2 "Out of Memory" crashes on long Analytics sessions).
const RAW_CANDLE_TTL_MS = 12_000;
function getLiveCandles(pair: string, tf: string): Promise<RawCandleTf[]> {
  const key = `${pair}:${tf}`;
  const hit = rawCandleCache.get(key);
  if (hit && Date.now() - hit.ts < RAW_CANDLE_TTL_MS) return hit.promise;
  const promise = invoke<RawCandleTf[]>("get_live_candles", { pair, tf });
  rawCandleCache.set(key, { ts: Date.now(), promise });
  promise.catch(() => {
    const cur = rawCandleCache.get(key);
    if (cur && cur.promise === promise) rawCandleCache.delete(key);
  });
  return promise;
}

// One instrument+timeframe candle series, fetched only while `enabled` (a
// toggle button — Supply/Demand zone, Trend Line, Pivot, Sessions, 8am box —
// is on) and cleared to [] the moment it's switched off. Consolidates what
// used to be a hand-rolled useState+useEffect pair repeated ~18 times across
// PriceHistoryChart (one per timeframe per feature) into a single call each.
// pollMs is optional: the Supply/Demand zone, Sessions, and 8am box features
// pass 10_000 so a still-forming candle's O/H/L/C keeps tracking live price;
// the auto Trend Line and Pivot Points features only ever fetch once per
// toggle/pair change (that distinction is intentional and predates this
// hook — preserved exactly, not something to unify away).
function useLiveCandles(pair: string, tf: string, enabled: boolean, pollMs?: number): RawCandleTf[] {
  const [candles, setCandles] = useState<RawCandleTf[]>([]);
  useEffect(() => {
    if (!enabled) { setCandles([]); return; }
    // Switching pair/tf/enabled while a fetch is in flight must not let
    // that superseded fetch's late resolution overwrite the state a NEWER
    // effect run already set — without this, flipping EUR/USD -> GBP/USD
    // could briefly render EUR-priced zones/trend lines on the GBP chart
    // if the EUR fetch happens to resolve after the GBP one.
    let cancelled = false;
    const load = () => getLiveCandles(pair, tf)
      .then(c => { if (!cancelled) setCandles(c); })
      .catch(() => { if (!cancelled) setCandles([]); });
    load();
    if (!pollMs) return () => { cancelled = true; };
    const id = setInterval(load, pollMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [enabled, pair, tf, pollMs]);
  return candles;
}

const STACK_TFS = ["1W", "1D", "4H", "1H", "15M", "5M", "1M"] as const;

// Deduplicated, briefly cached candle fetch shared by every strategy stack panel.
// Each stack panel needs all 7 timeframes; without sharing, N panels fire N×7
// concurrent backend (OANDA) calls on mount — enough to stall app boot on reload.
// Collapsing identical (pair, tf) requests into one in-flight call keeps it to a
// single fetch per timeframe — the "one candle source" rule.
const stackCandleCache = new Map<string, { ts: number; promise: Promise<RawCandleV3[]> }>();
const STACK_CANDLE_TTL_MS = 30_000;

function getStackCandles(pair: string, tf: string): Promise<RawCandleV3[]> {
  const key = `${pair}:${tf}`;
  const hit = stackCandleCache.get(key);
  if (hit && Date.now() - hit.ts < STACK_CANDLE_TTL_MS) return hit.promise;
  const promise = invoke<RawCandleV3[]>("get_live_candles_computed", { pair, tf });
  stackCandleCache.set(key, { ts: Date.now(), promise });
  // Drop failed fetches so the next cycle can retry instead of caching the rejection.
  promise.catch(() => {
    const cur = stackCandleCache.get(key);
    if (cur && cur.promise === promise) stackCandleCache.delete(key);
  });
  return promise;
}

// Shared status light for the strategy stack panels: a solid dot that pulses in
// the given color when active, or sits static-grey when inactive.
function StackLight({ color, pulsing, expanded }: { color: string; pulsing: boolean; expanded?: boolean }) {
  const outer = expanded ? 11 : 9;
  const inner = expanded ? 8 : 7;
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: outer, height: outer, flexShrink: 0 }}>
      {pulsing && <span className="animate-ping absolute inline-flex rounded-full" style={{ width: outer, height: outer, background: color, opacity: 0.5 }} />}
      <span className="relative inline-flex rounded-full" style={{ width: inner, height: inner, background: color }} />
    </span>
  );
}

// Legend explaining how to read a stack panel's lights and colors (expanded view only).
function StackLegend({ bullRule, bearRule, trendRule, consolRule }: { bullRule: string; bearRule: string; trendRule: string; consolRule: string }) {
  return (
    <div style={{ flexShrink: 0, marginTop: 8, paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
      <span style={{ display: "block", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", marginBottom: 8 }}>How to read</span>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 12, rowGap: 6, fontSize: 11, lineHeight: 1.4, alignItems: "baseline" }}>
        <span style={{ color: "#60a5fa", fontWeight: 700, whiteSpace: "nowrap" }}>Bullish</span>
        <span style={{ color: "var(--text-secondary)" }}>{bullRule}</span>
        <span style={{ color: "#a78bfa", fontWeight: 700, whiteSpace: "nowrap" }}>Bearish</span>
        <span style={{ color: "var(--text-secondary)" }}>{bearRule}</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 700, whiteSpace: "nowrap" }}>Trending</span>
        <span style={{ color: "var(--text-secondary)" }}>{trendRule} <span style={{ color: "var(--text-muted)" }}>· pulsing light</span></span>
        <span style={{ color: "var(--text-muted)", fontWeight: 700, whiteSpace: "nowrap" }}>Consolidating</span>
        <span style={{ color: "var(--text-secondary)" }}>{consolRule} <span style={{ color: "var(--text-muted)" }}>· grey light</span></span>
      </div>
    </div>
  );
}

// Direction + trend/consolidation state for one timeframe in a strategy stack panel.
type StackTfState = { dir: "bullish" | "bearish" | "neutral"; cond: "trending" | "consolidating" };

// Shared body for every strategy stack panel: a header tally, a per-timeframe light/label
// row over STACK_TFS, and the expanded legend. Panels differ only in the header label, the
// per-candle compute, and the four legend rules — all passed as props. Consumes the shared
// indicator engine (get_live_candles_computed) via getStackCandles; no UI-side math.
function StackPanelBodyImpl({ pair, expanded, headerLabel, compute, bullRule, bearRule, trendRule, consolRule, labelMinWidth }: {
  pair: string;
  expanded?: boolean;
  headerLabel: string;
  compute: (last: RawCandleV3) => StackTfState;
  bullRule: string;
  bearRule: string;
  trendRule: string;
  consolRule: string;
  labelMinWidth?: boolean;
}) {
  const [states, setStates] = useState<Record<string, StackTfState>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      const next: Record<string, StackTfState> = {};
      await Promise.all(STACK_TFS.map(async tf => {
        try {
          const candles = await getStackCandles(pair, tf);
          const last = candles[candles.length - 1];
          if (!last) return;
          next[tf] = compute(last);
        } catch { /* leave timeframe unset on fetch error */ }
      }));
      if (!cancelled) { setStates(next); setLoading(false); }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [pair, compute]);

  const bulls = STACK_TFS.filter(tf => states[tf]?.dir === "bullish").length;
  const bears = STACK_TFS.filter(tf => states[tf]?.dir === "bearish").length;

  return (
    <div className="flex flex-col h-full" style={{
      padding: expanded ? 16 : 6, gap: expanded ? 8 : 4, minHeight: 0,
      width: "100%", maxWidth: expanded ? 560 : undefined, marginLeft: expanded ? "auto" : undefined, marginRight: expanded ? "auto" : undefined,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexShrink: 0,
        fontSize: expanded ? 12 : 9, fontWeight: 700,
        paddingBottom: expanded ? 6 : 2, borderBottom: "1px solid var(--border-subtle)",
      }}>
        <span style={{ color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{headerLabel}</span>
        <span style={{ color: "#60a5fa" }}>● {bulls}</span>
        <span style={{ color: "#a78bfa" }}>● {bears}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: expanded ? 6 : 2, minHeight: 0 }}>
        {STACK_TFS.map(tf => {
          const st       = states[tf];
          const dir      = st?.dir;
          const trending = st?.cond === "trending";
          const isBull   = dir === "bullish";
          const isBear   = dir === "bearish";
          const dirColor = isBull ? "#60a5fa" : isBear ? "#a78bfa" : "var(--text-muted)";
          const onColor  = trending ? dirColor : "var(--text-muted)";
          const bg       = "rgba(255,255,255,0.04)";
          const border   = "var(--border-subtle)";
          const condWord = trending ? "Trending" : "Consolidating";
          const label    = !dir ? (loading ? "…" : "—") : condWord;
          return (
            <div key={tf} style={{
              flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4,
              padding: expanded ? "0 14px" : "0 6px", borderRadius: 8, background: bg, border: `1px solid ${border}`,
            }}>
              <span style={{ fontSize: expanded ? 14 : 11, fontWeight: 800, letterSpacing: "0.06em", color: "var(--text-secondary)", flexShrink: 0 }}>{tf}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                <StackLight color={onColor} pulsing={trending} expanded={expanded} />
                <span style={{ fontSize: expanded ? 12 : 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: onColor, ...(labelMinWidth ? { minWidth: expanded ? 54 : 44 } : null), textAlign: "right" }}>
                  {label}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      {expanded && (
        <StackLegend bullRule={bullRule} bearRule={bearRule} trendRule={trendRule} consolRule={consolRule} />
      )}
    </div>
  );
}

// MACD Stack — live MACD-vs-signal direction across every timeframe.
const macdStackCompute = (last: RawCandleV3): StackTfState => {
  const dir: StackTfState["dir"] = last.macd > last.macd_signal ? "bullish" : last.macd < last.macd_signal ? "bearish" : "neutral";
  // Trending when MACD and its signal line sit on the same side of the zero line.
  const trending = (last.macd > 0 && last.macd_signal > 0) || (last.macd < 0 && last.macd_signal < 0);
  return { dir, cond: trending ? "trending" : "consolidating" };
};
function MacdStackPanelBodyImpl({ pair, expanded }: { pair: string; expanded?: boolean }) {
  return <StackPanelBody pair={pair} expanded={expanded} headerLabel="vs Signal" compute={macdStackCompute}
    bullRule="MACD line above its signal line" bearRule="MACD line below its signal line"
    trendRule="MACD and signal on the same side of zero" consolRule="MACD and signal straddle the zero line" labelMinWidth />;
}

// EMA 9/20 Stack — live EMA9-vs-EMA20 direction plus price-vs-EMA trend/consolidation, per timeframe.
const emaStackCompute = (last: RawCandleV3): StackTfState => {
  const dir: StackTfState["dir"] = last.ema9 > last.ema20 ? "bullish" : last.ema9 < last.ema20 ? "bearish" : "neutral";
  // Trending when price sits clearly on one side of BOTH EMAs; consolidating when price is between them.
  const trending = (last.close > last.ema9 && last.close > last.ema20) || (last.close < last.ema9 && last.close < last.ema20);
  return { dir, cond: trending ? "trending" : "consolidating" };
};
function EmaStackPanelBodyImpl({ pair, expanded }: { pair: string; expanded?: boolean }) {
  return <StackPanelBody pair={pair} expanded={expanded} headerLabel="9 vs 20" compute={emaStackCompute}
    bullRule="EMA9 above EMA20" bearRule="EMA9 below EMA20"
    trendRule="price above or below both EMAs" consolRule="price between the two EMAs" />;
}

// EMA 50/200 Stack — live EMA50-vs-EMA200 direction plus price-vs-EMA trend/consolidation, per timeframe.
const ema200StackCompute = (last: RawCandleV3): StackTfState => {
  const dir: StackTfState["dir"] = last.ema50 > last.ema200 ? "bullish" : last.ema50 < last.ema200 ? "bearish" : "neutral";
  // Trending when price sits clearly on one side of BOTH EMAs; consolidating when price is between them.
  const trending = (last.close > last.ema50 && last.close > last.ema200) || (last.close < last.ema50 && last.close < last.ema200);
  return { dir, cond: trending ? "trending" : "consolidating" };
};
function Ema200StackPanelBodyImpl({ pair, expanded }: { pair: string; expanded?: boolean }) {
  return <StackPanelBody pair={pair} expanded={expanded} headerLabel="50 vs 200" compute={ema200StackCompute}
    bullRule="EMA50 above EMA200" bearRule="EMA50 below EMA200"
    trendRule="price above or below both EMAs" consolRule="price between the two EMAs" />;
}

// ADX Stack — live +DI/−DI direction plus ADX trend-strength state, per timeframe.
const adxStackCompute = (last: RawCandleV3): StackTfState => {
  const dir: StackTfState["dir"] = last.di_plus > last.di_minus ? "bullish" : last.di_plus < last.di_minus ? "bearish" : "neutral";
  // Trending when ADX confirms trend strength (>= 25); consolidating below that.
  const trending = last.adx >= 25;
  return { dir, cond: trending ? "trending" : "consolidating" };
};
function AdxStackPanelBodyImpl({ pair, expanded }: { pair: string; expanded?: boolean }) {
  return <StackPanelBody pair={pair} expanded={expanded} headerLabel="DI / ADX" compute={adxStackCompute}
    bullRule="+DI above −DI" bearRule="−DI above +DI"
    trendRule="ADX at or above 25" consolRule="ADX below 25" />;
}

// RSI Stack — live RSI-14 momentum direction plus trending/consolidating state, per timeframe.
const rsiStackCompute = (last: RawCandleV3): StackTfState => {
  const dir: StackTfState["dir"] = last.rsi14 > 50 ? "bullish" : last.rsi14 < 50 ? "bearish" : "neutral";
  // Trending when RSI holds a momentum band (>= 60 or <= 40); consolidating when it hugs the midline.
  const trending = last.rsi14 >= 60 || last.rsi14 <= 40;
  return { dir, cond: trending ? "trending" : "consolidating" };
};
function RsiStackPanelBodyImpl({ pair, expanded }: { pair: string; expanded?: boolean }) {
  return <StackPanelBody pair={pair} expanded={expanded} headerLabel="RSI 14" compute={rsiStackCompute}
    bullRule="RSI above 50" bearRule="RSI below 50"
    trendRule="RSI at or beyond 60 / 40" consolRule="RSI between 40 and 60" />;
}

// Squeeze Stack — live volatility squeeze state (Bollinger inside Keltner) plus break direction, per timeframe.
const squeezeStackCompute = (last: RawCandleV3): StackTfState => {
  const dir: StackTfState["dir"] = last.close > last.bb_middle ? "bullish" : last.close < last.bb_middle ? "bearish" : "neutral";
  // Squeeze ON (Bollinger inside Keltner) = consolidating; bands released outside KC = trending.
  const squeezeOn = last.bb_upper <= last.keltner_upper && last.bb_lower >= last.keltner_lower;
  return { dir, cond: squeezeOn ? "consolidating" : "trending" };
};
function SqueezeStackPanelBodyImpl({ pair, expanded }: { pair: string; expanded?: boolean }) {
  return <StackPanelBody pair={pair} expanded={expanded} headerLabel="Squeeze" compute={squeezeStackCompute}
    bullRule="price above Bollinger basis" bearRule="price below Bollinger basis"
    trendRule="Bollinger bands outside Keltner (released)" consolRule="Bollinger bands inside Keltner (in squeeze)" />;
}

// CCI Stack — live CCI direction plus trending/ranging state, per timeframe.
const cciStackCompute = (last: RawCandleV3): StackTfState => {
  const dir: StackTfState["dir"] = last.cci > 0 ? "bullish" : last.cci < 0 ? "bearish" : "neutral";
  // Trending when CCI is beyond ±100 (classic strong-trend reading); ranging within the band.
  const trending = Math.abs(last.cci) > 100;
  return { dir, cond: trending ? "trending" : "consolidating" };
};
function CciStackPanelBodyImpl({ pair, expanded }: { pair: string; expanded?: boolean }) {
  return <StackPanelBody pair={pair} expanded={expanded} headerLabel="CCI" compute={cciStackCompute}
    bullRule="CCI above 0" bearRule="CCI below 0"
    trendRule="CCI beyond ±100" consolRule="CCI within ±100" />;
}

// Market Structure Stack — multi-timeframe swing-structure bias via the shared
// computeMarketStructure engine: HH/HL = bullish, LH/LL = bearish, Range/Shifting = consolidating.
// Reuses the deduped getStackCandles fetch and the shared structure engine; no UI-side math.
function MarketStructureStackPanelBodyImpl({ pair, expanded }: { pair: string; expanded?: boolean }) {
  type TfState = { dir: "bullish" | "bearish" | "neutral"; cond: "trending" | "consolidating" };
  const [states, setStates] = useState<Record<string, TfState>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      const next: Record<string, TfState> = {};
      await Promise.all(STACK_TFS.map(async tf => {
        try {
          const candles = await getStackCandles(pair, tf);
          if (candles.length === 0) return;
          const rows: MsRow[] = candles.map(c => ({ date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, atr14: c.atr14 }));
          const { state } = computeMarketStructure(rows);
          if (state === "Strong Bullish" || state === "Bullish")      next[tf] = { dir: "bullish", cond: "trending" };
          else if (state === "Strong Bearish" || state === "Bearish") next[tf] = { dir: "bearish", cond: "trending" };
          else                                                        next[tf] = { dir: "neutral", cond: "consolidating" }; // Range / Shifting
        } catch { /* leave timeframe unset on fetch error */ }
      }));
      if (!cancelled) { setStates(next); setLoading(false); }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [pair]);

  const bulls = STACK_TFS.filter(tf => states[tf]?.dir === "bullish").length;
  const bears = STACK_TFS.filter(tf => states[tf]?.dir === "bearish").length;

  return (
    <div className="flex flex-col h-full" style={{
      padding: expanded ? 16 : 6, gap: expanded ? 8 : 4, minHeight: 0,
      width: "100%", maxWidth: expanded ? 560 : undefined, marginLeft: expanded ? "auto" : undefined, marginRight: expanded ? "auto" : undefined,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexShrink: 0,
        fontSize: expanded ? 12 : 9, fontWeight: 700,
        paddingBottom: expanded ? 6 : 2, borderBottom: "1px solid var(--border-subtle)",
      }}>
        <span style={{ color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Structure</span>
        <span style={{ color: "#60a5fa" }}>● {bulls}</span>
        <span style={{ color: "#a78bfa" }}>● {bears}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: expanded ? 6 : 2, minHeight: 0 }}>
        {STACK_TFS.map(tf => {
          const st       = states[tf];
          const dir      = st?.dir;
          const cond     = st?.cond;
          const trending = cond === "trending";
          const isBull   = dir === "bullish";
          const isBear   = dir === "bearish";
          const dirColor = isBull ? "#60a5fa" : isBear ? "#a78bfa" : "var(--text-muted)";
          const onColor  = trending ? dirColor : "var(--text-muted)";
          const bg       = "rgba(255,255,255,0.04)";
          const border   = "var(--border-subtle)";
          const condWord = cond === "trending" ? "Trending" : cond === "consolidating" ? "Consolidating" : "";
          const label    = !dir ? (loading ? "…" : "—") : condWord;
          return (
            <div key={tf} style={{
              flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4,
              padding: expanded ? "0 14px" : "0 6px", borderRadius: 8, background: bg, border: `1px solid ${border}`,
            }}>
              <span style={{ fontSize: expanded ? 14 : 11, fontWeight: 800, letterSpacing: "0.06em", color: "var(--text-secondary)", flexShrink: 0 }}>{tf}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                <StackLight color={onColor} pulsing={trending} expanded={expanded} />
                <span style={{ fontSize: expanded ? 12 : 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: onColor, textAlign: "right" }}>
                  {label}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      {expanded && (
        <StackLegend
          bullRule="higher highs & higher lows (HH/HL)"
          bearRule="lower highs & lower lows (LH/LL)"
          trendRule="clean HH/HL or LH/LL structure"
          consolRule="range or character shift (CHoCH)"
        />
      )}
    </div>
  );
}

function BlankPanel({ area, label, style, onExpand, badge, subtitle, subtitle2, children,
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

function formatCalendarDayHeading(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Unknown Date";
    return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  } catch { return "Unknown Date"; }
}

function formatCalendarTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}

const CALENDAR_IMPACTS = ["High", "Medium", "Low"] as const;
type CalendarImpact = typeof CALENDAR_IMPACTS[number];
const IMPACT_COLORS: Record<string, string> = {
  High: "#ef4444", Medium: "#f59e0b", Low: "#6b7280", Holiday: "#3b82f6",
};

// FTMO's restricted-news list (https://ftmo.com/en/faq/can-i-trade-news/) is
// NOT the same set as ForexFactory's generic "High" impact flag — it's a
// specific subset of releases per currency that FTMO bars trading within 2
// minutes before/after. Keep these two concepts separate: "impact" is
// ForexFactory's own classification, "restricted" is FTMO's trading rule.
const RESTRICTED_EVENT_KEYWORDS: Record<string, string[]> = {
  USD: [
    "federal funds rate", "fomc statement", "fomc meeting minutes", "fomc press conference",
    "non-farm employment change", "unemployment rate", "average hourly earnings",
    "advance gdp", "cpi y/y", "crude oil inventories",
  ],
  EUR: ["main refinancing rate", "ecb press conference", "monetary policy statement"],
  GBP: ["official bank rate", "mpc", "cpi y/y"],
  CAD: ["overnight rate", "boc rate statement", "cpi m/m", "employment change", "unemployment rate"],
  AUD: ["cash rate", "rba rate statement", "rba monetary policy statement", "employment change", "unemployment rate", "cpi m/m", "cpi q/q", "cpi y/y", "gdp q/q"],
  NZD: ["official cash rate", "rbnz rate statement", "employment change", "unemployment rate", "cpi q/q", "gdp q/q"],
  CHF: ["snb policy rate"],
};

function isFtmoRestricted(ev: EconomicEvent): boolean {
  const keywords = RESTRICTED_EVENT_KEYWORDS[ev.country?.toUpperCase()];
  if (!keywords) return false;
  const title = ev.title.toLowerCase();
  return keywords.some(kw => title.includes(kw));
}

function EconomicCalendarPanelImpl({ events, loading, impactFilter, restrictedOnly, filterByInstrument, pair }: {
  events: EconomicEvent[]; loading: boolean; impactFilter: Set<CalendarImpact>; restrictedOnly: boolean;
  filterByInstrument: boolean; pair: string;
}) {
  const pairCurrencies = relevantNewsCurrencies(pair);
  // Restricted Events Only bypasses the impact checkboxes rather than
  // AND-ing with them — restricted events span High and Low impact (e.g.
  // Crude Oil Inventories is Low), so requiring the matching impact box to
  // also be checked made it trivially easy to filter restricted events out
  // by accident.
  const calendarHorizonMs = Date.now() + 9 * 24 * 60 * 60 * 1000;
  const filtered = events.filter(ev => {
    const evTime = new Date(ev.date).getTime();
    return (!isNaN(evTime) && evTime >= Date.now() && evTime <= calendarHorizonMs)
      && (restrictedOnly
        ? isFtmoRestricted(ev)
        : (!(CALENDAR_IMPACTS as readonly string[]).includes(ev.impact) || impactFilter.has(ev.impact as CalendarImpact)))
      && (!filterByInstrument || pairCurrencies.includes(ev.country?.toUpperCase()));
  });

  // Group consecutive same-day events under one heading — events arrive
  // already sorted chronologically, so a day's events are always contiguous.
  // Each entry keeps ev's original `filtered` index so the restricted-run
  // border logic below (which looks at filtered[i-1]/[i+1]) is unaffected.
  const dayGroups: { key: string; heading: string; items: { ev: EconomicEvent; i: number }[] }[] = [];
  filtered.forEach((ev, i) => {
    const key = new Date(ev.date).toDateString();
    const last = dayGroups[dayGroups.length - 1];
    if (last && last.key === key) last.items.push({ ev, i });
    else dayGroups.push({ key, heading: formatCalendarDayHeading(ev.date), items: [{ ev, i }] });
  });

  return (
    <div style={{ height: "100%", overflowY: "auto", paddingBottom: 4 }}>
        {filtered.length === 0 && !loading && (
          <div style={{ padding: "20px 12px", fontSize: 11, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.5 }}>
            No calendar events loaded.<br />Check network access.
          </div>
        )}
        {dayGroups.map((group, gi) => {
          // Alternating soft tint per day, distinct from the sticky heading's
          // own (slightly stronger) shade, so consecutive days read as
          // separate blocks instead of blending into one continuous list.
          const dayShade = gi % 2 === 1 ? "rgba(255,255,255,0.035)" : "transparent";
          const isToday = group.key === new Date().toDateString();
          // Solid + noticeably lighter than the panel bg so this reads as a
          // header, not just another row. Must stay fully opaque (no alpha)
          // — it's position:sticky, so a translucent background would let
          // the row scrolling underneath bleed through and garble the text.
          const headingShade = "var(--bg-hover)";
          return (
          <div key={group.key} style={{ background: dayShade }}>
            <div style={{
              position: "sticky", top: 0, zIndex: 1, padding: "6px 10px",
              fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em",
              color: isToday ? "#eab308" : "var(--text-primary)", background: headingShade,
              borderBottom: "1px solid var(--border-strong)",
            }}>
              {group.heading}
            </div>
            {group.items.map(({ ev, i }) => {
          const prohibited = isFtmoRestricted(ev);
          // Restricted *and* on a currency actually in the instrument being
          // viewed — a stronger cue than the generic left-border accent
          // below, which just marks "restricted somewhere."
          const affectsInstrument = prohibited && pairCurrencies.includes(ev.country?.toUpperCase());
          // Consecutive highlighted rows read as one group with a single
          // border around the whole run, not a border per row — only the
          // outer edges of the run get the red border.
          const prevAffects = i > 0 && isFtmoRestricted(filtered[i - 1]) && pairCurrencies.includes(filtered[i - 1].country?.toUpperCase());
          const nextAffects = i < filtered.length - 1 && isFtmoRestricted(filtered[i + 1]) && pairCurrencies.includes(filtered[i + 1].country?.toUpperCase());
          const isGroupStart = affectsInstrument && !prevAffects;
          const isGroupEnd   = affectsInstrument && !nextAffects;
          // The dark/muted greys used everywhere else lose all contrast
          // against the red highlight, so a highlighted row swaps them for
          // near-white instead of reusing the theme's low-contrast tones.
          const color = affectsInstrument ? "#ffffff" : (IMPACT_COLORS[ev.impact] ?? "var(--text-muted)");
          const mutedColor     = affectsInstrument ? "rgba(255,255,255,0.75)" : "var(--text-muted)";
          const secondaryColor = affectsInstrument ? "#ffffff" : "var(--text-secondary)";
          return (
            <div key={i} style={{
              display: "flex", flexDirection: "column", gap: 3, padding: "8px 10px",
              borderLeft: affectsInstrument ? "1px solid #ef4444" : "none",
              borderRight: affectsInstrument ? "1px solid #ef4444" : "none",
              borderTop: isGroupStart ? "1px solid #ef4444" : "none",
              borderBottom: isGroupEnd ? "1px solid #ef4444" : (i < filtered.length - 1 ? "1px solid var(--border-subtle)" : "none"),
              borderTopLeftRadius: isGroupStart ? 6 : 0,
              borderTopRightRadius: isGroupStart ? 6 : 0,
              borderBottomLeftRadius: isGroupEnd ? 6 : 0,
              borderBottomRightRadius: isGroupEnd ? 6 : 0,
              background: affectsInstrument ? "rgba(239,68,68,0.32)" : "transparent",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#ffffff" }}>{ev.country}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {ev.impact}
                </span>
                {prohibited && (
                  <span
                    title="FTMO: no trading within 2 minutes before/after this release"
                    style={{
                      fontSize: 8, fontWeight: 800, color: "#ef4444", background: "#ef444422",
                      border: "1px solid #ef444455", borderRadius: 4, padding: "1px 5px",
                      textTransform: "uppercase", letterSpacing: "0.05em", marginLeft: "auto",
                    }}
                  >
                    Restricted Event
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.3 }}>
                {ev.title}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 10, color: mutedColor }}>
                <span>{formatCalendarTime(ev.date)}</span>
                {ev.forecast && <span>Forecast: <b style={{ color: secondaryColor }}>{ev.forecast}</b></span>}
                {ev.previous && <span>Previous: <b style={{ color: secondaryColor }}>{ev.previous}</b></span>}
              </div>
            </div>
          );
            })}
          </div>
          );
        })}
    </div>
  );
}
// Parent re-renders every 5s (livePrice tick); without memo this re-ran the
// events.filter()/day-grouping pass every tick even though calendarEvents
// itself only changes on a much slower cadence.
const EconomicCalendarPanel = memo(EconomicCalendarPanelImpl);

function NewsAndCalendarPanelImpl({
  news, newsLoading, pair, calendarEvents, calendarLoading,
}: {
  news: NewsArticle[]; newsLoading: boolean; pair: string;
  calendarEvents: EconomicEvent[]; calendarLoading: boolean;
}) {
  const [tab, setTab] = useState<"news" | "calendar">("calendar");

  const [impactFilter, setImpactFilter] = useState<Set<CalendarImpact>>(new Set(["High"]));
  const toggleImpact = (imp: CalendarImpact) => setImpactFilter(prev => {
    const next = new Set(prev);
    if (next.has(imp)) next.delete(imp); else next.add(imp);
    return next;
  });
  const [restrictedOnly, setRestrictedOnly] = useState(false);
  const [filterByInstrument, setFilterByInstrument] = useState(false);

  // Settings popover (impact filter) — portaled + fixed-positioned like the
  // Reversal/Indicators popovers. Lives in the tab strip so it's in line with
  // the News/Economic Calendar tabs; only shown while the calendar tab is active.
  const [showSettings, setShowSettings] = useState(false);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const settingsPopoverRef = useRef<HTMLDivElement>(null);
  const [settingsPos, setSettingsPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => { setShowSettings(false); }, [tab]);

  useEffect(() => {
    if (!showSettings) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideButton  = settingsBtnRef.current?.contains(target);
      const insidePopover = settingsPopoverRef.current?.contains(target);
      if (!insideButton && !insidePopover) setShowSettings(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showSettings]);

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      borderRadius: 12, background: "var(--bg-panel)", border: "1px solid var(--border-medium)",
      overflow: "hidden",
    }}>
      {/* Tab strip — integrated header of the panel, not a separate floating row */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, padding: "6px 8px 0" }}>
        {(["news", "calendar"] as const).map(t => {
          const active = tab === t;
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              fontSize: 9, fontWeight: 700, padding: "6px 10px",
              textTransform: "uppercase", letterSpacing: "0.08em",
              background: "transparent", border: "none",
              borderBottom: active ? "2px solid var(--accent-text)" : "2px solid transparent",
              color: active ? "var(--accent-text)" : "var(--text-muted)",
              cursor: "pointer", marginBottom: -1,
            }}>
              {t === "news" ? "News" : "Economic Calendar"}
            </button>
          );
        })}
        {tab === "calendar" && (
          <button
            ref={settingsBtnRef}
            onClick={() => {
              const rect = settingsBtnRef.current?.getBoundingClientRect();
              if (rect) setSettingsPos({ top: rect.bottom + 6, left: rect.right - 200 });
              setShowSettings(v => !v);
            }}
            title="Economic calendar settings"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 22, height: 22, padding: 0, marginLeft: "auto", marginBottom: 4,
              background: showSettings ? "var(--accent-dim)" : "transparent",
              border:     showSettings ? "1px solid var(--accent-border)" : "1px solid transparent",
              borderRadius: 6, color: showSettings ? "var(--accent-text)" : "var(--text-muted)", cursor: "pointer",
            }}
          >
            <Settings size={13} />
          </button>
        )}
      </div>
      {showSettings && settingsPos && createPortal(
        <div ref={settingsPopoverRef} style={{
          position: "fixed", top: settingsPos.top, left: settingsPos.left, zIndex: 1000,
          background: "var(--bg-panel)", border: "1px solid var(--border-medium)",
          borderRadius: 10, padding: "10px 12px", width: 200,
          boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em",
            color: "var(--text-muted)", marginBottom: 8 }}>
            News Impact Filter
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {CALENDAR_IMPACTS.map(imp => {
              const on = impactFilter.has(imp);
              const color = IMPACT_COLORS[imp];
              return (
                <button key={imp} onClick={() => toggleImpact(imp)} style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  background: "none", border: "none", padding: "4px 2px", cursor: "pointer", textAlign: "left",
                }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                    border: `2px solid ${color}`, background: on ? color : "transparent",
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: on ? "var(--text-primary)" : "var(--text-secondary)" }}>
                    {imp} Impact
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ height: 1, background: "var(--border-medium)", margin: "10px 0 8px" }} />
          <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em",
            color: "var(--text-muted)", marginBottom: 8 }}>
            FTMO Trading Restriction
          </div>
          <button onClick={() => setRestrictedOnly(v => !v)} style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            background: "none", border: "none", padding: "4px 2px", cursor: "pointer", textAlign: "left",
          }}>
            <span style={{
              width: 14, height: 14, borderRadius: 3, flexShrink: 0,
              border: "2px solid #ef4444", background: restrictedOnly ? "#ef4444" : "transparent",
            }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: restrictedOnly ? "var(--text-primary)" : "var(--text-secondary)" }}>
              Restricted Events Only
            </span>
          </button>
          <div style={{ height: 1, background: "var(--border-medium)", margin: "10px 0 8px" }} />
          <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em",
            color: "var(--text-muted)", marginBottom: 8 }}>
            Instrument
          </div>
          <button onClick={() => setFilterByInstrument(v => !v)} style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            background: "none", border: "none", padding: "4px 2px", cursor: "pointer", textAlign: "left",
          }}>
            <span style={{
              width: 14, height: 14, borderRadius: 3, flexShrink: 0,
              border: "2px solid var(--accent-text)", background: filterByInstrument ? "var(--accent-text)" : "transparent",
            }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: filterByInstrument ? "var(--text-primary)" : "var(--text-secondary)" }}>
              Filter by Current Instrument ({pair})
            </span>
          </button>
        </div>,
        document.body
      )}
      <div style={{ flex: 1, minHeight: 0, borderTop: "1px solid var(--border-medium)" }}>
        {tab === "news"
          ? <ForexNewsPanel news={news} loading={newsLoading} pair={pair} />
          : <EconomicCalendarPanel events={calendarEvents} loading={calendarLoading} impactFilter={impactFilter} restrictedOnly={restrictedOnly} filterByInstrument={filterByInstrument} pair={pair} />}
      </div>
    </div>
  );
}
// Same rationale as EconomicCalendarPanel above — parent re-renders on every
// 5s livePrice tick, this only needs to re-render when news/calendar data or
// the active tab/pair actually change.
const NewsAndCalendarPanel = memo(NewsAndCalendarPanelImpl);

function ForexNewsPanel({ news, loading, pair }: { news: NewsArticle[]; loading: boolean; pair: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
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
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.4, marginBottom: 4 }}>
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
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8,
        padding: "5px 10px", borderTop: "1px solid var(--border-light)", flexShrink: 0,
      }}>
        {loading && (
          <span style={{ fontSize: 9, color: "var(--text-muted)" }}>Updating…</span>
        )}
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>
          Live News · {pair}
        </span>
      </div>
    </div>
  );
}

// Memoized panel bodies: the parent (AnalyticsV3) re-renders on every 5s live-price
// tick, 10s alert-status poll, and 60s alert-eval cycle. Without memo, every chart
// panel below re-executes and its Recharts tree gets torn down/rebuilt on each tick
// even though its own props didn't change.
const PricePanelBody               = memo(PricePanelBodyImpl);
const MacdPanelBody                = memo(MacdPanelBodyImpl);
const RsiPanelBody                 = memo(RsiPanelBodyImpl);
const Rsi14PanelBody               = memo(Rsi14PanelBodyImpl);
const MaPanelBody                  = memo(MaPanelBodyImpl);
const AdxPanelBody                 = memo(AdxPanelBodyImpl);
const IchiPanelBody                = memo(IchiPanelBodyImpl);
const SessionPanelBody             = memo(SessionPanelBodyImpl);
const AvgPricePanelBody            = memo(AvgPricePanelBodyImpl);
const RocPanelBody                 = memo(RocPanelBodyImpl);
const AtrPanelBody                 = memo(AtrPanelBodyImpl);
const SqueezePanelBody             = memo(SqueezePanelBodyImpl);
const FailureSwingPanelBody        = memo(FailureSwingPanelBodyImpl);
const MarketStructurePanelBody     = memo(MarketStructurePanelBodyImpl);
const VolatilityPanelBody          = memo(VolatilityPanelBodyImpl);
const CciPanelBody                 = memo(CciPanelBodyImpl);
const WrPanelBody                  = memo(WrPanelBodyImpl);
const PivotPanelBody               = memo(PivotPanelBodyImpl);
const VolumePanelBody              = memo(VolumePanelBodyImpl);
const KeltPanelBody                = memo(KeltPanelBodyImpl);
const AiSynthesisPanelBody         = memo(AiSynthesisPanelBodyImpl);
const RegimePanelBody              = memo(RegimePanelBodyImpl);
const CandleContextPanelBody       = memo(CandleContextPanelBodyImpl);
const StackPanelBody               = memo(StackPanelBodyImpl);
const MacdStackPanelBody           = memo(MacdStackPanelBodyImpl);
const EmaStackPanelBody            = memo(EmaStackPanelBodyImpl);
const Ema200StackPanelBody         = memo(Ema200StackPanelBodyImpl);
const AdxStackPanelBody            = memo(AdxStackPanelBodyImpl);
const RsiStackPanelBody            = memo(RsiStackPanelBodyImpl);
const SqueezeStackPanelBody        = memo(SqueezeStackPanelBodyImpl);
const CciStackPanelBody            = memo(CciStackPanelBodyImpl);
const MarketStructureStackPanelBody = memo(MarketStructureStackPanelBodyImpl);

// Quad View default confirmation set — per primary instrument, which 3
// other instruments best corroborate whether a move is broad/genuine rather
// than isolated noise (see toggleQuadView). Covers every instrument in
// ALL_ASSETS. General method per category:
//  - FX crosses: the base currency's own USD pair, the quote currency's own
//    USD pair (so a XXX/YYY move can be attributed to XXX strength, YYY
//    weakness, or both), plus one macro proxy (gold for risk/safe-haven
//    currencies, oil for CAD, US10Y for rate-sensitive JPY/CHF/majors).
//  - USD majors: two other USD majors/proxies plus US10Y (the core USD rate driver).
//  - Indices: the other two comparable indices (same country/region) plus a
//    macro driver (US10Y for US indices, the relevant local FX pair for
//    non-US ones).
//  - Rates: the neighboring points on the yield curve plus gold (the classic
//    inverse-of-real-yields hedge).
//  - Commodities: the closest sibling commodity plus a currency/index proxy
//    tied to that commodity's usual driver (oil->CAD, copper->AUD/China).
//  - Crypto: BTC/ETH as the market-wide anchors plus a growth-asset proxy (US100/US10Y).
const QUAD_CONFIRMATION_SET: Record<string, [string, string, string]> = {
  // ── Forex ──
  "AUD/CAD": ["AUD/USD", "USD/CAD", "XAU/USD"],
  "AUD/CHF": ["AUD/USD", "USD/CHF", "XAU/USD"],
  "AUD/JPY": ["AUD/USD", "USD/JPY", "US100"],
  "AUD/NZD": ["AUD/USD", "NZD/USD", "XAU/USD"],
  "AUD/USD": ["EUR/USD", "XAU/USD", "US10Y"],
  "CAD/CHF": ["USD/CAD", "USD/CHF", "USOIL"],
  "CAD/JPY": ["USD/CAD", "USD/JPY", "USOIL"],
  "CHF/JPY": ["USD/CHF", "USD/JPY", "XAU/USD"],
  "EUR/AUD": ["EUR/USD", "AUD/USD", "XAU/USD"],
  "EUR/CAD": ["EUR/USD", "USD/CAD", "USOIL"],
  "EUR/CHF": ["EUR/USD", "USD/CHF", "US10Y"],
  "EUR/GBP": ["EUR/USD", "GBP/USD", "DE30"],
  "EUR/JPY": ["EUR/USD", "USD/JPY", "US10Y"],
  "EUR/NZD": ["EUR/USD", "NZD/USD", "XAU/USD"],
  "EUR/USD": ["GBP/USD", "USD/JPY", "US10Y"],
  "GBP/AUD": ["GBP/USD", "AUD/USD", "XAU/USD"],
  "GBP/CAD": ["GBP/USD", "USD/CAD", "USOIL"],
  "GBP/CHF": ["GBP/USD", "USD/CHF", "US10Y"],
  "GBP/JPY": ["GBP/USD", "USD/JPY", "US100"],
  "GBP/NZD": ["GBP/USD", "NZD/USD", "XAU/USD"],
  "GBP/USD": ["EUR/USD", "USD/JPY", "US10Y"],
  "NZD/CAD": ["NZD/USD", "USD/CAD", "XAU/USD"],
  "NZD/CHF": ["NZD/USD", "USD/CHF", "XAU/USD"],
  "NZD/JPY": ["NZD/USD", "USD/JPY", "US100"],
  "NZD/USD": ["AUD/USD", "XAU/USD", "US10Y"],
  "USD/CAD": ["USOIL", "EUR/USD", "US10Y"],
  "USD/CHF": ["EUR/USD", "XAU/USD", "US10Y"],
  "USD/JPY": ["US10Y", "EUR/USD", "US100"],
  "USD/MXN": ["USOIL", "US10Y", "EUR/USD"],
  "USD/SEK": ["EUR/USD", "US10Y", "DE30"],
  "USD/ZAR": ["XAU/USD", "US10Y", "EUR/USD"],
  // ── Indices ──
  US30:  ["US100", "US500", "US10Y"],
  US100: ["US30", "US500", "US10Y"],
  US500: ["US100", "US30", "US10Y"], // Nasdaq + Dow for cross-index breadth, 10Y yield for the rates driver
  DE30:  ["EU50", "UK100", "EUR/USD"],
  UK100: ["DE30", "EU50", "GBP/USD"],
  FR40:  ["DE30", "EU50", "EUR/USD"],
  EU50:  ["DE30", "FR40", "EUR/USD"],
  JP225: ["US100", "USD/JPY", "US10Y"],
  HK33:  ["US100", "AUD/USD", "XCU/USD"], // China-growth proxies
  AU200: ["AUD/USD", "XAU/USD", "US100"],
  // ── Rates ──
  US02Y: ["US10Y", "US30Y", "XAU/USD"],
  US05Y: ["US02Y", "US10Y", "XAU/USD"],
  US10Y: ["US02Y", "US30Y", "US500"],
  US30Y: ["US10Y", "US02Y", "XAU/USD"],
  // ── Commodities ──
  "XAU/USD": ["XAG/USD", "US10Y", "USD/JPY"],
  "XAG/USD": ["XAU/USD", "XCU/USD", "US10Y"],
  USOIL:     ["NATGAS", "USD/CAD", "XAU/USD"],
  "XCU/USD": ["USOIL", "AUD/USD", "HK33"],
  "XPT/USD": ["XAU/USD", "XPD/USD", "XAG/USD"],
  "XPD/USD": ["XPT/USD", "XAU/USD", "XCU/USD"],
  NATGAS:    ["USOIL", "USD/CAD", "XAU/USD"],
  // ── Crypto ──
  "BTC/USD":  ["ETH/USD", "US100", "US10Y"],
  "ETH/USD":  ["BTC/USD", "SOL/USD", "US100"],
  "SOL/USD":  ["BTC/USD", "ETH/USD", "US100"],
  "XRP/USD":  ["BTC/USD", "ETH/USD", "BNB/USD"],
  "BNB/USD":  ["BTC/USD", "ETH/USD", "SOL/USD"],
  "DOGE/USD": ["BTC/USD", "ETH/USD", "XRP/USD"],
};

export function AnalyticsV3() {
  const { analysisResult, sheetRows } = useAnalytics();
  const [, setError]       = useState<string | null>(null);
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);
  // Lets a Sidebar favorite click switch this page to the requested pair
  // without prop-drilling through AppShell. AppShell actually unmounts this
  // page on every navigation away, so a favorite clicked from elsewhere
  // mounts a fresh instance — consume() picks up that request even though
  // it was dispatched before this component (and its subscribe below,
  // which only covers a favorite clicked while already on this page) existed.
  const [selectedPair, setSelectedPair] = useState(() => pairSelectionEvents.consume() ?? getLastChartSelection()?.pair ?? "EUR/USD");
  const [aisRowCollapsed, setAisRowCollapsed] = useState(true);
  const [belowChartCollapsed, setBelowChartCollapsed] = useState(false);
  const [rightOfChartCollapsed, setRightOfChartCollapsed] = useState(false);
  // Quad View state declared here (rather than down by the rest of the Quad
  // View logic below) so the "effective collapsed" derivations right after
  // it can see it — Quad View always forces every panel around the chart
  // hidden, regardless of these three booleans' own persisted values (see
  // effectiveAisRowCollapsed etc.).
  const [quadView, setQuadView] = useState(false);
  const allPanelsCollapsed = aisRowCollapsed && belowChartCollapsed && rightOfChartCollapsed;
  // "Effective" — what the layout should actually behave as, folding in
  // Quad View's always-collapsed requirement on top of the raw toggle state.
  // Using these (not the raw booleans) for every SIZING calculation below
  // means the "collapse panels around chart" button can't desync the quad
  // grid's dimensions even if something still flips the raw state while
  // Quad View is active.
  const effectiveAisRowCollapsed      = quadView || aisRowCollapsed;
  const effectiveBelowChartCollapsed  = quadView || belowChartCollapsed;
  const effectiveRightOfChartCollapsed = quadView || rightOfChartCollapsed;
  // The AI Synthesis/Alerts row is a fixed 160px block + 10px padding-bottom.
  // Collapsing it should grow the chart by exactly that freed height. It
  // can't be done via flex-grow on the chart row (like belowChartCollapsed
  // does) because the below-chart panels sibling is still mounted and
  // doesn't shrink — competing for space that way collapses the chart to 0.
  const chartHeightBoost = effectiveAisRowCollapsed ? 170 : 0;

  // News/Calendar panel must bottom-align with the chart regardless of the
  // chart's actual rendered height (fixed 480/+boost, or 100% when
  // belowChartCollapsed) — measured via ResizeObserver rather than computed
  // from font/line-height assumptions, since CSS percentage-height can't
  // cross the chart-row's own content-driven (auto) height cleanly.
  const [chartColHeight, setChartColHeight] = useState<number | null>(null);
  const [rightPanelHeaderHeight, setRightPanelHeaderHeight] = useState<number | null>(null);
  // Callback ref, not useRef+useEffect: this node is gated behind
  // sheetRows.length > 0 (async data load) as well as rightOfChartCollapsed,
  // so a dependency-array effect can miss the moment it first mounts. A
  // callback ref fires exactly when the node attaches/detaches, whatever
  // the reason, so the observer never misses it.
  const rightPanelHeaderObsRef = useRef<ResizeObserver | null>(null);
  const rightPanelHeaderRef = useCallback((el: HTMLDivElement | null) => {
    rightPanelHeaderObsRef.current?.disconnect();
    rightPanelHeaderObsRef.current = null;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setRightPanelHeaderHeight(entry.contentRect.height));
    ro.observe(el);
    rightPanelHeaderObsRef.current = ro;
  }, []);
  const newsBoxHeight = chartColHeight != null && rightPanelHeaderHeight != null
    ? Math.max(120, chartColHeight - rightPanelHeaderHeight)
    : 338;

  const toggleAllPanels = useCallback(() => {
    const collapse = !allPanelsCollapsed;
    setAisRowCollapsed(collapse);
    setBelowChartCollapsed(collapse);
    setRightOfChartCollapsed(collapse);
    sidebarEvents.setCollapsed(collapse);
  }, [allPanelsCollapsed]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [toasts, setToasts] = useState<AlertToast[]>([]);
  const seenStatuses = useRef<Record<string, string>>({});
  const [newsItems, setNewsItems]     = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [calendarEvents, setCalendarEvents]   = useState<EconomicEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  // Every economic event ever persisted (see get_stored_economic_events) —
  // separate from calendarEvents (which is just the live feed's current
  // Sun-Sat window). This is what lets the News indicator's surprise
  // tooltip still resolve actual/forecast/previous for a release once it's
  // scrolled out of the live feed entirely.
  const [storedEconomicEvents, setStoredEconomicEvents] = useState<EconomicEvent[]>([]);
  // 10Y/30Y Treasury auction results, from TreasuryDirect (see
  // sync_treasury_auctions/get_stored_treasury_auctions) — a separate
  // pipeline from calendarEvents/storedEconomicEvents.
  const [treasuryAuctions, setTreasuryAuctions] = useState<TreasuryAuction[]>([]);
  const [livePrice, setLivePrice]     = useState<number | null>(null);
  const [priceError, setPriceError]   = useState<string | null>(null);

  function saveAlerts(list: Alert[]) {
    alertsJsonPath
      .then(path => invoke("write_text_file", { path, content: JSON.stringify(list, null, 2) }))
      .catch(console.error);
  }

  // Live price — poll every 5 s for the selected pair
  useEffect(() => {
    setLivePrice(null);
    const poll = () => {
      invoke<number>("get_live_price", { pair: selectedPair })
        .then(p => { setLivePrice(p); setPriceError(null); })
        .catch(e => setPriceError(String(e)));
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [selectedPair]);

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

  // Economic calendar — fetch on mount then every 5 min. Slower cadence than
  // news: the unofficial feed rate-limits, and scheduled events don't need
  // second-by-second freshness the way headlines do.
  //
  // The unofficial feed occasionally fails/hangs on the very first request
  // after a cold app launch (network interface not fully up yet). Without a
  // fast retry, a failed first attempt just sat there until the next full
  // 5-minute interval tick — which read as "the calendar takes 5 minutes to
  // load". Two fixes: (1) seed the panel instantly from the last successful
  // fetch, cached to disk, so there's always *something* on screen while a
  // fresh fetch is in flight; (2) retry quickly (15s) on failure instead of
  // waiting for the next scheduled poll.
  useEffect(() => {
    economicCalendarCachePath
      .then(path => invoke<string>("read_credentials_file", { path }))
      .then(content => setCalendarEvents(JSON.parse(content)))
      .catch(() => {});

    // Persisted history (see get_economic_calendar's save-on-poll and the
    // economic_events table it writes to) — loaded once here and refreshed
    // after each successful live poll below, since that's the only thing
    // that ever adds new rows to it.
    const loadStored = () => {
      invoke<EconomicEvent[]>("get_stored_economic_events")
        .then(setStoredEconomicEvents)
        .catch(() => {});
    };
    loadStored();

    let retryId: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 15_000;
    const load = () => {
      setCalendarLoading(true);
      invoke<EconomicEvent[]>("get_economic_calendar")
        .then(items => {
          retryDelay = 15_000;
          setCalendarEvents(items);
          economicCalendarCachePath
            .then(path => invoke("write_text_file", { path, content: JSON.stringify(items) }))
            .catch(console.error);
          loadStored();
        })
        // Back off on repeated failure (e.g. the feed's own rate limit)
        // instead of hammering it every 15s indefinitely, which is exactly
        // what trips that rate limit in the first place. Caps at the normal
        // 5-minute poll cadence.
        .catch(() => {
          retryId = setTimeout(load, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 5 * 60_000);
        })
        .finally(() => setCalendarLoading(false));
    };
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => { clearInterval(id); if (retryId) clearTimeout(retryId); };
  }, []);

  // Treasury auctions — sync on mount then every 30 min (auctions happen at
  // most a handful of times a month, unlike the 5-min calendar poll's
  // current-week churn). sync_treasury_auctions fetches+persists only a
  // recent window; get_stored_treasury_auctions reloads the full persisted
  // history so old auctions (and the trailing bid-to-cover average
  // interpretAuction computes from them) stay available for charting.
  //
  // One-time deep backfill: sync_treasury_auctions alone can only ever
  // reach back ~120 days (TreasuryDirect's "auctioned" endpoint caps at
  // ~250 total records across every note/bond term, confirmed directly —
  // no query param extends it). backfill_treasury_auctions instead hits the
  // "search" endpoint filtered to the exact 10Y/30Y terms, which returns
  // real history back to 1979 — comfortably past this app's deepest loaded
  // price data (1000 weekly bars ≈ 19 years). Gated on a one-time flag so
  // it doesn't refetch that full archive on every app launch.
  useEffect(() => {
    const loadStored = () => {
      invoke<TreasuryAuction[]>("get_stored_treasury_auctions")
        .then(setTreasuryAuctions)
        .catch(() => {});
    };
    loadStored();
    if (!getTreasuryAuctionsBackfilled()) {
      invoke("backfill_treasury_auctions")
        .then(() => { setTreasuryAuctionsBackfilled(); loadStored(); })
        .catch(() => {});
    }
    const sync = () => {
      invoke("sync_treasury_auctions")
        .then(loadStored)
        .catch(() => {});
    };
    sync();
    const id = setInterval(sync, 30 * 60_000);
    return () => clearInterval(id);
  }, []);

  // Initial load — seed seenStatuses so we don't fire on startup
  useEffect(() => {
    alertsJsonPath
      .then(path => invoke<string>("read_credentials_file", { path }))
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
      alertsJsonPath
        .then(path => invoke<string>("read_credentials_file", { path }))
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

  // Keep a ref to alerts so the evaluation interval always reads current state
  const alertsRef = useRef<Alert[]>([]);
  useEffect(() => { alertsRef.current = alerts; }, [alerts]);

  // Evaluate RSI/MACD Cross alerts every 60 s against computed candle data
  useEffect(() => {
    const evaluate = async () => {
      const activeRsiMacd = alertsRef.current.filter(
        a => a.direction === "rsi_macd_cross" && a.status === "watching" && a.active && a.rsiMacdConfig
      );
      const activeRsi = alertsRef.current.filter(
        a => a.direction === "rsi" && a.status === "watching" && a.active && a.rsiConfig
      );
      const active = activeRsiMacd; // existing variable kept for downstream RSI/MACD loop
      if (activeRsiMacd.length === 0 && activeRsi.length === 0) return;

      // Collect unique timeframes across all active alerts (both types)
      const allTfs = new Set<string>();
      activeRsiMacd.forEach(a => a.rsiMacdConfig!.timeframes.forEach(tf => allTfs.add(tf)));
      activeRsi.forEach(a => a.rsiConfig!.timeframes.forEach(tf => allTfs.add(tf)));

      // Fetch last 3 computed candles per timeframe
      const tfData: Record<string, RawCandleV3[]> = {};
      await Promise.all([...allTfs].map(async tf => {
        try {
          const candles = await getStackCandles(selectedPair, tf);
          if (candles.length >= 2) tfData[tf] = candles.slice(-3);
        } catch { /* ignore fetch errors */ }
      }));

      const triggered: { id: string; direction: "bullish" | "bearish"; tf: string; kind?: "rsi"; condition?: "cross_above_70" | "cross_below_30" | "hit_50" }[] = [];

      // RSI alerts evaluation
      activeRsi.forEach(alert => {
        const config = alert.rsiConfig!;
        for (const tf of config.timeframes) {
          const candles = tfData[tf];
          if (!candles || candles.length < 2) continue;
          const prev = candles[candles.length - 2];
          const curr = candles[candles.length - 1];

          let fires = false;
          let direction: "bullish" | "bearish" = "bullish";

          if (config.condition === "cross_above_70") {
            fires = prev.rsi14 <= 70 && curr.rsi14 > 70;
            direction = "bearish"; // overbought
          } else if (config.condition === "cross_below_30") {
            fires = prev.rsi14 >= 30 && curr.rsi14 < 30;
            direction = "bullish"; // oversold
          } else if (config.condition === "hit_50") {
            fires =
              (prev.rsi14 < 50 && curr.rsi14 >= 50) ||
              (prev.rsi14 > 50 && curr.rsi14 <= 50);
            direction = curr.rsi14 >= 50 ? "bullish" : "bearish";
          }

          if (fires) {
            triggered.push({ id: alert.id, direction, tf, kind: "rsi", condition: config.condition });
            break;
          }
        }
      });

      active.forEach(alert => {
        const config = alert.rsiMacdConfig!;
        for (const tf of config.timeframes) {
          const candles = tfData[tf];
          if (!candles || candles.length < 2) continue;
          const prev = candles[candles.length - 2];
          const curr = candles[candles.length - 1];

          // MACD cross: histogram changes sign between prev and current candle
          const macdBullishCross = prev.macd_histogram <= 0 && curr.macd_histogram > 0;
          const macdBearishCross = prev.macd_histogram >= 0 && curr.macd_histogram < 0;

          const isBullish = macdBullishCross && curr.rsi14 < 30;
          const isBearish = macdBearishCross && curr.rsi14 > 70;

          const fires =
            (config.directionBias === "bullish" && isBullish) ||
            (config.directionBias === "bearish" && isBearish) ||
            (config.directionBias === "both" && (isBullish || isBearish));

          if (fires) {
            triggered.push({ id: alert.id, direction: isBullish ? "bullish" : "bearish", tf });
            break; // first matching TF per alert is enough
          }
        }
      });

      if (triggered.length === 0) return;

      const now = new Date().toISOString();

      setAlerts(prev => {
        const next = prev.map(a => {
          const t = triggered.find(x => x.id === a.id);
          return t ? { ...a, status: "triggered" as const, triggered_at_utc: now } : a;
        });
        alertsJsonPath
          .then(path => invoke("write_text_file", { path, content: JSON.stringify(next, null, 2) }))
          .catch(console.error);
        return next;
      });

      // Prevent the JSON polling loop from double-firing a toast for the same trigger
      triggered.forEach(t => { seenStatuses.current[t.id] = "triggered"; });

      // Fire Telegram notifications for any triggered alerts
      const rsiCondLabel: Record<string, string> = {
        cross_above_70: "RSI crossed above 70",
        cross_below_30: "RSI crossed below 30",
        hit_50: "RSI hit 50",
      };
      triggered.forEach(t => {
        const alert = alertsRef.current.find(a => a.id === t.id);
        if (!alert || !alert.notifications.telegram) return;
        const dirLabel = t.direction === "bullish" ? "Bullish" : "Bearish";
        const body = t.kind === "rsi"
          ? `${alert.instrument.replace("_", "/")} · ${rsiCondLabel[t.condition!]}\nTimeframe: ${t.tf}`
          : `${alert.instrument.replace("_", "/")} · ${dirLabel} MACD×RSI cross\nTimeframe: ${t.tf}`;
        invoke("send_telegram_message", { text: `🚨 ${alert.name}\n${body}` }).catch(console.error);
      });

      // Fire in-app toasts + sound
      const newToasts: AlertToast[] = triggered
        .map(t => {
          const alert = alertsRef.current.find(a => a.id === t.id);
          if (!alert || !alert.notifications.in_app) return null;
          const dirLabel = t.direction === "bullish" ? "Bullish" : "Bearish";
          const subtitle = t.kind === "rsi"
            ? `${alert.instrument.replace("_", "/")} · ${rsiCondLabel[t.condition!]} · ${t.tf}`
            : `${alert.instrument.replace("_", "/")} · ${dirLabel} MACD×RSI · ${t.tf}`;
          return {
            toastId: crypto.randomUUID(),
            name: alert.name,
            instrument: alert.instrument,
            direction: alert.direction,
            price: 0,
            subtitle,
          };
        })
        .filter(Boolean) as AlertToast[];

      if (newToasts.length > 0) {
        const firstAlert = alertsRef.current.find(a => a.id === triggered[0].id);
        playAlertSound((firstAlert?.sound as AlertSound) ?? "chime");
        setToasts(prev => [...prev, ...newToasts]);
      }
    };

    evaluate();
    const id = setInterval(evaluate, 60_000);
    return () => clearInterval(id);
  }, [selectedPair]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const CHART_TFS = ["1W", "1D", "4H", "1H", "15M", "5M", "1M"] as const;
  const [chartTf, setChartTf] = useState<"1W" | "1D" | "4H" | "1H" | "15M" | "5M" | "1M">(() => {
    const saved = getLastChartSelection()?.chartTf;
    return (CHART_TFS as readonly string[]).includes(saved ?? "") ? (saved as typeof CHART_TFS[number]) : "1D";
  });
  const [indicatorTf, setIndicatorTf] = useState<"1W" | "1D" | "4H" | "1H" | "15M" | "5M" | "1M">("1D");
  // Remember the instrument+timeframe across navigation and app restarts —
  // see getLastChartSelection in preferences.ts.
  useEffect(() => { setLastChartSelection(selectedPair, chartTf); }, [selectedPair, chartTf]);

  // Quad View — 2x2 grid of 4 fully independent PriceHistoryChart instances
  // (each with its own instrument, timeframe, and full toolbar) instead of
  // the single chart. Slot 0 seeds from the currently charted pair the first
  // time Quad View is opened; every slot (including 0) is then freely
  // reassignable per-tile via that tile's own InstrumentPicker. Instrument
  // choice is remembered across restarts; the on/off toggle itself is not.
  // (quadView itself is declared earlier, alongside the panel-collapse state
  // it interacts with — see effectiveAisRowCollapsed etc.)
  const [quadPairs, setQuadPairsState] = useState<[string, string, string, string]>(() => getQuadPairs());
  // The whole 2x2 grid — Snapshot lives only on the top-right tile (slot 1)
  // but captures this entire element, not just that tile's own chart.
  const quadGridRef = useRef<HTMLDivElement>(null);
  // Quad View lock — the primary tile's toolbar drives all 4 while locked
  // (see quadSyncEvents inside PriceHistoryChart). On by default; not
  // persisted, same as quadView itself.
  const [quadLocked, setQuadLocked] = useState(true);
  const toggleQuadLocked = useCallback(() => setQuadLocked(v => !v), []);
  const toggleQuadView = useCallback(() => {
    setQuadView(v => {
      const next = !v;
      if (next) {
        // Entering Quad View collapses the panels around the chart (the AI
        // Synthesis/Alerts row above, the category panels below, and the
        // price/news panel to the side) plus the app sidebar, so the 2x2
        // grid gets full space.
        setAisRowCollapsed(true);
        setBelowChartCollapsed(true);
        setRightOfChartCollapsed(true);
        sidebarEvents.setCollapsed(true);
        // The top-right tile (slot 1) always picks up whatever instrument
        // was already being viewed, so switching into Quad View doesn't
        // change what's on screen — it just adds 3 more charts around it.
        // If that instrument has a defined confirmation set (see
        // QUAD_CONFIRMATION_SET), the other 3 slots default to it too.
        setQuadPairsState(prev => {
          const confirmation = QUAD_CONFIRMATION_SET[selectedPair];
          const nextPairs: [string, string, string, string] = confirmation
            ? [confirmation[0], selectedPair, confirmation[1], confirmation[2]]
            : [prev[0], selectedPair, prev[2], prev[3]];
          if (nextPairs.every((p, i) => p === prev[i])) return prev;
          setQuadPairs(nextPairs);
          return nextPairs;
        });
      }
      return next;
    });
  }, [selectedPair]);
  const setQuadPairSlot = useCallback((idx: 0 | 1 | 2 | 3, value: string) => {
    setQuadPairsState(prev => {
      const next: [string, string, string, string] = [...prev];
      next[idx] = value;
      setQuadPairs(next);
      return next;
    });
  }, []);
  // Selecting an instrument from the top ticker/selector while in Quad View
  // re-targets the whole grid at it — the primary tile (slot 1) switches to
  // the new instrument and, same as freshly entering Quad View, the other 3
  // slots reset to its QUAD_CONFIRMATION_SET (falling back to whatever was
  // already in those slots if the instrument has none defined).
  const selectPair = useCallback((pair: string) => {
    setSelectedPair(pair);
    if (quadView) {
      setQuadPairsState(prev => {
        const confirmation = QUAD_CONFIRMATION_SET[pair];
        const next: [string, string, string, string] = confirmation
          ? [confirmation[0], pair, confirmation[1], confirmation[2]]
          : [prev[0], pair, prev[2], prev[3]];
        setQuadPairs(next);
        return next;
      });
    }
  }, [quadView]);
  // Favorites clicked from the Sidebar (or any other page) route through the
  // same pub/sub that Pair Selector/Ticker clicks use — subscribed here
  // (after selectPair is defined, so it's the quad-aware handler, not the
  // raw setter) so a favorite pick also re-targets Quad View when it's on.
  useEffect(() => pairSelectionEvents.subscribe((pair) => selectPair(pair)), [selectPair]);
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
    const loadCandles = () =>
      invoke<RawCandleV3[]>("get_candles_v3", { pair: selectedPair })
        .then(async candles => {
          if (!candles.length) return;
          const last      = candles[candles.length - 1];
          const sheetRows = candles.map(mapToSheetRow);
          const lastRow   = sheetRows[sheetRows.length - 1];

          // Composite scoring drives the AI Synthesis panel. Fall back to the
          // static result if the backend isn't reachable (e.g. no OANDA key).
          let analysisResult = defaultAnalysisResult;
          try {
            const synth = await fetchSynthesis(selectedPair, "1D");
            setSynthesis(synth);
            analysisResult = synthesisToAnalysisResult(synth, lastRow);
          } catch (err) {
            setSynthesis(null);
            console.warn("Synthesis fetch failed, using fallback:", err);
          }

          setLiveAnalytics({
            eurusdSnapshot: mapToSnapshot(last),
            analysisResult,
            signalTags, signalHistory, historicalAccuracy,
            evidenceCards, emaStackData, macdChartData,
            momentumChartData, volatilityChartData, directionalChartData,
            sheetRows,
          });
        })
        .catch(err => setError(String(err)));

    // Always read from DB after sync resolves or fails — backend thread handles the sync.
    invoke<number>("sync_oanda_candles_v3", { pair: selectedPair })
      .then(() => loadCandles())
      .catch(() => loadCandles());
  }, [selectedPair]);



  const verdict =
    analysisResult.direction === "LONG"  ? "long"    :
    analysisResult.direction === "SHORT" ? "short"   :
    "neutral";

  const [indicatorRows, setIndicatorRows] = useState<SheetRow[]>([]);
  useEffect(() => {
    getStackCandles(selectedPair, indicatorTf)
      .then(candles => setIndicatorRows(candles.map(mapToSheetRow)))
      .catch(() => {});
  }, [selectedPair, indicatorTf]);
  const iRows     = indicatorRows.length > 0 ? indicatorRows : sheetRows;

  const latestRow   = iRows[iRows.length - 1];

  // Instrument name + Current Price + Today's Change must always sit on one
  // aligned row, for every instrument, with zero clipping past the app edge
  // — wrapping to a second line or a fixed min-width both failed that for
  // long pair names / wide prices at narrower panel widths. Instead: render
  // the row at natural size, measure it, and scale the whole row down
  // (never up) just enough to fit — content and available space both drive
  // recomputation, so it's correct after a pair switch or a divider drag.
  const [priceRowScale, setPriceRowScale] = useState(1);
  const priceRowOuterObsRef = useRef<ResizeObserver | null>(null);
  const priceRowInnerObsRef = useRef<ResizeObserver | null>(null);
  const priceRowOuterElRef  = useRef<HTMLDivElement | null>(null);
  const priceRowInnerElRef  = useRef<HTMLDivElement | null>(null);
  const recomputePriceRowScale = useCallback(() => {
    const inner = priceRowInnerElRef.current;
    const outer = priceRowOuterElRef.current;
    if (!inner || !outer) return;
    inner.style.transform = "scale(1)"; // reset before measuring, else scrollWidth reflects the last scale, not natural size
    const naturalWidth = inner.scrollWidth;
    // Small safety margin — scrollWidth/clientWidth both round to integer
    // px, so an exact-fit case can still clip by a sub-pixel amount.
    const available = outer.clientWidth - 2;
    setPriceRowScale(naturalWidth > available && naturalWidth > 0 ? available / naturalWidth : 1);
  }, []);
  // Callback refs (not useRef+useEffect): these nodes are gated behind
  // several conditions (sheetRows loaded, panel expanded, latestRow
  // present), so a dependency-array effect can miss the moment they first
  // mount — same reasoning as rightPanelHeaderRef above. Both outer
  // (available space) AND inner (natural content width — font metrics,
  // text content, anything) are observed directly, rather than relying on
  // a fixed set of anticipated triggers like selectedPair/latestRow, which
  // still left an edge case that clipped by a few px.
  const priceRowOuterRef = useCallback((el: HTMLDivElement | null) => {
    priceRowOuterElRef.current = el;
    priceRowOuterObsRef.current?.disconnect();
    priceRowOuterObsRef.current = null;
    if (!el) return;
    const ro = new ResizeObserver(() => recomputePriceRowScale());
    ro.observe(el);
    priceRowOuterObsRef.current = ro;
  }, [recomputePriceRowScale]);
  const priceRowInnerRef = useCallback((el: HTMLDivElement | null) => {
    priceRowInnerElRef.current = el;
    priceRowInnerObsRef.current?.disconnect();
    priceRowInnerObsRef.current = null;
    if (!el) return;
    const ro = new ResizeObserver(() => recomputePriceRowScale());
    ro.observe(el);
    priceRowInnerObsRef.current = ro;
  }, [recomputePriceRowScale]);
  useLayoutEffect(() => { recomputePriceRowScale(); }, [selectedPair, latestRow, livePrice, recomputePriceRowScale]);

  const macdBias    = !latestRow ? "neutral"
    : latestRow.macdHistogram > 0 ? "bullish"
    : latestRow.macdHistogram < 0 ? "bearish"
    : "neutral";
  const macdScore = useMemo(() => {
    if (!latestRow || iRows.length < 2) return 0;
    const recent = iRows.slice(-20);
    const maxHist = Math.max(...recent.map(r => Math.abs(r.macdHistogram)));
    return maxHist > 0 ? Math.round((Math.abs(latestRow.macdHistogram) / maxHist) * 100) : 0;
  }, [iRows, latestRow]);
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
  const macdHeadline      = iRows.length > 0 ? buildMacdAnalysis(iRows).headline : "";
  const priceHeadline     = iRows.length > 0 ? buildPriceAnalysis(iRows).headline : "";
  const rsiHeadline       = iRows.length > 0 ? buildRsiAnalysis(iRows).headline : "";
  const rsi14Headline     = iRows.length > 0 ? buildRsi14Analysis(iRows).headline : "";
  const maHeadline        = iRows.length > 0 ? buildMaAnalysis(iRows).headline : "";

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

  const keltHeadline = iRows.length > 0 ? buildKeltAnalysis(iRows).headline : "";
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

  const adxHeadline = iRows.length > 0 ? buildAdxAnalysis(iRows).headline : "";
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

  const ichiHeadline = iRows.length > 0 ? buildIchiAnalysis(iRows).headline : "";
  const ichiBias = !latestRow ? "neutral"
    : latestRow.close > Math.max(latestRow.senkouA, latestRow.senkouB) ? "bullish"
    : latestRow.close < Math.min(latestRow.senkouA, latestRow.senkouB) ? "bearish"
    : "neutral";
  const ichiScore = useMemo(() => {
    if (!latestRow) return 0;
    const cloudTop     = Math.max(latestRow.senkouA ?? 0, latestRow.senkouB ?? 0);
    const cloudBottom  = Math.min(latestRow.senkouA ?? 0, latestRow.senkouB ?? 0);
    const aboveCloud   = latestRow.close > cloudTop;
    const belowCloud   = latestRow.close < cloudBottom;
    const bullishCloud = (latestRow.senkouA ?? 0) > (latestRow.senkouB ?? 0);
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

  const sessionHeadline = useMemo(() => sheetRows.length > 0 ? buildSessionAnalysis(sheetRows).headline : "", [sheetRows]);
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

  const volHeadline = useMemo(() => sheetRows.length > 0 ? buildVolumeAnalysis(sheetRows).headline : "", [sheetRows]);
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

  const pivotHeadline = iRows.length > 0 ? buildPivotAnalysis(iRows).headline : "";
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

  const momHeadline = iRows.length > 0 ? buildMomentumAnalysis(iRows).headline : "";
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
    iRows.length > 0 ? computeWR(iRows, iRows.length - 1) : -50,
  [iRows]);
  const wrHeadline = iRows.length > 0
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

  const atrHeadline = iRows.length > 0 ? buildAtrAnalysis(iRows).headline : "";
  const atrBias = useMemo(() => {
    if (!latestRow || iRows.length < 3) return "neutral";
    const recent20 = iRows.slice(-20);
    const avg      = recent20.reduce((s, r) => s + r.atr14, 0) / recent20.length;
    const ratio    = avg > 0 ? latestRow.atr14 / avg : 1;
    const rising   = latestRow.atr14 > iRows[iRows.length - 2].atr14;
    return ratio > 1.10 && rising ? "bullish" : ratio < 0.90 && !rising ? "bearish" : "neutral";
  }, [latestRow, iRows]);
  const atrScore = useMemo(() => {
    if (!latestRow || iRows.length < 3) return 0;
    const recent20 = iRows.slice(-20);
    const avg      = recent20.reduce((s, r) => s + r.atr14, 0) / recent20.length;
    const ratio    = avg > 0 ? latestRow.atr14 / avg : 1;
    return Math.min(100, Math.round(Math.abs(ratio - 1) * 200));
  }, [latestRow, iRows]);
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

  const msStructure = useMemo(() => computeMarketStructure(iRows), [iRows]);
  const msState     = msStructure.state;
  const msHeadline  = msState;
  const msBias      =
    msState === "Bullish" || msState === "Strong Bullish" ? "bullish" :
    msState === "Bearish" || msState === "Strong Bearish" ? "bearish" :
    "neutral";
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
  const curRegimeState = useMemo<RegimeState>(() => {
    const seq = computeRegimeSequence(iRows);
    return seq[seq.length - 1] ?? "Ranging";
  }, [iRows]);
  const regimeAdx = iRows.length ? (iRows[iRows.length - 1]?.adx ?? 0) : 0;
  const isTrending = curRegimeState === "Trending" || curRegimeState === "StrongTrending";
  const trendStrength = isTrending
    ? curRegimeState === "StrongTrending" ? "Strong"
    : regimeAdx >= 30 ? "Normal"
    : "Weak"
    : null;
  const trendStrengthColor = trendStrength === "Strong" ? "#34d399"
                           : trendStrength === "Normal" ? "#60a5fa"
                           : "#94a3b8";

  const regimeInsight  = isTrending                          ? "Momentum strategies favored"
                       : curRegimeState === "Compression"    ? "Breakout conditions building"
                       : curRegimeState === "Expansion"      ? "Volatility expansion — direction pending"
                       :                                       "Mean reversion environment";
  const regimeHeadline = trendStrength
    ? `${trendStrength} Trend · ${regimeInsight}`
    : regimeInsight;
  const msBullishLike = msState === "Bullish" || msState === "Strong Bullish";
  const msBearishLike = msState === "Bearish" || msState === "Strong Bearish";
  const regimeAlignmentInsight: string =
    curRegimeState === "Compression"
      ? "Breakout setup forming"
      : curRegimeState === "Expansion"
      ? "Volatile expansion — wait for direction"
      : isTrending && msBullishLike
      ? "High confidence bullish conditions"
      : isTrending && msBearishLike
      ? "High confidence bearish conditions"
      : isTrending
      ? "Trend / structure mismatch — mixed signals"
      : curRegimeState === "Ranging" && msState === "Range"
      ? "Choppy / low edge environment"
      : curRegimeState === "Ranging" && msBullishLike
      ? "Ranging into bullish structure"
      : curRegimeState === "Ranging" && msBearishLike
      ? "Ranging into bearish structure"
      : "Mixed conditions";
  const makeRegimeBadge = (large?: boolean) => {
    const color = curRegimeState === "StrongTrending" ? "#34d399"
                : curRegimeState === "Trending"       ? "#60a5fa"
                : curRegimeState === "Compression"    ? "#f59e0b"
                : curRegimeState === "Expansion"      ? "#f87171"
                : "#94a3b8";
    const bg    = curRegimeState === "StrongTrending" ? "rgba(52,211,153,0.12)"
                : curRegimeState === "Trending"       ? "rgba(96,165,250,0.12)"
                : curRegimeState === "Compression"    ? "rgba(245,158,11,0.12)"
                : curRegimeState === "Expansion"      ? "rgba(248,113,113,0.12)"
                : "rgba(148,163,184,0.10)";
    const border = curRegimeState === "StrongTrending" ? "rgba(52,211,153,0.35)"
                 : curRegimeState === "Trending"       ? "rgba(96,165,250,0.35)"
                 : curRegimeState === "Compression"    ? "rgba(245,158,11,0.35)"
                 : curRegimeState === "Expansion"      ? "rgba(248,113,113,0.35)"
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
    for (const r of sheetRows) { const v = computeFsWick(r, selectedPair); if (v !== null) all.push(v); }
    const sorted = [...all].sort((a, b) => a - b);
    if (!sorted.length || !sheetRows.length) return null;
    const cur = sheetRows[sheetRows.length - 1];
    const todayFs = cur ? computeFsWick(cur, selectedPair) : null;
    const todayRank = todayFs !== null ? fsPercentileRank(sorted, todayFs) : null;
    return { todayFs, todayRank };
  }, [sheetRows]);
  const fswBadge = (fswStats?.todayFs != null)
    ? <span className="tabular-nums" style={{ fontSize: 10, fontWeight: 600, color: "#f59e0b" }}>{fswStats.todayFs}p{fswStats.todayRank != null ? ` · ${fswStats.todayRank}th` : ""}</span>
    : undefined;
  const fswHeadline = "";

  const cctxPatterns   = useMemo(() => detectCandlePatterns(iRows.slice(-5)), [iRows]);
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

  const volaHeadline = iRows.length > 0 ? buildVolatilityAnalysis(iRows).headline : "";
  const volaBias = !latestRow ? "neutral"
    : latestRow.close > latestRow.bbUpper ? "bullish"
    : latestRow.close < latestRow.bbLower ? "bearish"
    : "neutral";
  const volaScore = useMemo(() => {
    if (!latestRow) return 0;
    const { close, bbUpper, bbMiddle } = latestRow;
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

  const avgpHeadline = iRows.length > 0 ? buildAvgPriceAnalysis(iRows).headline : "";
  const avgpBias = useMemo(() => {
    if (iRows.length < 6) return "neutral";
    const idx = iRows.length - 1;
    const roc5 = ((iRows[idx].close - iRows[idx - 5].close) / iRows[idx - 5].close) * 100;
    return roc5 > 0.05 ? "bullish" : roc5 < -0.05 ? "bearish" : "neutral";
  }, [iRows]);
  const avgpScore = useMemo(() => {
    if (iRows.length < 6) return 0;
    const idx  = iRows.length - 1;
    const roc5 = Math.abs(((iRows[idx].close - iRows[idx - 5].close) / iRows[idx - 5].close) * 100);
    return Math.min(100, Math.round(roc5 * 20));
  }, [iRows]);
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

  const rocHeadline = iRows.length > 0 ? buildRocAnalysis(iRows).headline : "";
  const rocBias = useMemo(() => {
    if (iRows.length < 6) return "neutral" as const;
    const idx  = iRows.length - 1;
    const roc5 = ((iRows[idx].close - iRows[idx - 5].close) / iRows[idx - 5].close) * 100;
    return roc5 > 0.05 ? "bullish" as const : roc5 < -0.05 ? "bearish" as const : "neutral" as const;
  }, [iRows]);
  const rocScore = useMemo(() => {
    if (iRows.length < 6) return 0;
    const idx  = iRows.length - 1;
    const roc5 = Math.abs(((iRows[idx].close - iRows[idx - 5].close) / iRows[idx - 5].close) * 100);
    return Math.min(100, Math.round(roc5 * 20));
  }, [iRows]);
  const makeRocBadge = (large?: boolean) => (
    <HoverTooltip tip={`Score ${rocScore}/100 — ROC(5) magnitude × 20, capped at 100 (±5% ROC = score 100). Higher = stronger 5-session directional momentum. ${iRows.length >= 6 ? `ROC(5) is ${(((iRows[iRows.length - 1].close - iRows[iRows.length - 6].close) / iRows[iRows.length - 6].close) * 100).toFixed(3)}%.` : ""}`}>
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
    if (!latestRow || iRows.length < 2) return 0;
    const recent = iRows.slice(-20);
    const maxBody = Math.max(...recent.map(r => Math.abs(r.close - r.open)));
    return maxBody > 0 ? Math.round((Math.abs(latestRow.close - latestRow.open) / maxBody) * 100) : 0;
  }, [iRows, latestRow]);
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
  const aisTooltip      = synthesis
    ? `AI verdict: ${analysisResult.direction} ${analysisResult.confidence}% · Composite ${synthesis.composite.toFixed(0)}. `
      + `Regime: ${synthesis.context.regime} · Volatility: ${synthesis.context.volatility}. `
      + `MTF — D ${synthesis.multi_timeframe.daily.direction}/${Math.round(synthesis.multi_timeframe.daily.confidence)}%, `
      + `H4 ${synthesis.multi_timeframe.h4.direction}/${Math.round(synthesis.multi_timeframe.h4.confidence)}%, `
      + `H1 ${synthesis.multi_timeframe.h1.direction}/${Math.round(synthesis.multi_timeframe.h1.confidence)}% · `
      + `Alignment ${Math.round(synthesis.multi_timeframe.alignment_score)}%.`
    : `AI verdict: ${analysisResult.direction} with ${analysisResult.confidence}% confidence. Long score ${analysisResult.longScore} vs Short score ${analysisResult.shortScore}.`;
  const makeAisBadge = (large?: boolean) => (
    <HoverTooltip tip={aisTooltip}>
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
        {/* flex-1/min-w-0 keeps the (potentially expanded) pair selector from
            growing over the clock or the app's fixed top-right fullscreen button */}
        <div className="flex-1 min-w-0 h-full">
          <PairSelector
            value={selectedPair}
            onPairChange={selectPair}
            collapsedContent={<InstrumentTicker onSelect={selectPair} />}
          />
        </div>
        {/* marginRight clears the app-level fixed fullscreen toggle (top:8/right:8, 26px) */}
        <div className="h-full" style={{ marginRight: 30 }}>
          <AnalyticsClock />
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
        {!aisRowCollapsed && !quadView && (
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
                {p.id === "ai-synthesis" && <AiSynthesisPanelBody result={analysisResult} pair={selectedPair} />}
                {p.id === "ai-chat"      && <AlertsPanel instrument={selectedPair.replace("/", "_")} alerts={alerts} onUpdate={updateAlert} onDelete={deleteAlert} />}
              </BlankPanel>
            );
          })}
        </div>
        )}

        {/* ── Divider — doubles as the collapse/expand handle for the AI
            Synthesis + Alerts row above (hidden in Quad View, which never
            shows this row) ── */}
        {!quadView && (
        <div style={{ position: "relative", height: 1, background: "var(--border-medium)", flexShrink: 0 }}>
          <button
            onClick={() => setAisRowCollapsed(v => !v)}
            title={aisRowCollapsed ? "Expand AI Synthesis & Alerts" : "Collapse AI Synthesis & Alerts"}
            style={{
              position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
              width: 22, height: 14, padding: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: "1px solid var(--border-medium)", borderRadius: 4,
              cursor: "pointer", color: "var(--text-secondary)", zIndex: 5,
            }}
          >
            <span style={{
              width: 0, height: 0,
              borderLeft: "4px solid transparent", borderRight: "4px solid transparent",
              ...(aisRowCollapsed
                ? { borderTop: "5px solid currentColor" }
                : { borderBottom: "5px solid currentColor" }),
            }} />
          </button>
        </div>
        )}

        {/* ── Scrollable bottom rows — category container panels ──
            paddingTop intentionally 0 so the sticky Indicator Timeframe row
            can rest flush with the container top edge; the first child
            below carries the 10px of initial spacing instead. */}
        <div className="flex-1 min-h-0" style={{
          display: "flex", flexDirection: "column",
          // marginRight eats 8px of the page's own right padding so the
          // scrollbar itself sits 8px further right, closer to the window
          // edge; paddingRight bumped by the same 8px so content still ends
          // up at its original spot — only the scrollbar's position moves.
          overflowY: effectiveBelowChartCollapsed ? "hidden" : "auto", paddingTop: "0", paddingRight: "18px", marginRight: "-8px",
        }}>
          {sheetRows.length === 0 && (
            // Same footprint as the real chart+toolbar below (toolbar strip +
            // 480px-tall panel) so the page doesn't visibly collapse down to
            // just the bottom rows while the initial candle fetch is still
            // in flight, then jump back open once sheetRows arrives.
            <div style={{ marginTop: 10, flexShrink: 0, width: effectiveRightOfChartCollapsed ? "100%" : "76%" }}>
              <div style={{ height: 34, marginBottom: 4 }} />
              <div style={{
                height: 480 + chartHeightBoost, borderRadius: 14,
                background: "var(--bg-panel-alt)", border: "1px solid var(--border-subtle)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--text-muted)", fontSize: 12, letterSpacing: "0.05em",
              }}>
                Loading chart…
              </div>
            </div>
          )}
          {sheetRows.length > 0 && (
            <div style={{
              display: "flex", alignItems: effectiveBelowChartCollapsed ? "stretch" : "flex-start", marginTop: 10,
              ...(effectiveBelowChartCollapsed ? { flex: 1, minHeight: 0 } : { flexShrink: 0 }),
            }}>
              {quadView ? (
                <div ref={quadGridRef} style={{
                  width: effectiveRightOfChartCollapsed ? "100%" : "76%", marginBottom: 10, flexShrink: effectiveRightOfChartCollapsed ? 1 : 0,
                  display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 1,
                  background: "var(--border-medium)", borderRadius: 14, overflow: "hidden",
                  height: effectiveBelowChartCollapsed ? "100%" : 480 + chartHeightBoost,
                  ...(effectiveBelowChartCollapsed ? { flex: 1, minHeight: 0 } : {}),
                }}>
                  {quadPairs.map((qp, idx) => (
                    <div key={idx} style={{ minWidth: 0, minHeight: 0, background: "#0f1117" }}>
                      <PriceHistoryChart
                        rows={sheetRows} pair={qp} onPairChange={(p) => setQuadPairSlot(idx as 0 | 1 | 2 | 3, p)}
                        livePrice={null} expandWidth expandHeight heightBoost={0}
                        allPanelsCollapsed={allPanelsCollapsed} onToggleAllPanels={toggleAllPanels}
                        rightOfChartCollapsed={false} onHeightChange={() => {}}
                        calendarEvents={calendarEvents} storedEconomicEvents={storedEconomicEvents} treasuryAuctions={treasuryAuctions}
                        compact quadView={quadView} onToggleQuadView={toggleQuadView}
                        showSnapshotAndExpand={idx === 1} snapshotTargetRef={quadGridRef}
                        quadLocked={quadLocked} onToggleQuadLocked={toggleQuadLocked}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <PriceHistoryChart rows={sheetRows} pair={selectedPair} chartTf={chartTf} setChartTf={setChartTf} livePrice={livePrice} expandWidth={effectiveRightOfChartCollapsed} expandHeight={effectiveBelowChartCollapsed} heightBoost={chartHeightBoost} allPanelsCollapsed={allPanelsCollapsed} onToggleAllPanels={toggleAllPanels} rightOfChartCollapsed={effectiveRightOfChartCollapsed} onHeightChange={setChartColHeight} calendarEvents={calendarEvents} storedEconomicEvents={storedEconomicEvents} treasuryAuctions={treasuryAuctions} quadView={quadView} onToggleQuadView={toggleQuadView} />
              )}
              {/* ── Vertical divider — doubles as the collapse/expand handle
                  for the price/news panel right of the chart (hidden in
                  Quad View, which never shows this panel) ── */}
              {!quadView && (
              <div style={{ position: "relative", width: 1, alignSelf: "stretch", background: "var(--border-medium)", flexShrink: 0, marginLeft: 12 }}>
                <button
                  onClick={() => setRightOfChartCollapsed(v => !v)}
                  title={rightOfChartCollapsed ? "Expand panel right of chart" : "Collapse panel right of chart"}
                  style={{
                    position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                    width: 14, height: 22, padding: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: "transparent", border: "1px solid var(--border-medium)", borderRadius: 4,
                    cursor: "pointer", color: "var(--text-secondary)", zIndex: 5,
                  }}
                >
                  <span style={{
                    width: 0, height: 0,
                    borderTop: "4px solid transparent", borderBottom: "4px solid transparent",
                    ...(rightOfChartCollapsed
                      ? { borderRight: "5px solid currentColor" }
                      : { borderLeft: "5px solid currentColor" }),
                  }} />
                </button>
              </div>
              )}
              {!rightOfChartCollapsed && !quadView && (
              <div style={{ flex: 1, minWidth: 0, paddingLeft: 16, paddingRight: 0, marginTop: 4, position: "relative" }}>
                <div ref={rightPanelHeaderRef}>
                {/* Outer: fixed to the panel's actual available width, clips
                    anything past it. Inner: rendered at natural size, then
                    scaled down (never up, transformOrigin left) just enough
                    to fit — see recomputePriceRowScale. This keeps the pair
                    name / price / change permanently on one aligned row for
                    every instrument at every panel width, with no clipping. */}
                <div ref={priceRowOuterRef} style={{ width: "100%", overflow: "hidden" }}>
                <div ref={priceRowInnerRef} style={{ display: "flex", alignItems: "center", gap: 20, width: "fit-content", transform: `scale(${priceRowScale})`, transformOrigin: "left center" }}>
                  <div style={{ display: "flex", alignItems: "flex-start" }}>
                    <span style={{
                      fontSize: 38, fontWeight: 800, color: "#ffffff",
                      letterSpacing: "-0.02em", lineHeight: 1,
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                    }}>
                      {selectedPair}
                    </span>
                    <span className="flex items-center justify-center" style={{ width: 16, height: 16, flexShrink: 0, marginLeft: 8 }}>
                      <span className="animate-ping absolute inline-flex rounded-full" style={{ width: 10, height: 10, opacity: 0.45, background: "#60a5fa", animationDuration: "2s" }} />
                      <span className="relative inline-flex rounded-full" style={{ width: 7, height: 7, background: "#60a5fa" }} />
                    </span>
                  </div>
                  {latestRow && (() => {
                    const display = livePrice ?? latestRow.close;
                    const isUp = display >= latestRow.open;
                    const pct = (latestRow.close - latestRow.open) / latestRow.open * 100;
                    return (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 20, marginTop: 6, marginLeft: -14 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center", marginLeft: -5 }}>
                          <span style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>Current Price</span>
                          <span style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: isUp ? "#60a5fa" : "#a78bfa", letterSpacing: "-0.01em", lineHeight: 1, whiteSpace: "nowrap" }}>
                            {formatPrice(display, decimalsForPair(selectedPair, display))}
                          </span>
                          {priceError && <span style={{ fontSize: 9, color: "#f87171", maxWidth: 200 }}>{priceError}</span>}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginLeft: -16 }}>
                          <span style={{ fontSize: 8, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>Today's Change</span>
                          <span style={{ fontSize: 17, fontWeight: 400, color: pct >= 0 ? "#60a5fa" : "#a78bfa", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em", lineHeight: 1, marginTop: 9, whiteSpace: "nowrap" }}>
                            {pct >= 0 ? "+" : ""}{pct.toFixed(3)}%
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                </div>
                {latestRow && (
                  <div style={{ height: 1, background: "var(--border-medium)", margin: "12px 0 12px" }} />
                )}
                {latestRow && (
                  <>
                    <div style={{ display: "flex", gap: 26, justifyContent: "center" }}>
                      {([["Today's Open", latestRow.open], ["Today's High", latestRow.high], ["Today's Low", latestRow.low], ["Today's Close", latestRow.close]] as const).map(([label, value]) => (
                        <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>{label}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: label === "Today's Close" ? (latestRow.close >= latestRow.open ? "#60a5fa" : "#a78bfa") : "var(--text-secondary)" }}>
                            {formatPrice(value as number, decimalsForPair(selectedPair, value as number))}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div style={{ height: 1, background: "var(--border-medium)", marginTop: 12 }} />
                  </>
                )}
                </div>
                <div style={{ marginTop: 14, height: newsBoxHeight }}>
                  <NewsAndCalendarPanel
                    news={newsItems} newsLoading={newsLoading} pair={selectedPair}
                    calendarEvents={calendarEvents} calendarLoading={calendarLoading}
                  />
                </div>
              </div>
              )}
            </div>
          )}
          {/* ── Divider — doubles as the collapse/expand handle for
              everything below the chart (Strategies + category panels),
              hidden in Quad View, which never shows these panels ── */}
          {!quadView && (
          <div style={{ position: "relative", height: 2, background: "rgba(255,255,255,0.12)", margin: "10px 0 10px", flexShrink: 0 }}>
            <button
              onClick={() => setBelowChartCollapsed(v => !v)}
              title={belowChartCollapsed ? "Expand panels below chart" : "Collapse panels below chart"}
              style={{
                position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                width: 22, height: 14, padding: 0, display: "flex", alignItems: "center", justifyContent: "center",
                background: "transparent", border: "1px solid var(--border-medium)", borderRadius: 4,
                cursor: "pointer", color: "var(--text-secondary)", zIndex: 5,
              }}
            >
              <span style={{
                width: 0, height: 0,
                borderLeft: "4px solid transparent", borderRight: "4px solid transparent",
                ...(belowChartCollapsed
                  ? { borderTop: "5px solid currentColor" }
                  : { borderBottom: "5px solid currentColor" }),
              }} />
            </button>
          </div>
          )}
          {!belowChartCollapsed && !quadView && (
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
                const scrollable = cat.label !== "Strategies" && cat.count > cols;
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
                      gridTemplateColumns: `repeat(${cat.label === "Strategies" ? cols * 2 : cat.count}, 1fr)`,
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
                            {p.id === "macd"            && <MacdPanelBody         pair={selectedPair} indicatorTf={indicatorTf} />}
                            {p.id === "rsi9"            && <RsiPanelBody          pair={selectedPair} indicatorTf={indicatorTf} />}
                            {p.id === "rsi14"           && <Rsi14PanelBody        pair={selectedPair} indicatorTf={indicatorTf} />}
                            {p.id === "moving-averages" && <MaPanelBody           pair={selectedPair} indicatorTf={indicatorTf} />}
                            {p.id === "keltner"         && <KeltPanelBody         pair={selectedPair} indicatorTf={indicatorTf} />}
                            {p.id === "adx"             && <AdxPanelBody          pair={selectedPair} indicatorTf={indicatorTf} />}
                            {p.id === "ichimoku"        && <IchiPanelBody         rows={sheetRows} />}
                            {p.id === "session"         && <SessionPanelBody      rows={sheetRows} />}
                            {p.id === "volume"          && <VolumePanelBody       pair={selectedPair} indicatorTf={indicatorTf} />}
                            {p.id === "pivots"          && <PivotPanelBody        rows={sheetRows} />}
                            {p.id === "cci"             && <CciPanelBody          pair={selectedPair} indicatorTf={indicatorTf} />}
                            {p.id === "wr"              && <WrPanelBody           pair={selectedPair} indicatorTf={indicatorTf} />}
                            {p.id === "volatility"      && <VolatilityPanelBody   pair={selectedPair} indicatorTf={indicatorTf} />}
                            {p.id === "avg-price"       && <AvgPricePanelBody     pair={selectedPair} indicatorTf={indicatorTf} />}
                            {p.id === "roc"             && <RocPanelBody          pair={selectedPair} indicatorTf={indicatorTf} />}
                            {p.id === "atr"             && <AtrPanelBody          pair={selectedPair} indicatorTf={indicatorTf} />}
                            {p.id === "squeeze"         && <SqueezePanelBody      pair={selectedPair} indicatorTf={indicatorTf} />}
                            {p.id === "failure-swing"   && <FailureSwingPanelBody  rows={sheetRows} pair={selectedPair} />}
                            {p.id === "candle-context"  && <CandleContextPanelBody    pair={selectedPair} indicatorTf={indicatorTf} />}
                            {p.id === "market-structure" && <MarketStructurePanelBody pair={selectedPair} indicatorTf={indicatorTf} />}
                            {p.id === "regime"          && <RegimePanelBody           pair={selectedPair} indicatorTf={indicatorTf} showCandles={regimeShowCandles} onToggleCandles={() => setRegimeShowCandles(v => !v)} />}
                            {p.id === "macd-stack"      && <MacdStackPanelBody        pair={selectedPair} />}
                            {p.id === "ema-stack"       && <EmaStackPanelBody         pair={selectedPair} />}
                            {p.id === "ema-stack-200"   && <Ema200StackPanelBody      pair={selectedPair} />}
                            {p.id === "adx-stack"       && <AdxStackPanelBody         pair={selectedPair} />}
                            {p.id === "rsi-stack"       && <RsiStackPanelBody         pair={selectedPair} />}
                            {p.id === "squeeze-stack"   && <SqueezeStackPanelBody     pair={selectedPair} />}
                            {p.id === "cci-stack"       && <CciStackPanelBody         pair={selectedPair} />}
                            {p.id === "ms-stack"        && <MarketStructureStackPanelBody pair={selectedPair} />}
                          </BlankPanel>
                        );
                      })}
                    </div>
                    </div>
                  </div>
                );
                const isRowEnd = colsAccum % 4 === 0;
                if (catIdx === 0) {
                  // Indicator Timeframe selector lives directly below the Strategies row — it
                  // controls the indicator panels below, not the timeframe-independent stacks.
                  return [el, (
                    <div key="indicator-tf" style={{
                      width: "100%", flexShrink: 0,
                      display: "flex", alignItems: "center", gap: 10,
                      position: "sticky", top: 0, zIndex: 20,
                      background: "var(--bg-base)",
                      paddingTop: 10, paddingBottom: 10, marginTop: 8, marginBottom: 6,
                      borderBottom: "1px solid var(--border-subtle)",
                    }}>
                      <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Indicator Timeframe</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        {(["1W","1D","4H","1H","15M","5M","1M"] as const).map(tf => (
                          <button key={tf} onClick={() => setIndicatorTf(tf)} style={{
                            fontSize: 9, fontWeight: 700, padding: "4px 10px",
                            textTransform: "uppercase", letterSpacing: "0.08em",
                            background: indicatorTf === tf ? "var(--accent-dim)"    : "var(--bg-panel-alt)",
                            border:     indicatorTf === tf ? "1px solid var(--accent-border)" : "1px solid var(--border-medium)",
                            color:      indicatorTf === tf ? "var(--accent-text)"   : "var(--text-secondary)",
                            borderRadius: 8, cursor: "pointer",
                          }}>{tf}</button>
                        ))}
                      </div>
                    </div>
                  )];
                }
                return catIdx < CATEGORIES.length - 1 && isRowEnd
                  ? [el, <div key={`sep-${catIdx}`} style={{ width: "100%", height: 26, display: "flex", alignItems: "center", pointerEvents: "none" }}><div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} /></div>]
                  : [el];
              });
            })()}
          </div>
          )}
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
          {expanded.id === "ai-synthesis"    && <AiSynthesisPanelBody result={analysisResult} pair={selectedPair} expanded />}
          {expanded.id === "price"           && <PricePanelBody      rows={sheetRows} expanded />}
          {expanded.id === "macd"            && <MacdPanelBody       pair={selectedPair} indicatorTf={indicatorTf} expanded />}
          {expanded.id === "rsi9"            && <RsiPanelBody        pair={selectedPair} indicatorTf={indicatorTf} expanded />}
          {expanded.id === "rsi14"           && <Rsi14PanelBody      pair={selectedPair} indicatorTf={indicatorTf} expanded />}
          {expanded.id === "moving-averages" && <MaPanelBody         pair={selectedPair} indicatorTf={indicatorTf} expanded />}
          {expanded.id === "keltner"         && <KeltPanelBody       pair={selectedPair} indicatorTf={indicatorTf} expanded />}
          {expanded.id === "adx"             && <AdxPanelBody        pair={selectedPair} indicatorTf={indicatorTf} expanded />}
          {expanded.id === "ichimoku"        && <IchiPanelBody       rows={sheetRows} expanded />}
          {expanded.id === "session"         && <SessionPanelBody    rows={sheetRows} expanded />}
          {expanded.id === "volume"          && <VolumePanelBody     pair={selectedPair} indicatorTf={indicatorTf} expanded />}
          {expanded.id === "pivots"          && <PivotPanelBody      rows={sheetRows} expanded />}
          {expanded.id === "cci"             && <CciPanelBody        pair={selectedPair} indicatorTf={indicatorTf} expanded />}
          {expanded.id === "wr"              && <WrPanelBody         pair={selectedPair} indicatorTf={indicatorTf} expanded />}
          {expanded.id === "volatility"      && <VolatilityPanelBody pair={selectedPair} indicatorTf={indicatorTf} expanded />}
          {expanded.id === "avg-price"       && <AvgPricePanelBody   pair={selectedPair} indicatorTf={indicatorTf} expanded />}
          {expanded.id === "roc"             && <RocPanelBody        pair={selectedPair} indicatorTf={indicatorTf} expanded />}
          {expanded.id === "atr"             && <AtrPanelBody             pair={selectedPair} indicatorTf={indicatorTf} expanded />}
          {expanded.id === "squeeze"         && <SqueezePanelBody         pair={selectedPair} indicatorTf={indicatorTf} expanded />}
          {expanded.id === "failure-swing"   && <FailureSwingPanelBody   rows={sheetRows} pair={selectedPair} expanded />}
          {expanded.id === "ai-chat"         && <AlertsPanel instrument={selectedPair.replace("/", "_")} alerts={alerts} onUpdate={updateAlert} onDelete={deleteAlert} />}
          {expanded.id === "candle-context"   && <CandleContextPanelBody    pair={selectedPair} indicatorTf={indicatorTf} expanded />}
          {expanded.id === "market-structure" && <MarketStructurePanelBody  pair={selectedPair} indicatorTf={indicatorTf} expanded />}
          {expanded.id === "regime"           && <RegimePanelBody           pair={selectedPair} indicatorTf={indicatorTf} expanded showCandles={regimeShowCandles} onToggleCandles={() => setRegimeShowCandles(v => !v)} />}
          {expanded.id === "macd-stack"       && <MacdStackPanelBody        pair={selectedPair} expanded />}
          {expanded.id === "ema-stack"        && <EmaStackPanelBody         pair={selectedPair} expanded />}
          {expanded.id === "ema-stack-200"    && <Ema200StackPanelBody      pair={selectedPair} expanded />}
          {expanded.id === "adx-stack"        && <AdxStackPanelBody         pair={selectedPair} expanded />}
          {expanded.id === "rsi-stack"        && <RsiStackPanelBody         pair={selectedPair} expanded />}
          {expanded.id === "squeeze-stack"    && <SqueezeStackPanelBody     pair={selectedPair} expanded />}
          {expanded.id === "cci-stack"        && <CciStackPanelBody         pair={selectedPair} expanded />}
          {expanded.id === "ms-stack"         && <MarketStructureStackPanelBody pair={selectedPair} expanded />}
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
        {toast.subtitle ?? `${toast.instrument.replace("_", "/")} · ${toast.direction} ${toast.price.toFixed(5)}`}
      </div>
    </div>
  );
}
