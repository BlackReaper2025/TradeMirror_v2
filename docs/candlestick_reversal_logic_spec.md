# Candlestick Reversal Logic - Claude Code Implementation Specification

## Mission for Claude Code

Implement a deterministic, testable reversal-signal engine based on the trading framework in *The Candlestick Trading Bible* by Bella Ealie.

The engine must not treat a candle shape by itself as a trade signal. The book's central model is:

```text
market structure + important location + candlestick signal + acceptable risk/reward
```

Build raw candlestick-pattern detectors first, then evaluate them through market structure, multi-timeframe context, location, confluence, and risk filters. Keep every threshold configurable. Use only closed candles and confirmed historical structure; do not introduce lookahead bias or repainting.

Before coding, inspect the existing repository and use its language, data types, indicator library, naming conventions, and test framework. If the repository already has swing, level, moving-average, ATR, or signal types, extend them instead of creating incompatible duplicates.

## Required behavior

The implementation must:

1. Detect the raw reversal patterns described below from OHLC data.
2. Distinguish a raw pattern from a context-qualified reversal setup.
3. Classify market structure on a higher timeframe before evaluating the entry timeframe.
4. Search for patterns at meaningful locations, especially:
   - horizontal support and resistance;
   - support/resistance role reversals after a breakout and retest;
   - supply and demand zones;
   - rising support or falling resistance trendlines;
   - 8-period and 21-period simple moving averages in trending markets;
   - 50% and 61% Fibonacci retracements of the current impulse;
   - the boundaries of a valid range;
   - Bollinger Bands only as secondary confirmation at a horizontal range boundary.
5. Reject signals in choppy markets and signals floating in the middle of nowhere.
6. Prefer reversals of a pullback in the direction of the higher-timeframe trend.
7. Treat major countertrend reversals as an advanced, stricter setup.
8. Return reasons, matched levels, invalidation, entry alternatives, stop, target, and estimated reward/risk - not only a boolean.
9. Include unit tests and, if the repository supports it, backtest fixtures that prove there is no lookahead.

## Source interpretation

This document turns qualitative book language such as "small body," "long tail," and "near a level" into configurable engineering defaults. Those numerical defaults are implementation choices, not performance claims from the book. They must be exposed for optimization and validation rather than hard-coded invisibly.

The book is directional about its core rules:

- A pattern alone is insufficient.
- The preferred timeframes are 1H, 4H, and Daily, with 4H and Daily emphasized for pattern quality.
- Higher-timeframe support/resistance and market structure take priority over a lower-timeframe candle.
- In a trend, wait for a pullback into a key level and a candle that signals the next impulse.
- In a range, trade only at the boundaries, not in the middle.
- Moving averages are dynamic support/resistance in a trend, not signal generators in a range.
- A choppy, tight, poorly bounded market is a no-trade condition.
- A prospective setup should offer at least 2:1 reward/risk to the next logical target.

## Core terminology and derived candle values

For candle `c`:

```text
range(c)       = high - low
body(c)        = abs(close - open)
body_high(c)   = max(open, close)
body_low(c)    = min(open, close)
upper_wick(c)  = high - body_high
lower_wick(c)  = body_low - low
body_ratio(c)  = body / range
upper_ratio(c) = upper_wick / range
lower_ratio(c) = lower_wick / range
midpoint(c)    = (open + close) / 2
bullish(c)     = close > open + price_epsilon
bearish(c)     = close < open - price_epsilon
```

If `range <= price_epsilon`, classify the candle as degenerate and do not emit a pattern. Use a symbol-aware epsilon based on tick size. Level proximity needs a separate volatility-aware tolerance.

Suggested initial configuration, to be tuned in tests/backtests:

