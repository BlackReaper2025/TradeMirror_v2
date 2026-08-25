// ─── TradeLocker → Trade Log synchronization (Phase 6) ────────────────────────
// Reads open positions / non-final orders / order history from the broker
// (via the Rust commands added in Phase 5) and reconciles them into the
// existing Trade Log (trades table), without redesigning it. Every broker
// position is tracked by a linked `executions` row keyed on brokerPositionId,
// which is how a repeated or restarted sync avoids ever creating a duplicate
// Trade Log record for the same position (also backstopped by a DB-level
// unique index — see migrations.ts v12).
//
// Manual trigger only for now (a "Sync Now" button in Settings) rather than a
// background poll — this is still the validation phase for the integration,
// and a human-in-the-loop sync is easier to reason about and verify.

import { invoke } from "@tauri-apps/api/core";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index";
import { trades, executions, tradeIdeas } from "../db/schema";
import { getAccountProfile } from "../db/queries";
import { tradeEvents } from "./tradeEvents";
import { looksLikeStopOut, recordStopOutCooldown } from "./riskEngine";

type TlRow = Record<string, string | null>;
interface TlInstrument { tradableInstrumentId: string | number; name: string; }

export interface TlSyncResult {
  opened: number;
  closed: number;
  updated: number;
  errors: string[];
}

function msToIso(ms: string | number | null | undefined): string | null {
  if (ms == null) return null;
  const n = typeof ms === "string" ? parseInt(ms, 10) : ms;
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n).toISOString();
}

