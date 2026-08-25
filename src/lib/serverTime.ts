// ─── Account server time → storage time conversion (Phase 4) ──────────────────
// The Trade Log's "Server Time" entry mode lets a trade be logged by copying
// timestamps straight off a broker/prop-firm CSV/report, in that server's own
// clock, rather than requiring manual conversion first.

import { zonedWallTimeToUtcMs, utcMsToZonedWallTimeStr } from "./timezone";
import { getPropFirmServerZone, type PropFirm } from "./preferences";
import { getAccountProfile } from "../db/queries";

const STORAGE_ZONE = "America/New_York"; // canonical zone TradeMirror stores trade timestamps in

// Resolves the IANA server zone for one account. account_profiles.serverTimezone
// (set per-account in Settings) takes priority; falls back to the legacy
// per-firm default so accounts configured before Phase 4 keep working
// unchanged until the user re-saves their Account Profile.
export async function resolveAccountServerZone(accountId: string, propFirmFallback: PropFirm): Promise<string> {
  const profile = await getAccountProfile(accountId);
  return profile?.serverTimezone || getPropFirmServerZone(propFirmFallback);
}

// Prop firms reset the daily drawdown at midnight in THEIR server timezone,
// not at UTC or the machine's local midnight (E8 Markets, for one, resets at
// 00:00 server time — see help.e8markets.com's Daily Drawdown article). This
// returns the current server-day's [start, end) window translated into
// TradeMirror's storage zone, so callers can bound a trades.closedAt/
// openedAt range query against the account's actual reset boundary instead
// of the trader's own calendar day.
export async function getServerDayBoundsInStorageZone(
  accountId: string,
  propFirmFallback: PropFirm
): Promise<{ start: string; end: string }> {
  const serverZone = await resolveAccountServerZone(accountId, propFirmFallback);

  const nowInServerZone = utcMsToZonedWallTimeStr(Date.now(), serverZone); // "YYYY-MM-DDTHH:MM"
  const [y, mo, d] = nowInServerZone.slice(0, 10).split("-").map(Number);

  const dayStartUtcMs = zonedWallTimeToUtcMs(y, mo, d, 0, 0, serverZone);
  // Next server-day midnight computed from calendar y/mo/d+1 (JS Date
  // normalizes month/year rollover), not "+24h in ms" — a DST transition day
  // in the server zone isn't always exactly 24 hours long.
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  const nextDayStartUtcMs = zonedWallTimeToUtcMs(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, serverZone);

  return {
    start: utcMsToZonedWallTimeStr(dayStartUtcMs, STORAGE_ZONE),
    end:   utcMsToZonedWallTimeStr(nextDayStartUtcMs, STORAGE_ZONE),
  };
}

// Convert a "YYYY-MM-DDTHH:MM" string entered in a server's local time into
// the equivalent "YYYY-MM-DDTHH:MM" string in TradeMirror's storage zone.
export function serverTimeToStorage(datetimeLocalStr: string, serverZone: string): string {
  if (!datetimeLocalStr) return datetimeLocalStr;
  const [datePart, timePart] = datetimeLocalStr.split("T");
  if (!datePart || !timePart) return datetimeLocalStr;
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi]    = timePart.split(":").map(Number);
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return datetimeLocalStr;
  const utcMs = zonedWallTimeToUtcMs(y, mo, d, h, mi, serverZone);
  return utcMsToZonedWallTimeStr(utcMs, STORAGE_ZONE);
}
