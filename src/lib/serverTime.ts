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
