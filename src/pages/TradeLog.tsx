// ─── Trade Log page — Phase 3 ────────────────────────────────────────────────
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Panel } from "../components/ui/Panel";
import { TradeTable } from "../components/tradelog/TradeTable";
import { useDatabase } from "../db/DatabaseProvider";
import {
  getAllTradesWithJournal,
  getSettings,
  getAccount,
  deleteTradeById,
  type TradeWithJournal,
  type Account,
} from "../db/queries";
import { TradeForm, type TradeFormValues } from "../components/tradelog/TradeForm";
import { finishTradeSave, saveNewTrade, saveEditedTrade } from "../lib/tradeSave";
import { formatSignedDollar } from "../lib/tradeFormat";

export function TradeLog() {
  const { ready } = useDatabase();
  const [account, setAccount]     = useState<Account | null>(null);
  const [trades, setTrades]       = useState<TradeWithJournal[]>([]);
  const [loading, setLoading]     = useState(true);
  const [editTrade, setEditTrade]       = useState<TradeWithJournal | null>(null);
  const [showForm, setShowForm]         = useState(false);
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

  // ── Shared: finish a create/edit/delete by closing the form + refetching ─────
  const finishAndRefetch = useCallback(async (accountId: string, days: string[]) => {
    await finishTradeSave(accountId, days);
    setShowForm(false);
    setEditTrade(null);
    await load();
  }, [load]);

  // ── Create a new trade ────────────────────────────────────────────────────
  const handleSave = useCallback(async (values: TradeFormValues) => {
    if (!account) return;
    setSaveError(null);
    try {
      const { day } = await saveNewTrade(account, values);
      await finishAndRefetch(account.id, [day]);
    } catch (err) {
      console.error("[TradeLog] create error:", err);
      setSaveError(String(err));
    }
  }, [account, finishAndRefetch]);

  // ── Edit an existing trade ────────────────────────────────────────────────
  const handleEditSave = useCallback(async (values: TradeFormValues) => {
    if (!account || !editTrade) return;
    setSaveError(null);
    try {
      // Recalculate both days in case openedAt moved to a different date
      const { oldDay, newDay } = await saveEditedTrade(editTrade, values);
      await finishAndRefetch(account.id, [oldDay, newDay]);
    } catch (err) {
      console.error("[TradeLog] edit error:", err);
      setSaveError(String(err));
    }
  }, [account, editTrade, finishAndRefetch]);

  // ── Delete a trade ────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (tradeId: string) => {
    if (!account) return;
    setSaveError(null);
    try {
      const result = await deleteTradeById(tradeId);
      if (result) await finishAndRefetch(result.accountId, [result.day]);
    } catch (err) {
      console.error("[TradeLog] delete error:", err);
      setSaveError(String(err));
    }
  }, [account, finishAndRefetch]);

  // ── Open the form for a new/existing trade ────────────────────────────────
  // Stable identities (no deps that change per-row) so TradeTable's per-row
  // memoization isn't invalidated on every TradeLog render — previously these
  // were inline arrows recreated each render, silently defeating TradeRow's memo.
  const handleNewTrade = useCallback(() => { setEditTrade(null); setShowForm(true); }, []);
  const handleEditTrade = useCallback((t: TradeWithJournal) => { setEditTrade(t); setShowForm(true); }, []);

  // ── Summary stats from loaded trades ──────────────────────────────────────
  // Memoized so unrelated re-renders (form open/close, save errors) don't redo
  // 7 full passes over the trade list every time.
  const { wins, losses, totalPnl, winRate, avgWin, avgLoss, largestWin, largestLoss } = useMemo(() => {
    const wins    = trades.filter((t) => (t.pnl ?? 0) > 0);
    const losses  = trades.filter((t) => (t.pnl ?? 0) < 0);
    const totalPnl    = trades.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const winRate     = trades.length > 0 ? Math.round((wins.length / trades.length) * 100) : 0;
    const avgWin      = wins.length   > 0 ? wins.reduce((s, t)   => s + (t.pnl ?? 0), 0) / wins.length   : 0;
    const avgLoss     = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0)) / losses.length : 0;
    const largestWin  = wins.length   > 0 ? Math.max(...wins.map((t) => t.pnl ?? 0))   : 0;
    const largestLoss = losses.length > 0 ? Math.abs(Math.min(...losses.map((t) => t.pnl ?? 0))) : 0;
    return { wins, losses, totalPnl, winRate, avgWin, avgLoss, largestWin, largestLoss };
  }, [trades]);

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
            <StatStrip label="Total P&L" value={trades.length ? formatSignedDollar(totalPnl) : "—"} positive={totalPnl > 0} negative={totalPnl < 0} />
            <StatStrip label="Avg Win" value={avgWin > 0 ? `+$${avgWin.toFixed(2)}` : "—"} positive={avgWin > 0} />
            <StatStrip label="Avg Loss" value={avgLoss > 0 ? `-$${avgLoss.toFixed(2)}` : "—"} negative={avgLoss > 0} />
            <StatStrip label="Largest Win" value={largestWin > 0 ? formatSignedDollar(largestWin) : "—"} positive={largestWin > 0} />
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
            onNewTrade={handleNewTrade}
            onEditTrade={handleEditTrade}
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
          onClose={() => { setShowForm(false); setEditTrade(null); }}
          onSaved={editTrade ? handleEditSave : handleSave}
          onDuplicate={(vals) => { handleSave(vals); }}
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
  accent?: boolean;
  positive?: boolean;
  negative?: boolean;
}

function StatStrip({ label, value, sub, accent, positive, negative }: StatStripProps) {
  const color = accent
    ? "var(--accent-text)"
    : positive
    ? "#7ed62e"
    : negative
    ? "#f03a3a"
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
