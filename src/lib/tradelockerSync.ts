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
import { eq, and, isNotNull } from "drizzle-orm";
import { getDb } from "../db/index";
import { trades, executions, tradeIdeas } from "../db/schema";
import { getAccountProfile, recalculateDailyStats, updateAccountBalance } from "../db/queries";
import { tradeEvents } from "./tradeEvents";
import { looksLikeStopOut, recordStopOutCooldown } from "./riskEngine";
import { utcMsToZonedWallTimeStr } from "./timezone";

type TlRow = Record<string, string | null>;
interface TlInstrument { tradableInstrumentId: string | number; name: string; }

export interface TlSyncResult {
  opened: number;
  closed: number;
  updated: number;
  split: number;
  errors: string[];
}

// The rest of the app stores trades.openedAt/closedAt as NAIVE wall-clock
// strings in this zone (see src/lib/serverTime.ts's STORAGE_ZONE) — not raw
// UTC ISO strings. A plain `new Date(ms).toISOString()` (what this used to
// do) produces a "...Z"-suffixed UTC string, which silently broke
// recalculateDailyStats's day-boundary comparison (a naive string range
// check against trades.closedAt) and could shift a trade onto the wrong
// calendar day or off any day entirely, depending on the gap between UTC
// and this zone. Broker timestamps are UTC, so they need the same
// zone conversion "Server Time" manual entries already get.
const STORAGE_ZONE = "America/New_York";

function msToStorageZone(ms: string | number | null | undefined): string | null {
  if (ms == null) return null;
  const n = typeof ms === "string" ? parseInt(ms, 10) : ms;
  if (!Number.isFinite(n) || n <= 0) return null;
  return utcMsToZonedWallTimeStr(n, STORAGE_ZONE) + ":00";
}

