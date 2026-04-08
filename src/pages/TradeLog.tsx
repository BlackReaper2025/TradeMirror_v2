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

export function TradeLog() {
  const { ready } = useDatabase();
  const [account, setAccount]     = useState<Account | null>(null);
  const [trades, setTrades]       = useState<TradeWithJournal[]>([]);
  const [loading, setLoading]     = useState(true);
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

  // ── Save a new trade + optional journal entry ──────────────────────────────
  const handleSave = useCallback(async (values: TradeFormValues) => {
    if (!account) return;
    setSaveError(null);
    try {
      const tradeId   = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const journalId = `j-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // Store openedAt as local datetime string ("YYYY-MM-DDTHH:MM:SS") — no Z suffix.
      // This keeps the day component consistent with localDateStr() used in queries.
      const normaliseDateTime = (v: string) => {
        if (!v) return v;
        // datetime-local gives "YYYY-MM-DDTHH:MM", pad seconds
        return v.length === 16 ? v + ":00" : v.replace(/Z$/, "");
      };

      const openedAt = normaliseDateTime(values.openedAt);
      const day      = openedAt.split("T")[0]; // local date for daily_stats

      console.log("[TradeLog] saving trade — openedAt:", openedAt, "day:", day);

      await createTrade({
        id:             tradeId,
        accountId:      account.id,
        openedAt,
        closedAt:       values.closedAt ? normaliseDateTime(values.closedAt) : undefined,
        instrument:     values.instrument.trim(),
        side:           values.side,
        setupName:      values.setupName.trim() || undefined,
        entryPrice:     values.entryPrice  ? parseFloat(values.entryPrice)  : undefined,
        stopPrice:      values.stopPrice   ? parseFloat(values.stopPrice)   : undefined,
        targetPrice:    values.targetPrice ? parseFloat(values.targetPrice) : undefined,
        size:           values.size        ? parseFloat(values.size)        : undefined,
        fees:           values.fees        ? parseFloat(values.fees)        : 0,
        pnl:            values.pnl         ? parseFloat(values.pnl)         : 0,
        technicalNotes: values.technicalNotes.trim() || undefined,
        tags:           values.tags.trim() || undefined,
      });
      console.log("[TradeLog] ✓ trade inserted");

      await createJournalEntry({
        id:              journalId,
        tradeId:         tradeId,
        emotionBefore:   values.emotionBefore   || undefined,
        emotionAfter:    values.emotionAfter     || undefined,
        mistakes:        values.mistakes.trim()  || undefined,
        lessons:         values.lessons.trim()   || undefined,
        confidenceScore: values.confidenceScore  ? parseInt(values.confidenceScore)  : undefined,
        disciplineScore: values.disciplineScore  ? parseInt(values.disciplineScore)  : undefined,
        freeformNotes:   values.freeformNotes.trim() || undefined,
      });
      console.log("[TradeLog] ✓ journal inserted");

      await recalculateDailyStats(account.id, day);
      console.log("[TradeLog] ✓ daily_stats recalculated");

      await updateAccountBalance(account.id);
      console.log("[TradeLog] ✓ account balance updated");

      // Notify dashboard (and any other subscriber) to refetch
      tradeEvents.notify();

      setShowForm(false);
      await load();
    } catch (err) {
      console.error("[TradeLog] save error:", err);
      setSaveError(String(err));
    }
  }, [account, load]);

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
          onClick={() => setShowForm(true)}
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
          <TradeTable trades={trades} onNewTrade={() => setShowForm(true)} />
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

      {/* ── Trade entry form (slide-over) ───────────────────────────────────── */}
      {showForm && account && (
        <TradeForm
          account={account}
          onClose={() => setShowForm(false)}
          onSaved={handleSave}
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
