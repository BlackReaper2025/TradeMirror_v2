import React, { useState, useCallback, useEffect } from "react";
import { ArrowUpRight, ArrowDownRight, Plus, Pencil, Trash2 } from "lucide-react";
import { Panel } from "../ui/Panel";
import { Badge } from "../ui/Badge";
import { TradeForm, type TradeFormValues } from "../tradelog/TradeForm";
import {
  createTrade,
  createJournalEntry,
  updateTrade,
  upsertJournalEntry,
  deleteTradeById,
  recalculateDailyStats,
  updateAccountBalance,
  getSettings,
  getAccount,
  type Trade,
  type Account,
  type TradeWithJournal,
} from "../../db/queries";
import { tradeEvents } from "../../lib/tradeEvents";
import { useDatabase } from "../../db/DatabaseProvider";
import { getTimeFormat } from "../../lib/preferences";

function formatTime(iso: string, hour12: boolean) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12 });
}

function fmtPrice(n: number | null | undefined) {
  if (n == null) return null;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 });
}

function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function normaliseDateTime(v: string): string {
  if (!v) return v;
  return v.length === 16 ? v + ":00" : v.replace(/Z$/, "");
}

interface Props {
  trades:       Trade[];
  selectedDate: string | null;
  onTradeChanged?: () => void;
}

