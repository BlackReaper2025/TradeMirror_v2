// Trend sub-score. Signed range [-100, +100].
//
// Components (max |contribution|):
//   ema_stack         ±30    EMA9/20/50/200 alignment
//   sma200            ±10    Close vs SMA(200)
//   macd_zero         ±10    MACD line vs zero
//   adx_di            ±20    ADX strength gated by +DI vs -DI dominance
//   ichimoku          ±20    Price vs Kijun and Cloud
//   avg_price_drift   ±10    Close vs HLC/3 SMA5
//
// Sum capped at ±100.

use crate::analytics_v3_demo::CandleV3;
use super::{Bias, ScoreBlock, SignalContribution, bias_from_value, sum_components};

fn sig(id: &str, name: &str, value: f64, max_abs: f64, evidence: String, why: &str) -> SignalContribution {
    SignalContribution {
        id:             id.into(),
        name:           name.into(),
        value,
        max_abs,
        bias:           bias_from_value(value),
        evidence,
        why_it_matters: why.into(),
    }
}

// ── EMA stack: count ordered relations among (price>EMA9, EMA9>EMA20, EMA20>EMA50, EMA50>EMA200).
fn ema_stack(c: &CandleV3) -> SignalContribution {
    let up_flags = [
        c.close > c.ema9,
        c.ema9  > c.ema20,
        c.ema20 > c.ema50,
        c.ema50 > c.ema200,
    ];
    let dn_flags = [
        c.close < c.ema9,
        c.ema9  < c.ema20,
        c.ema20 < c.ema50,
        c.ema50 < c.ema200,
    ];
    let up = up_flags.iter().filter(|&&b| b).count() as i32;
    let dn = dn_flags.iter().filter(|&&b| b).count() as i32;
    let value = ((up - dn) as f64) * 7.5; // ±30 max

    let label = match (up, dn) {
        (4, _) => "Aligned Up",
        (_, 4) => "Aligned Down",
        (3, _) => "Mostly Up",
        (_, 3) => "Mostly Down",
        _      => "Mixed",
    };
    let evidence = format!(
        "{} | Close {:.4} · EMA9 {:.4} · EMA20 {:.4} · EMA50 {:.4} · EMA200 {:.4}",
        label, c.close, c.ema9, c.ema20, c.ema50, c.ema200,
    );
    sig("ema_stack", "EMA Stack", value, 30.0, evidence,
        "EMA stack alignment reflects trend integrity across multiple horizons. \
         Full alignment (price > EMA9 > EMA20 > EMA50 > EMA200) is the most reliable \
         confirmation of a bullish trend; the reverse defines a confirmed bear trend. \
         Mixed orderings signal trend uncertainty or transition.")
}

fn sma200(c: &CandleV3) -> SignalContribution {
    let v = if c.sma200 <= 0.0 { 0.0 }
            else if c.close > c.sma200 {  10.0 }
            else                       { -10.0 };
    let pos = if c.sma200 > 0.0 && c.close > c.sma200 { "above" } else { "below" };
    let evidence = format!("Close {:.4} {} SMA200 {:.4}", c.close, pos, c.sma200);
    sig("sma200", "SMA(200) bias", v, 10.0, evidence,
        "The 200-period SMA is the canonical long-term trend anchor. \
         Sustained closes above signal a bull-market context; closes below signal a bear-market context.")
}

fn macd_zero(c: &CandleV3) -> SignalContribution {
    let v = if c.macd >  0.00005 {  10.0 }
            else if c.macd < -0.00005 { -10.0 }
            else { 0.0 };
    let evidence = format!("MACD line {:+.5}", c.macd);
    sig("macd_zero", "MACD vs zero", v, 10.0, evidence,
        "MACD above zero means the 12-EMA is above the 26-EMA — a bullish trend condition. \
         Below zero is bearish. Zero-line crossovers are slow but high-confidence trend signals.")
}

