// ─── Shared Trade Log display formatters ──────────────────────────────────────
// TradeTable.tsx and TradeLogPreview.tsx each redefined their own copy of a
// handful of these. Only the two below turned out to be genuinely identical
// (byte-for-byte, same input shape) once compared — fmtPrice and fmtDate in
// each file differ in real, deliberate ways (null → "—" vs null → falsy for
// conditional rendering; ISO-timestamp input vs bare-date-string input that
// needs a "T00:00:00" appended to avoid a UTC-midnight timezone shift), so
// those stayed local rather than risk changing behavior to force a merge.

/** "2:30 PM" / "14:30" depending on hour12. */
export function formatTradeTime(iso: string, hour12: boolean): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12 });
}

/** "+$1,234.56" / "-$1,234.56" / "—" for null. */
export function formatSignedDollar(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n >= 0 ? `+$${abs}` : `-$${abs}`;
}