```yaml
pattern_timeframes: ["1h", "4h", "1d"]
preferred_timeframes: ["4h", "1d"]
allow_lower_timeframes: false

doji_max_body_ratio: 0.10
small_body_max_ratio: 0.30
long_body_min_ratio: 0.60
pin_min_primary_wick_ratio: 0.60
pin_max_body_ratio: 0.30
pin_max_opposite_wick_ratio: 0.20
pin_min_wick_to_body: 2.0
pin_body_end_fraction: 0.35
require_star_gap: false
false_break_max_bars_after_inside: 3

engulfing_tolerance_ticks: 1
inside_bar_tolerance_ticks: 1
tweezer_tolerance_atr: 0.10
level_proximity_atr: 0.25
level_break_atr: 0.10
stop_buffer_atr: 0.10
prior_move_min_atr: 1.0

swing_pivot_left: 2
swing_pivot_right: 2
ma_slope_lookback: 5
range_min_touches_per_side: 2
range_min_width_atr: 3.0
minimum_reward_risk: 2.0
beginner_risk_fraction: 0.01
absolute_max_risk_fraction: 0.02
```

`price_epsilon`, containment tolerances, and level tolerances are different concepts. Do not use one loose tolerance for everything.

## Separate raw patterns from qualified setups

Use at least two stages:

```text
RawPatternDetector(OHLC) -> RawPattern[]
SetupEvaluator(rawPattern, structure, levels, indicators, risk) -> QualifiedSetup
```

A raw detector answers, "Does this candle sequence have the required anatomy?" The setup evaluator answers, "Did that anatomy occur at the right place, under the right market condition, with a usable invalidation and target?"

Never name a raw pattern `BUY` or `SELL`. A raw pattern has a directional implication, not an executable trading instruction.

## Market-structure engine

### Confirmed swings

Use confirmed swing highs and lows. A default pivot strength of two bars on each side is acceptable, but it must be configurable. A swing is not available to the algorithm until the right-side confirmation bars have closed.

### Trend classification

- `UPTREND`: the latest confirmed swing highs are rising and the latest confirmed swing lows are rising - higher highs and higher lows.
- `DOWNTREND`: the latest confirmed swing highs are falling and the latest confirmed swing lows are falling - lower highs and lower lows.
- `RANGE`: price oscillates between identifiable horizontal support and resistance, with at least two meaningful touches on each side, no clean sequence of directional swings, and enough width to support a target.
- `CHOPPY`: there is no clean trend and no clearly tradeable range, boundaries are ambiguous, price repeatedly crosses the same area, or the range is too tight relative to volatility/costs.
- `UNKNOWN`: insufficient confirmed data.

Do not force a trendline, range, or trend classification. `CHOPPY` and `UNKNOWN` must be real return states that block a setup.

### Impulse and pullback

In a trend, separate movement into:

- an impulse in the dominant trend direction; and
- a corrective pullback against it.

The preferred reversal is a local pullback reversal that resumes the dominant trend:

- in an uptrend, a bullish reversal pattern after a pullback into support;
- in a downtrend, a bearish reversal pattern after a pullback into resistance.

Do not chase a trend-direction candle at the extended end of an impulse. The intended entry area is the start of the next impulse after a retracement.

Quantify the required prior move without using future pivots. Prefer the most recent confirmed swing leg. Suggested initial rule:

- bullish reversal: the candidate follows a confirmed downward leg or a short-term pullback whose high-to-candidate-low distance is at least `prior_move_min_atr * ATR(14)`;
- bearish reversal: the candidate follows a confirmed upward leg or pullback whose candidate-high-to-low distance is at least the same threshold.

In a dominant trend, the entry-timeframe pullback may be shorter than a full higher-timeframe swing, but it must still show directional movement into the level. Store the prior leg's start, end, distance in ATR, and whether it is a pullback or dominant-trend impulse.

### Multi-timeframe rules

Use completed candles on every timeframe.

Suggested mappings faithful to the book:

| Entry timeframe | Required context |
|---|---|
| 1H | Daily structure and Daily key levels |
| 4H | Weekly and Daily structure/key levels |
| Daily | Weekly structure and Weekly key levels |

For every candidate, retain:

- entry-timeframe regime;
- higher-timeframe regime and dominant direction;
- higher-timeframe support/resistance and supply/demand zones;
- the previous completed higher-timeframe candle and any visible rejection;
- whether the candidate agrees or conflicts with the higher-timeframe analysis.

