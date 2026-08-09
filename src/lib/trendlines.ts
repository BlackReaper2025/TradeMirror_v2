// Auto trendline detection — shared engine.
// Connects consecutive pairs of swing lows into support trend rays and
// consecutive pairs of swing highs into resistance trend rays, working
// backward from the most recent pivots — up to `count` of each per
// timeframe (given enough pivots), regardless of slope direction. Operates
// on a plain chronological OHLC series for any instrument/timeframe,
// mirroring the supplyDemand.ts pattern. Only the two anchor pivots per ray
// are returned — the chart layer extends each ray forward past its anchors.

import { findPivots, type RawCandleTf } from "./supplyDemand";

export interface TrendlineSegment {
  type: "support" | "resistance";
  t1: number; // unix seconds — earlier pivot
  p1: number; // price at earlier pivot
  t2: number; // unix seconds — later (most recent) pivot
  p2: number; // price at later pivot
  srcDurationSec: number; // typical bar duration on the source timeframe
}

const toTime = (c: RawCandleTf) => Math.floor(new Date(c.timestamp).getTime() / 1000);

function buildRays(
  candles: RawCandleTf[],
  pivots: number[],
  type: "support" | "resistance",
  priceOf: (i: number) => number,
  count: number,
  srcDurationSec: number,
): TrendlineSegment[] {
  const rays: TrendlineSegment[] = [];
  for (let k = 0; k < count; k++) {
    const idx2 = pivots.length - 1 - k;
    const idx1 = idx2 - 1;
    if (idx1 < 0) break;
    const i1 = pivots[idx1], i2 = pivots[idx2];
    rays.push({
      type,
      t1: toTime(candles[i1]), p1: priceOf(i1),
      t2: toTime(candles[i2]), p2: priceOf(i2),
      srcDurationSec,
    });
  }
  return rays;
}

/**
 * Detects up to `count` support and `count` resistance auto trend rays from
 * a chronological (oldest → newest) candle series. Each ray connects a
 * consecutive pair of swing pivots, working backward from the most recent —
 * ray 1 connects the two most recent pivots, ray 2 the pair before that, etc.
 */
export function computeAutoTrendlines(candles: RawCandleTf[], lookback = 2, count = 1): TrendlineSegment[] {
  const n = candles.length;
  if (n < lookback * 2 + 3 || count < 1) return [];

  const { pivotHighs, pivotLows } = findPivots(candles, lookback);
  const srcDurationSec = toTime(candles[n - 1]) - toTime(candles[n - 2]);

  return [
    ...buildRays(candles, pivotLows,  "support",    i => candles[i].low,  count, srcDurationSec),
    ...buildRays(candles, pivotHighs, "resistance", i => candles[i].high, count, srcDurationSec),
  ];
}
