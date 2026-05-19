// Structure sub-score. Signed range [-100, +100].
//
// Components (max |contribution|):
//   structure_state   ±35    Bullish / Bearish / Range from swing sequencing
//   last_bos          ±25    Most recent Break of Structure
//   last_choch        ±20    Most recent Change of Character (regime flip)
//   pivot_context     ±20    Close vs prior-session pivot levels (R1/S1)
//
// Swing detection uses N=3 lookback on each side (default).

use crate::analytics_v3_demo::CandleV3;
use super::{Bias, ScoreBlock, SignalContribution, bias_from_value, sum_components};

#[derive(Clone, Copy, PartialEq, Eq)]
enum SwingType { High, Low }

#[derive(Clone, Copy)]
struct Swing { idx: usize, kind: SwingType, price: f64 }

#[derive(Clone, Copy, PartialEq, Eq)]
enum EventType { Bos, Choch }

#[derive(Clone, Copy)]
#[allow(dead_code)] // idx retained for future "BOS at bar X" surfacing
struct Event { idx: usize, kind: EventType, bullish: bool }

#[derive(Clone, Copy, PartialEq, Eq)]
enum State { Bullish, Bearish, Range }

fn detect_swings(candles: &[CandleV3], n: usize) -> Vec<Swing> {
    let len = candles.len();
    if len < n * 2 + 1 { return vec![]; }
    let mut swings = Vec::new();
    for i in n..(len - n) {
        let mut sh = true;
        let mut sl = true;
        for k in 1..=n {
            if candles[i - k].high >= candles[i].high || candles[i + k].high >= candles[i].high { sh = false; }
            if candles[i - k].low  <= candles[i].low  || candles[i + k].low  <= candles[i].low  { sl = false; }
        }
        if sh { swings.push(Swing { idx: i, kind: SwingType::High, price: candles[i].high }); }
        if sl { swings.push(Swing { idx: i, kind: SwingType::Low,  price: candles[i].low  }); }
    }
    swings.sort_by_key(|s| s.idx);
    // Enforce alternation; collapse consecutive same-type swings, keeping the more extreme one.
    let mut alt: Vec<Swing> = Vec::new();
    for s in swings {
        if let Some(prev) = alt.last_mut() {
            if prev.kind == s.kind {
                let replace = match s.kind {
                    SwingType::High => s.price > prev.price,
                    SwingType::Low  => s.price < prev.price,
                };
                if replace { *prev = s; }
                continue;
            }
        }
        alt.push(s);
    }
    alt
}

fn detect_state(swings: &[Swing]) -> State {
    let highs: Vec<&Swing> = swings.iter().filter(|s| s.kind == SwingType::High).collect();
    let lows:  Vec<&Swing> = swings.iter().filter(|s| s.kind == SwingType::Low ).collect();
    if highs.len() < 2 || lows.len() < 2 { return State::Range; }
    let last_h = highs[highs.len() - 1].price;
    let prev_h = highs[highs.len() - 2].price;
    let last_l = lows [lows.len()  - 1].price;
    let prev_l = lows [lows.len()  - 2].price;
    let hh = last_h > prev_h;
    let hl = last_l > prev_l;
    let lh = last_h < prev_h;
    let ll = last_l < prev_l;
    if hh && hl { State::Bullish }
    else if lh && ll { State::Bearish }
    else { State::Range }
}

fn detect_events(swings: &[Swing]) -> Vec<Event> {
    let mut events = Vec::new();
    let mut trend: Option<bool> = None; // Some(true) = bullish trend, Some(false) = bearish trend
    let mut last_high: Option<f64> = None;
    let mut last_low:  Option<f64> = None;
    for s in swings {
        match s.kind {
            SwingType::High => {
                if let Some(p) = last_high {
                    if s.price > p {
                        let kind = match trend { Some(false) => EventType::Choch, _ => EventType::Bos };
                        events.push(Event { idx: s.idx, kind, bullish: true });
                        trend = Some(true);
                    }
                }
                last_high = Some(s.price);
            }
            SwingType::Low => {
                if let Some(p) = last_low {
                    if s.price < p {
                        let kind = match trend { Some(true) => EventType::Choch, _ => EventType::Bos };
                        events.push(Event { idx: s.idx, kind, bullish: false });
                        trend = Some(false);
                    }
                }
                last_low = Some(s.price);
            }
        }
    }
    events
}