A lower-timeframe candle must not overrule a nearby higher-timeframe barrier. Example: reject or heavily downgrade a bullish Daily pin bar directly below a major Weekly resistance level.

## Location engine: where Claude must look for reversals

### 1. Horizontal support and resistance

Build zones from repeated confirmed swing reactions, not infinitely thin exact-price lines. Preserve:

- number of touches;
- recency;
- reaction strength;
- timeframe of origin;
- whether the level has flipped role after a breakout.

Preferred trend setups:

- uptrend: old resistance breaks and becomes support; wait for a bullish reversal on the retest;
- downtrend: old support breaks and becomes resistance; wait for a bearish reversal on the retest.

Preferred range setups:

- bullish reversal at the lower boundary/support;
- bearish reversal at the upper boundary/resistance;
- reject all ordinary reversal patterns in the middle of the range.

### 2. Supply and demand zones

Give more weight to a 4H or Daily base from which price departed rapidly and directionally. Store the full zone, not a single price. A useful zone also leaves room to the next opposing level for an acceptable reward/risk ratio.

- demand zone -> bullish reversal location;
- supply zone -> bearish reversal location.

### 3. Trendlines

Construct trendlines only from confirmed, obvious swings:

- rising support trendline: connect at least two confirmed swing lows in an uptrend;
- falling resistance trendline: connect at least two confirmed swing highs in a downtrend.

The book emphasizes drawing these on 4H and Daily charts. A third touch is stronger evidence than the minimum two anchors. Extend the line forward without refitting it using future pivots.

At candidate time, compare the candle's wick/body with the trendline's projected price:

- bullish pin, engulfing pattern, or other bullish reversal rejecting a rising support trendline;
- bearish equivalent rejecting a falling resistance trendline.

### 4. Moving averages

Use 8-SMA and 21-SMA as dynamic support/resistance only when market structure is trending and the averages have directional slope.

- uptrend: price pulls back to the 8-SMA/21-SMA area, rejects it, and forms a bullish pattern;
- downtrend: price retraces to the 8-SMA/21-SMA area, rejects it, and forms a bearish pattern.

Do not use the moving-average trigger in a range or choppy market. The book mentions the 200-SMA as a broad direction filter, but its core entry examples use the 8-SMA and 21-SMA. Make the 200-SMA optional, not a mandatory trigger.

### 5. Fibonacci retracement

On a confirmed trend impulse, calculate 50% and 61% retracement levels (allow 61.8% as the configurable conventional equivalent). A pattern near either retracement is a confluence factor, especially when it overlaps horizontal support/resistance, a trendline, or the 21-SMA.

Do not let Fibonacci create a setup by itself. It confirms a level and pattern.

### 6. Range boundaries and Bollinger Bands

In a valid range, require a horizontal boundary first. A false break of the upper/lower Bollinger Band may confirm rejection of that same boundary. Never accept a Bollinger touch by itself as the signal.

### "Near" and "rejection" logic

A candle is near a level/zone if the minimum distance from its full high-low interval to the zone is no more than a configurable volatility-aware tolerance, initially `0.25 * ATR(14)`.

Prefer actual rejection over mere proximity:

- bullish rejection: the lower wick touches or penetrates support/demand/trendline/MA tolerance, then the candle closes back above the level or in the upper part of its range;
- bearish rejection: the upper wick touches or penetrates resistance/supply/trendline/MA tolerance, then the candle closes back below the level or in the lower part of its range.

Store both `near_level` and `rejected_level`; the latter deserves more weight.

## Raw candlestick-pattern definitions

All indices below refer to completed candles in chronological order.

### Bullish pin bar / hammer

Anatomy:

- small real body near the top of the candle;
- long lower wick showing rejection of lower prices;
- short upper wick;
- book guidance: the long wick should be about twice the real body or more.

Suggested detector:

