// ─── Generic IANA timezone wall-clock ⇄ UTC conversion helpers ────────────────
// Shared by serverTime.ts (prop-firm server time → storage zone) and
// tradeFormat.ts (storage zone → user's configured display zone), so the
// DST-aware offset math exists in exactly one place.

export function offsetMsAt(utcMs: number, timeZone: string): number {
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
export function zonedWallTimeToUtcMs(y: number, mo: number, d: number, h: number, mi: number, timeZone: string): number {
  const guessUtcMs = Date.UTC(y, mo - 1, d, h, mi, 0);
  const offset1 = offsetMsAt(guessUtcMs, timeZone);
  const utcMs1  = guessUtcMs - offset1;
  const offset2 = offsetMsAt(utcMs1, timeZone); // re-check across DST boundaries
  return offset2 === offset1 ? utcMs1 : guessUtcMs - offset2;
}

export function utcMsToZonedWallTimeStr(utcMs: number, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const hour  = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}
