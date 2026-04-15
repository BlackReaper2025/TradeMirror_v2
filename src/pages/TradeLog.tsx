// ─── Trade Log page — Phase 3 ────────────────────────────────────────────────
import { useEffect, useState, useCallback } from "react";
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
  const [editTrade, setEditTrade] = useState<TradeWithJournal | null>(null); // null = new
  const [showForm, setShowForm]   = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
      const day       = openedAt.split("T")[0];

      await createTrade({
        id: tradeId, accountId: account.id, openedAt,
        closedAt:       values.closedAt ? normaliseDateTime(values.closedAt) : undefined,
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
      const oldDay  = editTrade.openedAt.slice(0, 10);
      const openedAt = normaliseDateTime(values.openedAt);
      const newDay  = openedAt.split("T")[0];

      await updateTrade(editTrade.id, {
        openedAt,
        closedAt:       values.closedAt ? normaliseDateTime(values.closedAt) : undefined,
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
  const totalPnl   = trades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const winRate    = trades.length > 0 ? Math.round((wins.length / trades.length) * 100) : 0;
  const avgWin     = wins.length   > 0 ? wins.reduce((s, t)   => s + (t.pnl ?? 0), 0) / wins.length   : 0;
  const avgLoss    = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0)) / losses.length : 0;

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      style={{ padding: "20px 24px 24px" }}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1
            className="text-[22px] font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Trade Log
          </h1>
          {account && (
            <div className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              {account.name} · {account.brokerOrFirm}
            </div>
          )}
        </div>

        <button
          onClick={() => { setEditTrade(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-opacity hover:opacity-80"
          style={{
            background: "var(--accent-dim)",
            color: "var(--accent-text)",
            border: "1px solid var(--accent-border)",
          }}
        >
          <Plus size={15} />
          New Trade
        </button>
      </div>

      {/* ── Summary stat strip ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-5" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <StatStrip
          label="Total Trades"
          value={String(trades.length)}
          icon={<Hash size={14} />}
        />
        <StatStrip
          label="Win Rate"
          value={`${winRate}%`}
          sub={`${wins.length}W · ${losses.length}L`}
          icon={<BarChart2 size={14} />}
          accent
        />
        <StatStrip
          label="Total P&L"
          value={trades.length ? fmt$(totalPnl) : "—"}
          positive={totalPnl > 0}
          negative={totalPnl < 0}
          icon={totalPnl >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        />
        <StatStrip
          label="Avg Win / Loss"
          value={avgWin || avgLoss ? `+$${avgWin.toFixed(0)} / -$${avgLoss.toFixed(0)}` : "—"}
          icon={<TrendingUp size={14} />}
        />
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <Panel padded={false} className="flex-1 flex flex-col overflow-hidden" style={{ padding: "0 0" }}>
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
    : "var(--text-primary)";

  return (
    <div
      className="px-4 py-3 rounded-xl flex items-center gap-3"
      style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)" }}
    >
      {icon && (
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--bg-panel-alt)", color: "var(--text-muted)" }}
        >
          {icon}
        </div>
      )}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          {label}
        </div>
        <div className="text-[15px] font-bold tabular-nums mt-0.5" style={{ color }}>
          {value}
        </div>
        {sub && (
          <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{sub}</div>
        )}
      </div>
    </div>
  );
}