```text
body_ratio <= pin_max_body_ratio
lower_ratio >= pin_min_primary_wick_ratio
upper_ratio <= pin_max_opposite_wick_ratio
lower_wick >= pin_min_wick_to_body * max(body, price_epsilon)
body_low >= high - pin_body_end_fraction * range
```

Direction is bullish. Candle color is secondary; a bullish close can add quality but is not mandatory.

Reversal context:

- after a decline or pullback;
- at support, demand, a rising trendline, 8/21-SMA support, 50/61% retracement, or the lower boundary of a range.

### Bearish pin bar / shooting star

Mirror the bullish pin:

```text
body_ratio <= pin_max_body_ratio
upper_ratio >= pin_min_primary_wick_ratio
lower_ratio <= pin_max_opposite_wick_ratio
upper_wick >= pin_min_wick_to_body * max(body, price_epsilon)
body_high <= low + pin_body_end_fraction * range
```

Direction is bearish. It is strongest after an advance/pullback into resistance, supply, a falling trendline, 8/21-SMA resistance, 50/61% retracement, or range resistance.

### Doji

Raw anatomy:

```text
body_ratio <= doji_max_body_ratio
```

A generic Doji represents indecision, not a standalone direction. It becomes a reversal candidate only after a meaningful move and at a key location. Require a directional confirmation candle or classify it as `WATCH`, not `QUALIFIED`.

### Dragonfly Doji

Suggested anatomy:

```text
body_ratio <= doji_max_body_ratio
lower_ratio >= pin_min_primary_wick_ratio
upper_ratio <= 0.10
open and close are near the high
```

Direction is bullish only with a down move/pullback and support/demand context.

### Gravestone Doji

Mirror the dragonfly:

```text
body_ratio <= doji_max_body_ratio
upper_ratio >= pin_min_primary_wick_ratio
lower_ratio <= 0.10
open and close are near the low
```

Direction is bearish only with an up move/pullback and resistance/supply context.

### Bullish engulfing

Let `a` be the previous candle and `b` the current candle.

Required anatomy:

```text
bearish(a)
bullish(b)
body_low(b) <= body_low(a) + containment_tolerance
body_high(b) >= body_high(a) - containment_tolerance
body(b) > body(a)
```

At least one boundary should extend beyond the prior body after tolerance so equal bodies are not mislabeled. The book defines body engulfment, not necessarily full high-low engulfment. Optionally return `full_range_engulfing=true` as a stronger subtype when `low(b) <= low(a)` and `high(b) >= high(a)`.

Direction is bullish. For a reversal, require a prior decline/pullback and bullish location. In an established uptrend, this is commonly a pullback reversal/continuation of the dominant trend.

### Bearish engulfing

Mirror the bullish form:

```text
bullish(a)
bearish(b)
body_low(b) <= body_low(a) + containment_tolerance
body_high(b) >= body_high(a) - containment_tolerance
body(b) > body(a)
```

Require a prior advance/pullback and bearish location.

The engulfing candle may engulf more than one prior candle. The minimum valid pattern is two candles; optionally count how many consecutive prior bodies the current body engulfs and expose that as quality metadata.

### Morning star

Let `a`, `b`, and `c` be three completed candles:

1. `a` is a strong bearish candle during a decline.
2. `b` has a small body and shows loss of downside momentum; it may be bullish, bearish, or Doji.
3. `c` is a strong bullish candle.
4. `close(c) > midpoint(a)`.

The book describes a gap around the star. Because many FX/crypto markets trade continuously, implement `gap_present` as a quality flag and make `require_gap` configurable, default `false`.

This is bullish only at the bottom of a decline and preferably near support/demand.

### Evening star

Mirror the morning star:

1. `a` is a strong bullish candle during an advance.
2. `b` is small/indecisive.
3. `c` is a strong bearish candle.
4. `close(c) < midpoint(a)`.

This is bearish only at the top of an advance and preferably near resistance/supply. Keep the gap optional but recorded.

### Tweezer bottom

Two-candle bullish reversal:

- first candle bearish;
- second candle bullish;
- their lows match within `tweezer_tolerance`, initially `0.10 * ATR(14)` or a tick-aware equivalent;
- occurs after a decline and at support/demand.

