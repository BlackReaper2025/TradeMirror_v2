# Supply & Demand Zone Detection

Implementation: [`src/lib/supplyDemand.ts`](../src/lib/supplyDemand.ts)

Shared, timeframe-agnostic engine for detecting fair-value-gap (FVG) based
supply and demand zones from a plain chronological OHLC candle series. Used
by the Analytics V3 chart's Daily / 4H / 1H zone toggles — each timeframe
runs the same ruleset against its own candle set via `get_live_candles`, so
the logic is never duplicated per timeframe.

## Inputs

`RawCandleTf[]` — oldest to newest, each candle: `date`, `timestamp`, `open`,
`high`, `low`, `close`, `volume`.

## Candle classification

- **Bullish**: `close > open`. **Bearish**: `close < open`.
- **Indecision**: body is less than 35% of the candle's full high–low range
  (`bodyPct < 0.35`), regardless of color. A small-bodied doji-like candle
  counts as indecision even if nominally bullish or bearish.

## 1. Fair value gap (FVG)

For three consecutive candles A, B, C:

- **Bullish FVG** (→ demand candidate): `A.high < C.low`
- **Bearish FVG** (→ supply candidate): `A.low > C.high`

B is the displacement candle that creates the gap between A and C.

## 2. Origin candle (zone base)

Starting at candle A, walk backward while candles keep matching the
departure's own color and are *not* indecision candles:

- **Demand**: walk back while bullish and not indecision.
- **Supply**: walk back while bearish and not indecision.

The walk stops at the first candle that is either indecision or the opposite
color — that candle is the **origin**. This finds the true starting point of
the move (the last candle before the reversal began), not just candle A,
since A itself may already be mid-impulse.

## 3. Zone boundaries (with next-candle expansion)

- **Demand zone**: `[origin.low, origin.high]`, expanded down to
  `next.low` if the very next candle (`origin index + 1`) has a lower low
  than the origin candle itself.
- **Supply zone**: `[origin.low, origin.high]`, expanded up to `next.high`
  if the next candle has a higher high than the origin candle.

Expansion only ever loosens the boundary in the zone's own direction — it
never happens if the next candle doesn't extend past the origin candle.

## 4. Impulsive displacement (mandatory)

The departure candles (origin index + 1 through C) must contain at least one
candle whose body is **≥ 1.5× the median body of the preceding 20 candles**
(median computed up to, not including, the origin candle). This is a
benchmark, not an absolute law, per the original ruleset — but the shipped
engine currently enforces it as a hard pass/fail gate.

## 5. Structure break (mandatory)

- **Demand**: the departure's highest close must close **above** the
  nearest prior pivot high.
- **Supply**: the departure's lowest close must close **below** the
  nearest prior pivot low.

Pivots are local extremes confirmed with a 2-candle lookback each side (a
candle is a pivot high/low only if it's strictly the highest/lowest among
the 2 candles before and after it). "Nearest prior" means the closest pivot
chronologically before the origin candle. If no qualifying pivot exists
before the origin, structure break fails automatically.

Both displacement and structure break must pass for a candidate to be
accepted at all — failing either rejects the zone outright.

## 6. Freshness / tap tracking

Once a zone is accepted, every later candle (starting after the departure
candles) is checked for a tap:

```
tapped when: candle.low <= zoneHigh AND candle.high >= zoneLow
```

The first candle that intersects the zone marks it `tapIndex` / `tapDate`;
the zone is `fresh` only if no later candle has ever touched it. A single
touch — wick or body — permanently invalidates a zone. There is no partial
credit and no re-freshening.

## 7. Dedupe

The same origin candle can trigger multiple overlapping 3-candle FVG windows
along one departure. Results are deduped by `(type, originIndex)`, keeping
one entry per unique zone.

## Output

`computeSupplyDemandZones()` returns every accepted zone (fresh and tapped),
sorted oldest to newest. `freshSupplyDemandZones()` filters to untapped
zones only — this is what the chart actually draws.

## What the chart does with it

Each zone is rendered as a box anchored at the origin candle's timestamp,
extending forward to the current right edge of the chart (never drawn over
history before the zone formed). Boxes are price-anchored (`priceToCoordinate`)
so they stay correctly positioned regardless of which timeframe the candles
themselves are currently displayed at.
