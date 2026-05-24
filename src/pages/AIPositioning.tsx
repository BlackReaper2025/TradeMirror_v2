// ─── AI Positioning — daily snapshot tracking + outcome reporting ─────────────
//
// Visual language mirrors Analytics V3: verdict-driven accent (long = blue,
// short = purple, neutral = grey) injected as CSS vars at the page container,
// a pair pill top bar, a glowing direction + confidence-bar hero, and
// strong-shadow glass panels over var(--bg-base).
//
// Read-only validation surface. All derivation happens in Rust — no indicator
// math here.

import { useEffect, useState, useCallback, type CSSProperties } from "react";
import { TrendingUp, TrendingDown, Minus, RefreshCw, AlertCircle } from "lucide-react";
import { Panel, PanelHeader } from "../components/ui/Panel";
import { StatCard } from "../components/ui/StatCard";
import { Badge } from "../components/ui/Badge";
import {
  listResolvedSnapshots, getAccuracyStats, forceSnapshot, forceResolve, parseRationale,
  type ResolvedSnapshot, type AccuracyStats, type SliceStats,
  type Direction, type FirstLevelHit,
} from "../lib/brain/synthesis";

const PAIR = "EUR/USD";
const HISTORY_LIMIT = 30;
const STATS_WINDOW_DAYS = 90;

// Verdict-driven accent — overrides the theme accent vars at the container level
// so every child using var(--accent-*) inherits the bias colour (matches AV3).
const VERDICT_VARS: Record<"long" | "short" | "neutral", CSSProperties> = {
  long:    { "--accent-text": "#60a5fa", "--accent-dim": "rgba(96,165,250,0.11)",  "--accent-border": "rgba(96,165,250,0.25)" } as CSSProperties,
  short:   { "--accent-text": "#a78bfa", "--accent-dim": "rgba(167,139,250,0.10)", "--accent-border": "rgba(167,139,250,0.24)" } as CSSProperties,
  neutral: { "--accent-text": "#94a3b8", "--accent-dim": "rgba(148,163,184,0.10)", "--accent-border": "rgba(148,163,184,0.20)" } as CSSProperties,
};

// ─── Formatting helpers ───────────────────────────────────────────────────────