Matching lows without the prior decline and location are only a raw pattern.

### Tweezer top

Two-candle bearish reversal:

- first candle bullish;
- second candle bearish;
- their highs match within tolerance;
- occurs after an advance and at resistance/supply.

### Inside bar / Harami as used by this book

The book uses "Harami" and "inside bar" interchangeably. Implement the range-contained inside bar as the canonical pattern:

```text
mother = a
inside = b
high(b) <= high(a) + containment_tolerance
low(b) >= low(a) - containment_tolerance
range(b) < range(a)
```

Require at least one strict boundary after tolerance. Return the mother range and the inside range.

An inside bar is indecision. It can be continuation or reversal, so it has no trade direction until context and a breakout provide one.

For reversal use:

- at the top of an advance/key resistance, a confirmed break downward can create a bearish reversal;
- at the bottom of a decline/key support, a confirmed break upward can create a bullish reversal.

For trend continuation use, the break should be in the dominant trend direction after a pullback at a key level. This project may expose continuation metadata, but do not mix continuation results into a reversal-only API without a `setup_role` field.

If desired, implement classic body-contained Harami separately as `BODY_HARAMI`. Do not silently substitute it for the book's full-range inside-bar trading rules.

### Inside-bar false breakout

This is one of the book's most important reversal setups.

Sequence:

1. Detect mother candle `a` and inside candle `b`.
2. Within a configurable small number of later bars, candle `c` breaks one side of the inside-bar structure.
3. `c` reverses and closes back inside the mother candle's high-low range.
4. The setup direction is opposite the failed breakout.

Bullish false breakout:

```text
low(c) < low(b) - break_tolerance
close(c) > low(a) and close(c) < high(a)
direction = BULLISH
```

Bearish false breakout:

```text
high(c) > high(b) + break_tolerance
close(c) < high(a) and close(c) > low(a)
direction = BEARISH
```

Quality flags:

- `mother_range_swept`: the false-break bar also exceeds the mother low/high before closing back inside it. This is stronger than only exceeding the inside candle.
- `closed_back_inside_inside_range`: stronger snapback.
- `directional_false_break_bar`: the false-break candle closes in the intended reversal direction.
- `key_level_sweep`: the wick also sweeps support/resistance or a supply/demand boundary.

Location requirements:

- support/resistance or supply/demand;
- 50%/61% retracement;
- 21-SMA or trendline in a trend;
- horizontal boundary in a range.

Do not infer that every failed inside-bar break is institutional "stop hunting." Detect the observable price sequence and describe it neutrally as a liquidity sweep/failed breakout.

## Context-qualified reversal types

Classify every qualified result into one of these roles:

### `PULLBACK_REVERSAL_WITH_TREND` - preferred

- Higher timeframe and entry timeframe have a clear compatible trend.
- Price has pulled back against that trend.
- The pattern reverses the pullback at support in an uptrend or resistance in a downtrend.
- At least one book-defined key location is present.

### `RANGE_BOUNDARY_REVERSAL`

- The range has at least two touches on both boundaries.
- The pattern rejects the lower boundary for bullish or upper boundary for bearish.
- The signal is not in the middle portion of the range.
- There is room to the opposite boundary for at least the minimum reward/risk.

### `MAJOR_COUNTERTREND_REVERSAL` - advanced/strict

- The candidate is at a major Weekly/Daily level or zone.
- The prior trend shows loss of momentum or repeated rejection.
- The reversal pattern is clear on Daily/4H.
- At least two additional confluence factors agree.
- The lower-timeframe direction is not allowed to override conflicting higher-timeframe evidence.

In `beginner_mode`, reject this class entirely and allow only with-trend pullback reversals and range-boundary reversals.

## Hard filters and confluence scoring

### Hard rejection rules

Return `REJECTED` if any applies:

