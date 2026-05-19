// Structure sub-score. Signed range [-100, +100].
//
// Components (max |contribution|):
//   structure_state   ±35    Strength-tiered HH/HL/LH/LL state (6 tiers)
//   last_bos          ±25    Most recent Break of Structure (with recency decay)
//   last_choch        ±20    Most recent Change of Character (with recency decay)
//   pivot_context     ±20    Close vs prior-session pivot levels (R1/S1)
//
// Algorithm improvements over v1:
//   • ATR-based displacement filter (0.25×ATR min) for HH/HL/LH/LL classification.
//     Sub-threshold differences are classified as "Equal" — micro swings no longer
//     count as full structural events.
//   • Swings are NOT collapsed on same-type repeats. Every fractal swing is kept and
//     classified relative to the prior same-type swing. Old code silently lost
//     HH/LL information when collapsing.
//   • Real-time event detection: in addition to swing-formation events (which lag
//     by N bars), the current bar's close is checked against the highest unbroken
//     swing high and lowest unbroken swing low. Events fire on the actual break
//     bar, not N bars later.
//   • Strength tiers: state expands from {Bullish, Bearish, Range} to a 6-tier
//     {Strong Bullish, Bullish, Shifting, Range, Bearish, Strong Bearish}.
//   • Break confirmation uses CLOSE, not wick. Wicks above prior highs no longer
//     trigger BOS — only closes do.
//
// Swing detection uses N=3 lookback on each side. Replay-consistent.

use crate::analytics_v3_demo::CandleV3;
use super::{Bias, ScoreBlock, SignalContribution, bias_from_value, sum_components};

const SWING_LOOKBACK: usize = 3;
const DISPLACEMENT_ATR_MULT: f64 = 0.25;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum SwingType { High, Low }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Relative { HH, HL, LH, LL, Equal, FirstOfKind }

#[derive(Clone, Copy, Debug)]
struct Swing { idx: usize, kind: SwingType, price: f64, relative: Relative }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum EventType { Bos, Choch }

