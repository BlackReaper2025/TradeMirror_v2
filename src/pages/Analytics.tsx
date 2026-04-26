// ─── Analytics — 3-row layout + pair selector ─────────────────────────────────
//
//  PairSelector  — top strip, EUR/USD active, others placeholder
//  Row 1         — Verdict:  direction · confidence bar · signal tags · history %
//  Row 2         — Evidence: 5 equal group cards (Trend, MACD, Momentum, Volatility, Directional)
//  Row 3         — Detail:   Entry/Exit plan | Signal history dots | Live indicator bars
//
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, ReferenceLine,
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
  { id: "avg-price",       area: "avgp",  label: "Avg Price & Rate of Change", sub: "Group 5 — Avg Price · Avg Delta · ROC(5)" },
  { id: "volatility",      area: "vola",  label: "Volatility",                 sub: "Group 4 — ATR · Hist Vol · Bollinger Bands" },
  { id: "macd",            area: "macd",  label: "MACD",                       sub: "Group 7 — MACD · Signal · Histogram" },
  { id: "moving-averages", area: "ma",    label: "Moving Averages",            sub: "Group 6 — SMA(20/50/200) · EMA(9/12/20/26/50/200)" },
  { id: "pivots",          area: "pvt",   label: "Pivot Points",               sub: "Group 8 — R3/R2/R1 · S1/S2/S3" },
  { id: "keltner",         area: "kelt",  label: "Keltner Channels",           sub: "Group 9 — Kelt Upper · Mid · Lower" },
  { id: "rsi9",            area: "rsi9",  label: "RSI (9) + StochRSI",         sub: "Group 10 — RSI(9) · StochRSI %K/%D" },
  { id: "rsi14",           area: "rsi14", label: "RSI (14) + Trend",           sub: "Group 11 — RSI(14) · RSI Trend" },
  { id: "momentum",        area: "mom",   label: "Momentum Oscillators",       sub: "Group 12 — Williams %R · CCI · Momentum(10)" },
  { id: "adx",             area: "adx",   label: "Directional Movement / ADX", sub: "Group 13 — +DI · −DI · DX · ADX" },
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

const NO_SUB_IDS = new Set(["price", "macd"]);

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
          width:      "900px",
          height:     "600px",
          background: "var(--bg-panel-alt)",
          border:     "1px solid var(--border-medium)",
          boxShadow:  "0 24px 60px rgba(0,0,0,0.6)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`relative flex items-center shrink-0 ${panel.id === "macd" ? "px-4 py-2" : "px-5 py-4"}`}
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

  return (
    <div className="h-full flex flex-col overflow-hidden">
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
  const [offset, setOffset] = useState(0);

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
          <div className="flex flex-col justify-center px-5 py-2.5" style={{ flex: "0 0 auto", minWidth: 0, maxWidth: "45%" }}>
            <ul className="flex flex-col gap-0.5">
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
          <div className="flex-1 flex items-center px-5 py-2.5">
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {analysis.description}
            </p>
          </div>
        </div>
      )}

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
            <Bar dataKey="histogram" name="Histogram" isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.histogram >= 0 ? "rgba(74,222,128,0.7)" : "rgba(248,113,113,0.7)"} />
              ))}
            </Bar>
            <Line dataKey="macd"   name="MACD"   type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#60a5fa" isAnimationActive={false} />
            <Line dataKey="signal" name="Signal" type="monotone" dot={false} strokeWidth={expanded ? 1.5 : 1} stroke="#f59e0b" isAnimationActive={false} />
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
          className="shrink-0 text-[9px] font-black uppercase tracking-widest leading-none"
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
            badge={p.id === "macd" ? macdBadge : undefined}
            subtitle={p.id === "macd" ? macdHeadline : undefined}
            onExpand={() => setExpanded({ id: p.id, label: p.label, sub: p.sub })}>
            {p.id === "price" && <PricePanelBody rows={sheetRows} />}
            {p.id === "macd"  && <MacdPanelBody rows={sheetRows} />}
          </BlankPanel>
        ))}
      </div>

      {expanded && (
        <PanelModal panel={expanded} onClose={close} badge={expanded.id === "macd" ? macdBadgeExpanded : undefined} subtitle={expanded.id === "macd" ? macdHeadline : undefined}>
          {expanded.id === "price" && <PricePanelBody rows={sheetRows} expanded />}
          {expanded.id === "macd"  && <MacdPanelBody rows={sheetRows} expanded />}
        </PanelModal>
      )}

    </div>
  );
}
