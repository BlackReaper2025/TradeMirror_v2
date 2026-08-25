// ─── OANDA → Trade Log synchronization (Phase 8/9) ─────────────────────────────
// Mirrors src/lib/tradelockerSync.ts's design for the OANDA trading account:
// reads open/closed trades from OANDA's v20 account API and reconciles them
// into the existing Trade Log, keyed by a linked `executions` row per OANDA
// trade id so a repeated sync never creates duplicates. Manual "Sync Now"
// trigger only, same reasoning as the TradeLocker sync — still validation
// phase, human-in-the-loop is easier to reason about than a background poll.
//
// `broker: "oanda"` on every execution row this function touches keeps it
// from ever considering a TradeLocker-owned row "closed" (or vice versa) if
// one TradeMirror account were ever linked to both brokers.

import { invoke } from "@tauri-apps/api/core";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index";
import { trades, executions, tradeIdeas } from "../db/schema";
import { getAccountProfile } from "../db/queries";
import { tradeEvents } from "./tradeEvents";
import { looksLikeStopOut, recordStopOutCooldown } from "./riskEngine";

interface OandaOrderSummary { price?: string; distance?: string; }
interface OandaTrade {
  id: string;
  instrument: string;
  price: string; // entry price
  openTime: string;
  state: string;
  initialUnits: string;
  currentUnits: string;
  closeTime?: string;
  averageClosePrice?: string;
  realizedPL?: string;
  takeProfitOrder?: OandaOrderSummary;
  stopLossOrder?: OandaOrderSummary;
}

export interface OandaSyncResult {
  opened: number;
  updated: number;
  closed: number;
  errors: string[];
}

function toNum(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// Reverses src-tauri/src/lib.rs's to_oanda_instrument() special-case table so
// synced instrument names match the app's display convention ("US500" not
// "SPX500_USD"). Standard pairs just swap the underscore for a slash.
const OANDA_REVERSE_MAP: Record<string, string> = {
  SPX500_USD: "US500", NAS100_USD: "US100", US30_USD: "US30", WTICO_USD: "USOIL",
  NATGAS_USD: "NATGAS", USB02Y_USD: "US02Y", USB05Y_USD: "US05Y", USB10Y_USD: "US10Y",
  USB30Y_USD: "US30Y", DE30_EUR: "DE30", UK100_GBP: "UK100", JP225_USD: "JP225",
  FR40_EUR: "FR40", EU50_EUR: "EU50", HK33_HKD: "HK33", AU200_AUD: "AU200",
};

function normalizeOandaInstrument(raw: string): string {
  const upper = raw.toUpperCase();
  return OANDA_REVERSE_MAP[upper] ?? upper.replace(/_/g, "/");
}

/**
 * Syncs one TradeMirror account's linked OANDA account into the Trade Log.
 * Safe to call repeatedly — already-tracked trades are only updated, never
 * re-inserted.
 */
export async function syncOandaAccount(accountId: string): Promise<OandaSyncResult> {
  const result: OandaSyncResult = { opened: 0, updated: 0, closed: 0, errors: [] };

  const profile = await getAccountProfile(accountId);
  if (!profile?.oandaAccountId) {
    result.errors.push("No OANDA account is linked to this TradeMirror account yet — link one in Settings first.");
    return result;
  }
  const oandaAccountId = profile.oandaAccountId;

  let openTrades: OandaTrade[] = [];
  try {
    const res = await invoke<{ trades: OandaTrade[] }>("oanda_get_open_trades", { accountId: oandaAccountId });
    openTrades = res.trades ?? [];
  } catch (err) {
    result.errors.push(String(err));
    return result;
  }

  const db = getDb();

  // ── Create or update Trade Log entries for currently-open trades ──
  for (const t of openTrades) {
    const brokerPositionId = String(t.id);
    const symbol = normalizeOandaInstrument(t.instrument);
    const units = toNum(t.currentUnits) ?? toNum(t.initialUnits) ?? 0;
    const side: "long" | "short" = units < 0 ? "short" : "long";
    const entryPrice = toNum(t.price);
    const qty = Math.abs(units) || null;
    const openedAtIso = t.openTime || new Date().toISOString();
    const stopPrice   = toNum(t.stopLossOrder?.price);
    const targetPrice = toNum(t.takeProfitOrder?.price);

    const existing = await db.select().from(executions)
      .where(and(eq(executions.accountId, accountId), eq(executions.brokerPositionId, brokerPositionId)))
      .limit(1);

    if (existing.length === 0) {
      const ideaId  = `idea-oanda-${brokerPositionId}`;
      const tradeId = `t-oanda-${brokerPositionId}`;
      try {
        await db.insert(tradeIdeas).values({
          id: ideaId, symbol, direction: side, orderType: "market",
          intendedEntry: entryPrice ?? undefined,
          intendedStop: stopPrice ?? undefined,
          intendedTarget: targetPrice ?? undefined,
          lifecycleState: "open",
          disciplineState: "Synced from OANDA — opened outside TradeMirror's planning flow.",
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
          id: `exec-oanda-${brokerPositionId}`, tradeIdeaId: ideaId, accountId, tradeId,
          broker: "oanda", brokerPositionId, status: "open",
          entryPrice: entryPrice ?? undefined,
          stopPrice: stopPrice ?? undefined,
          targetPrice: targetPrice ?? undefined,
          quantity: qty ?? undefined,
          openedAt: openedAtIso,
        });
        result.opened++;
      } catch (err) {
        result.errors.push(`Trade ${brokerPositionId}: ${String(err)}`);
      }
    } else {
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

  // ── Detect closures: tracked "open" OANDA executions no longer in the open-trades list ──
  const openIds = new Set(openTrades.map((t) => String(t.id)));
  const trackedOpen = await db.select().from(executions)
    .where(and(eq(executions.accountId, accountId), eq(executions.status, "open"), eq(executions.broker, "oanda")));

  const stillOpenTracked = trackedOpen.filter(
    (e) => e.brokerPositionId && !openIds.has(e.brokerPositionId)
  );

  let history: OandaTrade[] | null = null;
  for (const exec of stillOpenTracked) {
    if (history === null) {
      try {
        const res = await invoke<{ trades: OandaTrade[] }>("oanda_get_trades_history", { accountId: oandaAccountId });
        history = res.trades ?? [];
      } catch (err) {
        result.errors.push(String(err));
        history = [];
      }
    }
    const closed = history.find((t) => String(t.id) === exec.brokerPositionId);
    const exitPrice   = closed ? toNum(closed.averageClosePrice) : null;
    const pnl         = closed ? toNum(closed.realizedPL) : null; // OANDA-reported, not computed here
    const closedAtIso = closed?.closeTime ?? new Date().toISOString();

    if (exec.tradeId) {
      const tradeRow = (await db.select().from(trades).where(eq(trades.id, exec.tradeId)).limit(1))[0];
      await db.update(trades).set({
        closedAt: closedAtIso,
        exitPrice: exitPrice ?? undefined,
        pnl: pnl ?? undefined,
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
      pnl: pnl ?? undefined,
    }).where(eq(executions.id, exec.id));
    result.closed++;
  }

  if (result.opened > 0 || result.closed > 0 || result.updated > 0) {
    tradeEvents.notify();
  }
  return result;
}