const fmtPrice = (n: number) => n.toFixed(5);
const fmtPips  = (n: number) => `${n.toFixed(1)}`;
const fmtR     = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}R`;
const fmtPct   = (n: number) => `${Math.round(n * 100)}%`;

function fmtDate(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

// Direction badge colours follow the AV3 bias palette (blue / purple).
function dirColor(dir: Direction): "blue" | "purple" | "neutral" {
  return dir === "LONG" ? "blue" : dir === "SHORT" ? "purple" : "neutral";
}

// Outcome colours keep win/loss semantics (green TP, red SL).
function hitColor(hit: FirstLevelHit): "green" | "red" | "neutral" {
  if (hit === "sl")   return "red";
  if (hit === "none") return "neutral";
  return "green";
}

function rColor(r: number): string {
  if (r > 0.001)  return "#4ade80";
  if (r < -0.001) return "#f87171";
  return "var(--text-secondary)";
}

// ─── Slice breakdown table ────────────────────────────────────────────────────

function SliceTable({ title, rows }: { title: string; rows: SliceStats[] }) {
  return (
    <div>
      <div className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>No resolved samples yet</div>
      ) : (
        <div className="flex flex-col gap-1">
          {rows.map((s) => (
            <div
              key={s.key}
              className="grid items-center text-[12px] py-1.5 px-2 rounded-lg"
              style={{ gridTemplateColumns: "1.4fr 0.5fr 0.8fr 0.9fr", background: "var(--bg-panel)" }}
            >
              <span style={{ color: "var(--text-secondary)" }} className="truncate">{s.key.replace(/^\d+\s/, "")}</span>
              <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>{s.n}</span>
              <span className="tabular-nums" style={{ color: "var(--text-secondary)" }}>{fmtPct(s.win_rate)}</span>
              <span className="tabular-nums font-semibold" style={{ color: rColor(s.expectancy_r) }}>{fmtR(s.expectancy_r)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AIPositioning() {
  const [history, setHistory] = useState<ResolvedSnapshot[]>([]);
  const [stats, setStats]     = useState<AccuracyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [hist, st] = await Promise.all([
        listResolvedSnapshots(PAIR, HISTORY_LIMIT),
        getAccuracyStats(PAIR, STATS_WINDOW_DAYS),
      ]);
      setHistory(hist);
      setStats(st);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onSnapshot = useCallback(async () => {
    setBusy(true); setError(null);
    try { await forceSnapshot(PAIR); await load(); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }, [load]);

  const onResolve = useCallback(async (snapshotId: number) => {
    setBusy(true); setError(null);
    try { await forceResolve(snapshotId); await load(); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }, [load]);

  const today        = history[0]?.snapshot ?? null;
  const todayOutcome = history[0]?.outcome ?? null;
  const topRationale = today ? parseRationale(today.rationale_json).slice(0, 3) : [];

  const verdict: "long" | "short" | "neutral" =
    today?.direction === "LONG" ? "long" : today?.direction === "SHORT" ? "short" : "neutral";
  const isLong  = today?.direction === "LONG";
  const isShort = today?.direction === "SHORT";
  const conf    = today ? Math.round(today.confidence) : 0;
  const confHigh = conf >= 60;

  return (
    <div
      className="flex-1 overflow-y-auto flex flex-col"
      style={{ padding: "12px 14px 16px", gap: 12, background: "var(--bg-base)", ...VERDICT_VARS[verdict] }}
    >
      {/* ── Top bar: pair pill + run snapshot ── */}
      <div className="flex items-center justify-between shrink-0" style={{ height: 40 }}>
        <div className="flex items-center gap-3">
          <div
            className="h-full flex items-center gap-2.5 px-4 rounded-[14px]"
            style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", height: 40 }}
          >
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--accent-text)" }} />
            <div className="flex flex-col items-start leading-none gap-0.5">
              <span className="text-[13px] font-bold tracking-wide" style={{ color: "var(--text-primary)" }}>{PAIR}</span>
              <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>AI Positioning</span>
            </div>
          </div>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Daily snapshot tracking · {STATS_WINDOW_DAYS}-day window
          </span>
        </div>
        <button
          onClick={onSnapshot}
          disabled={busy}
          className="flex items-center gap-2 px-3.5 rounded-[14px] text-[13px] font-semibold transition-colors"
          style={{
            height: 40,
            background: "var(--accent-dim)", color: "var(--accent-text)",
            border: "1px solid var(--accent-border)",
            opacity: busy ? 0.5 : 1, cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          Run snapshot now
        </button>
      </div>

      {error && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] shrink-0"
          style={{ background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* ── Hero: today's positioning (VerdictPanel-style) ── */}
          <Panel
            padded={false}
            className="overflow-hidden"
            style={{ border: "1px solid var(--border-subtle)", boxShadow: "0 4px 24px rgba(0,0,0,0.45)" }}
          >
            {!today ? (
              <div className="p-6 text-[13px]" style={{ color: "var(--text-muted)" }}>
                No snapshot yet. Click “Run snapshot now” to create the first one.
              </div>
            ) : (
              <>
                {/* Top strip: direction | confidence | context */}
                <div className="flex">
                  {/* Direction */}
                  <div
                    className="flex flex-col items-center justify-center px-8 py-5 shrink-0 gap-2"
                    style={{ minWidth: 230, borderRight: "1px solid var(--border-subtle)" }}
                  >
                    <div className="relative flex items-center justify-center">
                      <div className="absolute" style={{ right: "calc(100% + 8px)" }}>
                        {isLong  && <TrendingUp   size={22} strokeWidth={2.5} style={{ color: "var(--accent-text)", filter: "drop-shadow(0 0 6px var(--accent-text))" }} />}
                        {isShort && <TrendingDown size={22} strokeWidth={2.5} style={{ color: "var(--accent-text)", filter: "drop-shadow(0 0 6px var(--accent-text))" }} />}
                        {!isLong && !isShort && <Minus size={22} strokeWidth={2.5} style={{ color: "var(--accent-text)" }} />}
                      </div>
                      <span
                        className="text-[22px] font-bold tracking-widest leading-none"
                        style={{ color: "var(--accent-text)", textShadow: "0 0 6px var(--accent-text)" }}
                      >
                        {today.direction === "NEUTRAL" ? "FLAT" : today.direction}
                      </span>
                    </div>
                    <span className="text-[12px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                      {isLong ? "Bullish Bias" : isShort ? "Bearish Bias" : "No Position"}
                    </span>
                    {today.direction !== "NEUTRAL" && (
                      todayOutcome
                        ? <Badge label={todayOutcome.first_level_hit.toUpperCase()} color={hitColor(todayOutcome.first_level_hit)} />
                        : <Badge label="Open" color="blue" />
                    )}
                  </div>

                  {/* Confidence */}
                  <div className="flex-1 flex flex-col justify-center px-6 py-5">
                    <div className="flex items-baseline gap-3 mb-2">
                      <span className="text-[11px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Confidence</span>
                      <span className="text-[28px] font-black tabular-nums leading-none" style={{ color: "var(--text-primary)" }}>{conf}%</span>
                      <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                        composite {today.composite.toFixed(0)}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${conf}%`, background: confHigh ? "var(--accent-text)" : "var(--text-secondary)", boxShadow: confHigh ? "0 0 6px var(--accent-text)" : "none" }}
                      />
                    </div>
                    {topRationale.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-4">
                        {topRationale.map((r, i) => (
                          <span
                            key={i}
                            className="text-[10px] px-2 py-0.5 rounded-md font-medium"
                            style={{ background: "var(--accent-dim)", color: "var(--accent-text)", border: "1px solid var(--accent-border)" }}
                            title={r.evidence}
                          >
                            {r.signal_name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Context */}
                  <div
                    className="flex flex-col justify-center px-7 py-5 shrink-0 gap-1.5"
                    style={{ minWidth: 190, borderLeft: "1px solid var(--border-subtle)" }}
                  >
                    <ContextRow label="Regime"     value={today.regime} />
                    <ContextRow label="Volatility" value={today.volatility} />
                    <ContextRow label="MTF Align"   value={today.mtf_alignment.toFixed(0)} />
                    <ContextRow label="Taken"       value={fmtDate(today.created_at)} />
                  </div>
                </div>

                {/* Level plan */}
                <div style={{ height: 1, background: "var(--border-medium)" }} />
                {today.direction === "NEUTRAL" ? (
                  <div className="px-5 py-4 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    Snapshot skipped — risk filter rejected this setup (low confidence, Compression regime,
                    or weak MTF alignment). No position taken.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4">
                    <LevelTile label="Entry" value={fmtPrice(today.entry)} />
                    <LevelTile label="Stop"  value={fmtPrice(today.stop_loss)} accent="red" />
                    <LevelTile label="TP"    value={fmtPrice(today.tp1)} accent="green" />
                    <LevelTile label="Risk"  value={`${fmtPips(today.risk_pips)} pips`} />
                  </div>
                )}
              </>
            )}
          </Panel>

          {/* ── Aggregate tiles ── */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard label="Win Rate"   value={stats.n_resolved > 0 ? fmtPct(stats.win_rate) : "—"} sub={`${stats.n_resolved} resolved`} />
              <StatCard label="Expectancy" value={stats.n_resolved > 0 ? fmtR(stats.expectancy_r) : "—"} positive={stats.expectancy_r > 0} negative={stats.expectancy_r < 0} sub="per trade" />
              <StatCard label="Total R"    value={stats.n_resolved > 0 ? fmtR(stats.total_r) : "—"} positive={stats.total_r > 0} negative={stats.total_r < 0} sub={`${STATS_WINDOW_DAYS}d`} />
              <StatCard label="Avg MFE"    value={stats.n_resolved > 0 ? fmtPips(stats.avg_mfe) : "—"} sub="pips" />
              <StatCard label="Avg MAE"    value={stats.n_resolved > 0 ? fmtPips(stats.avg_mae) : "—"} sub="pips" />
              <StatCard label="Snapshots"  value={`${stats.n_snapshots}`} sub={`${stats.n_skipped} skipped`} />
            </div>
          )}

          {/* ── History + breakdowns ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <Panel style={{ border: "1px solid var(--border-subtle)", boxShadow: "0 4px 24px rgba(0,0,0,0.45)" }}>
                <PanelHeader label={`History · last ${HISTORY_LIMIT}`} />
                {history.length === 0 ? (
                  <div className="text-[13px]" style={{ color: "var(--text-muted)" }}>No snapshots recorded yet.</div>
                ) : (
                  <div className="flex flex-col">
                    <div
                      className="grid items-center text-[10px] font-black uppercase tracking-widest pb-2 px-2"
                      style={{ gridTemplateColumns: "1.4fr 0.7fr 0.6fr 1fr 0.8fr 0.7fr 0.7fr 0.8fr", color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}
                    >
                      <span>Date</span><span>Dir</span><span>Conf</span><span>Regime</span>
                      <span>Outcome</span><span>R</span><span>MFE</span><span>MAE</span>
                    </div>
                    {history.map(({ snapshot: s, outcome: o }) => (
                        <div
                          key={s.id}
                          className="grid items-center text-[12px] py-2 px-2"
                          style={{ gridTemplateColumns: "1.4fr 0.7fr 0.6fr 1fr 0.8fr 0.7fr 0.7fr 0.8fr", borderBottom: "1px solid var(--border-subtle)" }}
                        >
                          <span className="tabular-nums" style={{ color: "var(--text-secondary)" }}>{fmtDate(s.created_at)}</span>
                          <span><Badge label={s.direction} color={dirColor(s.direction)} /></span>
                          <span className="tabular-nums" style={{ color: "var(--text-secondary)" }}>{s.confidence.toFixed(0)}</span>
                          <span className="truncate" style={{ color: "var(--text-muted)" }}>{s.regime}</span>
                          {o ? (
                            <>
                              <span><Badge label={o.first_level_hit.toUpperCase()} color={hitColor(o.first_level_hit)} /></span>
                              <span className="tabular-nums font-semibold" style={{ color: rColor(o.r_multiple) }}>{fmtR(o.r_multiple)}</span>
                              <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>{fmtPips(o.mfe_pips)}</span>
                              <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>{fmtPips(o.mae_pips)}</span>
                            </>
                          ) : (
                            <span className="col-span-4 flex items-center gap-2">
                              <Badge label="Open" color="blue" />
                              <button
                                onClick={() => onResolve(s.id)}
                                disabled={busy}
                                className="text-[11px] px-2 py-0.5 rounded-md"
                                style={{ background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
                              >
                                Check
                              </button>
                            </span>
                          )}
                        </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            <div>
              <Panel style={{ border: "1px solid var(--border-subtle)", boxShadow: "0 4px 24px rgba(0,0,0,0.45)" }}>
                <PanelHeader label="Slice Breakdowns" />
                {stats ? (
                  <div className="flex flex-col gap-4">
                    <SliceTable title="By Regime"        rows={stats.by_regime} />
                    <SliceTable title="By Confidence"    rows={stats.by_confidence} />
                    <SliceTable title="By MTF Alignment" rows={stats.by_mtf_alignment} />
                  </div>
                ) : (
                  <div className="text-[13px]" style={{ color: "var(--text-muted)" }}>No data.</div>
                )}
              </Panel>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Small building blocks ────────────────────────────────────────────────────

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function LevelTile({ label, value, accent }: { label: string; value: string; accent?: "green" | "red" }) {
  const color = accent === "green" ? "#4ade80" : accent === "red" ? "#f87171" : "var(--text-primary)";
  return (
    <div
      className="flex flex-col gap-0.5 px-3 py-2 rounded-lg"
      style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)" }}
    >
      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-[14px] font-bold tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}
