// Momentum sub-score. Signed range [-100, +100].
//
// Components (max |contribution|):
//   rsi14_zone        ±15    RSI(14) location and trend
//   stoch_rsi         ±10    Stochastic RSI K vs D + zone
//   macd_hist         ±15    MACD histogram direction + acceleration
//   cci_zone          ±15    CCI vs ±100
//   williams_r        ±10    Williams %R vs -20 / -80 (computed from H/L/C)
//   momentum10        ±10    10-bar % change in close
//   roc5              ±15    5-bar % change in close
//   avg_delta5        ±10    Mean per-bar close-to-close pip delta over 5 bars

use crate::analytics_v3_demo::CandleV3;
use super::{Bias, ScoreBlock, SignalContribution, bias_from_value, sum_components};

fn sig(id: &str, name: &str, value: f64, max_abs: f64, evidence: String, why: &str) -> SignalContribution {
    SignalContribution {
        id: id.into(), name: name.into(), value, max_abs,
        bias: bias_from_value(value), evidence, why_it_matters: why.into(),
    }
}

// ── RSI(14) zone scoring.
// Bullish zone 50-65 with trend UP scores high. Above 70 = overbought (mixed).
// Bearish zone 35-50 with trend DOWN scores low.
fn rsi14_zone(c: &CandleV3) -> SignalContribution {
    let r = c.rsi14;
    let trend_up   = c.rsi_trend == "UP";
    let trend_down = c.rsi_trend == "DOWN";

    let mut v: f64 = 0.0;
    if r >= 50.0 && r <= 65.0 && trend_up      { v =  12.0; }
    else if r >  65.0 && r <= 75.0 && trend_up { v =  10.0; }
    else if r >  75.0                           { v =   5.0; } // overbought caution
    else if r >= 50.0 && r <= 60.0              { v =   6.0; }
    else if r >= 35.0 && r <= 50.0 && trend_down { v = -12.0; }
    else if r >= 25.0 && r <  35.0 && trend_down { v = -10.0; }
    else if r <  25.0                           { v =  -5.0; } // oversold caution
    else if r >= 40.0 && r <= 50.0              { v =  -6.0; }

    // Bonus / penalty for trend agreement
    if v >  0.0 && trend_up   { v += 3.0; }
    if v <  0.0 && trend_down { v -= 3.0; }
    let value = v.max(-15.0).min(15.0);

    let evidence = format!("RSI(14) {:.1} · trend {}", r, c.rsi_trend);
    sig("rsi14_zone", "RSI(14) Zone", value, 15.0, evidence,
        "RSI's predictive value comes from zone × slope. A rising RSI in the 50–65 bullish \
         operating zone confirms momentum; a falling RSI in 35–50 confirms bearish momentum. \
         Extremes (>70 / <30) warn of exhaustion rather than confirm trend.")
}

fn stoch_rsi(c: &CandleV3) -> SignalContribution {
    let k = c.stoch_rsi_k;
    let d = c.stoch_rsi_d;
    let cross_up   = k > d + 1.0;
    let cross_down = d > k + 1.0;
    let oversold   = k < 20.0;
    let overbought = k > 80.0;

    let mut v: f64 = 0.0;
    if cross_up   && !overbought { v += 6.0; }
    if cross_down && !oversold   { v -= 6.0; }
    if oversold   && cross_up    { v += 4.0; }   // bullish reversal from oversold
    if overbought && cross_down  { v -= 4.0; }   // bearish reversal from overbought
    let value = v.max(-10.0).min(10.0);

    let zone = if oversold { "oversold" } else if overbought { "overbought" } else { "mid" };
    let evidence = format!("StochRSI K {:.1} {} D {:.1} ({})",
        k, if cross_up {">"} else if cross_down {"<"} else {"≈"}, d, zone);
    sig("stoch_rsi", "Stochastic RSI", value, 10.0, evidence,
        "StochRSI %K/%D crossovers are leading momentum signals. Crossovers in extreme \
         territory (below 20 oversold, above 80 overbought) carry the highest reliability, \
         particularly when reversing from those zones back toward the midline.")
}

