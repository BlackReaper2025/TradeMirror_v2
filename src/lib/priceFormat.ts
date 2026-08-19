// Shared price-precision/formatting helpers — used by the Analytics V3 chart
// (price scale, current-price panel) and the instrument ticker, so the two
// never disagree on how many decimals an instrument displays.

// Indices/oil trade in whole-point-ish increments and gold/silver in far
// fewer significant decimals than a forex pip (0.00001) — showing them at
// forex precision produces meaningless trailing digits (e.g. "7786.40000").
// `price`, when known, drops 2 more decimals once the value is over 100 —
// covers JPY crosses (e.g. USD/JPY ~157) that are otherwise indistinguishable
// from other forex pairs by symbol alone, since the same pair can occasionally
// cross the 100 threshold (AUD/JPY, NZD/JPY) depending on market conditions.
export function decimalsForPair(pair: string, price?: number): number {
  if (pair === "US100") return 1; // always 1 decimal, regardless of price
  if (pair === "US500") return 2; // always 2 decimals, regardless of price
  // Global indices all quote at 1 decimal on OANDA regardless of price level
  // (confirmed live: DE30/UK100/JP225/FR40/EU50/HK33/AU200), same as US100.
  if (["DE30", "UK100", "JP225", "FR40", "EU50", "HK33", "AU200"].includes(pair)) return 1;

  const base = (() => {
    switch (pair) {
      case "US30": case "USOIL": case "XAU/USD": return 2;
      case "XAG/USD": return 3;
      case "NATGAS": return 3;
      case "BTC/USD": case "ETH/USD": return 0;
      default: return 5;
    }
  })();
  return price !== undefined && price > 100 ? Math.max(0, base - 2) : base;
}

// Thousands-separated price text (e.g. "30,066.20") — indices/XAU run into
// the thousands where a bare toFixed() is hard to scan at a glance.
export function formatPrice(value: number, decimals: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