fn sig(id: &str, name: &str, value: f64, max_abs: f64, evidence: String, why: &str) -> SignalContribution {
    SignalContribution {
        id: id.into(), name: name.into(), value, max_abs,
        bias: bias_from_value(value), evidence, why_it_matters: why.into(),
    }
}

fn state_signal(state: State, swing_count: (usize, usize)) -> SignalContribution {
    let (n_sh, n_sl) = swing_count;
    let value = match state {
        State::Bullish =>  35.0,
        State::Bearish => -35.0,
        State::Range   =>   0.0,
    };
    let label = match state {
        State::Bullish => "Bullish (HH + HL)",
        State::Bearish => "Bearish (LH + LL)",
        State::Range   => "Range — no consistent HH/HL or LH/LL pattern",
    };
    let evidence = format!("State: {} · {} swing highs · {} swing lows", label, n_sh, n_sl);
    sig("structure_state", "Market Structure State", value, 35.0, evidence,
        "Market structure describes the price narrative independent of indicators. \
         Higher Highs + Higher Lows define a bullish structure; Lower Highs + Lower Lows \
         define a bearish structure. Trades aligned with structure carry the highest edge \
         because they trade with the path of least resistance.")
}

fn last_bos_signal(events: &[Event], swings_len: usize) -> SignalContribution {
    // Find most recent BOS
    let bos = events.iter().rev().find(|e| e.kind == EventType::Bos);
    let (value, evidence) = match bos {
        Some(e) if e.bullish => (
             25.0,
            format!("Most recent BOS: bullish continuation at swing #{}", swings_len.saturating_sub(1)),
        ),
        Some(e) if !e.bullish => (
            -25.0,
            format!("Most recent BOS: bearish continuation at swing #{}", swings_len.saturating_sub(1)),
        ),
        _ => (0.0, "No BOS detected in window".into()),
    };
    sig("last_bos", "Last Break of Structure", value, 25.0, evidence,
        "A Break of Structure (BOS) is a continuation event — price prints a new swing high \
         in an established uptrend (or a new swing low in a downtrend). BOS confirms the \
         prevailing direction with structural evidence, not just indicator signals.")
}

fn last_choch_signal(events: &[Event]) -> SignalContribution {
    let choch = events.iter().rev().find(|e| e.kind == EventType::Choch);
    let (value, evidence) = match choch {
        Some(e) if e.bullish => (
             20.0,
            "Bullish CHOCH — regime flipped from bearish to bullish".into(),
        ),
        Some(e) if !e.bullish => (
            -20.0,
            "Bearish CHOCH — regime flipped from bullish to bearish".into(),
        ),
        _ => (0.0, "No CHOCH detected in window".into()),
    };
    sig("last_choch", "Last Change of Character", value, 20.0, evidence,
        "A Change of Character (CHOCH) is the first structural signal of a regime flip — \
         the first higher-high in what was a downtrend, or the first lower-low in what was \
         an uptrend. It is the earliest evidence of a trend reversal at the structure level.")
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

    // Close above pivot = bullish; below = bearish.
    if c.close > c.pivot_point { v += 6.0; parts.push(format!("above PP {:.4}", c.pivot_point)); }
    else                       { v -= 6.0; parts.push(format!("below PP {:.4}", c.pivot_point)); }

    // R1 / S1 proximity or break.
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

    // R2 / S2 break = stronger context.
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
    let swings = detect_swings(candles, 3);
    let state  = detect_state(&swings);
    let events = detect_events(&swings);

    let n_sh = swings.iter().filter(|s| s.kind == SwingType::High).count();
    let n_sl = swings.iter().filter(|s| s.kind == SwingType::Low).count();

    let components = vec![
        state_signal(state, (n_sh, n_sl)),
        last_bos_signal(&events, swings.len()),
        last_choch_signal(&events),
        pivot_context(candles),
    ];
    let value = sum_components(&components);
    ScoreBlock { value, bias: bias_from_value(value), components }
}