export function TradeLogPreview({ trades, selectedDate, onTradeChanged }: Props) {
  const { ready } = useDatabase();
  const [showForm,      setShowForm]      = useState(false);
  const [editTrade,     setEditTrade]     = useState<TradeWithJournal | null>(null);
  const [duplicateInit, setDuplicateInit] = useState<TradeFormValues | undefined>(undefined);
  const [account,    setAccount]    = useState<Account | null>(null);
  const [hour12,     setHour12]     = useState(() => getTimeFormat() === "12h");

  useEffect(() => {
    const handler = () => setHour12(getTimeFormat() === "12h");
    window.addEventListener("tm:prefs-changed", handler);
    return () => window.removeEventListener("tm:prefs-changed", handler);
  }, []);

  // Load account once when form is about to open
  const loadAccount = useCallback(async () => {
    if (!ready) return null;
    try {
      const settings = await getSettings();
      const acc = await getAccount(settings?.selectedAccountId ?? "acc-1");
      setAccount(acc);
      return acc;
    } catch { return null; }
  }, [ready]);

  const finishSave = useCallback(async (accountId: string, days: string[]) => {
    const uniqueDays = [...new Set(days)];
    for (const d of uniqueDays) await recalculateDailyStats(accountId, d);
    await updateAccountBalance(accountId);
    tradeEvents.notify();
    setShowForm(false);
    setEditTrade(null);
    onTradeChanged?.();
  }, [onTradeChanged]);

  const handleAddClick = useCallback(async () => {
    const acc = await loadAccount();
    if (!acc) return;
    setEditTrade(null);
    setShowForm(true);
  }, [loadAccount]);

  const handleEditClick = useCallback(async (trade: Trade) => {
    const acc = await loadAccount();
    if (!acc) return;
    setEditTrade({ ...trade, journal: null });
    setShowForm(true);
  }, [loadAccount]);

  const handleDelete = useCallback(async (tradeId: string) => {
    if (!ready) return;
    try {
      const result = await deleteTradeById(tradeId);
      if (result) {
        await recalculateDailyStats(result.accountId, result.day);
        await updateAccountBalance(result.accountId);
        tradeEvents.notify();
        onTradeChanged?.();
      }
    } catch (err) {
      console.error("[TradeLogPreview] delete error:", err);
    }
  }, [ready, onTradeChanged]);

  const handleSave = useCallback(async (values: TradeFormValues) => {
    if (!account) return;
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
      setupName:      values.setupName.trim()     || undefined,
      entryPrice:     values.entryPrice  ? parseFloat(values.entryPrice)  : undefined,
      stopPrice:      values.stopPrice   ? parseFloat(values.stopPrice)   : undefined,
      targetPrice:    values.targetPrice ? parseFloat(values.targetPrice) : undefined,
      size:           values.size        ? parseFloat(values.size)        : undefined,
      fees:           values.fees        ? parseFloat(values.fees)        : 0,
      pnl:            values.pnl         ? parseFloat(values.pnl)         : 0,
      technicalNotes: values.technicalNotes.trim() || undefined,
      tags:           values.tags.trim()           || undefined,
      tradeRef:       values.tradeRef.trim()       || undefined,
      exitPrice:      values.exitPrice ? parseFloat(values.exitPrice) : undefined,
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
  }, [account, finishSave]);

  const handleEditSave = useCallback(async (values: TradeFormValues) => {
    if (!account || !editTrade) return;
    const oldDay   = (editTrade.closedAt ?? editTrade.openedAt).slice(0, 10);
    const openedAt = normaliseDateTime(values.openedAt);
    const closedAt = values.closedAt ? normaliseDateTime(values.closedAt) : undefined;
    const newDay   = (closedAt ?? openedAt).split("T")[0];

    await updateTrade(editTrade.id, {
      openedAt,
      closedAt,
      instrument:     values.instrument.trim(),
      side:           values.side,
      setupName:      values.setupName.trim()     || undefined,
      entryPrice:     values.entryPrice  ? parseFloat(values.entryPrice)  : undefined,
      stopPrice:      values.stopPrice   ? parseFloat(values.stopPrice)   : undefined,
      targetPrice:    values.targetPrice ? parseFloat(values.targetPrice) : undefined,
      size:           values.size        ? parseFloat(values.size)        : undefined,
      fees:           values.fees        ? parseFloat(values.fees)        : 0,
      pnl:            values.pnl         ? parseFloat(values.pnl)         : 0,
      technicalNotes: values.technicalNotes.trim() || undefined,
      tags:           values.tags.trim()           || undefined,
      tradeRef:       values.tradeRef.trim()       || undefined,
      exitPrice:      values.exitPrice ? parseFloat(values.exitPrice) : undefined,
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

    await finishSave(account.id, [oldDay, newDay]);
  }, [account, editTrade, finishSave]);

  return (
    <>
      <div style={{ position: "relative", height: "100%" }}>
        <div style={{
          position: "absolute", inset: 0, borderRadius: "14px", padding: "1.5px", pointerEvents: "none", zIndex: 1,
          background: "rgba(255,255,255,0.12)",
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        } as React.CSSProperties} />
        <Panel state className="h-full flex flex-col" style={{ border: "none", borderRadius: "14px", background: "radial-gradient(ellipse at top left, rgba(255,255,255,0.07) 0%, transparent 60%), rgba(8,12,18,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", boxShadow: "none" } as React.CSSProperties}>
          <div className="relative flex items-center justify-between mb-4">
            <span className="text-[14px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
              Trade History
            </span>
            {selectedDate && (
              <span className="text-[12px] font-normal" style={{ color: "var(--text-muted)", position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
                {selectedDate === todayDateStr() ? "Today" : fmtDate(selectedDate)}
              </span>
            )}
            <button
              onClick={handleAddClick}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors"
              style={{ color: "var(--text-secondary)", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.15)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
              title="Add trade"
            >
              <Plus size={11} /> Add Trade
            </button>
          </div>

          <div className="flex flex-col gap-2 flex-1 overflow-auto">
            {trades.map((trade) => {
              const pnl   = trade.pnl ?? 0;
              const isWin = pnl > 0;
              const pnlStr = `${isWin ? "+" : pnl < 0 ? "-" : ""}$${Math.abs(pnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              return (
                <div
                  key={trade.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
                  onDoubleClick={() => handleEditClick(trade)}
                >
                  {/* Side icon */}
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: isWin ? "var(--accent-dim)" : "rgba(255,255,255,0.06)" }}
                  >
                    {trade.side === "long"
                      ? <ArrowUpRight size={14} style={{ color: isWin ? "var(--accent-text)" : "var(--text-muted)" }} />
                      : <ArrowDownRight size={14} style={{ color: isWin ? "var(--accent-text)" : "var(--text-muted)" }} />
                    }
                  </div>

                  {/* Instrument + setup */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                        {trade.instrument}
                      </span>
                      <Badge
                        label={trade.side === "long" ? "Long" : "Short"}
                        color="neutral"
                      />
                    </div>
                    <div className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      {trade.setupName} · {formatTime(trade.openedAt, hour12)}
                    </div>
                    {(trade.entryPrice != null || trade.targetPrice != null) && (
                      <div className="flex items-center gap-2 mt-1">
                        {fmtPrice(trade.entryPrice) && (
                          <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                            Entry <span style={{ color: "var(--text-secondary)" }}>{fmtPrice(trade.entryPrice)}</span>
                          </span>
                        )}
                        {fmtPrice(trade.entryPrice) && fmtPrice(trade.targetPrice) && (
                          <span style={{ color: "var(--text-muted)", fontSize: "9px" }}>→</span>
                        )}
                        {fmtPrice(trade.targetPrice) && (
                          <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                            Target <span style={{ color: "var(--text-secondary)" }}>{fmtPrice(trade.targetPrice)}</span>
                          </span>
                        )}
                        {trade.tradeRef && (
                          <span className="text-[11px] font-mono tabular-nums ml-auto mr-4" style={{ color: "var(--text-muted)" }}>
                            #{trade.tradeRef}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* P&L + actions */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <div
                      className="text-[14px] font-bold tabular-nums"
                      style={{ color: isWin ? "var(--accent-text)" : "var(--text-secondary)" }}
                    >
                      {pnlStr}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEditClick(trade)}
                        className="flex items-center justify-center w-5 h-5 rounded transition-colors"
                        style={{ color: "var(--text-secondary)", background: "rgba(255,255,255,0.10)" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.20)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.10)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
                        title="Edit trade"
                      >
                        <Pencil size={10} />
                      </button>
                      <button
                        onClick={() => handleDelete(trade.id)}
                        className="flex items-center justify-center w-5 h-5 rounded transition-colors"
                        style={{ color: "var(--text-secondary)", background: "rgba(255,255,255,0.10)" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.25)"; (e.currentTarget as HTMLElement).style.color = "#f87171"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.10)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
                        title="Delete trade"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {trades.length === 0 && (
              <div className="flex-1 flex items-center justify-center">
                <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {selectedDate ? "No trades on this day" : "No trades today"}
                </span>
              </div>
            )}
          </div>
        </Panel>
      </div>

      {showForm && account && (
        <TradeForm
          key={editTrade?.id ?? "new"}
          account={account}
          existingTrade={editTrade}
          defaultDate={editTrade ? undefined : (selectedDate ?? undefined)}
          defaultValues={duplicateInit}
          onClose={() => { setShowForm(false); setEditTrade(null); setDuplicateInit(undefined); }}
          onSaved={editTrade ? handleEditSave : handleSave}
          onDuplicate={(vals) => { setDuplicateInit(vals); setEditTrade(null); }}
        />
      )}
    </>
  );
}
