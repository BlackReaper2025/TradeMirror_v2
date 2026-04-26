// ─── Trade Log page — Phase 3 ────────────────────────────────────────────────
import React, { useEffect, useState, useCallback } from "react";
import { Plus, TrendingUp, TrendingDown, BarChart2, Hash } from "lucide-react";
import { Panel } from "../components/ui/Panel";
import { TradeTable } from "../components/tradelog/TradeTable";
import { useDatabase } from "../db/DatabaseProvider";
import {
  getAllTradesWithJournal,
  getSettings,
  getAccount,
  createTrade,
  createJournalEntry,
  updateTrade,
  upsertJournalEntry,
  deleteTradeById,
  recalculateDailyStats,
  updateAccountBalance,
  type TradeWithJournal,
  type Account,
} from "../db/queries";
import { TradeForm, type TradeFormValues } from "../components/tradelog/TradeForm";
import { tradeEvents } from "../lib/tradeEvents";

function fmt$(n: number) {
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n >= 0 ? `+$${abs}` : `-$${abs}`;
}

// Normalise a datetime-local string to a full "YYYY-MM-DDTHH:MM:SS" (no Z).
function normaliseDateTime(v: string): string {
  if (!v) return v;
  return v.length === 16 ? v + ":00" : v.replace(/Z$/, "");
}

