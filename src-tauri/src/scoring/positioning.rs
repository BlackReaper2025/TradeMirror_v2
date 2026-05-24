// Day-trading positioning derivation.
//
// Pure function: consumes a Synthesis + price/ATR/pivot context and produces
// the day-trading-tuned entry/SL/TP/risk for a 24-hour holding window.
//
// Replay-consistent: no I/O, no time queries. Same inputs always produce the
// same outputs. Snapshot persistence lives in positioning_store; this module
// owns only the derivation rules.

use serde::Serialize;
use super::Synthesis;

#[derive(Serialize, Clone, Debug)]
pub struct DayTradePositioning {
    pub direction:   String,        // "LONG" | "SHORT" | "NEUTRAL"
    pub entry:       f64,
    pub stop_loss:   f64,
    pub tp1:         f64,
    pub tp2:         f64,
    pub tp3:         f64,
    pub risk_pips:   f64,
    pub skipped:     bool,
    pub skip_reason: Option<String>,
}

/// Pip size for the quote convention of a given pair.
///   EUR/USD-style majors → 0.0001
///   JPY-quoted pairs     → 0.01
///   XAU (gold)           → 0.1
///   XAG (silver)         → 0.01
pub fn pip_size_for(pair: &str) -> f64 {
    let p = pair.to_uppercase();
    if p.contains("JPY")      { 0.01   }
    else if p.contains("XAU") { 0.1    }
    else if p.contains("XAG") { 0.01   }
    else                      { 0.0001 }
}

// ─── Day-trading rules (per AI_Positioning_Tracking_Plan §5) ──────────────────
const STOP_ATR_MULT:     f64 = 0.75;
const MIN_STOP_PIPS:     f64 = 15.0;
const MAX_STOP_PIPS:     f64 = 60.0;
// Reserved for future multilevel TP — currently disabled (single-TP system).
#[allow(dead_code)] const TP2_R_MULTIPLE: f64 = 1.5;
#[allow(dead_code)] const TP3_R_MULTIPLE: f64 = 2.5;
const MIN_CONFIDENCE:    f64 = 25.0;
const MIN_MTF_ALIGNMENT: f64 = 33.0;

/// Derive day-trading entry / SL / TPs from a Synthesis.
///
/// Arguments:
///   * `synth`     — already-computed Synthesis (direction, confidence, regime, mtf).
///   * `entry`     — current price (typically the daily close at snapshot time).
///   * `atr_pips`  — ATR(14) expressed in pips (caller divides ATR price by pip_size).
///   * `pip_size`  — pip unit for this pair (from `pip_size_for`).
///   * `pivot_r1`  — daily R1 pivot — TP1 target for LONG.
///   * `pivot_s1`  — daily S1 pivot — TP1 target for SHORT.
pub fn derive(
    synth:    &Synthesis,
    entry:    f64,
    atr_pips: f64,
    pip_size: f64,
    pivot_r1: f64,
    pivot_s1: f64,
) -> DayTradePositioning {
    // ── Risk filter ──────────────────────────────────────────────────────────
    let regime_str = format!("{:?}", synth.context.regime);
    let mtf_align  = synth.multi_timeframe.alignment_score;

    let skip_reason: Option<String> =
        if synth.direction == "NEUTRAL" {
            Some("direction=NEUTRAL".into())
        } else if synth.confidence < MIN_CONFIDENCE {
            Some(format!("confidence {:.1} < {}", synth.confidence, MIN_CONFIDENCE))
        } else if regime_str == "Compression" {
            Some("regime=Compression — breakouts unpredictable".into())
        } else if mtf_align < MIN_MTF_ALIGNMENT {
            Some(format!("mtf_alignment {:.0} < {}", mtf_align, MIN_MTF_ALIGNMENT))
        } else {
            None
        };

    if let Some(reason) = skip_reason {
        return DayTradePositioning {
            direction:   "NEUTRAL".into(),
            entry,
            stop_loss:   entry,
            tp1: entry, tp2: entry, tp3: entry,
            risk_pips:   0.0,
            skipped:     true,
            skip_reason: Some(reason),
        };
    }

    // ── Sizing ───────────────────────────────────────────────────────────────
    let stop_pips     = (STOP_ATR_MULT * atr_pips).max(MIN_STOP_PIPS).min(MAX_STOP_PIPS);
    let stop_distance = stop_pips * pip_size;

    let direction_sign: f64 = if synth.direction == "LONG" { 1.0 } else { -1.0 };
    let stop_loss = entry - direction_sign * stop_distance;

    // TP1: nearest pivot in direction. Fallback to 1R if the pivot is on the
    // wrong side of entry (rare, but happens when price has already moved past
    // the pivot intraday).
    let tp1_pivot = if synth.direction == "LONG" { pivot_r1 } else { pivot_s1 };
    let pivot_in_direction = (synth.direction == "LONG"  && tp1_pivot > entry)
                          || (synth.direction == "SHORT" && tp1_pivot < entry);
    let tp1 = if pivot_in_direction && tp1_pivot != 0.0 {
        tp1_pivot
    } else {
        entry + direction_sign * stop_distance // ≈ 1R fallback
    };

    // TP2 / TP3 disabled — single-TP system until multilevel TP logic is designed.
    // Mirror TP1 so the stored levels carry no separate meaning; the resolver
    // only ever acts on TP1 + SL.
    let tp2 = tp1;
    let tp3 = tp1;

    DayTradePositioning {
        direction:   synth.direction.clone(),
        entry,
        stop_loss,
        tp1, tp2, tp3,
        risk_pips:   stop_pips,
        skipped:     false,
        skip_reason: None,
    }
}
