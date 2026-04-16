// ─── EquityChart — standalone equity curve panel with timeframe selector ──────
import React, { useState, useMemo, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { getSlideshowFolder, getSlideshowInterval } from "../../lib/preferences";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ComposedChart, Customized,
} from "recharts";
import { Images, ChevronLeft, ChevronRight, Play, Pause } from "lucide-react";
import { Panel } from "../ui/Panel";
import type { Account, Candle } from "../../db/queries";
import { getHourlyCandles, getDailyCandles, get15MinCandles, getIntradayCurve } from "../../db/queries";
import { useDatabase } from "../../db/DatabaseProvider";

function fmtBalance(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

// ─── Timeframe ─────────────────────────────────────────────────────────────────

const TIMEFRAMES = ["1H", "1D", "1W", "1M", "3M", "YTD", "ALL"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

const CANDLE_TIMEFRAMES: Timeframe[] = ["1H"]; // 1D now uses intraday line chart

function filterCurve(
  curve: Array<{ date: string; balance: number }>,
  tf: Timeframe,
): Array<{ date: string; balance: number }> {
  const cutoff = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split("T")[0];
  };
  switch (tf) {
    case "1H":  return []; // handled by CandleChart
    case "1D":  return []; // handled by intraday line chart
    case "1W":  return curve.filter(p => p.date >= cutoff(7));
    case "1M":  return curve.filter(p => p.date >= cutoff(30));
    case "3M":  return curve.filter(p => p.date >= cutoff(90));
    case "YTD": return curve.filter(p => p.date >= `${new Date().getFullYear()}-01-01`);
    case "ALL": return curve;
  }
}

// ─── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  startingBalance: number;
}

function ChartTooltip({ active, payload, label, startingBalance }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const val  = payload[0].value;
  const diff = val - startingBalance;
  const isPos = diff >= 0;
  return (
    <div className="px-3 py-2.5 rounded-xl text-[12px]"
      style={{ background: "#0d1219", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
      <div style={{ color: "#8899aa" }}>{label}</div>
      <div className="font-bold tabular-nums mt-0.5" style={{ color: "#dce6f4" }}>
        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val)}
      </div>
      <div className="tabular-nums" style={{ color: isPos ? "#4ade80" : "#f87171" }}>
        {isPos ? "+" : ""}
        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(diff)}
      </div>
    </div>
  );
}

// ─── Candle tooltip ────────────────────────────────────────────────────────────

function CandleTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Candle }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const diff  = d.close - d.open;
  const isUp  = diff >= 0;
  const fmt   = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  return (
    <div className="px-3 py-2.5 rounded-xl text-[12px]"
      style={{ background: "#0d1219", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
      <div style={{ color: "#8899aa" }}>{d.time}</div>
      <div className="tabular-nums mt-0.5" style={{ color: "#8899aa", fontSize: 10 }}>
        O {fmt(d.open)} · H {fmt(d.high)} · L {fmt(d.low)} · C {fmt(d.close)}
      </div>
      <div className="font-bold tabular-nums mt-0.5" style={{ color: isUp ? "#4ade80" : "#f87171" }}>
        {isUp ? "+" : ""}{fmt(diff)}
      </div>
    </div>
  );
}

// ─── Candle SVG layer — receives scales via Recharts Customized props ─────────

function CandlesLayer({ candles, xAxisMap, yAxisMap }: {
  candles: Candle[];
  xAxisMap?: Record<string, { scale: (v: string) => number; bandwidth?: () => number }>;
  yAxisMap?: Record<string, { scale: (v: number) => number }>;
}) {
  const xAxis = xAxisMap?.[0];
  const yAxis = yAxisMap?.[0];
  if (!xAxis || !yAxis || candles.length === 0) return null;

  const xScale    = xAxis.scale;
  const yScale    = yAxis.scale;
  const bandwidth = xAxis.bandwidth?.() ?? (() => {
    if (candles.length < 2) return 40;
    return Math.abs(xScale(candles[1].time) - xScale(candles[0].time));
  })();
  const candleW = Math.max(4, Math.min(bandwidth * 0.6, 22));

  return (
    <g>
      {candles.map((d, i) => {
        const xMid   = xScale(d.time) + bandwidth / 2;
        const yOpen  = yScale(d.open);
        const yClose = yScale(d.close);
        const yHigh  = yScale(d.high);
        const yLow   = yScale(d.low);

        const isUp      = d.close >= d.open;
        const color     = isUp ? "#4ade80" : "#f87171";
        const fillColor = isUp ? "rgba(74,222,128,0.85)" : "rgba(248,113,113,0.85)";
        const bodyTop   = Math.min(yOpen, yClose);
        const bodyH     = Math.max(Math.abs(yClose - yOpen), 1.5);

        return (
          <g key={i}>
            <line x1={xMid} y1={yHigh} x2={xMid} y2={yLow} stroke={color} strokeWidth={1.5} />
            <rect x={xMid - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={fillColor} rx={1} />
          </g>
        );
      })}
    </g>
  );
}

// ─── Candle chart wrapper ─────────────────────────────────────────────────────

function CandleChart({ candles, startingBalance }: { candles: Candle[]; startingBalance: number }) {
  if (candles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>No trade data for this timeframe</span>
      </div>
    );
  }
  const allVals = candles.flatMap(c => [c.high, c.low]);
  const minVal  = Math.min(...allVals);
  const maxVal  = Math.max(...allVals);
  const pad     = (maxVal - minVal) * 0.15 || 200;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={candles} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.035)" vertical={false} />
        <XAxis dataKey="time" tick={{ fill: "#4a5568", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis
          domain={[minVal - pad, maxVal + pad]}
          tick={{ fill: "#4a5568", fontSize: 10 }}
          axisLine={false} tickLine={false}
          tickFormatter={fmtBalance} width={52}
        />
        <Tooltip content={<CandleTooltip />} cursor={{ stroke: "rgba(255,255,255,0.07)", strokeWidth: 1 }} />
        <Customized component={(props: object) => <CandlesLayer candles={candles} {...(props as Parameters<typeof CandlesLayer>[0])} />} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ─── Slideshow error boundary — prevents black screen on any render error ──────

class SlideshowBoundary extends React.Component<
  { children: React.ReactNode },
  { err: string | null }
> {
  state = { err: null };
  static getDerivedStateFromError(e: Error) { return { err: e.message ?? "Unknown error" }; }
  render() {
    if (this.state.err) return (
      <div className="h-full flex items-center justify-center px-6 text-center">
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Slideshow error: {this.state.err}
        </span>
      </div>
    );
    return this.props.children;
  }
}

// ─── Slideshow view ───────────────────────────────────────────────────────────

// Normalise Windows backslashes → forward slashes so asset protocol resolves correctly
function toAssetSrc(filePath: string): string {
  const normalised = filePath.replace(/\\/g, "/");
  return convertFileSrc(normalised);
}

interface SlideshowViewProps {
  images:   string[];
  idx:      number;
  setIdx:   React.Dispatch<React.SetStateAction<number>>;
  onLoaded: (paths: string[]) => void;
}

function SlideshowView({ images, idx, setIdx, onLoaded }: SlideshowViewProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    const folder = getSlideshowFolder();
    if (!folder) {
      setStatus("error");
      setErrMsg("No folder set. Add one in Settings → Inspiration.");
      return;
    }
    invoke<string[]>("list_images", { folder })
      .then(paths => {
        if (cancelled) return;
        if (paths.length === 0) { setStatus("error"); setErrMsg("No images found in that folder."); return; }
        onLoaded(paths);
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setErrMsg(`Could not read folder: ${String(e)}`);
      });
    return () => { cancelled = true; };
  }, []);

  if (status === "error") return (
    <div className="h-full flex items-center justify-center px-6 text-center">
      <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>{errMsg}</span>
    </div>
  );

  if (status === "loading" || images.length === 0) return (
    <div className="h-full flex items-center justify-center">
      <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</span>
    </div>
  );

  const src = toAssetSrc(images[idx]);

  return (
    <div className="h-full w-full flex items-center justify-center">
      <img
        key={src}
        src={src}
        alt=""
        className="h-full w-full"
        style={{ objectFit: "contain" }}
        onError={() => {
          if (images.length > 1) setIdx(i => (i + 1) % images.length);
        }}
      />
    </div>
  );
}

// ─── Timeframe button ──────────────────────────────────────────────────────────

function TfButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide transition-colors"
      style={{
        background: active ? "var(--accent-dim)" : "rgba(8,12,18,0.70)",
        border: `1px solid ${active ? "var(--accent-border)" : "rgba(255,255,255,0.07)"}`,
        color: active ? "var(--accent-text)" : "var(--text-muted)",
        backdropFilter: "blur(4px)",
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
    >
      {label}
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface Props {
  equityCurve: Array<{ date: string; balance: number }>;
  account:     Account | null;
}

export function EquityChart({ equityCurve, account }: Props) {
  const [timeframe, setTimeframe]     = useState<Timeframe>("ALL");
  const [candles, setCandles]         = useState<Candle[]>([]);
  const [intradayCurve, setIntraday]  = useState<Array<{ date: string; balance: number }>>([]);
  const [viewMode, setViewMode]     = useState<"chart" | "slideshow">("chart");
  const [ssImages,  setSsImages]    = useState<string[]>([]);
  const [ssIdx,     setSsIdx]       = useState(0);
  const [ssPlaying, setSsPlaying]   = useState(true);
  const { ready }                   = useDatabase();

  // Auto-advance slideshow
  useEffect(() => {
    if (viewMode !== "slideshow" || ssImages.length < 2 || !ssPlaying) return;
    const id = setInterval(() => setSsIdx(i => (i + 1) % ssImages.length), getSlideshowInterval() * 1_000);
    return () => clearInterval(id);
  }, [viewMode, ssImages.length, ssPlaying]);

  const isCandle = CANDLE_TIMEFRAMES.includes(timeframe);

  useEffect(() => {
    if (!isCandle || !account || !ready) { setCandles([]); return; }
    getHourlyCandles(account.id).then(setCandles).catch(() => setCandles([]));
  }, [timeframe, account?.id, ready, isCandle]);

  useEffect(() => {
    if (timeframe !== "1D" || !account || !ready) { setIntraday([]); return; }
    getIntradayCurve(account.id, 24).then(setIntraday).catch(() => setIntraday([]));
  }, [timeframe, account?.id, ready]);

  const startingBalance = account?.startingBalance ?? 0;
  const allTimeGain     = account ? account.currentBalance - account.startingBalance : 0;
  const isPos           = allTimeGain >= 0;

  const filtered     = useMemo(() => filterCurve(equityCurve, timeframe), [equityCurve, timeframe]);
  const displayData  = timeframe === "1D" ? intradayCurve : filtered;
  const tickInterval = timeframe === "1W"
    ? 0
    : Math.max(1, Math.floor(displayData.length / 6));

  const minBal   = displayData.length ? Math.min(...displayData.map(p => p.balance)) : 0;
  const maxBal   = displayData.length ? Math.max(...displayData.map(p => p.balance)) : 0;
  const yPadding = (maxBal - minBal) * 0.15 || 200;

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "14px", padding: "1.5px", pointerEvents: "none", zIndex: 1, background: "rgba(255,255,255,0.12)", WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude" } as React.CSSProperties} />
    <Panel state className="h-full flex flex-col gap-0 p-0 overflow-hidden" style={{ border: "none", borderRadius: "14px", background: "radial-gradient(ellipse at top left, rgba(255,255,255,0.07) 0%, transparent 60%), rgba(8,12,18,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", boxShadow: "none" } as React.CSSProperties}>

      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-5 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center">
          <span className="text-[14px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
            {viewMode === "chart" ? "Equity Curve" : "Inspiration"}
          </span>
          {viewMode === "chart" && (
            <span className="text-[11px] tabular-nums font-medium ml-3" style={{ color: isPos ? "var(--accent-text)" : "#f87171" }}>
              {isPos ? "+" : ""}
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(allTimeGain)} all time
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {viewMode === "slideshow" && ssImages.length > 1 && (
            <>
              <button
                onClick={() => setSsIdx(i => (i - 1 + ssImages.length) % ssImages.length)}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-muted)" }}
              >
                <ChevronLeft size={13} />
              </button>
              <button
                onClick={() => setSsPlaying(p => !p)}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-muted)" }}
              >
                {ssPlaying ? <Pause size={12} /> : <Play size={12} />}
              </button>
              <button
                onClick={() => setSsIdx(i => (i + 1) % ssImages.length)}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-muted)" }}
              >
                <ChevronRight size={13} />
              </button>
              <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                {ssIdx + 1}/{ssImages.length}
              </span>
            </>
          )}
          <button
            onClick={() => setViewMode(m => m === "chart" ? "slideshow" : "chart")}
            title={viewMode === "chart" ? "Switch to slideshow" : "Switch to equity curve"}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{
              background: viewMode === "slideshow" ? "var(--accent-dim)" : "rgba(255,255,255,0.06)",
              border: viewMode === "slideshow" ? "1px solid var(--accent-border)" : "1px solid rgba(255,255,255,0.1)",
              color: viewMode === "slideshow" ? "var(--accent-text)" : "var(--text-muted)",
            }}
          >
            <Images size={13} />
          </button>
        </div>
      </div>

      {/* ── Content — flex-1 ── */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        {viewMode === "slideshow" ? (
          <SlideshowBoundary>
            <SlideshowView images={ssImages} idx={ssIdx} setIdx={setSsIdx} onLoaded={setSsImages} />
          </SlideshowBoundary>
        ) : (
        <>
        {/* Timeframe buttons — top right */}
        <div className="absolute top-3 right-3 flex items-center gap-1" style={{ zIndex: 2 }}>
          {TIMEFRAMES.map(tf => (
            <TfButton key={tf} label={tf} active={timeframe === tf} onClick={() => setTimeframe(tf)} />
          ))}
        </div>
        {isCandle ? (
          <CandleChart candles={candles} startingBalance={startingBalance} />
        ) : displayData.length < 2 ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              No trade data for this timeframe
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={displayData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="var(--chart-line)" stopOpacity={0.26} />
                  <stop offset="60%"  stopColor="var(--chart-line)" stopOpacity={0.06} />
                  <stop offset="100%" stopColor="var(--chart-line)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.035)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "#4a5568", fontSize: 10 }}
                axisLine={false} tickLine={false}
                interval={tickInterval}
                tickFormatter={(val: string) => {
                  if (!val.includes("-")) return val; // already "HH:MM"
                  const d = new Date(val + "T00:00:00");
                  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                }}
              />
              <YAxis
                domain={[minBal - yPadding, maxBal + yPadding]}
                tick={{ fill: "#4a5568", fontSize: 10 }}
                axisLine={false} tickLine={false}
                tickFormatter={fmtBalance} width={52}
              />
              <Tooltip
                content={<ChartTooltip startingBalance={startingBalance} />}
                cursor={{ stroke: "rgba(255,255,255,0.07)", strokeWidth: 1 }}
              />
              <Area
                type="monotone" dataKey="balance"
                stroke="var(--chart-line)" strokeWidth={2.5}
                fill="url(#equityGrad)" dot={false}
                activeDot={{ r: 5, fill: "var(--chart-line)", stroke: "var(--bg-panel)", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
        </>
        )}
      </div>

    </Panel>
    </div>
  );
}
