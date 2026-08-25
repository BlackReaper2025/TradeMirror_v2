// ─── Centralized Risk / Discipline Engine (Phase 11) ───────────────────────────
// Every future route that can add exposure (Trade tab, copy-trade orchestration,
// live execution) must pass through this module rather than each implementing
// its own risk math — the Shared Indicator Engine Rule applies just as much to
// risk logic as it does to indicators: one engine, every consumer uses it.
//
// Nothing in this file places, modifies, or is wired to any order. It is pure
// validation logic over data already in the DB, consumed by whatever builds
// the actual submission path later (Phase 13+). Calling it does nothing by
// itself — it only answers "would this be allowed."
//
// Scope note: max-risk-per-trade is expressed and checked in DOLLARS, not
// position size. Converting a dollar risk into a position size needs each
// instrument's contract/point value, which nothing in this project has built
// yet (no instrument-spec table) — fabricating that number here would be
// worse than not having it. The caller (whoever builds the Trade tab) is
// expected to compute proposedRiskDollars from real instrument specs and
// pass it in; this engine's job is purely to decide whether that number is
// within every applicable limit.

import { eq, inArray, gt, desc } from "drizzle-orm";
import { getDb } from "../db/index";
import { tradeIdeas, executions, cooldowns } from "../db/schema";
import { getAccount, getAccountProfile, getTodayFullStats } from "../db/queries";
import { getAccountPropFirm } from "./preferences";
import { getServerDayBoundsInStorageZone } from "./serverTime";

// ─── Cooldown (Phase 12) ────────────────────────────────────────────────────
// "Confirmed stop-out triggers a persistent 12-hour global no-new-trade
// cooldown." Persistent because it's a plain DB row, not in-memory state —
// survives an app restart with no extra work.
//
// Stop-out detection is a heuristic, not a broker-confirmed close reason:
// neither TradeLocker's nor OANDA's read-only sync captures an explicit
// "closed because SL hit" flag, so this treats a close on the losing side of
// (and reasonably near) the trade's own stop price as a stop-out. Good enough
// to catch the case that matters; not a substitute for a real fill reason.

export interface CooldownCheck {
  ok: boolean;
  activeUntil: string | null;
}

export async function checkCooldown(): Promise<CooldownCheck> {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const rows = await db
    .select()
    .from(cooldowns)
    .where(gt(cooldowns.cooldownUntil, nowIso))
    .orderBy(desc(cooldowns.cooldownUntil))
    .limit(1);
  return { ok: rows.length === 0, activeUntil: rows[0]?.cooldownUntil ?? null };
}

/** Returns true if this close looks like a stop-out, given the trade's own stop level. */
export function looksLikeStopOut(
  side: "long" | "short",
  stopPrice: number | null | undefined,
  exitPrice: number | null | undefined
): boolean {
  if (stopPrice == null || exitPrice == null) return false;
  return side === "long" ? exitPrice <= stopPrice : exitPrice >= stopPrice;
}

