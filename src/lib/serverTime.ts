// ─── Prop firm server time → storage time conversion ──────────────────────────
// The Trade Log's "Server Time" entry mode lets a trade be logged by copying
// timestamps straight off a prop firm's CSV/report, in that firm's own server
// clock, rather than requiring manual conversion first.

import { zonedWallTimeToUtcMs, utcMsToZonedWallTimeStr } from "./timezone";
import { getPropFirmServerZone, type PropFirm } from "./preferences";

const STORAGE_ZONE = "America/New_York"; // canonical zone TradeMirror stores trade timestamps in

// Convert a "YYYY-MM-DDTHH:MM" string entered in a prop firm's server time
// into the equivalent "YYYY-MM-DDTHH:MM" string in TradeMirror's storage zone.
// Which IANA zone counts as that firm's server time is user-configurable in
// Settings (defaults to Europe/Helsinki / EET-EEST, the common MT4/5 broker
// server convention) — see getPropFirmServerZone in preferences.ts.
export function serverTimeToStorage(datetimeLocalStr: string, propFirm: PropFirm): string {
  if (!datetimeLocalStr) return datetimeLocalStr;
  const [datePart, timePart] = datetimeLocalStr.split("T");
  if (!datePart || !timePart) return datetimeLocalStr;
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi]    = timePart.split(":").map(Number);
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return datetimeLocalStr;
  const utcMs = zonedWallTimeToUtcMs(y, mo, d, h, mi, getPropFirmServerZone(propFirm));
  return utcMsToZonedWallTimeStr(utcMs, STORAGE_ZONE);
}
