// ─── Shared trade create/edit/delete flow ─────────────────────────────────────
// TradeLog.tsx (full page) and TradeLogPreview.tsx (Dashboard widget) both
// need to turn a TradeFormValues draft into DB writes, then recalc daily
// stats + account balance + notify listeners. Previously each reimplemented
// this ~140-line sequence independently, with real risk of the two silently
// diverging on a future field/behavior change. This is the one place that
// sequence lives; callers still own their own post-save UI behavior (a full
// local refetch for the page, a lighter onTradeChanged callback for the
// widget) since that part genuinely differs between them.

import type { Account, CreateTradeInput, CreateJournalInput, TradeWithJournal } from "../db/queries";
import {
  createTrade, createJournalEntry, updateTrade, upsertJournalEntry,
  syncTradeImages, recalculateDailyStats, updateAccountBalance,
} from "../db/queries";
import type { TradeFormValues } from "../components/tradelog/TradeForm";
import { tradeEvents } from "./tradeEvents";

// Normalise a datetime-local string to a full "YYYY-MM-DDTHH:MM:SS" (no Z).
export function normaliseDateTime(v: string): string {
  if (!v) return v;
  return v.length === 16 ? v + ":00" : v.replace(/Z$/, "");
}

function buildTradeFields(values: TradeFormValues, openedAt: string, closedAt: string | undefined): Omit<CreateTradeInput, "id" | "accountId"> {
  return {
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
    syncNotes:      values.syncNotes.trim()       || undefined,
    tags:           values.tags.trim()            || undefined,
    tradeRef:       values.tradeRef.trim()        || undefined,
    exitPrice:      values.exitPrice  ? parseFloat(values.exitPrice)  : undefined,
    slPips:         values.slPips  ? parseFloat(values.slPips)  : undefined,
    tpPips:         values.tpPips  ? parseFloat(values.tpPips)  : undefined,
    maePips:        values.maePips ? parseFloat(values.maePips) : undefined,
    mae:            values.mae     ? parseFloat(values.mae)     : undefined,
    maeTime:        values.maeTime ? normaliseDateTime(values.maeTime) : undefined,
    mfePips:        values.mfePips ? parseFloat(values.mfePips) : undefined,
    mfe:            values.mfe     ? parseFloat(values.mfe)     : undefined,
    mfeTime:        values.mfeTime ? normaliseDateTime(values.mfeTime) : undefined,
  };
}

function buildJournalFields(values: TradeFormValues): Omit<CreateJournalInput, "id" | "tradeId"> {
  return {
    emotionBefore:   values.emotionBefore                      || undefined,
    emotionAfter:    values.emotionAfter                       || undefined,
    mistakes:        values.mistakes.trim()                    || undefined,
    lessons:         values.lessons.trim()                     || undefined,
    confidenceScore: values.confidenceScore ? parseInt(values.confidenceScore) : undefined,
    disciplineScore: values.disciplineScore ? parseInt(values.disciplineScore) : undefined,
    freeformNotes:   values.freeformNotes.trim()               || undefined,
  };
}

/** Recalculate daily stats for every affected day + the account balance, then notify. Call after the trade/journal writes below. */
export async function finishTradeSave(accountId: string, days: string[]): Promise<void> {
  const uniqueDays = [...new Set(days)];
  for (const d of uniqueDays) await recalculateDailyStats(accountId, d);
  await updateAccountBalance(accountId);
  tradeEvents.notify();
}

/** Create a new trade + journal entry + synced images. Returns the day it landed on (for finishTradeSave). */
export async function saveNewTrade(account: Account, values: TradeFormValues): Promise<{ day: string }> {
  const tradeId   = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const journalId = `j-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const openedAt  = normaliseDateTime(values.openedAt);
  const closedAt  = values.closedAt ? normaliseDateTime(values.closedAt) : undefined;
  const day       = (closedAt ?? openedAt).split("T")[0];

  await createTrade({ id: tradeId, accountId: account.id, ...buildTradeFields(values, openedAt, closedAt) });
  await createJournalEntry({ id: journalId, tradeId, ...buildJournalFields(values) });
  await syncTradeImages(tradeId, values.images);

  return { day };
}

/** Update an existing trade + upsert its journal entry + synced images. Returns both days in play (for finishTradeSave — the trade may have moved date). */
export async function saveEditedTrade(editTrade: TradeWithJournal, values: TradeFormValues): Promise<{ oldDay: string; newDay: string }> {
  const oldDay   = (editTrade.closedAt ?? editTrade.openedAt).slice(0, 10);
  const openedAt = normaliseDateTime(values.openedAt);
  const closedAt = values.closedAt ? normaliseDateTime(values.closedAt) : undefined;
  const newDay   = (closedAt ?? openedAt).split("T")[0];

  await updateTrade(editTrade.id, buildTradeFields(values, openedAt, closedAt));
  await upsertJournalEntry(editTrade.id, editTrade.journal?.id ?? null, buildJournalFields(values));
  await syncTradeImages(editTrade.id, values.images);

  return { oldDay, newDay };
}
