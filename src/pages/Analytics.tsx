// ─── Analytics — 3-row layout + pair selector ─────────────────────────────────
//
//  PairSelector  — top strip, EUR/USD active, others placeholder
//  Row 1         — Verdict:  direction · confidence bar · signal tags · history %
//  Row 2         — Evidence: 5 equal group cards (Trend, MACD, Momentum, Volatility, Directional)
//  Row 3         — Detail:   Entry/Exit plan | Signal history dots | Live indicator bars
//
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, ReferenceLine, ReferenceArea,
  ResponsiveContainer, Cell, Tooltip,
} from "recharts";
import { Maximize2, X }          from "lucide-react";
import { VerdictPanel }          from "../components/analytics/VerdictPanel";
import { EvidenceCards }         from "../components/analytics/EvidenceCards";
import { EntryExitPanel }        from "../components/analytics/EntryExitPanel";
import { HistoryDotsPanel }      from "../components/analytics/HistoryDotsPanel";
import { PairSelector }          from "../components/analytics/PairSelector";
import { useAnalytics, setLiveAnalytics, hasLiveAnalytics, signalHistory, historicalAccuracy } from "../data/analyticsData";
import { fetchSheetRows }        from "../lib/googleSheets";
import type { SheetRow }         from "../lib/googleSheets";
import { analyze }               from "../lib/brain/analyzer";

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

const PANELS: { id: string; area: string; label: string; sub: string }[] = [
  { id: "ai-synthesis",    area: "ais",   label: "AI Synthesis",               sub: "Signal convergence verdict" },
  { id: "trend-score",     area: "ts",    label: "Trend Score",                sub: "Composite trend strength" },
  { id: "ai-positioning",  area: "aip",   label: "AI Positioning",             sub: "Entry · Exit · Stop" },
  { id: "price",           area: "price", label: "Price",                      sub: "Group 1 — OHLC · Body · Wicks" },
  { id: "session",         area: "sess",  label: "Session Context",            sub: "Group 2 — Gap · Inside Bar · % Change" },
  { id: "volume",          area: "vol",   label: "Volume",                     sub: "Group 3 — Volume · OBV · Vol SMA" },
  { id: "avg-price",       area: "avgp",  label: "AVG PRICE &\nRATE OF CHANGE", sub: "Group 5 — Avg Price · Avg Delta · ROC(5)" },
  { id: "volatility",      area: "vola",  label: "Volatility",                 sub: "Group 4 — ATR · Hist Vol · Bollinger Bands" },
  { id: "macd",            area: "macd",  label: "MACD",                       sub: "Group 7 — MACD · Signal · Histogram" },
  { id: "moving-averages", area: "ma",    label: "MOVING\nAVERAGES",           sub: "Group 6 — SMA(20/50/200) · EMA(9/12/20/26/50/200)" },
  { id: "pivots",          area: "pvt",   label: "Pivot Points",               sub: "Group 8 — R3/R2/R1 · S1/S2/S3" },
  { id: "keltner",         area: "kelt",  label: "KELTNER\nCHANNELS",          sub: "Group 9 — Kelt Upper · Mid · Lower" },
  { id: "rsi9",            area: "rsi9",  label: "RSI (9) +\nSTOCHRSI",        sub: "Group 10 — RSI(9) · StochRSI %K/%D" },
  { id: "rsi14",           area: "rsi14", label: "RSI (14) +\nTREND",          sub: "Group 11 — RSI(14) · RSI Trend" },
  { id: "momentum",        area: "mom",   label: "MOMENTUM\nOSCILLATORS",      sub: "Group 12 — Williams %R · CCI · Momentum(10)" },
  { id: "adx",             area: "adx",   label: "DIRECTIONAL\nMOVEMENT",      sub: "Group 13 — +DI · −DI · DX · ADX" },
  { id: "ichimoku",        area: "ichi",  label: "Ichimoku Cloud",             sub: "Group 14 — Tenkan · Kijun · Senkou · Chikou" },
];


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

