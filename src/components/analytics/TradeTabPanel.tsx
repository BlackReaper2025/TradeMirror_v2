// ─── Trade tab — planning mode (Phase 13/15/16) ───────────────────────────────
// Lives inside NewsAndCalendarPanelImpl (src/pages/AnalyticsV3.tsx) as a third
// tab alongside News / Economic Calendar, per the plan's only-approved UI
// additions. Creates/edits a local PLANNED Trade Idea (optionally with copy
// executions on other accounts) only — nothing here places, modifies, or is
// capable of placing a live order. Every submission path added later
// (Phase 17+) is expected to still run through src/lib/riskEngine.ts, not
// duplicate this validation.

import { useState, useEffect, useSyncExternalStore } from "react";
import { getDb } from "../../db/index";
import { tradeIdeas, executions } from "../../db/schema";
import { getSettings, getAccount, getAccountProfile, getActiveAccounts, type Account, type AccountProfile } from "../../db/queries";
import { validateTradeIdea, checkOneActiveTradeIdea, cancelPlannedTradeIdea, checkCooldown, type TradeIdeaValidationResult, type RiskCheckInput, type ActiveTradeIdeaCheck, type CooldownCheck } from "../../lib/riskEngine";
import { plannedTradeStore } from "../../lib/plannedTradeStore";

type Side = "buy" | "sell";
type OrderType = "market" | "limit" | "stop";

interface CopyTarget {
  accountId: string;
  accountName: string;
  broker: "tradelocker" | "oanda";
  enabled: boolean;
  volume: string;
  pointValue: string;
}

function FieldLabel({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }} title={title}>
      {children}
    </label>
  );
}

function NumInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-2 py-1.5 rounded-md text-[12px] outline-none"
      style={{ background: "var(--bg-panel-alt)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
    />
  );
}

// "Only valid/connected accounts enabled for execution are eligible" (Phase 15)
// — connected here means linked to a broker (Phase 5/8), since nothing is
// capable of live execution yet regardless.
function copyBrokerOf(profile: AccountProfile | null): "tradelocker" | "oanda" | null {
  if (profile?.tradelockerAccountId && profile?.tradelockerAccNum) return "tradelocker";
  if (profile?.oandaAccountId) return "oanda";
  return null;
}