export function TradeLog() {
  const { ready } = useDatabase();
  const [account, setAccount]     = useState<Account | null>(null);
  const [trades, setTrades]       = useState<TradeWithJournal[]>([]);
  const [loading, setLoading]     = useState(true);
  const [editTrade, setEditTrade]       = useState<TradeWithJournal | null>(null);
  const [showForm, setShowForm]         = useState(false);
  const [duplicateInit, setDuplicateInit] = useState<import("../components/tradelog/TradeForm").TradeFormValues | undefined>(undefined);
  const [saveError, setSaveError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    try {
      const settings   = await getSettings();
      const accountId  = settings?.selectedAccountId ?? "acc-1";
      const [acc, rows] = await Promise.all([
        getAccount(accountId),
        getAllTradesWithJournal(accountId),
      ]);
      setAccount(acc);
      setTrades(rows);
    } catch (err) {
      console.error("[TradeLog] load error:", err);
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useEffect(() => { load(); }, [load]);

  // ── Shared: finish a create/edit by recalculating stats + notifying ──────────
  async function finishSave(accountId: string, days: string[]) {
    const uniqueDays = [...new Set(days)];
    for (const d of uniqueDays) await recalculateDailyStats(accountId, d);
    await updateAccountBalance(accountId);
    tradeEvents.notify();
    setShowForm(false);
    setEditTrade(null);
    await load();
  }

  // ── Create a new trade ────────────────────────────────────────────────────
  const handleSave = useCallback(async (values: TradeFormValues) => {
    if (!account) return;
    setSaveError(null);
    try {
      const tradeId   = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const journalId = `j-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const openedAt  = normaliseDateTime(values.openedAt);
      const closedAt  = values.closedAt ? normaliseDateTime(values.closedAt) : undefined;
      const day       = (closedAt ?? openedAt).split("T")[0];

      await createTrade({
        id: tradeId, accountId: account.id, openedAt,
        closedAt,
        instrument:     values.instrument.trim(),
        side:           values.side,
        setupName:      values.setupName.trim()      || undefined,
        entryPrice:     values.entryPrice   ? parseFloat(values.entryPrice)  : undefined,
        stopPrice:      values.stopPrice    ? parseFloat(values.stopPrice)   : undefined,
        targetPrice:    values.targetPrice  ? parseFloat(values.targetPrice) : undefined,
        size:           values.size         ? parseFloat(values.size)        : undefined,
        fees:           values.fees         ? parseFloat(values.fees)        : 0,
        pnl:            values.pnl          ? parseFloat(values.pnl)         : 0,
        technicalNotes: values.technicalNotes.trim()  || undefined,
        tags:           values.tags.trim()            || undefined,
        tradeRef:       values.tradeRef.trim()        || undefined,
        exitPrice:      values.exitPrice  ? parseFloat(values.exitPrice)  : undefined,
      });

      await createJournalEntry({
        id: journalId, tradeId,
        emotionBefore:   values.emotionBefore                      || undefined,
        emotionAfter:    values.emotionAfter                       || undefined,
        mistakes:        values.mistakes.trim()                    || undefined,
        lessons:         values.lessons.trim()                     || undefined,
        confidenceScore: values.confidenceScore ? parseInt(values.confidenceScore) : undefined,
        disciplineScore: values.disciplineScore ? parseInt(values.disciplineScore) : undefined,
        freeformNotes:   values.freeformNotes.trim()               || undefined,
      });

      await finishSave(account.id, [day]);
    } catch (err) {
      console.error("[TradeLog] create error:", err);
      setSaveError(String(err));
    }
  }, [account, load]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Edit an existing trade ────────────────────────────────────────────────
  const handleEditSave = useCallback(async (values: TradeFormValues) => {
    if (!account || !editTrade) return;
    setSaveError(null);
    try {
      const oldDay   = (editTrade.closedAt ?? editTrade.openedAt).slice(0, 10);
      const openedAt = normaliseDateTime(values.openedAt);
      const closedAt = values.closedAt ? normaliseDateTime(values.closedAt) : undefined;
      const newDay   = (closedAt ?? openedAt).split("T")[0];

      await updateTrade(editTrade.id, {
        openedAt,
        closedAt,
        instrument:     values.instrument.trim(),
        side:           values.side,
        setupName:      values.setupName.trim()      || undefined,
        entryPrice:     values.entryPrice   ? parseFloat(values.entryPrice)  : undefined,
        stopPrice:      values.stopPrice    ? parseFloat(values.stopPrice)   : undefined,
        targetPrice:    values.targetPrice  ? parseFloat(values.targetPrice) : undefined,
        size:           values.size         ? parseFloat(values.size)        : undefined,
        fees:           values.fees         ? parseFloat(values.fees)        : 0,
        pnl:            values.pnl          ? parseFloat(values.pnl)         : 0,
        technicalNotes: values.technicalNotes.trim()  || undefined,
        tags:           values.tags.trim()            || undefined,
        tradeRef:       values.tradeRef.trim()        || undefined,
        exitPrice:      values.exitPrice  ? parseFloat(values.exitPrice)  : undefined,
      });

      await upsertJournalEntry(
        editTrade.id,
        editTrade.journal?.id ?? null,
        {
          emotionBefore:   values.emotionBefore                      || undefined,
          emotionAfter:    values.emotionAfter                       || undefined,
          mistakes:        values.mistakes.trim()                    || undefined,
          lessons:         values.lessons.trim()                     || undefined,
          confidenceScore: values.confidenceScore ? parseInt(values.confidenceScore) : undefined,
          disciplineScore: values.disciplineScore ? parseInt(values.disciplineScore) : undefined,
          freeformNotes:   values.freeformNotes.trim()               || undefined,
        }
      );

      // Recalculate both days in case openedAt moved to a different date
      await finishSave(account.id, [oldDay, newDay]);
    } catch (err) {
      console.error("[TradeLog] edit error:", err);
      setSaveError(String(err));
    }
  }, [account, editTrade, load]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Delete a trade ────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (tradeId: string) => {
    if (!account) return;
    setSaveError(null);
    try {
      const result = await deleteTradeById(tradeId);
      if (result) await finishSave(result.accountId, [result.day]);
    } catch (err) {
      console.error("[TradeLog] delete error:", err);
      setSaveError(String(err));
    }
  }, [account, load]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Summary stats from loaded trades ──────────────────────────────────────
  const wins    = trades.filter((t) => (t.pnl ?? 0) > 0);
  const losses  = trades.filter((t) => (t.pnl ?? 0) < 0);
  const totalPnl    = trades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const winRate     = trades.length > 0 ? Math.round((wins.length / trades.length) * 100) : 0;
  const avgWin      = wins.length   > 0 ? wins.reduce((s, t)   => s + (t.pnl ?? 0), 0) / wins.length   : 0;
  const avgLoss     = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0)) / losses.length : 0;
  const largestWin  = wins.length   > 0 ? Math.max(...wins.map((t) => t.pnl ?? 0))   : 0;
  const largestLoss = losses.length > 0 ? Math.abs(Math.min(...losses.map((t) => t.pnl ?? 0))) : 0;

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      style={{ padding: "20px 24px 24px" }}
    >
      {/* ── Summary stat strip ──────────────────────────────────────────────── */}
      <div className="mb-5 shrink-0" style={{ position: "relative", borderRadius: "14px", clipPath: "inset(0 round 14px)" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "14px", padding: "1.5px", pointerEvents: "none", zIndex: 1, background: "rgba(255,255,255,0.12)", WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude" } as React.CSSProperties} />
        <Panel padded={false} style={{ padding: "0", background: "radial-gradient(ellipse at top left, rgba(255,255,255,0.07) 0%, transparent 60%), rgba(8,12,18,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "none", borderRadius: "14px" }}>
          <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
            <StatStrip label="Total Trades" value={String(trades.length)} />
            <StatStrip label="Win Rate" value={`${winRate}%`} sub={`${wins.length}W · ${losses.length}L`} accent />
            <StatStrip label="Total P&L" value={trades.length ? fmt$(totalPnl) : "—"} positive={totalPnl > 0} negative={totalPnl < 0} />
            <StatStrip label="Avg Win" value={avgWin > 0 ? `+$${avgWin.toFixed(2)}` : "—"} positive={avgWin > 0} />
            <StatStrip label="Avg Loss" value={avgLoss > 0 ? `-$${avgLoss.toFixed(2)}` : "—"} negative={avgLoss > 0} />
            <StatStrip label="Largest Win" value={largestWin > 0 ? fmt$(largestWin) : "—"} positive={largestWin > 0} />
            <StatStrip label="Largest Loss" value={largestLoss > 0 ? `-$${largestLoss.toFixed(2)}` : "—"} negative={largestLoss > 0} />
          </div>
        </Panel>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ position: "relative", borderRadius: "14px", clipPath: "inset(0 round 14px)" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "14px", padding: "1.5px", pointerEvents: "none", zIndex: 1, background: "rgba(255,255,255,0.12)", WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude" } as React.CSSProperties} />
        <Panel padded={false} className="flex-1 flex flex-col overflow-hidden" style={{ padding: "1.5px", background: "radial-gradient(ellipse at top left, rgba(255,255,255,0.03) 0%, transparent 60%), rgba(8,12,18,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "none", borderRadius: "14px" }}>
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Loading trades…</span>
          </div>
        ) : (
          <TradeTable
            trades={trades}
            onNewTrade={() => { setEditTrade(null); setShowForm(true); }}
            onEditTrade={(t) => { setEditTrade(t); setShowForm(true); }}
            onDeleteTrade={handleDelete}
          />
        )}
        </Panel>
      </div>

      {/* ── Save error toast ────────────────────────────────────────────────── */}
      {saveError && (
        <div
          className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-[12px] max-w-sm"
          style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}
        >
          <strong>Save failed:</strong> {saveError}
          <button className="ml-3 underline" onClick={() => setSaveError(null)}>dismiss</button>
        </div>
      )}

      {/* ── Trade entry / edit form (slide-over) ───────────────────────────── */}
      {showForm && account && (
        <TradeForm
          key={editTrade?.id ?? "new"}
          account={account}
          existingTrade={editTrade}
          defaultValues={duplicateInit}
          onClose={() => { setShowForm(false); setEditTrade(null); setDuplicateInit(undefined); }}
          onSaved={editTrade ? handleEditSave : handleSave}
          onDuplicate={(vals) => { setDuplicateInit(vals); setEditTrade(null); }}
        />
      )}
    </div>
  );
}

// ─── Small stat strip card ────────────────────────────────────────────────────

interface StatStripProps {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  accent?: boolean;
  positive?: boolean;
  negative?: boolean;
}

function StatStrip({ label, value, sub, icon, accent, positive, negative }: StatStripProps) {
  const color = accent
    ? "var(--accent-text)"
    : positive
    ? "#4ade80"
    : negative
    ? "#f87171"
    : "var(--text-secondary)";

  return (
    <div
      className="px-4 py-1.5 flex flex-col items-center justify-center gap-0 text-center"
      style={{ boxShadow: "inset -1px 0 0 var(--border-subtle)" }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="flex items-baseline gap-3">
        <div className="text-[15px] font-bold tabular-nums" style={{ color }}>
          {value}
        </div>
        {sub && (
          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>
        )}
      </div>
    </div>
  );
}
