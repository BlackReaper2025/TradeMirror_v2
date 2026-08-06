// ─── FTMO server time → local time conversion ─────────────────────────────────
// FTMO / MetaTrader (Account MetriX) reports run on Eastern European time
// (EET/EEST — UTC+2 winter, UTC+3 summer), which follows EU-wide DST transition
// dates, not US ones. This converts a timestamp entered in FTMO server time into
// the equivalent wall-clock time in the user's local zone, so every other part
// of the app can keep treating stored trade timestamps as plain local time.

const FTMO_SERVER_ZONE = "Europe/Helsinki";  // EET/EEST, EU DST rules
const LOCAL_ZONE        = "America/New_York"; // EST/EDT, US DST rules

function offsetMsAt(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const asIfUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
  );
  return asIfUtc - utcMs;
}

// Interpret (y, mo, d, h, mi) as wall-clock time in `timeZone`, return the UTC instant (ms).
function zonedWallTimeToUtcMs(y: number, mo: number, d: number, h: number, mi: number, timeZone: string): number {
  const guessUtcMs = Date.UTC(y, mo - 1, d, h, mi, 0);
  const offset1 = offsetMsAt(guessUtcMs, timeZone);
  const utcMs1  = guessUtcMs - offset1;
  const offset2 = offsetMsAt(utcMs1, timeZone); // re-check across DST boundaries
  return offset2 === offset1 ? utcMs1 : guessUtcMs - offset2;
}

function utcMsToZonedWallTimeStr(utcMs: number, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const hour  = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

// Convert a "YYYY-MM-DDTHH:MM" string entered as FTMO server time into the
// equivalent "YYYY-MM-DDTHH:MM" string in the user's local (Virginia) time.
export function ftmoTimeToLocal(datetimeLocalStr: string): string {
  if (!datetimeLocalStr) return datetimeLocalStr;
  const [datePart, timePart] = datetimeLocalStr.split("T");
  if (!datePart || !timePart) return datetimeLocalStr;
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi]    = timePart.split(":").map(Number);
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return datetimeLocalStr;
  const utcMs = zonedWallTimeToUtcMs(y, mo, d, h, mi, FTMO_SERVER_ZONE);
  return utcMsToZonedWallTimeStr(utcMs, LOCAL_ZONE);
}