const NO_SUB_IDS = new Set(["price", "macd", "rsi9", "rsi14", "moving-averages"]);

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
          className={`relative flex items-center shrink-0 ${panel.id === "macd" ? "px-4 py-2" : panel.id === "price" ? "px-5 py-2" : "px-5 py-4"}`}
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
            <div className={cell} style={{ color: i === 0 ? grey : r.close > rows[i-1].close ? "#4ade80" : r.close < rows[i-1].close ? "#f87171" : grey }}>{r.close.toFixed(4)}</div>
            <VLine />
            {(() => { const chg = (r.close - r.open) / r.open * 100; return (
              <div className={cell} style={{ color: chg >= 0 ? "#4ade80" : "#f87171" }}>{chg.toFixed(2)}%</div>
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
          { key: "hist",   label: "Histogram", color: "#4ade80", on: showHist,   set: setShowHist   },
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
                  <Cell key={i} fill={d.histogram >= 0 ? "rgba(74,222,128,0.7)" : "rgba(248,113,113,0.7)"} />
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
            { color: "#4ade80", name: "Histogram", body: "The difference between the MACD line and the Signal line, plotted as bars. Green bars mean MACD is above Signal (bullish momentum); red bars mean MACD is below Signal (bearish momentum). Growing bars signal accelerating momentum; shrinking bars warn of a slowdown or reversal. The histogram turns before the lines cross, making it a leading indicator of momentum shifts." },
            { color: "#60a5fa", name: "MACD Line", body: "Calculated as EMA(12) minus EMA(26). It measures the difference between two exponential moving averages of price. When MACD is positive, the short-term average is above the long-term — a bullish condition. When negative, bearish. Crossovers of the zero line are used as trend-change signals, though they lag price action." },
            { color: "#f59e0b", name: "Signal Line", body: "A 9-period EMA of the MACD line itself. It acts as a trigger: when MACD crosses above the Signal line, it generates a buy signal; when it crosses below, a sell signal. The Signal line smooths the MACD and reduces noise. Crossovers in extreme territory (far from zero) are considered more reliable than those near zero." },
          ].map((item, i, arr) => (
            <div key={item.name} className="flex-1 flex flex-col gap-1 px-4 py-2.5" style={{ borderRight: i < arr.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
              <div className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <span className="text-[10px] font-bold" style={{ color: item.color }}>{item.name}</span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{item.body}</p>
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
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{item.body}</p>
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
              domain={[0, 100]}
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
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{item.body}</p>
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

const MA_WINDOW = 20;

function MaPanelBody({ rows, expanded }: { rows: SheetRow[]; expanded?: boolean }) {
  const windowSize = expanded ? 40 : MA_WINDOW;
  const maxOffset  = Math.max(0, rows.length - windowSize);
  const [offset, setOffset]         = useState(0);
  const [showClose,  setShowClose]  = useState(true);
  const [showEma9,   setShowEma9]   = useState(true);
  const [showEma20,  setShowEma20]  = useState(true);
  const [showEma50,  setShowEma50]  = useState(true);
  const [showEma200, setShowEma200] = useState(true);

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
    { key: "ema200", label: "EMA200", color: "#4ade80",               on: showEma200, set: setShowEma200 },
  ] as const;

  const yDomain = useMemo(() => {
    const vals: number[] = [];
    data.forEach(d => {
      if (showClose)  vals.push(d.close);
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
            <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={yAxisWidth} domain={yDomain} tickFormatter={v => v.toFixed(4)} />
            <Tooltip content={<MaTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} position={{ x: 10, y: 10 }} />
            {showClose  && <Line dataKey="close"  name="Close"  type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="rgba(255,255,255,0.55)" isAnimationActive={false} />}
            {showEma9   && <Line dataKey="ema9"   name="EMA9"   type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#f472b6" isAnimationActive={false} />}
            {showEma20  && <Line dataKey="ema20"  name="EMA20"  type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#60a5fa" isAnimationActive={false} />}
            {showEma50  && <Line dataKey="ema50"  name="EMA50"  type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#f59e0b" isAnimationActive={false} />}
            {showEma200 && <Line dataKey="ema200" name="EMA200" type="monotone" dot={false} strokeWidth={expanded ? 2 : 1.5} stroke="#4ade80" isAnimationActive={false} />}
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
            { color: "rgba(255,255,255,0.7)", name: "Close",  body: "The closing price for each session. Acts as the reference for all moving average comparisons — whether price is above or below a given MA defines short, medium, or long-term bias." },
            { color: "#f472b6",               name: "EMA9",   body: "9-period Exponential Moving Average. The fastest line, highly responsive to recent price action. Acts as dynamic short-term support in uptrends and resistance in downtrends. A close below EMA9 in an uptrend is often the first warning of weakness." },
            { color: "#60a5fa",               name: "EMA20",  body: "20-period Exponential Moving Average. A responsive short-to-medium-term trend filter. Because EMAs weight recent prices more heavily than SMAs, EMA20 reacts faster to price changes. Price holding above EMA20 in an uptrend confirms short-term bullish structure; a sustained break below is an early warning of trend weakness." },
            { color: "#f59e0b",               name: "EMA50",  body: "50-period Exponential Moving Average. The primary medium-term trend reference. Faster-reacting than SMA50, it gives earlier signals on trend changes. Institutional traders watch EMA50 closely — a price cross above or below this level often triggers significant order flow. Uptrends require price above EMA50." },
            { color: "#4ade80",               name: "EMA200", body: "200-period Exponential Moving Average. The long-term trend anchor. Price above EMA200 = bull market context; below = bear market. The EMA200 golden cross (EMA50 crossing above EMA200) and death cross (EMA50 crossing below) are widely followed structural signals — EMA versions react faster than their SMA equivalents." },
          ].map((item, i, arr) => (
            <div key={item.name} className="flex-1 flex flex-col gap-1 px-3 py-2.5" style={{ borderRight: i < arr.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
              <div className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <span className="text-[10px] font-bold" style={{ color: item.color }}>{item.name}</span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BlankPanel({ area, label, sub, style, onExpand, badge, subtitle, children }: {
  area?: string;
  label: string;
  sub: string;
  style?: React.CSSProperties;
  onExpand: () => void;
  badge?: React.ReactNode;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="relative overflow-hidden flex flex-col"
      style={{
        gridArea:     area,
        borderRadius: "14px",
        border:       "2px solid transparent",
        background: [
          "linear-gradient(var(--bg-panel), var(--bg-panel)) padding-box",
          "radial-gradient(ellipse 80% 80% at 0% 0%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 100%) border-box",
        ].join(", "),
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

export function Analytics() {
  const { analysisResult, eurusdSnapshot, sheetRows } = useAnalytics();
  const [error, setError]       = useState<string | null>(null);
  const [expanded, setExpanded] = useState<PanelMeta | null>(null);
  const close = useCallback(() => setExpanded(null), []);

  useEffect(() => {
    if (hasLiveAnalytics()) return;
    fetchSheetRows(50)
      .then(rows => {
        setLiveAnalytics({ ...analyze(rows), signalHistory, historicalAccuracy, sheetRows: rows });
      })
      .catch(err => setError(String(err)));
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
    bullish: { color: "#4ade80", bg: "rgba(74,222,128,0.12)",  border: "rgba(74,222,128,0.35)",  glow: "0 0 8px rgba(74,222,128,0.45)"  },
    bearish: { color: "#f87171", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.35)", glow: "0 0 8px rgba(248,113,113,0.45)" },
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

      {/* ── Panels grid ───────────────────────────────────────────── */}
      <div
        className="flex-1 min-h-0"
        style={{
          display:             "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gridTemplateRows:    "repeat(5, 1fr)",
          gridTemplateAreas:   `
            "ais   ais  ts    aip"
            "price sess vol   avgp"
            "vola  macd pvt   kelt"
            "ma    rsi9 rsi14 mom"
            "adx   adx  ichi  ichi"
          `,
          gap: "10px",
        }}
      >
        {PANELS.map(p => (
          <BlankPanel key={p.id} area={p.area} label={p.label} sub={p.sub}
            badge={p.id === "macd" ? macdBadge : p.id === "price" ? priceBadge : p.id === "rsi9" ? rsiBadge : p.id === "rsi14" ? rsi14Badge : p.id === "moving-averages" ? maBadge : undefined}
            subtitle={p.id === "macd" ? macdHeadline : p.id === "price" ? priceHeadline : p.id === "rsi9" ? rsiHeadline : p.id === "rsi14" ? rsi14Headline : p.id === "moving-averages" ? maHeadline : undefined}
            onExpand={() => setExpanded({ id: p.id, label: p.label, sub: p.sub })}>
            {p.id === "price"           && <PricePanelBody rows={sheetRows} />}
            {p.id === "macd"            && <MacdPanelBody  rows={sheetRows} />}
            {p.id === "rsi9"            && <RsiPanelBody   rows={sheetRows} />}
            {p.id === "rsi14"           && <Rsi14PanelBody rows={sheetRows} />}
            {p.id === "moving-averages" && <MaPanelBody    rows={sheetRows} />}
          </BlankPanel>
        ))}
      </div>

      {expanded && (
        <PanelModal panel={expanded} onClose={close} badge={expanded.id === "macd" ? macdBadgeExpanded : expanded.id === "price" ? priceBadgeExpanded : expanded.id === "rsi9" ? rsiBadgeExpanded : expanded.id === "rsi14" ? rsi14BadgeExpanded : expanded.id === "moving-averages" ? maBadgeExpanded : undefined} subtitle={expanded.id === "macd" ? macdHeadline : expanded.id === "price" ? priceHeadline : expanded.id === "rsi9" ? rsiHeadline : expanded.id === "rsi14" ? rsi14Headline : expanded.id === "moving-averages" ? maHeadline : undefined}>
          {expanded.id === "price"           && <PricePanelBody rows={sheetRows} expanded />}
          {expanded.id === "macd"            && <MacdPanelBody  rows={sheetRows} expanded />}
          {expanded.id === "rsi9"            && <RsiPanelBody   rows={sheetRows} expanded />}
          {expanded.id === "rsi14"           && <Rsi14PanelBody rows={sheetRows} expanded />}
          {expanded.id === "moving-averages" && <MaPanelBody    rows={sheetRows} expanded />}
        </PanelModal>
      )}

    </div>
  );
}