- candle is not closed;
- required OHLC values are missing/invalid;
- timeframe is disallowed by configuration;
- regime is `CHOPPY` or `UNKNOWN`;
- no valid raw pattern;
- no meaningful prior move/pullback into the pattern;
- no compatible key level/zone near the pattern;
- pattern is in the middle of a range;
- moving-average logic is being used in a range;
- higher timeframe presents a major opposing barrier and countertrend rules are not satisfied;
- stop/target cannot be constructed without crossing the logical invalidation;
- reward/risk to the next logical level is below `minimum_reward_risk`.

### Suggested scoring after hard filters

Use a transparent score with reason codes. Suggested initial weights:

| Evidence | Points |
|---|---:|
| Clean pattern anatomy | 1 to 2 |
| Correct horizontal S/R or supply/demand location | 2 |
| Level is from a higher timeframe | +2 |
| Direction agrees with dominant trend | +2 |
| Clear wick rejection/close back through level | +1 |
| Role-reversal retest | +1 |
| 8/21-SMA confluence in a trend | +1 |
| Trendline confluence | +1 |
| 50%/61% Fibonacci confluence | +1 |
| Second independent candlestick/false-break confirmation | +1 |
| Reward/risk >= 3.0 | +1 |

Cap repeated variants of the same evidence so closely correlated indicators do not inflate the score. For example, 8-SMA and 21-SMA together are one MA factor, not two independent points.

Suggested grades:

- `A`: 8 or more;
- `B`: 6-7;
- `WATCH`: passed anatomy/location but lacks confirmation or score;
- `REJECTED`: failed a hard gate.

These cutoffs are engineering defaults and must remain configurable.

## Entries, invalidation, targets, and risk

The signal engine should calculate plans, not place live orders unless the surrounding application explicitly owns execution.

### Entry alternatives

- Pin bar aggressive entry: after the pin bar closes.
- Pin bar conservative entry: limit near 50% of the pin bar's full high-low range. Mark that price may never retrace and the order may remain unfilled.
- Engulfing/star/tweezer entry: after the final pattern candle closes, or optional break of its directional extreme if the host strategy requires confirmation.
- Inside-bar directional setup: after a confirmed break of the inside/mother structure in the intended direction, according to the selected strictness.
- Inside-bar false breakout: after the false-break candle closes back inside the mother range; optional conservative confirmation is a break of the false-break candle's reversal-side extreme.

Never emit an entry using a pattern candle before it has closed.

### Stops

- Long: below the pattern/false-break low and below the relevant support/zone, plus `stop_buffer_atr`.
- Short: above the pattern/false-break high and above the relevant resistance/zone, plus the buffer.
- Inside-bar continuation breakout: beyond the opposite side of the mother candle.

Choose the farther logical invalidation when the candle extreme and zone boundary differ. Report which rule set the stop.

### Targets

- Trend setup: next meaningful support/resistance or opposing supply/demand level.
- Range setup: opposite range boundary, optionally with a small front-run buffer.
- Countertrend setup: next major structural level, not an arbitrary multiple.

Calculate reward/risk from actual entry, stop, and target. Reject below 2:1 by default.

### Position sizing metadata

If account/equity inputs exist:

```text
risk_budget = account_equity * risk_fraction
position_size = risk_budget / monetary_value_of_stop_distance
```

Default `risk_fraction` to 1% in beginner mode and never permit more than 2% without an explicit higher-level override. Treat these as book-derived safety limits, not a promise of profitability.

## Required output schema

Adapt types to the repository, but preserve these semantics:

```json
{
  "symbol": "EURUSD",
  "timeframe": "4h",
  "pattern_end_time": "ISO-8601",
  "status": "QUALIFIED | WATCH | REJECTED",
  "direction": "BULLISH | BEARISH | NEUTRAL",
  "pattern": "BULLISH_PIN | BEARISH_ENGULFING | MORNING_STAR | ...",
  "setup_role": "PULLBACK_REVERSAL_WITH_TREND | RANGE_BOUNDARY_REVERSAL | MAJOR_COUNTERTREND_REVERSAL",
  "pattern_quality": 0.0,
  "entry_regime": "UPTREND | DOWNTREND | RANGE | CHOPPY | UNKNOWN",
  "higher_timeframe_regime": "UPTREND | DOWNTREND | RANGE | CHOPPY | UNKNOWN",
  "prior_move": "UP | DOWN | PULLBACK_UP | PULLBACK_DOWN | NONE",
  "location_matches": [
    {
      "type": "HORIZONTAL_SUPPORT | ROLE_REVERSAL | DEMAND_ZONE | TRENDLINE | SMA_21 | FIB_50 | RANGE_LOW | ...",
      "timeframe": "1d",
      "distance_atr": 0.08,
      "rejected": true
    }
  ],
  "confluence_score": 9,
  "grade": "A",
  "entry_plans": [
    {"type": "AFTER_CLOSE", "price": 1.2345},
    {"type": "FIFTY_PERCENT_RETRACE", "price": 1.2320}
  ],
  "stop": {"price": 1.2280, "basis": "PATTERN_LOW_AND_DEMAND_ZONE"},
  "target": {"price": 1.2475, "basis": "NEXT_DAILY_RESISTANCE"},
  "reward_risk": 2.6,
  "reason_codes": [
    "HTF_UPTREND",
    "PULLBACK_TO_DAILY_SUPPORT",
    "BULLISH_PIN_REJECTION",
    "SMA_21_CONFLUENCE",
    "RR_ABOVE_MINIMUM"
  ],
  "rejection_reasons": [],
  "debug": {
    "thresholds_used": {},
    "source_candle_indexes": []
  }
}
```

For rejected candidates, still return the detected raw pattern and explicit rejection reasons where useful. This makes testing and tuning possible.

## Evaluation flow

```text
for each newly closed entry-timeframe candle:
    validate OHLC and update indicators using data available at this close

    htf_context = classify confirmed higher-timeframe structure
    entry_context = classify confirmed entry-timeframe structure

    if entry_context in {CHOPPY, UNKNOWN}:
        return REJECTED

    levels = levels that existed by this candle's close
    raw_patterns = detect patterns ending at this candle

    for pattern in raw_patterns:
        infer prior move and possible directional role
        matches = find compatible level contacts/rejections

        if no compatible match:
            reject as NO_KEY_LOCATION

        role = classify pullback, range-boundary, or countertrend reversal
        apply higher-timeframe conflict rules
        build entry, invalidation, and next-structure target
        calculate reward/risk
        apply hard filters
        score independent confluence
        emit fully explained result
```

Historical levels, trendlines, swings, and higher-timeframe candles must be reconstructed as they were known at the signal timestamp. Do not compute a level with future reactions and then pretend it existed earlier.

## Minimum acceptance tests

Add repository-native tests for at least these cases:

1. A valid bullish pin anatomy after a pullback in an uptrend, touching Daily support and 21-SMA, qualifies as `PULLBACK_REVERSAL_WITH_TREND`.
2. The identical bullish pin in the middle of an impulse with no level is rejected as `NO_KEY_LOCATION`.
3. A bearish engulfing candle at a falling 4H trendline and resistance during a downtrend qualifies.
4. A bullish engulfing candle in the middle of a valid range is rejected as `RANGE_MIDDLE`.
5. A dragonfly Doji at support returns `WATCH` until bullish confirmation, then qualifies if all other gates pass.
6. A generic Doji in the middle of noise never becomes a directional setup.
7. A morning star closes above the midpoint of the first bearish candle; lack of a gap is accepted when `require_gap=false`.
8. A morning star whose third candle fails to close above the first candle midpoint is rejected as malformed.
9. A tweezer bottom with matching lows at support after a decline is bullish; the same pair after an advance is not a bullish reversal.
10. An inside bar is detected using full high-low containment, not only body containment.
11. A bearish inside-bar false breakout sweeps the inside/mother high at range resistance, closes back in the mother range, and produces a bearish reversal candidate.
12. The same false breakout in the middle of a range is rejected.
13. A pattern that relies only on 8/21-SMA contact in a range is rejected as `MA_USED_OUTSIDE_TREND`.
14. A bullish lower-timeframe pattern directly under major Weekly resistance is rejected or routed through strict countertrend/conflict logic.
15. A setup with target reward/risk of 1.5 is rejected when the minimum is 2.0.
16. A choppy/unknown regime rejects every otherwise valid candle.
17. A signal result is identical when future candles after the signal are removed from the test fixture.
18. A pivot, trendline, or range boundary is not available before its confirmation timestamp.

