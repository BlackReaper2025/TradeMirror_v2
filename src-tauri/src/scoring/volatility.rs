// Volatility / regime classifier.
//
// Outputs a RegimeContext used by the composite aggregator to weight the directional
// sub-scores (trend / momentum / structure). Does NOT contribute a signed score itself.
//
// Classification:
//   regime     = Compression  if BB width < 0.75 × 20-bar avg BB width
//              = Trending     if ADX > 25
//              = Ranging      otherwise
//
//   volatility = Expanding    if ATR(14) > 1.10 × 20-bar SMA of ATR
//              = Contracting  if ATR(14) < 0.90 × 20-bar SMA of ATR
//              = Neutral      otherwise

use crate::analytics_v3_demo::CandleV3;
use super::{RegimeContext, RegimeState, VolatilityState};

const WINDOW: usize = 20;
const BB_COMPRESSION_THRESHOLD: f64 = 0.75;
const ADX_TRENDING_THRESHOLD:   f64 = 25.0;
const VOL_EXPANDING_THRESHOLD:  f64 = 1.10;
const VOL_CONTRACTING_THRESHOLD: f64 = 0.90;

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

    let regime = if bb_avg > 0.0 && bb_ratio < BB_COMPRESSION_THRESHOLD {
        RegimeState::Compression
    } else if cur.adx > ADX_TRENDING_THRESHOLD {
        RegimeState::Trending
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