export async function recordStopOutCooldown(params: {
  executionId: string;
  accountId: string;
  /** Genuine UTC epoch milliseconds — NOT a naive/local-zone string. The
   *  trades table stores timestamps as naive wall-clock strings in a display
   *  zone (see tradelockerSync.ts/oandaSync.ts), which `new Date(str)` would
   *  silently misinterpret as the machine's local zone instead — this param
   *  is typed as ms specifically so that ambiguity can't leak in here. */
  stopOutAtMs: number;
  cooldownHours: number;
}): Promise<void> {
  const db = getDb();
  const stopOutAtIso = new Date(params.stopOutAtMs).toISOString();
  const cooldownUntil = new Date(params.stopOutAtMs + params.cooldownHours * 3600_000).toISOString();
  await db.insert(cooldowns).values({
    id: `cooldown-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    triggeredByExecutionId: params.executionId,
    triggeredByAccountId: params.accountId,
    stopOutAt: stopOutAtIso,
    cooldownUntil,
    createdAt: new Date().toISOString(),
  });
}

// Trade Idea lifecycle states that count as "active" for the one-active-idea
// rule — mirrors the enum in src/db/schema.ts (tradeIdeas.lifecycleState).
const ACTIVE_LIFECYCLE_STATES = ["planned", "submitting", "pending", "open", "cooldown"] as const;

export interface ActiveTradeIdeaCheck {
  ok: boolean;
  activeIdea: typeof tradeIdeas.$inferSelect | null;
}

/**
 * Gate: "Enforce maximum one active Trade Idea, including pending entries."
 * This is GLOBAL, not per-account — an E8 + OANDA copy of the same idea is
 * one active idea, but so is any second, unrelated idea started while the
 * first is still open/pending anywhere.
 */
export async function checkOneActiveTradeIdea(): Promise<ActiveTradeIdeaCheck> {
  const db = getDb();
  const rows = await db
    .select()
    .from(tradeIdeas)
    .where(inArray(tradeIdeas.lifecycleState, [...ACTIVE_LIFECYCLE_STATES]))
    .limit(1);
  return { ok: rows.length === 0, activeIdea: rows[0] ?? null };
}

/**
 * Discards a still-planned Trade Idea and its executions — safe only while
 * lifecycleState is "planned", since nothing has actually executed anywhere
 * yet at that stage. Exists so the one-active-idea rule (above) doesn't
 * permanently lock the Trade tab after a single use: without a way back out,
 * placing one planned trade would block every future one forever.
 */
export async function cancelPlannedTradeIdea(ideaId: string): Promise<void> {
  const db = getDb();
  const [idea] = await db.select().from(tradeIdeas).where(eq(tradeIdeas.id, ideaId)).limit(1);
  if (!idea || idea.lifecycleState !== "planned") return;
  const now = new Date().toISOString();
  await db.update(executions).set({ status: "closed", closedAt: now }).where(eq(executions.tradeIdeaId, ideaId));
  await db.update(tradeIdeas).set({ lifecycleState: "closed", closedAt: now }).where(eq(tradeIdeas.id, ideaId));
}

export interface RiskCheckInput {
  accountId: string;
  /** Dollar amount at risk if the stop is hit, computed by the caller from
   *  real instrument specs (position size × stop distance × point value). */
  proposedRiskDollars: number;
}

export interface AccountRiskResult {
  accountId: string;
  accountName: string;
  approved: boolean;
  reasons: string[];
  proposedRiskDollars: number;
  /** The binding ceiling — the smallest of the applicable limits below. */
  maxRiskDollars: number;
  limitingFactor: "maxRiskPct" | "dailyDrawdown" | "staticDrawdown" | null;
  maxRiskPctDollars: number;
  dailyDrawdownRemaining: number | null;
  staticDrawdownRemaining: number | null;
}

/**
 * "Calculate maximum 1.00% risk independently for each account... Load
 * account-specific prop-firm rules before approval. For E8[-style accounts],
 * calculate remaining daily and static drawdown buffers and reject a trade
 * that could breach either even if it is within the normal 1% rule. Permitted
 * risk is constrained by the smallest safe applicable limit."
 *
 * Daily/static drawdown here are a first-pass approximation, not a full
 * prop-firm-accurate accounting: daily usage is today's realized P&L only
 * (no open floating P&L folded in, since that needs a live broker read this
 * engine doesn't have), and static usage is measured from the account's
 * starting balance (not a trailing peak). Good enough to catch an obviously
 * unsafe trade; not a substitute for the firm's own dashboard.
 */
export async function checkAccountRisk(input: RiskCheckInput): Promise<AccountRiskResult> {
  const account = await getAccount(input.accountId);
  if (!account) {
    return {
      accountId: input.accountId, accountName: "(unknown account)", approved: false,
      reasons: ["Account not found"], proposedRiskDollars: input.proposedRiskDollars,
      maxRiskDollars: 0, limitingFactor: null, maxRiskPctDollars: 0,
      dailyDrawdownRemaining: null, staticDrawdownRemaining: null,
    };
  }

  const profile = await getAccountProfile(account.id);
  const maxRiskPct = profile?.maxRiskPerTradePct ?? 1.0;
  const maxRiskPctDollars = account.currentBalance * (maxRiskPct / 100);

  let dailyDrawdownRemaining: number | null = null;
  let staticDrawdownRemaining: number | null = null;

  if (profile?.dailyDrawdownAmount != null) {
    // Bound to this account's actual prop-firm server-day reset (e.g. E8
    // Markets resets the daily drawdown at 00:00 server time), not the
    // machine's local midnight — otherwise this check could clear a loss
    // from its count hours before (or after) the firm actually does.
    const dayBounds = await getServerDayBoundsInStorageZone(account.id, getAccountPropFirm(account.id));
    const today = await getTodayFullStats(account.id, dayBounds);
    const dailyUsed = Math.max(0, -today.totalPnl); // only realized losses count against it
    dailyDrawdownRemaining = profile.dailyDrawdownAmount - dailyUsed;
  }

  if (profile?.staticDrawdownAmount != null) {
    const staticUsed = Math.max(0, account.startingBalance - account.currentBalance);
    staticDrawdownRemaining = profile.staticDrawdownAmount - staticUsed;
  }

  const candidates: { value: number; factor: AccountRiskResult["limitingFactor"] }[] = [
    { value: maxRiskPctDollars, factor: "maxRiskPct" },
  ];
  if (dailyDrawdownRemaining != null) candidates.push({ value: dailyDrawdownRemaining, factor: "dailyDrawdown" });
  if (staticDrawdownRemaining != null) candidates.push({ value: staticDrawdownRemaining, factor: "staticDrawdown" });

  const binding = candidates.reduce((min, c) => (c.value < min.value ? c : min));
  const maxRiskDollars = Math.max(0, binding.value);

  const reasons: string[] = [];
  if (input.proposedRiskDollars > maxRiskDollars) {
    reasons.push(
      `Proposed risk $${input.proposedRiskDollars.toFixed(2)} exceeds the ${describeLimitingFactor(binding.factor)} limit of $${maxRiskDollars.toFixed(2)}.`
    );
  }

  return {
    accountId: account.id,
    accountName: account.name,
    approved: reasons.length === 0,
    reasons,
    proposedRiskDollars: input.proposedRiskDollars,
    maxRiskDollars,
    limitingFactor: binding.factor,
    maxRiskPctDollars,
    dailyDrawdownRemaining,
    staticDrawdownRemaining,
  };
}

function describeLimitingFactor(factor: AccountRiskResult["limitingFactor"]): string {
  switch (factor) {
    case "maxRiskPct":      return "max-risk-per-trade";
    case "dailyDrawdown":   return "remaining daily drawdown";
    case "staticDrawdown":  return "remaining static drawdown";
    default:                return "risk";
  }
}

export interface TradeIdeaValidationInput {
  stopPrice: number | null;
  accounts: RiskCheckInput[]; // one entry per account the idea would execute on (primary + any copy targets)
}

export interface TradeIdeaValidationResult {
  approved: boolean;
  oneActiveTradeIdea: ActiveTradeIdeaCheck;
  cooldown: CooldownCheck;
  stopLossOk: boolean;
  perAccount: AccountRiskResult[];
}

/**
 * Top-level gate — the single function any future submission path should
 * call before allowing new exposure. "Manual volume may be smaller but can
 * never bypass the maximum-risk rule" — enforced by the caller always
 * passing the ACTUAL proposed risk, never a value assumed safe.
 *
 * Only gates NEW exposure — "allow viewing and safe close/reduce-risk
 * actions" during cooldown is satisfied by construction, since closing or
 * reducing an existing position never goes through this function at all.
 */
export async function validateTradeIdea(input: TradeIdeaValidationInput): Promise<TradeIdeaValidationResult> {
  const oneActiveTradeIdea = await checkOneActiveTradeIdea();
  const cooldown = await checkCooldown();
  const stopLossOk = input.stopPrice != null && Number.isFinite(input.stopPrice);
  const perAccount = await Promise.all(input.accounts.map(checkAccountRisk));

  const approved = oneActiveTradeIdea.ok && cooldown.ok && stopLossOk && perAccount.every((r) => r.approved);
  return { approved, oneActiveTradeIdea, cooldown, stopLossOk, perAccount };
}
