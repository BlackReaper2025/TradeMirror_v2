// ─── Analytics — 3-row layout + pair selector ─────────────────────────────────
//
//  PairSelector  — top strip, EUR/USD active, others placeholder
//  Row 1         — Verdict:  direction · confidence bar · signal tags · history %
//  Row 2         — Evidence: 5 equal group cards (Trend, MACD, Momentum, Volatility, Directional)
//  Row 3         — Detail:   Entry/Exit plan | Signal history dots | Live indicator bars
//
import { useEffect, useRef, useState, useCallback } from "react";
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


interface PanelMeta { label: string; sub: string }

function PanelModal({ panel, onClose }: { panel: PanelMeta; onClose: () => void }) {
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
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-black uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
              {panel.label}
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              {panel.sub}
            </span>
          </div>
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

        {/* Body (empty for now) */}
        <div className="flex-1" />

        {/* Footer */}
        <div className="px-5 pb-4 text-center text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)", opacity: 0.4 }}>
          Press Esc or click outside to close
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

function PricePanelBody({ rows }: { rows: SheetRow[] }) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [rows]);

  const hdr  = "text-[7px] font-black uppercase tracking-widest py-1 text-center";
  const cell = "text-[10px] tabular-nums py-[3px] text-center";
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

function BlankPanel({ area, label, sub, style, onExpand, children }: {
  area?: string;
  label: string;
  sub: string;
  style?: React.CSSProperties;
  onExpand: () => void;
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
        className="relative flex items-center justify-between shrink-0 px-3 py-1.5"
        style={{ borderBottom: "1px solid var(--border-subtle)", zIndex: 1 }}
      >
        <span
          className="text-[9px] font-black uppercase tracking-widest leading-none"
          style={{ color: "var(--text-secondary)" }}
        >
          {label}
        </span>
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
            onExpand={() => setExpanded({ label: p.label, sub: p.sub })}>
            {p.id === "price" && <PricePanelBody rows={sheetRows} />}
          </BlankPanel>
        ))}
      </div>

      {expanded && <PanelModal panel={expanded} onClose={close} />}

    </div>
  );
}