fn adx_di(c: &CandleV3) -> SignalContribution {
    let strength = if c.adx >= 40.0 { 20.0 }
                   else if c.adx >= 25.0 { 15.0 }
                   else if c.adx >= 20.0 { 8.0 }
                   else { 0.0 };
    let sign = if c.di_plus > c.di_minus + 0.5 { 1.0 }
               else if c.di_minus > c.di_plus + 0.5 { -1.0 }
               else { 0.0 };
    let value = strength * sign;
    let label = if c.adx >= 40.0 { "Strong" }
                else if c.adx >= 25.0 { "Confirmed" }
                else if c.adx >= 20.0 { "Developing" }
                else { "Ranging" };
    let dom   = if c.di_plus > c.di_minus { "+DI dominant" } else { "-DI dominant" };
    let evidence = format!(
        "ADX {:.1} ({}) · +DI {:.1} · -DI {:.1} · {}",
        c.adx, label, c.di_plus, c.di_minus, dom,
    );
    sig("adx_di", "ADX + DI Direction", value, 20.0, evidence,
        "ADX measures trend strength independently of direction; ≥25 confirms a real trend, \
         ≥40 confirms a strong trend. +DI vs -DI dominance sets the bias. Together they form \
         the classic Wilder trend-entry confirmation.")
}

fn ichimoku(c: &CandleV3) -> SignalContribution {
    let v = match (c.price_above_cloud, c.price_above_kijun) {
        (true,  true)  =>  20.0,
        (true,  false) =>   5.0,
        (false, true)  =>  -5.0,
        (false, false) => -20.0,
    };
    let cloud = if c.price_above_cloud { "above cloud" } else { "below cloud" };
    let kijun = if c.price_above_kijun { "above Kijun" } else { "below Kijun" };
    let evidence = format!(
        "Close {:.4} · {} · {} {:.4}",
        c.close, cloud, kijun, c.kijun,
    );
    sig("ichimoku", "Ichimoku Position", v, 20.0, evidence,
        "Price above the Ichimoku cloud and above Kijun is the strongest bullish positioning \
         in the system — both medium-term momentum and trend support align. The reverse \
         configuration is the strongest bearish positioning.")
}

fn avg_price_drift(candles: &[CandleV3]) -> SignalContribution {
    if candles.len() < 5 {
        return sig("avg_price", "Avg Price Drift", 0.0, 10.0,
            "Insufficient history".into(),
            "5-bar typical-price average — captures recent center of gravity.");
    }
    let recent = &candles[candles.len()-5..];
    let avg: f64 = recent.iter().map(|c| (c.high + c.low + c.close) / 3.0).sum::<f64>() / 5.0;
    let cur = candles.last().unwrap();
    let atr = if cur.atr14 > 0.0 { cur.atr14 } else { 0.0005 };
    let diff = cur.close - avg;
    let normalized = (diff / atr).max(-1.0).min(1.0);
    let value = normalized * 10.0;
    let evidence = format!(
        "Close {:.4} {} 5-bar avg price {:.4} ({:+.1} ATR)",
        cur.close,
        if diff >= 0.0 { "above" } else { "below" },
        avg, diff / atr,
    );
    sig("avg_price", "Avg Price Drift", value, 10.0, evidence,
        "5-bar HLC/3 average captures recent typical price including the full session range. \
         Sustained closes above = buyers control the recent center of gravity; below = sellers.")
}

pub fn score(candles: &[CandleV3]) -> ScoreBlock {
    if candles.is_empty() {
        return ScoreBlock { value: 0.0, bias: Bias::Neutral, components: vec![] };
    }
    let c = candles.last().unwrap();
    let components = vec![
        ema_stack(c),
        sma200(c),
        macd_zero(c),
        adx_di(c),
        ichimoku(c),
        avg_price_drift(candles),
    ];
    let value = sum_components(&components);
    ScoreBlock { value, bias: bias_from_value(value), components }
}