function toNum(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// TradeLocker's instrument names come back bare ("EURUSD"), but the rest of
// the app — the Trade Log, Analytics chart's pair selector, and the "open
// trade" matching in AnalyticsV3.tsx (t.instrument.toUpperCase() === pair) —
// uses a slash for 6-letter pair codes ("EUR/USD", "XAU/USD", "BTC/USD") and
// bare tickers only for indices/commodities ("US30", "GOLD", "NAS100").
// Without this, a synced trade's instrument string would never match the
// chart's pair and its Entry/SL/TP lines would silently never appear.
function normalizeInstrumentName(raw: string): string {
  const upper = raw.toUpperCase().trim();
  if (upper.includes("/")) return upper;
  if (/^[A-Z]{6}$/.test(upper)) {
    return `${upper.slice(0, 3)}/${upper.slice(3)}`;
  }
  return upper;
}

/**
 * Syncs one TradeMirror account's linked TradeLocker account into the Trade
 * Log. Safe to call repeatedly (e.g. a manual "Sync Now" button) — already-
 * tracked positions are only updated, never re-inserted.
 */
export async function syncTradeLockerAccount(accountId: string): Promise<TlSyncResult> {
  const result: TlSyncResult = { opened: 0, closed: 0, updated: 0, errors: [] };

  const profile = await getAccountProfile(accountId);
  if (!profile?.tradelockerAccountId || !profile?.tradelockerAccNum) {
    result.errors.push("No TradeLocker account is linked to this TradeMirror account yet — link one in Settings first.");
    return result;
  }
  const tlAccountId = profile.tradelockerAccountId;
  const accNum = profile.tradelockerAccNum;

  let positions: TlRow[] = [];
  let openOrders: TlRow[] = [];
  let instruments: TlInstrument[] = [];
  try {
    [positions, openOrders, instruments] = await Promise.all([
      invoke<TlRow[]>("tradelocker_get_positions", { accountId: tlAccountId, accNum }),
      invoke<TlRow[]>("tradelocker_get_orders", { accountId: tlAccountId, accNum }),
      invoke<TlInstrument[]>("tradelocker_get_instruments", { accountId: tlAccountId, accNum }),
    ]);
  } catch (err) {
    result.errors.push(String(err));
    return result;
  }

  const instrumentName = new Map(instruments.map((i) => [String(i.tradableInstrumentId), i.name]));
  const orderById = new Map(openOrders.map((o) => [String(o.id), o]));
  const db = getDb();

  // ── Create or update Trade Log entries for currently-open positions ──
  for (const pos of positions) {
    const brokerPositionId = String(pos.id);
    const rawName = instrumentName.get(String(pos.tradableInstrumentId)) ?? `#${pos.tradableInstrumentId}`;
    const symbol = normalizeInstrumentName(rawName);
    const side: "long" | "short" = String(pos.side).toLowerCase() === "sell" ? "short" : "long";
    const entryPrice = toNum(pos.avgPrice);
    const qty = toNum(pos.qty);
    const openedAtIso = msToIso(pos.openDate) ?? new Date().toISOString();

    const slOrder = pos.stopLossId ? orderById.get(String(pos.stopLossId)) : null;
    const tpOrder = pos.takeProfitId ? orderById.get(String(pos.takeProfitId)) : null;
    const stopPrice   = slOrder ? (toNum(slOrder.stopPrice) ?? toNum(slOrder.price)) : null;
    const targetPrice = tpOrder ? (toNum(tpOrder.price) ?? toNum(tpOrder.stopPrice)) : null;

    const existing = await db.select().from(executions)
      .where(and(eq(executions.accountId, accountId), eq(executions.brokerPositionId, brokerPositionId)))
      .limit(1);

    if (existing.length === 0) {
      const ideaId  = `idea-tl-${brokerPositionId}`;
      const tradeId = `t-tl-${brokerPositionId}`;
      try {
        await db.insert(tradeIdeas).values({
          id: ideaId, symbol, direction: side, orderType: "market",
          intendedEntry: entryPrice ?? undefined,
          intendedStop: stopPrice ?? undefined,
          intendedTarget: targetPrice ?? undefined,
          lifecycleState: "open",
          disciplineState: "Synced from TradeLocker — opened outside TradeMirror's planning flow.",
          createdAt: openedAtIso,
        });
        await db.insert(trades).values({
          id: tradeId, accountId, openedAt: openedAtIso,
          instrument: symbol, side,
          entryPrice: entryPrice ?? undefined,
          stopPrice: stopPrice ?? undefined,
          targetPrice: targetPrice ?? undefined,
          size: qty ?? undefined,
          tradeRef: brokerPositionId,
        });
        await db.insert(executions).values({
          id: `exec-${brokerPositionId}`, tradeIdeaId: ideaId, accountId, tradeId,
          broker: "tradelocker", brokerPositionId, status: "open",
          entryPrice: entryPrice ?? undefined,
          stopPrice: stopPrice ?? undefined,
          targetPrice: targetPrice ?? undefined,
          quantity: qty ?? undefined,
          openedAt: openedAtIso,
        });
        result.opened++;
      } catch (err) {
        result.errors.push(`Position ${brokerPositionId}: ${String(err)}`);
      }
    } else {
      // Already tracked and still open — refresh SL/TP in case they were
      // changed directly on the broker platform since the last sync.
      const exec = existing[0];
      if (exec.status === "open" && exec.tradeId) {
        await db.update(trades).set({
          stopPrice: stopPrice ?? undefined,
          targetPrice: targetPrice ?? undefined,
        }).where(eq(trades.id, exec.tradeId));
        await db.update(executions).set({
          stopPrice: stopPrice ?? undefined,
          targetPrice: targetPrice ?? undefined,
        }).where(eq(executions.id, exec.id));
        result.updated++;
      }
    }
  }

  // ── Detect closures: tracked "open" executions no longer in the open-positions list ──
  const openPositionIds = new Set(positions.map((p) => String(p.id)));
  const trackedOpen = await db.select().from(executions)
    .where(and(eq(executions.accountId, accountId), eq(executions.status, "open"), eq(executions.broker, "tradelocker")));

  const stillOpenTracked = trackedOpen.filter(
    (e) => e.brokerPositionId && !openPositionIds.has(e.brokerPositionId)
  );

  let history: TlRow[] | null = null;
  for (const exec of stillOpenTracked) {
    if (history === null) {
      try {
        history = await invoke<TlRow[]>("tradelocker_get_orders_history", { accountId: tlAccountId, accNum });
      } catch (err) {
        result.errors.push(String(err));
        history = [];
      }
    }
    const closeFill = history.find(
      (o) => String(o.positionId) === exec.brokerPositionId && String(o.status) === "Filled"
    );
    const exitPrice   = closeFill ? toNum(closeFill.avgPrice) : null;
    const closedAtIso = closeFill
      ? (msToIso(closeFill.lastModified) ?? msToIso(closeFill.createdDate) ?? new Date().toISOString())
      : new Date().toISOString();

    if (exec.tradeId) {
      const tradeRow = (await db.select().from(trades).where(eq(trades.id, exec.tradeId)).limit(1))[0];
      await db.update(trades).set({
        closedAt: closedAtIso,
        exitPrice: exitPrice ?? undefined,
        // pnl intentionally left unset — TradeLocker's read-only API doesn't
        // expose a reliable per-trade realized P&L or contract/point value
        // here, and guessing at one would put a fabricated number in front
        // of real trading decisions. Fill in manually from the Trade Log,
        // or wire this once a verified P&L source is available.
      }).where(eq(trades.id, exec.tradeId));

      if (tradeRow && looksLikeStopOut(tradeRow.side, exec.stopPrice, exitPrice)) {
        await recordStopOutCooldown({
          executionId: exec.id,
          accountId,
          stopOutAtIso: closedAtIso,
          cooldownHours: profile.cooldownHours ?? 12,
        });
      }
    }
    await db.update(executions).set({
      status: "closed",
      closedAt: closedAtIso,
    }).where(eq(executions.id, exec.id));
    result.closed++;
  }

  if (result.opened > 0 || result.closed > 0 || result.updated > 0) {
    tradeEvents.notify();
  }
  return result;
}