#[derive(Clone, Copy, Debug)]
#[allow(dead_code)]
struct Event {
    idx:      usize,
    kind:     EventType,
    bullish:  bool,
    is_live:  bool,   // true if fired on current bar close (not yet a confirmed swing)
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum State {
    StrongBullish,
    Bullish,
    Bearish,
    StrongBearish,
    Shifting,   // trend pair contradicts prior trend pair — early reversal warning
    Range,      // no consistent direction or insufficient data
}

// ── Fractal swing detection (strict): bar i is a swing high if its high is greater
//    than the highs of N bars on each side. Strict inequality.
fn fractal_swings(candles: &[CandleV3], n: usize) -> Vec<(usize, SwingType, f64)> {
    let len = candles.len();
    if len < n * 2 + 1 { return vec![]; }
    let mut out = Vec::new();
    for i in n..(len - n) {
        let mut sh = true;
        let mut sl = true;
        for k in 1..=n {
            if candles[i - k].high >= candles[i].high || candles[i + k].high >= candles[i].high { sh = false; }
            if candles[i - k].low  <= candles[i].low  || candles[i + k].low  <= candles[i].low  { sl = false; }
        }
        if sh { out.push((i, SwingType::High, candles[i].high)); }
        if sl { out.push((i, SwingType::Low,  candles[i].low )); }
    }
    out.sort_by_key(|t| t.0);
    out
}

// ── Classify each swing relative to the prior swing of the same kind. Difference
//    must exceed DISPLACEMENT_ATR_MULT × ATR(at swing idx) to qualify as HH/HL/LH/LL.
//    Below threshold → Equal (sub-threshold drift, treated as continuation).
fn classify_swings(candles: &[CandleV3], raw: Vec<(usize, SwingType, f64)>) -> Vec<Swing> {
    let mut out: Vec<Swing> = Vec::with_capacity(raw.len());
    for (idx, kind, price) in raw {
        let atr = candles.get(idx).map(|c| c.atr14).unwrap_or(0.0005).max(0.0001);
        let min_disp = DISPLACEMENT_ATR_MULT * atr;
        // Find prior same-kind swing in `out`.
        let prior = out.iter().rev().find(|s| s.kind == kind).copied();
        let relative = match (kind, prior) {
            (_,                 None)    => Relative::FirstOfKind,
            (SwingType::High,  Some(p))  => {
                if      price > p.price + min_disp { Relative::HH }
                else if price < p.price - min_disp { Relative::LH }
                else                                { Relative::Equal }
            }
            (SwingType::Low,   Some(p))  => {
                if      price > p.price + min_disp { Relative::HL }
                else if price < p.price - min_disp { Relative::LL }
                else                                { Relative::Equal }
            }
        };
        out.push(Swing { idx, kind, price, relative });
    }
    out
}

// ── State determination from the most recent classifications.
fn determine_state(swings: &[Swing]) -> State {
    let highs: Vec<&Swing> = swings.iter().filter(|s| s.kind == SwingType::High).collect();
    let lows:  Vec<&Swing> = swings.iter().filter(|s| s.kind == SwingType::Low ).collect();
    if highs.is_empty() || lows.is_empty() { return State::Range; }

    let last_h = highs.last().unwrap().relative;
    let last_l = lows.last().unwrap().relative;
    let prev_h = if highs.len() >= 2 { highs[highs.len() - 2].relative } else { Relative::FirstOfKind };
    let prev_l = if lows.len()  >= 2 { lows[lows.len()   - 2].relative } else { Relative::FirstOfKind };

    let is_bull_pair = |h: Relative, l: Relative| matches!(h, Relative::HH) && matches!(l, Relative::HL);
    let is_bear_pair = |h: Relative, l: Relative| matches!(h, Relative::LH) && matches!(l, Relative::LL);

    // Strong tier: current pair + prior pair both aligned in same direction.
    if is_bull_pair(last_h, last_l) && is_bull_pair(prev_h, prev_l) { return State::StrongBullish; }
    if is_bear_pair(last_h, last_l) && is_bear_pair(prev_h, prev_l) { return State::StrongBearish; }

    // Moderate tier: current pair aligned, prior may differ or be insufficient.
    if is_bull_pair(last_h, last_l) { return State::Bullish; }
    if is_bear_pair(last_h, last_l) { return State::Bearish; }

    // Shifting: current pair contradicts a clear prior pair.
    if (is_bull_pair(prev_h, prev_l) || matches!(prev_l, Relative::HL))
        && (matches!(last_l, Relative::LL) || matches!(last_h, Relative::LH))
    { return State::Shifting; }
    if (is_bear_pair(prev_h, prev_l) || matches!(prev_h, Relative::LH))
        && (matches!(last_h, Relative::HH) || matches!(last_l, Relative::HL))
    { return State::Shifting; }

    State::Range
}

// ── Historical events (from past swings). Triggers only on HH (bull) or LL (bear)
//    classifications, since those are the structural breaks. Equal / FirstOfKind do
//    not trigger events.
fn historical_events(swings: &[Swing]) -> Vec<Event> {
    let mut events = Vec::new();
    let mut trend: Option<bool> = None;
    for s in swings {
        match s.relative {
            Relative::HH => {
                let kind = match trend { Some(false) => EventType::Choch, _ => EventType::Bos };
                events.push(Event { idx: s.idx, kind, bullish: true, is_live: false });
                trend = Some(true);
            }
            Relative::LL => {
                let kind = match trend { Some(true) => EventType::Choch, _ => EventType::Bos };
                events.push(Event { idx: s.idx, kind, bullish: false, is_live: false });
                trend = Some(false);
            }
            _ => {}
        }
    }
    events
}

// ── Real-time event detection. Find the highest unbroken swing high and lowest
//    unbroken swing low as of the bar PRIOR to the current bar. If the current bar's
//    close breaks either, emit a live event.
fn live_event(candles: &[CandleV3], swings: &[Swing], prior_trend: Option<bool>) -> Option<Event> {
    let n = candles.len();
    if n < 2 { return None; }
    let cur = &candles[n - 1];
    let prior_end = n - 1;   // exclusive — closes up to (but not including) current bar

    // Highest unbroken swing high: maximum-priced SH such that no prior close exceeded it.
    let unbroken_sh = swings.iter()
        .filter(|s| s.kind == SwingType::High && s.idx < prior_end)
        .filter(|s| {
            candles[s.idx + 1..prior_end].iter().all(|c| c.close <= s.price)
        })
        .max_by(|a, b| a.price.partial_cmp(&b.price).unwrap_or(std::cmp::Ordering::Equal))
        .copied();

    if let Some(anchor) = unbroken_sh {
        if cur.close > anchor.price {
            let kind = match prior_trend { Some(false) => EventType::Choch, _ => EventType::Bos };
            return Some(Event { idx: n - 1, kind, bullish: true, is_live: true });
        }
    }

    let unbroken_sl = swings.iter()
        .filter(|s| s.kind == SwingType::Low && s.idx < prior_end)
        .filter(|s| {
            candles[s.idx + 1..prior_end].iter().all(|c| c.close >= s.price)
        })
        .min_by(|a, b| a.price.partial_cmp(&b.price).unwrap_or(std::cmp::Ordering::Equal))
        .copied();

    if let Some(anchor) = unbroken_sl {
        if cur.close < anchor.price {
            let kind = match prior_trend { Some(true) => EventType::Choch, _ => EventType::Bos };
            return Some(Event { idx: n - 1, kind, bullish: false, is_live: true });
        }
    }
    None
}

fn sig(id: &str, name: &str, value: f64, max_abs: f64, evidence: String, why: &str) -> SignalContribution {
    SignalContribution {
        id: id.into(), name: name.into(), value, max_abs,
        bias: bias_from_value(value), evidence, why_it_matters: why.into(),
    }
}

fn state_signal(state: State, swing_count: (usize, usize)) -> SignalContribution {
    let (n_sh, n_sl) = swing_count;
    let (value, label) = match state {
        State::StrongBullish =>  ( 35.0, "Strong Bullish (consecutive HH+HL pairs)"),
        State::Bullish       =>  ( 22.0, "Bullish (HH + HL)"),
        State::Shifting      =>  (  0.0, "Shifting — recent swing contradicts prior trend pair"),
        State::Range         =>  (  0.0, "Range — no consistent HH/HL or LH/LL pattern"),
        State::Bearish       =>  (-22.0, "Bearish (LH + LL)"),
        State::StrongBearish =>  (-35.0, "Strong Bearish (consecutive LH+LL pairs)"),
    };
    let evidence = format!("State: {} · {} swing highs · {} swing lows", label, n_sh, n_sl);
    sig("structure_state", "Market Structure State", value, 35.0, evidence,
        "Market structure describes the price narrative independent of indicators. \
         Higher Highs + Higher Lows define a bullish structure; Lower Highs + Lower Lows \
         define a bearish structure. Strong tier = two consecutive aligned pairs, the \
         highest-edge environment. Shifting = the most recent swing contradicts the prior \
         trend — earliest structural warning of a reversal.")
}

/// BOS contribution scales with recency: full ±25 on the most recent bar, decaying to
/// half by ~10 bars ago.
fn last_bos_signal(events: &[Event], total_bars: usize) -> SignalContribution {
    let bos = events.iter().rev().find(|e| e.kind == EventType::Bos);
    let (value, evidence) = match bos {
        Some(e) => {
            let bars_ago = total_bars.saturating_sub(e.idx + 1) as f64;
            let decay = (1.0 / (1.0 + bars_ago / 10.0)).max(0.4);
            let raw = if e.bullish { 25.0 } else { -25.0 } * decay;
            let label = if e.bullish { "bullish continuation" } else { "bearish continuation" };
            let liveness = if e.is_live { " [live break on current bar]" } else { "" };
            (raw, format!("BOS {} {} bars ago{}", label, bars_ago as i64, liveness))
        }
        None => (0.0, "No BOS detected in window".into()),
    };
    sig("last_bos", "Last Break of Structure", value, 25.0, evidence,
        "A Break of Structure (BOS) is a continuation event — close above the prior swing \
         high in a bullish trend, or below the prior swing low in a bearish trend. BOS \
         confirms the prevailing direction with structural evidence. Recent BOS carries more \
         weight than stale BOS via a recency decay.")
}

fn last_choch_signal(events: &[Event], total_bars: usize) -> SignalContribution {
    let choch = events.iter().rev().find(|e| e.kind == EventType::Choch);
    let (value, evidence) = match choch {
        Some(e) => {
            let bars_ago = total_bars.saturating_sub(e.idx + 1) as f64;
            let decay = (1.0 / (1.0 + bars_ago / 8.0)).max(0.4);
            let raw = if e.bullish { 20.0 } else { -20.0 } * decay;
            let dir  = if e.bullish { "bullish flip" } else { "bearish flip" };
            let liveness = if e.is_live { " [live break on current bar]" } else { "" };
            (raw, format!("CHOCH {} {} bars ago{}", dir, bars_ago as i64, liveness))
        }
        None => (0.0, "No CHOCH detected in window".into()),
    };
    sig("last_choch", "Last Change of Character", value, 20.0, evidence,
        "A Change of Character (CHOCH) flips the prevailing structural trend — first close \
         above the prior swing high after a downtrend, or first close below the prior swing \
         low after an uptrend. It is the earliest structural evidence of a regime change. \
         Confidence decays faster than BOS since CHOCH age erodes its predictive value.")
}

fn pivot_context(candles: &[CandleV3]) -> SignalContribution {
    if candles.is_empty() {
        return sig("pivot_context", "Pivot Context", 0.0, 20.0,
            "No candles".into(),
            "Daily pivot levels frame the day's bull/bear bias.");
    }
    let c = candles.last().unwrap();
    if c.pivot_point <= 0.0 {
        return sig("pivot_context", "Pivot Context", 0.0, 20.0,
            "Pivot levels unavailable".into(),
            "Daily pivot levels frame the day's bull/bear bias.");
    }
    let atr = if c.atr14 > 0.0 { c.atr14 } else { 0.0005 };
    let mut v: f64 = 0.0;
    let mut parts: Vec<String> = Vec::new();

    if c.close > c.pivot_point { v += 6.0; parts.push(format!("above PP {:.4}", c.pivot_point)); }
    else                       { v -= 6.0; parts.push(format!("below PP {:.4}", c.pivot_point)); }

    if c.r1 > 0.0 && c.close > c.r1 {
        v += 8.0;
        parts.push(format!("broken R1 {:.4}", c.r1));
    } else if c.s1 > 0.0 && c.close < c.s1 {
        v -= 8.0;
        parts.push(format!("broken S1 {:.4}", c.s1));
    } else if c.r1 > 0.0 && (c.r1 - c.close).abs() < 0.3 * atr {
        v += 4.0;
        parts.push(format!("testing R1 {:.4}", c.r1));
    } else if c.s1 > 0.0 && (c.close - c.s1).abs() < 0.3 * atr {
        v -= 4.0;
        parts.push(format!("testing S1 {:.4}", c.s1));
    }

    if c.r2 > 0.0 && c.close > c.r2 { v += 6.0; parts.push(format!("above R2 {:.4}", c.r2)); }
    if c.s2 > 0.0 && c.close < c.s2 { v -= 6.0; parts.push(format!("below S2 {:.4}", c.s2)); }

    let value = v.max(-20.0).min(20.0);
    let evidence = format!("Close {:.4} · {}", c.close, parts.join(" · "));
    sig("pivot_context", "Pivot Context", value, 20.0, evidence,
        "Daily pivot points frame the session's directional bias. Close above the pivot \
         favours bulls; closes above R1/R2 indicate trend continuation. Closes below S1/S2 \
         indicate sustained selling. Proximity to a level often precedes either rejection \
         or breakout — both scored as meaningful structural cues.")
}

pub fn score(candles: &[CandleV3]) -> ScoreBlock {
    if candles.is_empty() {
        return ScoreBlock { value: 0.0, bias: Bias::Neutral, components: vec![] };
    }

    let raw     = fractal_swings(candles, SWING_LOOKBACK);
    let swings  = classify_swings(candles, raw);
    let state   = determine_state(&swings);

    let mut events = historical_events(&swings);
    // Determine prior trend from existing events to label any live event correctly.
    let prior_trend = events.last().map(|e| e.bullish);
    if let Some(live) = live_event(candles, &swings, prior_trend) {
        events.push(live);
    }

    let n_sh = swings.iter().filter(|s| s.kind == SwingType::High).count();
    let n_sl = swings.iter().filter(|s| s.kind == SwingType::Low ).count();

    let components = vec![
        state_signal(state, (n_sh, n_sl)),
        last_bos_signal(&events, candles.len()),
        last_choch_signal(&events, candles.len()),
        pivot_context(candles),
    ];
    let value = sum_components(&components);
    ScoreBlock { value, bias: bias_from_value(value), components }
}