fn macd_hist(candles: &[CandleV3]) -> SignalContribution {
    if candles.len() < 2 {
        return sig("macd_hist", "MACD Histogram", 0.0, 15.0,
            "Insufficient history".into(),
            "MACD histogram captures momentum acceleration.");
    }
    let cur = candles.last().unwrap();
    let prev = &candles[candles.len() - 2];
    let h = cur.macd_histogram;
    let dh = h - prev.macd_histogram;

    // Sign of h sets direction; expanding (|h| growing) amplifies.
    let mut v = 0.0;
    if h > 0.0 {
        v = if dh > 0.0 { 12.0 } else { 6.0 };   // bullish — expanding vs shrinking
    } else if h < 0.0 {
        v = if dh < 0.0 { -12.0 } else { -6.0 }; // bearish — expanding vs shrinking
    }
    // Acceleration kicker if dh sign matches h sign and magnitude is significant
    if h.abs() > 0.0001 && dh.signum() == h.signum() {
        v += 3.0 * h.signum();
    }
    let value = v.max(-15.0).min(15.0);

    let state = match (h.signum() as i32, dh.signum() as i32) {
        (1, 1)   => "bullish + expanding",
        (1, -1)  => "bullish + shrinking",
        (-1, -1) => "bearish + expanding",
        (-1, 1)  => "bearish + shrinking",
        _        => "neutral",
    };
    let evidence = format!("Hist {:+.5} (Δ {:+.5}) — {}", h, dh, state);
    sig("macd_hist", "MACD Histogram", value, 15.0, evidence,
        "The MACD histogram turns before the lines cross — it is the leading indicator of \
         momentum shifts. A histogram that is bullish AND expanding confirms accelerating \
         upside momentum; bullish + shrinking warns of upcoming reversal.")
}

fn cci_zone(c: &CandleV3) -> SignalContribution {
    let cci = c.cci;
    let v = if cci >  200.0 {   5.0 }    // unsustainable overbought — caution flag
        else if cci >  100.0 {  15.0 }
        else if cci >   50.0 {   8.0 }
        else if cci > -50.0  {   0.0 }
        else if cci > -100.0 {  -8.0 }
        else if cci > -200.0 { -15.0 }
        else                 {  -5.0 };  // unsustainable oversold

    let zone = if cci > 200.0 { "extreme overbought" }
        else if cci > 100.0 { "overbought / bullish momentum" }
        else if cci > 0.0   { "mildly bullish" }
        else if cci > -100.0 { "mildly bearish" }
        else if cci > -200.0 { "oversold / bearish momentum" }
        else { "extreme oversold" };

    let evidence = format!("CCI {:+.1} — {}", cci, zone);
    sig("cci_zone", "CCI Zone", v, 15.0, evidence,
        "CCI > +100 signals strong bullish momentum; < -100 signals strong bearish momentum. \
         Extremes above ±200 are unsustainable and historically precede pullbacks, so they \
         receive a reduced score reflecting reversal risk.")
}

fn compute_wr(candles: &[CandleV3], period: usize) -> f64 {
    let n = candles.len();
    if n == 0 { return -50.0; }
    let start = n.saturating_sub(period);
    let win = &candles[start..n];
    let hh = win.iter().map(|c| c.high).fold(f64::NEG_INFINITY, f64::max);
    let ll = win.iter().map(|c| c.low ).fold(f64::INFINITY,     f64::min);
    if hh <= ll { return -50.0; }
    let close = candles[n - 1].close;
    ((hh - close) / (hh - ll)) * -100.0
}

fn williams_r(candles: &[CandleV3]) -> SignalContribution {
    let wr = compute_wr(candles, 14);
    let v = if wr > -20.0      {  3.0 }   // overbought — limited upside, slight caution
        else if wr > -50.0     {  8.0 }   // upper-mid: bullish
        else if wr > -80.0     { -8.0 }   // lower-mid: bearish
        else                   { -3.0 };  // oversold — limited downside, slight caution

    let zone = if wr > -20.0 { "overbought" }
        else if wr > -50.0 { "upper neutral" }
        else if wr > -80.0 { "lower neutral" }
        else { "oversold" };
    let evidence = format!("Williams %R {:.1} ({})", wr, zone);
    sig("williams_r", "Williams %R", v, 10.0, evidence,
        "Williams %R measures where the close sits within the 14-bar high-low range. \
         Holding near the top (above -20) during a rally confirms bullish strength; \
         failing to recover above -20 on bounces during a decline confirms bearish dominance.")
}

