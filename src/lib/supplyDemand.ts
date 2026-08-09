// Fair-value-gap based supply & demand zone detection — shared engine.
// Operates on a plain chronological OHLC candle series for any instrument/
// timeframe, so the Supply & Demand screen can reuse it for Daily/4H/1H
// without duplicating the ruleset per timeframe.

export interface RawCandleTf {
  date: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SupplyDemandZone {
  type: "supply" | "demand";
  originIndex: number;
  baseDate: string;
  originTimestamp: string;
  zoneLow: number;
  zoneHigh: number;
  tapIndex: number | null;
  tapDate: string | null;
  fresh: boolean;
}

const isBullish   = (c: RawCandleTf) => c.close > c.open;
const isBearish   = (c: RawCandleTf) => c.close < c.open;
const body        = (c: RawCandleTf) => Math.abs(c.close - c.open);
const range       = (c: RawCandleTf) => c.high - c.low;
const bodyPct     = (c: RawCandleTf) => (range(c) === 0 ? 0 : body(c) / range(c));
const isIndecision = (c: RawCandleTf) => bodyPct(c) < 0.35;

function medianBody(candles: RawCandleTf[], endIdxExclusive: number, lookback = 20): number {
  const start = Math.max(0, endIdxExclusive - lookback);
  const bodies = candles.slice(start, endIdxExclusive).map(body).sort((a, b) => a - b);
  if (bodies.length === 0) return 0;
  const mid = Math.floor(bodies.length / 2);
  return bodies.length % 2 ? bodies[mid] : (bodies[mid - 1] + bodies[mid]) / 2;
}

export function findPivots(candles: RawCandleTf[], lookback = 2) {
  const n = candles.length;
  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];
  for (let i = lookback; i < n - lookback; i++) {
    let isHigh = true, isLow = true;
    for (let k = i - lookback; k <= i + lookback; k++) {
      if (k === i) continue;
      if (candles[k].high >= candles[i].high) isHigh = false;
      if (candles[k].low  <= candles[i].low)  isLow  = false;
    }
    if (isHigh) pivotHighs.push(i);
    if (isLow)  pivotLows.push(i);
  }
  return { pivotHighs, pivotLows };
}

/**
 * Detects fair-value-gap based supply/demand zones from a chronological
 * (oldest → newest) candle series: causal FVG + impulsive departure +
 * structure break + untapped freshness, mirroring the manual ruleset.
 */
export function computeSupplyDemandZones(candles: RawCandleTf[]): SupplyDemandZone[] {
  const n = candles.length;
  if (n < 10) return [];

  const { pivotHighs, pivotLows } = findPivots(candles, 2);
  const nearestPriorPivotHigh = (idx: number) => {
    let best: number | null = null;
    for (const p of pivotHighs) if (p < idx) best = p;
    return best;
  };
  const nearestPriorPivotLow = (idx: number) => {
    let best: number | null = null;
    for (const p of pivotLows) if (p < idx) best = p;
    return best;
  };

  const raw: SupplyDemandZone[] = [];

  for (let i = 1; i < n - 1; i++) {
    const A = candles[i - 1], C = candles[i + 1];

    // Bullish FVG → demand candidate
    if (A.high < C.low) {
      let originIdx = i - 1;
      while (originIdx > 0 && isBullish(candles[originIdx]) && !isIndecision(candles[originIdx])) originIdx--;
      const origin = candles[originIdx];
      const next = candles[originIdx + 1];
      // Expand down to the next candle's low if it undercuts the origin candle.
      const zoneLow = Math.min(origin.low, next.low), zoneHigh = origin.high;
      const depEnd = i + 1;
      const depCandles = candles.slice(originIdx + 1, depEnd + 1);
      const medBody = medianBody(candles, originIdx, 20);
      const maxDepBody = Math.max(...depCandles.map(body));
      const displacementOk = medBody > 0 && maxDepBody >= 1.5 * medBody;
      const pivotIdx = nearestPriorPivotHigh(originIdx);
      const pivotHigh = pivotIdx !== null ? candles[pivotIdx].high : null;
      const maxDepClose = Math.max(...depCandles.map(c => c.close));
      const structureBreak = pivotHigh !== null && maxDepClose > pivotHigh;

      let tapIndex: number | null = null;
      for (let t = depEnd + 1; t < n; t++) {
        if (candles[t].low <= zoneHigh && candles[t].high >= zoneLow) { tapIndex = t; break; }
      }
      const accepted = displacementOk && structureBreak;
      if (accepted) {
        raw.push({
          type: "demand", originIndex: originIdx, baseDate: origin.date,
          originTimestamp: origin.timestamp, zoneLow, zoneHigh,
          tapIndex, tapDate: tapIndex !== null ? candles[tapIndex].date : null,
          fresh: tapIndex === null,
        });
      }
    }

    // Bearish FVG → supply candidate
    if (A.low > C.high) {
      let originIdx = i - 1;
      while (originIdx > 0 && isBearish(candles[originIdx]) && !isIndecision(candles[originIdx])) originIdx--;
      const origin = candles[originIdx];
      const next = candles[originIdx + 1];
      // Expand up to the next candle's high if it overshoots the origin candle.
      const zoneLow = origin.low, zoneHigh = Math.max(origin.high, next.high);
      const depEnd = i + 1;
      const depCandles = candles.slice(originIdx + 1, depEnd + 1);
      const medBody = medianBody(candles, originIdx, 20);
      const maxDepBody = Math.max(...depCandles.map(body));
      const displacementOk = medBody > 0 && maxDepBody >= 1.5 * medBody;
      const pivotIdx = nearestPriorPivotLow(originIdx);
      const pivotLow = pivotIdx !== null ? candles[pivotIdx].low : null;
      const minDepClose = Math.min(...depCandles.map(c => c.close));
      const structureBreak = pivotLow !== null && minDepClose < pivotLow;

      let tapIndex: number | null = null;
      for (let t = depEnd + 1; t < n; t++) {
        if (candles[t].low <= zoneHigh && candles[t].high >= zoneLow) { tapIndex = t; break; }
      }
      const accepted = displacementOk && structureBreak;
      if (accepted) {
        raw.push({
          type: "supply", originIndex: originIdx, baseDate: origin.date,
          originTimestamp: origin.timestamp, zoneLow, zoneHigh,
          tapIndex, tapDate: tapIndex !== null ? candles[tapIndex].date : null,
          fresh: tapIndex === null,
        });
      }
    }
  }

  // Dedupe by (type, originIndex) — the same origin candle can be detected
  // via multiple overlapping 3-candle FVG windows along the same departure.
  const seen = new Map<string, SupplyDemandZone>();
  for (const z of raw) {
    const key = `${z.type}|${z.originIndex}`;
    if (!seen.has(key)) seen.set(key, z);
  }
  return [...seen.values()].sort((a, b) => a.originIndex - b.originIndex);
}

/** Only the zones that have not yet been tapped since forming. */
export function freshSupplyDemandZones(candles: RawCandleTf[]): SupplyDemandZone[] {
  return computeSupplyDemandZones(candles).filter(z => z.fresh);
}

/** The single most recently tapped zone (supply or demand), or null if none have been tapped. */
export function mostRecentTappedZone(candles: RawCandleTf[]): SupplyDemandZone | null {
  const tapped = computeSupplyDemandZones(candles).filter(z => !z.fresh && z.tapIndex !== null);
  if (tapped.length === 0) return null;
  return tapped.reduce((a, b) => (b.tapIndex! > a.tapIndex! ? b : a));
}