Useful anatomy fixtures:

```text
Bullish pin:
O=103.0 H=104.5 L=97.0 C=104.0

Bullish engulfing:
previous O=105.0 H=106.0 L=100.0 C=101.0
current  O=100.5 H=106.0 L=100.0 C=105.5

Morning star:
a: O=110.0 H=111.0 L=103.5 C=104.0
b: O=103.8 H=104.2 L=102.8 C=103.2
c: O=103.2 H=108.0 L=103.0 C=107.5
first-candle midpoint=107.0, so the third close confirms

Bullish inside-bar false breakout:
mother: O=108.0 H=110.0 L=100.0 C=102.0
inside: O=102.0 H=108.0 L=101.5 C=106.0
false-break: O=101.0 H=107.0 L=99.0 C=106.0
the mother low is swept and price closes back inside the mother range
```

These fixtures test anatomy only. Tests for qualified setups must also supply sufficient prior bars, volatility, structure, levels, and higher-timeframe context.

## Source ambiguities deliberately resolved

The PDF contains several obvious prose errors. Implement the internally consistent rule, not the isolated typo:

1. Page 40 says the smaller Harami candle should close "outside" the previous candle, but its diagram and the later inside-bar chapters define it as inside/contained. Use containment.
2. Page 44 calls a tweezer top a bullish reversal in one sentence, while pages 43-45, the diagram, and standard direction in the same section define it as bearish. Use bearish for tweezer top.
3. Page 45 calls a tweezer bottom at support bearish in one sentence, but the rest of the section and chart define it as bullish. Use bullish for tweezer bottom.
4. Page 53 describes a downtrend with an erroneous "higher lows" phrase. Use lower highs and lower lows.
5. Page 104 briefly says a long range-bound pin stop belongs above support; the adjacent rules and chart place long invalidation below support/pattern low. Use below for a long and above for a short.

Do not silently discard these notes; keep a short implementation comment or design note so a future maintainer does not reintroduce the PDF's typos.

## Traceability to the book

PDF page references:

| Topic | Pages |
|---|---:|
| Candle anatomy | 11-13 |
| Engulfing, Doji, Dragonfly, Gravestone | 16-27 |
| Morning/Evening Star, Hammer/Shooting Star | 28-39 |
| Harami/inside bar and Tweezers | 40-45 |
| Market structure, trends, pullbacks, levels | 51-69 |
| Multi-timeframe/top-down analysis | 70-77 |
| Trend + level + signal framework | 79-80 |
| Pin-bar strategies and confluence | 81-108 |
| Engulfing strategies, MAs, Fibonacci, trendlines, zones | 109-135 |
| Inside bar and false-breakout strategies | 137-160 |
| Risk/reward, stops, and position risk | 133-136 and 162-166 |

## Deliverables from Claude Code

1. Pattern detectors implemented as pure, testable functions.
2. Confirmed-swing and regime classification with no repainting.
3. Location detectors for horizontal levels, zones, trendlines, 8/21-SMA, Fibonacci, and range boundaries.
4. Multi-timeframe context integration.
5. Setup evaluator with hard gates, score, reason codes, entries, stop, target, and reward/risk.
6. Configuration schema with documented defaults.
7. Unit tests covering every raw pattern and every acceptance case above.
8. Backtest or replay test proving signals use only information available at the candle close.
9. A short README section explaining the difference between a raw pattern, a watch candidate, and a qualified setup.

## Safety and validation note

This logic is a structured interpretation of an educational trading book, not evidence that the strategy is profitable. Keep signal generation separate from live order execution. Validate on out-of-sample data, include spreads/slippage/fees, avoid survivorship bias, and paper trade before any use with real capital.
