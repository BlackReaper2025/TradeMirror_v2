// Volatility / regime classifier.
//
// Outputs a RegimeContext used by the composite aggregator to weight the directional
// sub-scores (trend / momentum / structure). Does NOT contribute a signed score itself.
//
// Algorithm v2 — five-tier regime with joint ADX/BB/ATR conditions:
//
//   StrongTrending  ADX >= 40 AND |+DI - -DI| >= DI_DOMINANCE_THRESHOLD
//   Trending        ADX >= 25 AND |+DI - -DI| >= DI_DOMINANCE_THRESHOLD
//   Compression     BB width < BB_COMPRESSION_THRESHOLD x 20-bar avg BB width
//                   AND ATR(14) < VOL_CONTRACTING_THRESHOLD x ATR SMA(20)
//                   AND ADX < ADX_TRENDING_THRESHOLD  (no trend in progress)
//   Expansion       BB width > BB_EXPANSION_THRESHOLD x 20-bar avg BB width
//                   AND ATR(14) > VOL_EXPANDING_THRESHOLD x ATR SMA(20)
//                   AND ADX < ADX_TRENDING_THRESHOLD  (no clean trend yet)
//   Ranging         otherwise (default)
//
// Volatility state (independent of regime; describes ATR trajectory):
//   Expanding    ATR(14) > VOL_EXPANDING_THRESHOLD x ATR SMA(20)
//   Contracting  ATR(14) < VOL_CONTRACTING_THRESHOLD x ATR SMA(20)
//   Neutral      otherwise
//
// Improvements over v1:
//   - Trending check now PRECEDES Compression — fixes the bug where mid-trend BB
//     contraction relative to the early-trend expansion average flagged a real
//     trend as Compression.
//   - DI dominance gate on Trending — ADX > 25 alone could fire on directionless
//     bidirectional volatility; now requires |+DI - -DI| > 5.
//   - Joint BB+ATR condition on Compression — both must contract for a true
//     squeeze, not just BB.
//   - StrongTrending tier (ADX >= 40) — separates borderline trends from
//     conviction trends for scoring purposes.
//   - Expansion tier — high-volatility post-breakout phases without clean trend.
//   - Wider vol-state bands [0.85, 1.20] — Neutral no longer eats most readings.

use crate::analytics_v3_demo::CandleV3;
use super::{RegimeContext, RegimeState, VolatilityState};

const WINDOW: usize = 20;
const ADX_TRENDING_THRESHOLD:    f64 = 25.0;
const ADX_STRONG_THRESHOLD:      f64 = 40.0;
const DI_DOMINANCE_THRESHOLD:    f64 = 5.0;
const BB_COMPRESSION_THRESHOLD:  f64 = 0.65;
const BB_EXPANSION_THRESHOLD:    f64 = 1.50;
const VOL_EXPANDING_THRESHOLD:   f64 = 1.20;
const VOL_CONTRACTING_THRESHOLD: f64 = 0.85;

fn avg_bb_width(candles: &[CandleV3]) -> f64 {
    let n = candles.len();
    if n == 0 { return 0.0; }
    let start = n.saturating_sub(WINDOW);
    let win = &candles[start..n];
    let sum: f64 = win.iter().map(|c| (c.bb_upper - c.bb_lower).max(0.0)).sum();
    sum / win.len() as f64
}

fn avg_atr(candles: &[CandleV3]) -> f64 {
    let n = candles.len();
    if n == 0 { return 0.0; }
    let start = n.saturating_sub(WINDOW);
    let win = &candles[start..n];
    let sum: f64 = win.iter().map(|c| c.atr14).sum();
    sum / win.len() as f64
}

fn squeeze_duration(candles: &[CandleV3]) -> (bool, i32) {
    let n = candles.len();
    if n == 0 { return (false, 0); }
    let cur = candles.last().unwrap();
    let on  = cur.bb_upper < cur.keltner_upper && cur.bb_lower > cur.keltner_lower;
    // Count consecutive bars in the current state (on or off).
    let mut bars = 0i32;
    for i in (0..n).rev() {
        let c = &candles[i];
        let s = c.bb_upper < c.keltner_upper && c.bb_lower > c.keltner_lower;
        if s == on { bars += 1; } else { break; }
    }
    (on, bars)
}

pub fn classify_context(candles: &[CandleV3]) -> RegimeContext {
    if candles.is_empty() {
        return RegimeContext {
            regime: RegimeState::Ranging,
            volatility: VolatilityState::Neutral,
            adx: 0.0, atr_ratio: 1.0, bb_width_ratio: 1.0,
            squeeze_on: false, squeeze_bars: 0,
        };
    }
    let cur = candles.last().unwrap();

    let bb_width = (cur.bb_upper - cur.bb_lower).max(0.0);
    let bb_avg   = avg_bb_width(candles);
    let bb_ratio = if bb_avg > 0.0 { bb_width / bb_avg } else { 1.0 };

    let atr_avg   = avg_atr(candles);
    let atr_ratio = if atr_avg > 0.0 { cur.atr14 / atr_avg } else { 1.0 };

    let di_diff   = (cur.di_plus - cur.di_minus).abs();
    let di_confirmed = di_diff >= DI_DOMINANCE_THRESHOLD;

    // Regime priority:
    //   1. StrongTrending / Trending (ADX-confirmed + DI dominance)
    //   2. Compression (joint BB+ATR + no trend)
    //   3. Expansion (joint BB+ATR upside + no trend)
    //   4. Ranging (default)
    let regime = if cur.adx >= ADX_STRONG_THRESHOLD && di_confirmed {
        RegimeState::StrongTrending
    } else if cur.adx >= ADX_TRENDING_THRESHOLD && di_confirmed {
        RegimeState::Trending
    } else if bb_avg > 0.0
        && bb_ratio < BB_COMPRESSION_THRESHOLD
        && atr_ratio < VOL_CONTRACTING_THRESHOLD
        && cur.adx < ADX_TRENDING_THRESHOLD
    {
        RegimeState::Compression
    } else if bb_avg > 0.0
        && bb_ratio > BB_EXPANSION_THRESHOLD
        && atr_ratio > VOL_EXPANDING_THRESHOLD
        && cur.adx < ADX_TRENDING_THRESHOLD
    {
        RegimeState::Expansion
    } else {
        RegimeState::Ranging
    };

    let volatility = if atr_ratio > VOL_EXPANDING_THRESHOLD {
        VolatilityState::Expanding
    } else if atr_ratio < VOL_CONTRACTING_THRESHOLD {
        VolatilityState::Contracting
    } else {
        VolatilityState::Neutral
    };

    let (squeeze_on, squeeze_bars) = squeeze_duration(candles);

    RegimeContext {
        regime, volatility,
        adx: cur.adx,
        atr_ratio,
        bb_width_ratio: bb_ratio,
        squeeze_on,
        squeeze_bars,
    }
}