export function TradeTabPanel({ pair }: { pair: string }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [maxRiskPct, setMaxRiskPct] = useState(1.0);

  // Seeded from the shared planned-trade store if it already holds a plan for
  // this exact pair (e.g. switching tabs and back) — otherwise starts fresh,
  // since a plan for a different instrument shouldn't leak into this one.
  const seed = plannedTradeStore.get();
  const seeded = seed.pair === pair;
  const [side, setSide] = useState<Side>(seeded ? seed.side : "buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [entry, setEntry] = useState(seeded && seed.entry != null ? String(seed.entry) : "");
  const [sl, setSl] = useState(seeded && seed.stop != null ? String(seed.stop) : "");
  const [tp, setTp] = useState(seeded && seed.target != null ? String(seed.target) : "");
  const [volume, setVolume] = useState("");
  const [pointValue, setPointValue] = useState(""); // $ per unit per price point — user-supplied, see note below

  // ── Copy Trade (Phase 15) ──
  const [copyTradeEnabled, setCopyTradeEnabled] = useState(false);
  const [copyTargets, setCopyTargets] = useState<CopyTarget[]>([]);

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TradeIdeaValidationResult | null>(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [preview, setPreview] = useState<{ accountName: string; broker: string; volume: string; riskDollars: string }[] | null>(null);
  const [activeIdea, setActiveIdea] = useState<ActiveTradeIdeaCheck | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cooldown, setCooldown] = useState<CooldownCheck | null>(null);
  const [missingRiskInputs, setMissingRiskInputs] = useState<string[]>([]);

  async function refreshActiveIdea() {
    setActiveIdea(await checkOneActiveTradeIdea());
    setCooldown(await checkCooldown());
  }

  useEffect(() => {
    (async () => {
      const settings = await getSettings();
      const accountId = settings?.selectedAccountId ?? "acc-1";
      const [acc, profile, allAccounts] = await Promise.all([
        getAccount(accountId), getAccountProfile(accountId), getActiveAccounts(),
      ]);
      setAccount(acc);
      setMaxRiskPct(profile?.maxRiskPerTradePct ?? 1.0);

      const others = allAccounts.filter((a) => a.id !== accountId);
      const profiles = await Promise.all(others.map((a) => getAccountProfile(a.id)));
      const eligible: CopyTarget[] = [];
      others.forEach((a, i) => {
        const broker = copyBrokerOf(profiles[i]);
        if (broker) eligible.push({ accountId: a.id, accountName: a.name, broker, enabled: false, volume: "", pointValue: "" });
      });
      setCopyTargets(eligible);
    })();
    refreshActiveIdea();
  }, []);

  async function handleCancelActiveIdea() {
    if (!activeIdea?.activeIdea) return;
    setCancelling(true);
    try {
      await cancelPlannedTradeIdea(activeIdea.activeIdea.id);
      await refreshActiveIdea();
    } finally {
      setCancelling(false);
    }
  }

  // Push every edit into the shared store — this is what the chart overlay
  // (src/pages/AnalyticsV3.tsx's PriceHistoryChart) reads to draw the planned
  // Entry/SL/TP lines, and also drag them. Tagged "form" so the pull effect
  // below can tell this write apart from a chart-originated one and not loop.
  useEffect(() => {
    const entryVal = parseFloat(entry);
    const slVal = parseFloat(sl);
    const tpVal = parseFloat(tp);
    plannedTradeStore.set({
      pair, side,
      entry: Number.isFinite(entryVal) ? entryVal : null,
      stop: Number.isFinite(slVal) ? slVal : null,
      target: Number.isFinite(tpVal) ? tpVal : null,
    }, "form");
  }, [pair, side, entry, sl, tp]);

  // Pull a chart-originated drag (see AnalyticsV3.tsx's planned-line drag
  // handler) back into these text inputs. Gated on source === "chart" so
  // this never fires on the echo of the push effect's own "form" write —
  // without that guard, every keystroke here would immediately overwrite
  // itself with a stale re-parsed value and fight the user's typing.
  const storeState = useSyncExternalStore(plannedTradeStore.subscribe, plannedTradeStore.get);
  useEffect(() => {
    if (storeState.source !== "chart" || storeState.pair !== pair) return;
    if (storeState.entry != null) setEntry(String(storeState.entry));
    if (storeState.stop != null) setSl(String(storeState.stop));
    if (storeState.target != null) setTp(String(storeState.target));
  }, [storeState, pair]);

  const entryN = parseFloat(entry);
  const slN = parseFloat(sl);
  const tpN = parseFloat(tp);
  const volN = parseFloat(volume);
  const pvN = parseFloat(pointValue);

  const hasEntry = Number.isFinite(entryN);
  const hasSl = Number.isFinite(slN);
  const hasTp = Number.isFinite(tpN);
  const hasVol = Number.isFinite(volN) && volN > 0;
  const hasPv = Number.isFinite(pvN) && pvN > 0;

  const slDistance = hasEntry && hasSl ? Math.abs(entryN - slN) : null;
  const tpDistance = hasEntry && hasTp ? Math.abs(tpN - entryN) : null;
  const rr = slDistance && tpDistance && slDistance > 0 ? tpDistance / slDistance : null;

  // Dollar figures need the instrument's real contract/point value, which
  // this project has no spec table for (same limitation as riskEngine.ts).
  // Rather than guess, the user supplies it directly when they know it —
  // these stay blank otherwise instead of showing a fabricated number.
  const slDollarLoss   = slDistance != null && hasVol && hasPv ? slDistance * volN * pvN : null;
  const tpDollarProfit = tpDistance != null && hasVol && hasPv ? tpDistance * volN * pvN : null;
  const riskPct = slDollarLoss != null && account && account.currentBalance > 0
    ? (slDollarLoss / account.currentBalance) * 100
    : null;

  function updateCopyTarget(accountId: string, patch: Partial<CopyTarget>) {
    setCopyTargets((prev) => prev.map((c) => (c.accountId === accountId ? { ...c, ...patch } : c)));
  }

  async function handlePlaceTrade() {
    if (!account || !hasEntry || !hasSl) return;
    setSaving(true);
    setSavedMsg("");
    setPreview(null);
    setMissingRiskInputs([]);
    try {
      const activeCopyTargets = copyTradeEnabled ? copyTargets.filter((c) => c.enabled) : [];

      // Every account that would get an execution MUST produce a real
      // proposedRiskDollars — the 1%-max-risk check (Phase 11) is the whole
      // point of this engine, and silently omitting an account from
      // riskInputs (e.g. because Volume/Point Value was left blank) would
      // let a trade through with NO risk validation for that account rather
      // than a correctly blocked one. Block placement instead and say why.
      const missing: string[] = [];
      if (!hasVol || !hasPv) missing.push(account.name);

      // "Calculate E8 and OANDA quantities independently; never copy raw lot
      // size" (Phase 16) — each account uses its OWN volume/point-value, not
      // the primary's, since contract specs differ per broker/instrument.
      const riskInputs: RiskCheckInput[] = [];
      if (slDollarLoss != null) riskInputs.push({ accountId: account.id, proposedRiskDollars: slDollarLoss });
      const copyRisk = new Map<string, number | null>();
      for (const c of activeCopyTargets) {
        const cVol = parseFloat(c.volume);
        const cPv = parseFloat(c.pointValue);
        const cRisk = slDistance != null && Number.isFinite(cVol) && cVol > 0 && Number.isFinite(cPv) && cPv > 0
          ? slDistance * cVol * cPv
          : null;
        copyRisk.set(c.accountId, cRisk);
        if (cRisk != null) riskInputs.push({ accountId: c.accountId, proposedRiskDollars: cRisk });
        else missing.push(c.accountName);
      }
      if (missing.length > 0) {
        setMissingRiskInputs(missing);
        return;
      }

      const validation = await validateTradeIdea({ stopPrice: slN, accounts: riskInputs });
      setResult(validation);
      if (!validation.approved) return;

      const db = getDb();
      const now = new Date().toISOString();
      const ideaId = `idea-manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await db.insert(tradeIdeas).values({
        id: ideaId,
        symbol: pair,
        direction: side === "buy" ? "long" : "short",
        orderType,
        intendedEntry: entryN,
        intendedStop: slN,
        intendedTarget: hasTp ? tpN : undefined,
        lifecycleState: "planned",
        copyTradeEnabled: activeCopyTargets.length > 0,
        disciplineState: "Created from the Trade tab — planning mode, no live submission.",
        createdAt: now,
      });

      // Primary execution.
      await db.insert(executions).values({
        id: `exec-manual-${ideaId}-primary`,
        tradeIdeaId: ideaId,
        accountId: account.id,
        status: "planned",
        entryPrice: entryN,
        stopPrice: slN,
        targetPrice: hasTp ? tpN : undefined,
        quantity: hasVol ? volN : undefined,
      });
      // One execution row per copy target — this is what actually gives one
      // Trade Idea multiple broker executions (Phase 10).
      const previewRows = [{
        accountName: account.name, broker: "primary", volume: hasVol ? volume : "—",
        riskDollars: slDollarLoss != null ? `$${slDollarLoss.toFixed(2)}` : "—",
      }];
      for (const c of activeCopyTargets) {
        await db.insert(executions).values({
          id: `exec-manual-${ideaId}-${c.accountId}`,
          tradeIdeaId: ideaId,
          accountId: c.accountId,
          broker: c.broker,
          status: "planned",
          entryPrice: entryN,
          stopPrice: slN,
          targetPrice: hasTp ? tpN : undefined,
          quantity: Number.isFinite(parseFloat(c.volume)) ? parseFloat(c.volume) : undefined,
        });
        const r = copyRisk.get(c.accountId);
        previewRows.push({
          accountName: c.accountName, broker: c.broker, volume: c.volume || "—",
          riskDollars: r != null ? `$${r.toFixed(2)}` : "—",
        });
      }

      // "Generate/log the exact per-account orders that would be sent" (Phase 16).
      console.log("[TradeTab] dry-run — orders that would be sent:", previewRows);
      setPreview(previewRows);
      setSavedMsg(
        `Planned ${side.toUpperCase()} ${pair} saved locally across ${previewRows.length} account(s). No order was sent anywhere.`
      );
      await refreshActiveIdea();
    } finally {
      setSaving(false);
    }
  }

  const canPlace = hasEntry && hasSl && hasVol && hasPv && !saving && (activeIdea?.ok ?? true) && (cooldown?.ok ?? true);

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "10px 10px 4px" }}>
      <div
        className="text-[9px] font-bold uppercase tracking-wider text-center py-1 rounded mb-3"
        style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", color: "#fbbf24" }}
      >
        Planning Mode — no orders are ever sent
      </div>

      {activeIdea?.activeIdea && (
        <div className="flex items-center justify-between gap-2 mb-3 p-2 rounded-md text-[10px]" style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.3)", color: "#60a5fa" }}>
          <span>
            Active Trade Idea: {activeIdea.activeIdea.symbol} {activeIdea.activeIdea.direction} ({activeIdea.activeIdea.lifecycleState}) — blocks placing another until this one is cancelled or closes.
          </span>
          {activeIdea.activeIdea.lifecycleState === "planned" && (
            <button
              onClick={handleCancelActiveIdea}
              disabled={cancelling}
              className="shrink-0 px-2 py-1 rounded text-[10px] font-semibold transition-all disabled:opacity-50"
              style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171" }}
            >
              {cancelling ? "Cancelling…" : "Cancel Plan"}
            </button>
          )}
        </div>
      )}

      {cooldown && !cooldown.ok && (
        <div className="mb-3 p-2 rounded-md text-[10px]" style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)", color: "#fbbf24" }}>
          Cooldown active until {cooldown.activeUntil ? new Date(cooldown.activeUntil).toLocaleString() : "unknown"} — a recent stop-out blocks new positions until then. Not overridable from here by design.
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <div className="flex gap-1.5">
          {(["buy", "sell"] as Side[]).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className="flex-1 py-1.5 rounded-md text-[11px] font-bold uppercase transition-all"
              style={{
                background: side === s ? (s === "buy" ? "rgba(74,222,128,0.18)" : "rgba(248,113,113,0.18)") : "var(--bg-panel-alt)",
                border: side === s ? `1px solid ${s === "buy" ? "#4ade80" : "#f87171"}` : "1px solid var(--border-subtle)",
                color: side === s ? (s === "buy" ? "#4ade80" : "#f87171") : "var(--text-secondary)",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5">
          {(["market", "limit", "stop"] as OrderType[]).map((t) => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className="flex-1 py-1 rounded-md text-[10px] font-semibold capitalize transition-all"
              style={{
                background: orderType === t ? "var(--accent-dim)" : "var(--bg-panel-alt)",
                border: orderType === t ? "1px solid var(--accent-border)" : "1px solid var(--border-subtle)",
                color: orderType === t ? "var(--accent-text)" : "var(--text-secondary)",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <div className="flex flex-col gap-1">
            <FieldLabel>Entry</FieldLabel>
            <NumInput value={entry} onChange={setEntry} placeholder={orderType === "market" ? "Market" : "Price"} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>SL</FieldLabel>
            <NumInput value={sl} onChange={setSl} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>TP</FieldLabel>
            <NumInput value={tp} onChange={setTp} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex flex-col gap-1">
            <FieldLabel>Volume / Size ({account?.name ?? "primary"})</FieldLabel>
            <NumInput value={volume} onChange={setVolume} placeholder="units or lots" />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel title="Optional — $ value of one price point for this instrument at this size, e.g. $10/pip on a standard EUR/USD lot. Leave blank to skip the dollar figures below.">
              Point Value ($, optional)
            </FieldLabel>
            <NumInput value={pointValue} onChange={setPointValue} placeholder="$ / point" />
          </div>
        </div>

        <div className="h-px" style={{ background: "var(--border-subtle)" }} />

        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
          <span style={{ color: "var(--text-muted)" }}>R:R</span>
          <span className="text-right font-semibold" style={{ color: "var(--text-primary)" }}>
            {rr != null ? `1 : ${rr.toFixed(2)}` : "—"}
          </span>
          <span style={{ color: "var(--text-muted)" }}>SL $ loss</span>
          <span className="text-right font-semibold" style={{ color: "#f87171" }}>
            {slDollarLoss != null ? `-$${slDollarLoss.toFixed(2)}` : "—"}
          </span>
          <span style={{ color: "var(--text-muted)" }}>TP $ profit</span>
          <span className="text-right font-semibold" style={{ color: "#4ade80" }}>
            {tpDollarProfit != null ? `+$${tpDollarProfit.toFixed(2)}` : "—"}
          </span>
          <span style={{ color: "var(--text-muted)" }}>Risk %</span>
          <span className="text-right font-semibold" style={{ color: riskPct != null && riskPct > maxRiskPct ? "#f87171" : "var(--text-primary)" }}>
            {riskPct != null ? `${riskPct.toFixed(2)}% (max ${maxRiskPct.toFixed(2)}%)` : "—"}
          </span>
        </div>

        <div className="h-px" style={{ background: "var(--border-subtle)" }} />

        <button
          onClick={() => setCopyTradeEnabled((v) => !v)}
          className="flex items-center justify-between w-full py-1.5 px-2 rounded-md text-[11px] font-semibold transition-all"
          style={{
            background: copyTradeEnabled ? "var(--accent-dim)" : "var(--bg-panel-alt)",
            border: copyTradeEnabled ? "1px solid var(--accent-border)" : "1px solid var(--border-subtle)",
            color: copyTradeEnabled ? "var(--accent-text)" : "var(--text-secondary)",
          }}
        >
          <span>Copy Trade</span>
          <span>{copyTradeEnabled ? "ON" : "OFF"}</span>
        </button>

        {copyTradeEnabled && (
          <div className="flex flex-col gap-2">
            {copyTargets.length === 0 && (
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                No other accounts are connected to a broker yet — link one in Settings to make it an eligible copy target.
              </span>
            )}
            {copyTargets.map((c) => (
              <div key={c.accountId} className="flex flex-col gap-1.5 p-2 rounded-md" style={{ background: "var(--bg-panel-alt)", border: "1px solid var(--border-subtle)" }}>
                <button
                  onClick={() => updateCopyTarget(c.accountId, { enabled: !c.enabled })}
                  className="flex items-center gap-2 text-[11px] font-semibold"
                  style={{ color: c.enabled ? "var(--accent-text)" : "var(--text-secondary)" }}
                >
                  <span style={{
                    width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                    border: "2px solid var(--accent-text)", background: c.enabled ? "var(--accent-text)" : "transparent",
                  }} />
                  {c.accountName} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({c.broker})</span>
                </button>
                {c.enabled && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <NumInput value={c.volume} onChange={(v) => updateCopyTarget(c.accountId, { volume: v })} placeholder="volume" />
                    <NumInput value={c.pointValue} onChange={(v) => updateCopyTarget(c.accountId, { pointValue: v })} placeholder="$ / point" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handlePlaceTrade}
          disabled={!canPlace}
          className="w-full py-2 rounded-md text-[11px] font-bold uppercase tracking-wide transition-all disabled:opacity-40"
          style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)", color: "var(--accent-text)" }}
        >
          {saving ? "Checking…" : "Place Trade (Planning Mode)"}
        </button>

        {missingRiskInputs.length > 0 && (
          <div className="flex flex-col gap-1 text-[10px] p-2 rounded-md" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171" }}>
            <span>Blocked: Volume and Point Value are required for every account this trade would go to, so the 1% risk check has something real to validate — missing for: {missingRiskInputs.join(", ")}.</span>
          </div>
        )}
        {result && !result.approved && (
          <div className="flex flex-col gap-1 text-[10px] p-2 rounded-md" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171" }}>
            {!result.oneActiveTradeIdea.ok && <span>Blocked: another Trade Idea is already active ({result.oneActiveTradeIdea.activeIdea?.symbol}).</span>}
            {!result.cooldown.ok && <span>Blocked: cooldown active until {result.cooldown.activeUntil}.</span>}
            {!result.stopLossOk && <span>Blocked: a stop loss is required.</span>}
            {result.perAccount.filter((r) => !r.approved).map((r) => (
              <span key={r.accountId}>{r.accountName}: {r.reasons.join(" ")}</span>
            ))}
          </div>
        )}
        {preview && (
          <div className="flex flex-col gap-1 text-[10px] p-2 rounded-md" style={{ background: "var(--bg-panel-alt)", border: "1px solid var(--border-subtle)" }}>
            <span className="font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Dry-run — orders that would be sent</span>
            {preview.map((p, i) => (
              <span key={i} style={{ color: "var(--text-secondary)" }}>
                {p.accountName} ({p.broker}) — vol {p.volume}, risk {p.riskDollars}
              </span>
            ))}
          </div>
        )}
        {savedMsg && (
          <div className="text-[10px] p-2 rounded-md" style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", color: "#4ade80" }}>
            {savedMsg}
          </div>
        )}
      </div>
    </div>
  );
}