function nowStorageZone(): string {
  return utcMsToZonedWallTimeStr(Date.now(), STORAGE_ZONE) + ":00";
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
//
// Matches a 6-letter PREFIX rather than requiring the whole string to be
// exactly 6 letters — a real E8/TradeLocker account confirmed this matters:
// broker/white-label instrument names can carry a suffix (account-type or
// route marker) that an exact-length match silently falls through on,
// leaving the symbol unslashed and permanently unmatched to any chart pair.
function normalizeInstrumentName(raw: string): string {
  const upper = raw.toUpperCase().trim();
  if (upper.includes("/")) return upper;
  const match = upper.match(/^([A-Z]{6})/);
  if (match) {
    const code = match[1];
    return `${code.slice(0, 3)}/${code.slice(3)}`;
  }
  return upper;
}

/**
 * Syncs one TradeMirror account's linked TradeLocker account into the Trade
 * Log. Safe to call repeatedly (e.g. a manual "Sync Now" button) — already-
 * tracked positions are only updated, never re-inserted.
 */
export async function syncTradeLockerAccount(accountId: string): Promise<TlSyncResult> {
  const result: TlSyncResult = { opened: 0, closed: 0, updated: 0, split: 0, errors: [] };
  // Local calendar days touched by any trade this sync closes/creates with a
  // closedAt — daily_stats (which the Dashboard and Calendar panel actually
  // read, not the trades table directly) is a derived aggregate that has to
  // be explicitly recalculated after writing trades, same as the normal
  // Trade Log save path (src/lib/tradeSave.ts's finishTradeSave) already
  // does. Without this, synced trades existed in the DB but never showed up
  // anywhere that reads daily_stats.
  const touchedDays = new Set<string>();

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

  // Lazily fetched and shared by both the partial-close check below and the
  // full-closure loop further down, so a sync with neither doesn't pay for it.
  let history: TlRow[] | null = null;
  async function getHistory(): Promise<TlRow[]> {
    if (history === null) {
      try {
        history = await invoke<TlRow[]>("tradelocker_get_orders_history", { accountId: tlAccountId, accNum });
      } catch (err) {
        result.errors.push(String(err));
        history = [];
      }
    }
    return history;
  }

  // Recognizes a line this sync (in any past or current version) writes
  // automatically, vs. the user's own commentary — used to migrate stray
  // auto-generated lines that older code wrote into technicalNotes (before
  // syncNotes existed) out into syncNotes where they belong.
  function isSyncGeneratedLine(line: string): boolean {
    return (
      line.startsWith("[Estimated P&L") || // dead feature — see isEstimateLine below
      line.startsWith("[P&L estimate unavailable") ||
      line.startsWith("[Partial close ") || // superseded format, pre-dates leg-splitting
      line.startsWith("Partial close leg") ||
      line.startsWith("P&L for the closed portion not captured")
    );
  }

  // The P&L auto-estimate (tickCost, then lotSize-based contract math) was
  // tried and abandoned — confirmed wrong against known-real TradeLocker Net
  // P&L values, with no further data source available to fix it. The user
  // now enters P&L/fees manually. These lines are actively deleted (not
  // migrated) wherever they're found, rather than left around as clutter.
  function isEstimateLine(line: string): boolean {
    return line.startsWith("[Estimated P&L") || line.startsWith("[P&L estimate unavailable");
  }

  // All "Filled" orders against this position on the reducing side (opposite
  // the position's own side), oldest first — a position can accumulate
  // several of these over time (one or more partial closes, then the final
  // close), and TradeLocker's own journal shows exactly this: one entry per
  // reducing fill, sharing the same entry price/time but each with its own
  // exit price/time/size. Mirrored here rather than collapsing to "the
  // latest fill" so the Trade Log matches what the broker itself shows.
  function findAllReducingFills(rows: TlRow[], positionId: string, positionSide: "long" | "short"): TlRow[] {
    const reducingSide = positionSide === "long" ? "sell" : "buy";
    const candidates = rows.filter(
      (o) => String(o.positionId) === positionId && String(o.status) === "Filled" && String(o.side).toLowerCase() === reducingSide
    );
    candidates.sort((a, b) => (toNum(a.lastModified) ?? toNum(a.createdDate) ?? 0) - (toNum(b.lastModified) ?? toNum(b.createdDate) ?? 0));
    return candidates;
  }

  // A reducing fill is "already recorded" once some trades row carries its
  // order id as tradeRef — every split-leg row this sync creates is tagged
  // that way specifically so a repeated sync recognizes it and never splits
  // the same closing fill into a second row.
  async function tradeExistsForOrderId(orderId: string): Promise<boolean> {
    const rows = await db.select().from(trades).where(eq(trades.tradeRef, orderId)).limit(1);
    return rows.length > 0;
  }

  // Creates one Trade Log row for a single reducing fill — a completed leg
  // of a position that was (or is still being) closed in pieces. Entry/SL/TP
  // are shared with the parent position; size and exit are this fill's own.
  // pnl/fees are intentionally left unset — TradeLocker's API exposes
  // neither, and an auto-estimate was tried and abandoned as unfixably wrong
  // (see isEstimateLine above); the user enters these manually now.
  async function createSplitLegTrade(params: {
    brokerPositionId: string; fill: TlRow; symbol: string; side: "long" | "short";
    entryPrice: number | null; stopPrice: number | null; targetPrice: number | null; openedAtIso: string;
  }): Promise<void> {
    const { brokerPositionId, fill, symbol, side, entryPrice, stopPrice, targetPrice, openedAtIso } = params;
    const orderId = String(fill.id);
    const legQty = toNum(fill.filledQty);
    const legExitPrice = toNum(fill.avgPrice);
    const legClosedAt = msToStorageZone(fill.lastModified) ?? msToStorageZone(fill.createdDate) ?? nowStorageZone();
    const note = "Partial close leg — split from a larger position closed in pieces on TradeLocker.";

    await db.insert(trades).values({
      id: `t-tl-${brokerPositionId}-${orderId}`,
      accountId, openedAt: openedAtIso,
      instrument: symbol, side,
      entryPrice: entryPrice ?? undefined,
      stopPrice: stopPrice ?? undefined,
      targetPrice: targetPrice ?? undefined,
      size: legQty ?? undefined,
      closedAt: legClosedAt,
      exitPrice: legExitPrice ?? undefined,
      tradeRef: orderId,
      syncNotes: note,
    });
    touchedDays.add(legClosedAt.slice(0, 10));
  }

  // ── Create or update Trade Log entries for currently-open positions ──
  for (const pos of positions) {
    const brokerPositionId = String(pos.id);
    const rawName = instrumentName.get(String(pos.tradableInstrumentId)) ?? `#${pos.tradableInstrumentId}`;
    const symbol = normalizeInstrumentName(rawName);
    const side: "long" | "short" = String(pos.side).toLowerCase() === "sell" ? "short" : "long";
    const entryPrice = toNum(pos.avgPrice);
    const qty = toNum(pos.qty);
    const openedAtIso = msToStorageZone(pos.openDate) ?? nowStorageZone();

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
      // changed directly on the broker platform since the last sync, and
      // re-normalize the symbol too: a row created before a normalizer fix
      // (or before /trade/config's instrument metadata was fully resolved)
      // would otherwise stay wrong forever, since this is the only place
      // an already-tracked row's fields ever get touched again.
      const exec = existing[0];
      if (exec.status === "open" && exec.tradeId) {
        // A partial close leaves the position id unchanged and still in the
        // open-positions list — it only shows up as a smaller quantity than
        // last synced. Mirrors TradeLocker's own journal: split off a
        // separate Trade Log row for each reducing fill not already
        // recorded, sized and priced to that specific fill, and keep this
        // row representing whatever's still actually open.
        const EPS = 1e-9;
        const isPartialClose = exec.quantity != null && qty != null && qty < exec.quantity - EPS;
        if (isPartialClose) {
          const fills = findAllReducingFills(await getHistory(), brokerPositionId, side);
          for (const fill of fills) {
            if (await tradeExistsForOrderId(String(fill.id))) continue;
            await createSplitLegTrade({ brokerPositionId, fill, symbol, side, entryPrice, stopPrice, targetPrice, openedAtIso });
            result.split++;
          }
        }

        await db.update(trades).set({
          instrument: symbol,
          stopPrice: stopPrice ?? undefined,
          targetPrice: targetPrice ?? undefined,
          size: qty ?? undefined, // broker-reported current remaining size — authoritative
        }).where(eq(trades.id, exec.tradeId));
        await db.update(executions).set({
          stopPrice: stopPrice ?? undefined,
          targetPrice: targetPrice ?? undefined,
          quantity: qty ?? undefined,
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

  for (const exec of stillOpenTracked) {
    let closedAtIso = nowStorageZone();
    let closedAtUtcMs = Date.now(); // for cooldown math — never derive a moment back out of the naive storage string
    if (exec.tradeId) {
      const tradeRow = (await db.select().from(trades).where(eq(trades.id, exec.tradeId)).limit(1))[0];
      const fills = tradeRow && exec.brokerPositionId
        ? findAllReducingFills(await getHistory(), exec.brokerPositionId, tradeRow.side)
        : [];
      // Every fill except the last is an earlier partial close that hasn't
      // been split into its own row yet (e.g. the position went from open
      // straight to fully-closed between two syncs, so the "still open"
      // branch above never got a chance to split it off). The last fill is
      // what actually closes this row — matches TradeLocker's own journal:
      // one row per reducing fill, this row representing the final leg.
      const unsplit = tradeRow
        ? await Promise.all(fills.map(async (f) => (await tradeExistsForOrderId(String(f.id))) ? null : f))
        : [];
      const pending = unsplit.filter((f): f is TlRow => f !== null);
      const finalFill = pending.length > 0 ? pending[pending.length - 1] : null;
      const earlierFills = pending.slice(0, -1);

      if (tradeRow) {
        for (const f of earlierFills) {
          await createSplitLegTrade({
            brokerPositionId: exec.brokerPositionId!, fill: f, symbol: tradeRow.instrument, side: tradeRow.side,
            entryPrice: tradeRow.entryPrice, stopPrice: exec.stopPrice, targetPrice: exec.targetPrice, openedAtIso: tradeRow.openedAt,
          });
          result.split++;
        }
      }

      const exitPrice = finalFill ? toNum(finalFill.avgPrice) : null;
      if (finalFill) {
        closedAtIso = msToStorageZone(finalFill.lastModified) ?? msToStorageZone(finalFill.createdDate) ?? closedAtIso;
        closedAtUtcMs = toNum(finalFill.lastModified) ?? toNum(finalFill.createdDate) ?? closedAtUtcMs;
      }

      // pnl/fees intentionally left unset — see the note on createSplitLegTrade above.
      await db.update(trades).set({
        closedAt: closedAtIso,
        exitPrice: exitPrice ?? undefined,
        tradeRef: finalFill ? String(finalFill.id) : undefined,
      }).where(eq(trades.id, exec.tradeId));
      touchedDays.add(closedAtIso.slice(0, 10));

      if (tradeRow && looksLikeStopOut(tradeRow.side, exec.stopPrice, exitPrice)) {
        await recordStopOutCooldown({
          executionId: exec.id,
          accountId,
          stopOutAtMs: closedAtUtcMs,
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

  // ── Backfill: retroactively estimate P&L for trades closed before this
  // diagnostic existed (e.g. legs already recorded by an earlier sync) — one
  // pass per trade, skipped on future syncs once a note is present. Matches
  // via tradeRef (the closing order id) against order history to find the
  // tradableInstrumentId/routeId the estimate needs.
  const closedTrades = await db.select().from(trades)
    .where(and(eq(trades.accountId, accountId), isNotNull(trades.closedAt), isNotNull(trades.exitPrice)));
  for (const t of closedTrades) {
    // One-time repair: earlier versions of this sync wrote its own
    // auto-generated lines (partial-close leg notices, P&L estimate debug)
    // into technicalNotes, which is meant for the user's own commentary —
    // move any such lines already sitting there into syncNotes instead.
    // Estimate lines specifically are deleted rather than migrated: the
    // auto-estimate was tried and abandoned as unfixably wrong (see
    // isEstimateLine above), so there's nothing worth keeping in either
    // field. Harmless to re-check every sync: once a row is clean, there's
    // nothing left to move or strip.
    const technicalLines = (t.technicalNotes ?? "").split("\n");
    const strayedSyncLines = technicalLines.filter((l) => isSyncGeneratedLine(l) && !isEstimateLine(l));
    const syncLines = (t.syncNotes ?? "").split("\n").filter((l) => l.length > 0 && !isEstimateLine(l));
    const needsCleanup = strayedSyncLines.length > 0
      || technicalLines.some(isSyncGeneratedLine)
      || (t.syncNotes ?? "").split("\n").some(isEstimateLine);
    if (needsCleanup) {
      const remainingTechnicalNotes = technicalLines.filter((l) => !isSyncGeneratedLine(l)).join("\n").trim();
      const cleanedSyncNotes = [...syncLines, ...strayedSyncLines].filter(Boolean).join("\n");
      await db.update(trades).set({
        technicalNotes: remainingTechnicalNotes || null,
        syncNotes: cleanedSyncNotes || null,
      }).where(eq(trades.id, t.id));
      t.technicalNotes = remainingTechnicalNotes || null;
      t.syncNotes = cleanedSyncNotes || null;
    }

    // Repair rows written before the storage-zone fix above existed — they
    // have a UTC "...Z" closedAt/openedAt instead of the naive
    // America/New_York string the rest of the app expects, which is exactly
    // what made recalculateDailyStats silently miss them. A future sync
    // can't otherwise touch these again once closed, so this has to run
    // every time and fix them in place, not just going forward.
    let fixedClosedAt = t.closedAt!;
    let fixedOpenedAt = t.openedAt;
    let needsDateFix = false;
    if (fixedClosedAt.endsWith("Z")) {
      const ms = Date.parse(fixedClosedAt);
      if (Number.isFinite(ms)) { fixedClosedAt = msToStorageZone(ms) ?? fixedClosedAt; needsDateFix = true; }
    }
    if (fixedOpenedAt.endsWith("Z")) {
      const ms = Date.parse(fixedOpenedAt);
      if (Number.isFinite(ms)) { fixedOpenedAt = msToStorageZone(ms) ?? fixedOpenedAt; needsDateFix = true; }
    }
    if (needsDateFix) {
      await db.update(trades).set({ closedAt: fixedClosedAt, openedAt: fixedOpenedAt }).where(eq(trades.id, t.id));
      t.closedAt = fixedClosedAt;
      t.openedAt = fixedOpenedAt;
    }

    // Re-validate daily_stats for every closed trade's day on every sync, not
    // just ones touched by fresh activity this run — touchedDays otherwise
    // only gets one chance to fire (the exact sync that first detects a
    // closure), and if anything ever went wrong in that one narrow window,
    // there was no way for the day to ever get recalculated again.
    if (t.closedAt) touchedDays.add(t.closedAt.slice(0, 10));
  }

  for (const day of touchedDays) {
    await recalculateDailyStats(accountId, day);
  }
  if (touchedDays.size > 0) {
    await updateAccountBalance(accountId);
  }

  if (result.opened > 0 || result.closed > 0 || result.updated > 0 || result.split > 0) {
    tradeEvents.notify();
  }
  return result;
}