fn momentum10(candles: &[CandleV3]) -> SignalContribution {
    let n = candles.len();
    if n < 11 {
        return sig("momentum10", "Momentum(10)", 0.0, 10.0,
            "Insufficient history".into(),
            "10-bar percentage momentum.");
    }
    let cur = candles[n - 1].close;
    let prior = candles[n - 11].close;
    if prior <= 0.0 {
        return sig("momentum10", "Momentum(10)", 0.0, 10.0, "Invalid prior".into(),
            "10-bar percentage momentum.");
    }
    let pct = (cur - prior) / prior * 100.0;
    let v = (pct * 5.0).max(-10.0).min(10.0); // 2% = full ±10
    let evidence = format!("Momentum(10) {:+.3}% over 10 bars", pct);
    sig("momentum10", "Momentum(10)", v, 10.0, evidence,
        "Momentum(10) is unbounded — captures the raw 10-bar percentage change. \
         Positive and accelerating values confirm trend strength; deceleration warns of slowdown.")
}

fn roc5(candles: &[CandleV3]) -> SignalContribution {
    let n = candles.len();
    if n < 6 {
        return sig("roc5", "Rate of Change (5)", 0.0, 15.0,
            "Insufficient history".into(),
            "5-bar rate of change captures one trading week of momentum.");
    }
    let cur = candles[n - 1].close;
    let prior = candles[n - 6].close;
    if prior <= 0.0 {
        return sig("roc5", "Rate of Change (5)", 0.0, 15.0, "Invalid prior".into(),
            "5-bar rate of change.");
    }
    let pct = (cur - prior) / prior * 100.0;
    // ±0.5% threshold = ±10, scale up to ±15 cap.
    let v = (pct * 20.0).max(-15.0).min(15.0);
    let evidence = format!("ROC(5) {:+.3}% over 5 bars", pct);
    sig("roc5", "Rate of Change (5)", v, 15.0, evidence,
        "ROC(5) measures one trading week of net change. Readings beyond ±0.5% reflect \
         meaningful momentum. Accelerating ROC confirms trend health; ROC divergence from \
         price (new low without ROC confirmation) is an early reversal signal.")
}

fn avg_delta5(candles: &[CandleV3]) -> SignalContribution {
    let n = candles.len();
    if n < 6 {
        return sig("avg_delta5", "Avg Delta (5-bar)", 0.0, 10.0,
            "Insufficient history".into(),
            "Average per-bar pip delta over 5 bars.");
    }
    let recent = &candles[n - 6..n];
    let mut sum = 0.0;
    for i in 1..recent.len() {
        sum += (recent[i].close - recent[i-1].close) * 10000.0;
    }
    let avg = sum / 5.0;
    // ±3 pips/bar = full ±10
    let v = (avg / 3.0 * 10.0).max(-10.0).min(10.0);
    let evidence = format!("Avg delta {:+.1} pips/bar over last 5 bars", avg);
    sig("avg_delta5", "Avg Delta (5-bar)", v, 10.0, evidence,
        "Average per-bar pip drift over 5 bars. Distinguishes consistent directional pressure \
         (large avg with low variance) from one-bar spikes (small avg despite a large ROC).")
}

pub fn score(candles: &[CandleV3]) -> ScoreBlock {
    if candles.is_empty() {
        return ScoreBlock { value: 0.0, bias: Bias::Neutral, components: vec![] };
    }
    let c = candles.last().unwrap();
    let components = vec![
        rsi14_zone(c),
        stoch_rsi(c),
        macd_hist(candles),
        cci_zone(c),
        williams_r(candles),
        momentum10(candles),
        roc5(candles),
        avg_delta5(candles),
    ];
    let value = sum_components(&components);
    ScoreBlock { value, bias: bias_from_value(value), components }
}
