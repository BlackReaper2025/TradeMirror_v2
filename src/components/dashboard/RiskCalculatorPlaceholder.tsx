// ─── RiskCalculator — position sizing and risk management panel ───────────────
import React, { useState, useMemo, useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Panel } from "../ui/Panel";
import { useDatabase } from "../../db/DatabaseProvider";
import { getSettings, getAccount } from "../../db/queries";

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ─── sub-components ───────────────────────────────────────────────────────────

function DirBtn({
  label, active, color, onClick,
}: { label: string; active: boolean; color: "green" | "red"; onClick: () => void }) {
  const g = color === "green";
  return (
    <button
      onClick={onClick}
      className="flex-1 py-1 rounded-lg text-[12px] font-semibold transition-colors"
      style={{
        background: active
          ? g ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)"
          : "rgba(255,255,255,0.10)",
        border: active
          ? g ? "1px solid rgba(34,197,94,0.55)" : "1px solid rgba(239,68,68,0.55)"
          : "1px solid rgba(255,255,255,0.18)",
        color: active
          ? g ? "#4ade80" : "#f87171"
          : "var(--text-secondary)",
      }}
    >
      {label}
    </button>
  );
}

function FieldInput({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? "0.00"}
        className="w-full px-2.5 py-1 rounded-lg text-[12px] tabular-nums outline-none"
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.10)",
          color: "var(--text-primary)",
        }}
        onFocus={e => { (e.currentTarget as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.28)"; }}
        onBlur={e  => { (e.currentTarget as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.10)"; }}
      />
    </div>
  );
}

function ChipBtn({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-1 rounded text-[10px] font-semibold transition-colors"
      style={{
        background: active ? "var(--accent-dim)" : "rgba(255,255,255,0.10)",
        border: `1px solid ${active ? "var(--accent-border)" : "rgba(255,255,255,0.18)"}`,
        color: active ? "var(--accent-text)" : "var(--text-secondary)",
      }}
    >
      {label}
    </button>
  );
}

function StatRow({
  label, value, color,
}: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-[12px] font-semibold tabular-nums" style={{ color: color ?? "var(--text-primary)" }}>
        {value}
      </span>
    </div>
  );
}

// ─── constants ────────────────────────────────────────────────────────────────

const RR_PRESETS   = ["1:1", "2:1", "3:1", "4:1", "Custom"] as const;
type RRPreset      = (typeof RR_PRESETS)[number];
const DOLLAR_PRESETS = [25, 50, 100, 250, 500];
const PCT_PRESETS    = [0.5, 1, 2, 3, 5];

// ─── Main component ───────────────────────────────────────────────────────────

export function RiskCalculatorPlaceholder() {
  const { ready } = useDatabase();
  const [accountBalance, setAccountBalance] = useState(0);

  const [direction, setDirection] = useState<"long" | "short">("long");
  const [entry,     setEntry]     = useState("");
  const [sl,        setSl]        = useState("");
  const [tp,        setTp]        = useState("");
  const [rrPreset,  setRrPreset]  = useState<RRPreset>("Custom");
  const [riskMode,  setRiskMode]  = useState<"$" | "%">("$");
  const [riskVal,   setRiskVal]   = useState("");

  // ── Load account balance ────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const settings = await getSettings();
        const account  = await getAccount(settings?.selectedAccountId ?? "acc-1");
        if (account) setAccountBalance(account.currentBalance);
      } catch { /* noop */ }
    })();
  }, [ready]);

  const entryN = parseFloat(entry) || 0;
  const slN    = parseFloat(sl)    || 0;
  const tpN    = parseFloat(tp)    || 0;

  // ── RR preset → auto-set TP ─────────────────────────────────────────────────
  useEffect(() => {
    if (!entryN || !slN || rrPreset === "Custom") return;
    const slDist  = Math.abs(entryN - slN);
    const mult    = parseInt(rrPreset);
    const tpPrice = direction === "long"
      ? entryN + slDist * mult
      : entryN - slDist * mult;
    setTp(tpPrice.toFixed(5).replace(/\.?0+$/, ""));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rrPreset, entryN, slN, direction]);

  // ── Derived stats ───────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!entryN || !slN) return null;
    const slDist = Math.abs(entryN - slN);
    const tpDist = tpN ? Math.abs(tpN - entryN) : 0;
    const rr     = tpDist && slDist ? tpDist / slDist : null;

    const riskDollars = riskMode === "$"
      ? parseFloat(riskVal) || 0
      : accountBalance * (parseFloat(riskVal) || 0) / 100;

    const volume  = riskDollars && slDist ? riskDollars / slDist : 0;
    const maxLoss = riskDollars;
    const maxGain = rr != null
      ? riskDollars * rr
      : tpDist && volume ? tpDist * volume : 0;

    return { rr, volume, maxLoss, maxGain };
  }, [entryN, slN, tpN, riskMode, riskVal, accountBalance]);

  // ── Reset ───────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setDirection("long");
    setEntry(""); setSl(""); setTp("");
    setRrPreset("Custom");
    setRiskVal(""); setRiskMode("$");
  };

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: "14px", padding: "1.5px", pointerEvents: "none", zIndex: 1,
        background: "rgba(255,255,255,0.12)",
        WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
        WebkitMaskComposite: "xor",
        maskComposite: "exclude",
      } as React.CSSProperties} />
      <Panel
        state
        className="h-full flex flex-col gap-0 p-0 overflow-hidden"
        style={{ border: "none", borderRadius: "14px", background: "radial-gradient(ellipse at top left, rgba(255,255,255,0.07) 0%, transparent 60%), rgba(8,12,18,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", boxShadow: "none" } as React.CSSProperties}
      >

        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-4 py-2 shrink-0"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <span className="text-[14px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
            Risk Calculator
          </span>
          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors"
            style={{ color: "var(--text-secondary)", background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.18)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.10)"; }}
          >
            <RotateCcw size={10} /> Reset
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 flex flex-col gap-2.5 px-4 py-2.5 overflow-hidden">

          {/* Direction */}
          <div className="flex gap-2">
            <DirBtn label="▲  Long"  active={direction === "long"}  color="green" onClick={() => setDirection("long")}  />
            <DirBtn label="▼  Short" active={direction === "short"} color="red"   onClick={() => setDirection("short")} />
          </div>

          {/* Entry + Stop Loss side by side */}
          <div className="flex gap-2">
            <div className="flex-1"><FieldInput label="Entry Price" value={entry} onChange={setEntry} /></div>
            <div className="flex-1"><FieldInput label="Stop Loss"   value={sl}    onChange={setSl}   /></div>
          </div>

          {/* Take Profit + RR presets */}
          <div className="flex flex-col gap-1">
            <FieldInput
              label="Take Profit"
              value={tp}
              onChange={v => { setTp(v); setRrPreset("Custom"); }}
            />
            <div className="flex gap-1">
              {RR_PRESETS.map(p => (
                <ChipBtn key={p} label={p} active={rrPreset === p} onClick={() => setRrPreset(p)} />
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />

          {/* Risk Amount */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Risk Amount
              </span>
              <div className="flex gap-1" style={{ minWidth: 60 }}>
                <ChipBtn label="$" active={riskMode === "$"} onClick={() => setRiskMode("$")} />
                <ChipBtn label="%" active={riskMode === "%"} onClick={() => setRiskMode("%")} />
              </div>
            </div>

            {/* Risk input */}
            <input
              type="number"
              value={riskVal}
              onChange={e => setRiskVal(e.target.value)}
              placeholder={riskMode === "$" ? "0.00" : "0.00%"}
              className="w-full px-2.5 py-1 rounded-lg text-[12px] tabular-nums outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "var(--text-primary)" }}
              onFocus={e => { (e.currentTarget as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.28)"; }}
              onBlur={e  => { (e.currentTarget as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.10)"; }}
            />

            {/* Quick-select presets */}
            <div className="flex gap-1">
              {riskMode === "$"
                ? DOLLAR_PRESETS.map(v => (
                    <ChipBtn key={v} label={`$${v}`} active={riskVal === String(v)} onClick={() => setRiskVal(String(v))} />
                  ))
                : PCT_PRESETS.map(v => (
                    <ChipBtn key={v} label={`${v}%`} active={riskVal === String(v)} onClick={() => setRiskVal(String(v))} />
                  ))
              }
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />

          {/* Output stats */}
          <div className="flex flex-col gap-2">
            <div className="flex gap-3">
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>R:R Ratio</span>
                <span className="text-[12px] font-semibold tabular-nums" style={{ color: stats?.rr == null ? "var(--text-primary)" : stats.rr >= 2 ? "#4ade80" : stats.rr >= 1 ? "var(--text-primary)" : "#f87171" }}>
                  {stats?.rr != null ? `1 : ${fmt(stats.rr)}` : "—"}
                </span>
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Volume (lots)</span>
                <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {stats?.volume ? fmt(stats.volume, 4) : "—"}
                </span>
              </div>
            </div>
            <div style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />
            <div className="flex gap-3">
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Max Loss</span>
                <span className="text-[12px] font-semibold tabular-nums" style={{ color: stats?.maxLoss ? "#f87171" : "var(--text-primary)" }}>
                  {stats?.maxLoss ? `-$${fmt(stats.maxLoss)}` : "—"}
                </span>
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Max Gain</span>
                <span className="text-[12px] font-semibold tabular-nums" style={{ color: stats?.maxGain ? "#4ade80" : "var(--text-primary)" }}>
                  {stats?.maxGain ? `+$${fmt(stats.maxGain)}` : "—"}
                </span>
              </div>
            </div>
          </div>

        </div>
      </Panel>
    </div>
  );
}
