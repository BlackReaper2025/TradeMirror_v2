// Centralized scoring engine.
//
// Pipeline: CandleV3[] -> per-component sub-scores (trend / momentum / structure)
//   + regime context (volatility classifier) -> regime-weighted composite ->
//   direction + confidence + RAG-friendly rationale.
//
// All sub-scores are signed in [-100, +100]. Bias = sign, conviction = magnitude.
// Scoring is replay-consistent: bar i never reads bar i+1.

pub mod trend;
pub mod momentum;
pub mod structure;
pub mod volatility;

use serde::Serialize;
use crate::analytics_v3_demo::CandleV3;

// ─── Shared types ─────────────────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Bias { Bullish, Bearish, Neutral }

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub enum RegimeState { StrongTrending, Trending, Expansion, Ranging, Compression }

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub enum VolatilityState { Expanding, Neutral, Contracting }

#[derive(Serialize, Clone, Debug)]
pub struct SignalContribution {
    pub id:             String,  // stable, RAG-indexable id, e.g. "ema_stack"
    pub name:           String,  // human label
    pub value:          f64,     // signed contribution
    pub max_abs:        f64,     // theoretical maximum |value|
    pub bias:           Bias,
    pub evidence:       String,  // numeric proof — what was measured
    pub why_it_matters: String,  // book-quotable rule text
}

#[derive(Serialize, Clone, Debug)]
pub struct ScoreBlock {
    pub value:      f64,         // signed, clamped to [-100, +100]
    pub bias:       Bias,
    pub components: Vec<SignalContribution>,
}

#[derive(Serialize, Clone, Debug)]
pub struct RegimeContext {
    pub regime:         RegimeState,
    pub volatility:     VolatilityState,
    pub adx:            f64,
    pub atr_ratio:      f64,    // ATR(14) / ATR SMA(20)
    pub bb_width_ratio: f64,    // current BB width / 20-bar avg BB width
    pub squeeze_on:     bool,
    pub squeeze_bars:   i32,
}

#[derive(Serialize, Clone, Debug)]
pub struct Rationale {
    pub component:      String,  // "trend" | "momentum" | "structure"
    pub signal_id:      String,
    pub signal_name:    String,
    pub evidence:       String,
    pub weight:         f64,     // |contribution| / sum(|contributions|) within component
    pub why_it_matters: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct TimeframeScore {
    pub timeframe:  String,      // "D" / "H4" / "H1"
    pub composite:  f64,
    pub direction:  String,      // "LONG" | "SHORT" | "NEUTRAL"
    pub confidence: f64,         // 0..100
    pub trend:      ScoreBlock,
    pub momentum:   ScoreBlock,
    pub structure:  ScoreBlock,
    pub context:    RegimeContext,
}

#[derive(Serialize, Clone, Debug)]
pub struct MultiTimeframe {
    pub daily:           TimeframeScore,
    pub h4:              TimeframeScore,
    pub h1:              TimeframeScore,
    pub mtf_composite:   f64,    // higher-TF-weighted blend
    pub alignment_score: f64,    // 0..100, % of TFs agreeing with mtf_direction
    pub mtf_direction:   String, // LONG / SHORT / NEUTRAL
}

#[derive(Serialize, Clone, Debug)]
pub struct Synthesis {
    pub timestamp:         String,
    pub symbol:            String,
    pub primary_timeframe: String,

    pub direction:  String,
    pub confidence: f64,
    pub composite:  f64,

    pub trend:     ScoreBlock,
    pub momentum:  ScoreBlock,
    pub structure: ScoreBlock,
    pub context:   RegimeContext,

    pub rationale: Vec<Rationale>,

    pub multi_timeframe: MultiTimeframe,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

pub(crate) fn bias_from_value(v: f64) -> Bias {
    if v >=  5.0 { Bias::Bullish }
    else if v <= -5.0 { Bias::Bearish }
    else { Bias::Neutral }
}

pub(crate) fn clamp(v: f64, lo: f64, hi: f64) -> f64 { v.max(lo).min(hi) }

/// Sums signed contributions and clamps to ±100.
pub(crate) fn sum_components(components: &[SignalContribution]) -> f64 {
    let raw: f64 = components.iter().map(|c| c.value).sum();
    clamp(raw, -100.0, 100.0)
}

// ─── Composite aggregation ────────────────────────────────────────────────────

/// Per-regime weights applied to the trend / momentum / structure sub-scores.
fn regime_weights(regime: &RegimeState) -> (f64, f64, f64) {
    match regime {
        RegimeState::StrongTrending => (1.4, 1.0, 1.0),  // trend dominance amplified
        RegimeState::Trending       => (1.2, 1.0, 1.0),  // trend dominates
        RegimeState::Expansion      => (1.0, 1.1, 0.9),  // volatility-up, no clean trend yet
        RegimeState::Ranging        => (0.5, 1.2, 0.9),  // mean-reversion favoured
        RegimeState::Compression    => (0.3, 0.3, 0.5),  // breakout-watch, low conviction
    }
}

/// Volatility-state multiplier applied to the final composite magnitude.
fn volatility_multiplier(vol: &VolatilityState) -> f64 {
    match vol {
        VolatilityState::Expanding   => 1.05,
        VolatilityState::Neutral     => 1.00,
        VolatilityState::Contracting => 0.85,
    }
}

/// Combine sub-scores into a composite using the current regime + volatility.
pub(crate) fn composite_score(
    trend: &ScoreBlock,
    momentum: &ScoreBlock,
    structure: &ScoreBlock,
    context: &RegimeContext,
) -> f64 {
    let (wt, wm, ws) = regime_weights(&context.regime);
    let sum_w = wt + wm + ws;
    let raw   = (trend.value * wt + momentum.value * wm + structure.value * ws) / sum_w;
    clamp(raw * volatility_multiplier(&context.volatility), -100.0, 100.0)
}

pub(crate) fn direction_from(composite: f64) -> String {
    if composite >=  5.0 { "LONG".into() }
    else if composite <= -5.0 { "SHORT".into() }
    else { "NEUTRAL".into() }
}

// ─── Rationale builder ────────────────────────────────────────────────────────

fn build_rationale(
    trend: &ScoreBlock,
    momentum: &ScoreBlock,
    structure: &ScoreBlock,
) -> Vec<Rationale> {
    let mut out = Vec::with_capacity(32);
    for (component_name, block) in &[("trend", trend), ("momentum", momentum), ("structure", structure)] {
        let total_abs: f64 = block.components.iter().map(|c| c.value.abs()).sum();
        for c in &block.components {
            // Skip non-contributing zero-value signals.
            if c.value.abs() < 0.001 { continue; }
            let weight = if total_abs > 0.0 { c.value.abs() / total_abs } else { 0.0 };
            out.push(Rationale {
                component:      (*component_name).into(),
                signal_id:      c.id.clone(),
                signal_name:    c.name.clone(),
                evidence:       c.evidence.clone(),
                weight,
                why_it_matters: c.why_it_matters.clone(),
            });
        }
    }
    // Order by absolute contribution magnitude — most influential first.
    out.sort_by(|a, b| b.weight.partial_cmp(&a.weight).unwrap_or(std::cmp::Ordering::Equal));
    out
}

// ─── Per-timeframe scoring ────────────────────────────────────────────────────

pub fn score_timeframe(candles: &[CandleV3], timeframe: &str) -> TimeframeScore {
    let context = volatility::classify_context(candles);
    let trend     = trend::score(candles);
    let momentum  = momentum::score(candles);
    let structure = structure::score(candles);

    let composite = composite_score(&trend, &momentum, &structure, &context);
    TimeframeScore {
        timeframe:  timeframe.into(),
        composite,
        direction:  direction_from(composite),
        confidence: composite.abs(),
        trend, momentum, structure, context,
    }
}

// ─── Multi-timeframe orchestrator ─────────────────────────────────────────────

/// MTF weights — daily anchors, lower TFs add nuance.
const MTF_W_D:  f64 = 0.50;
const MTF_W_H4: f64 = 0.30;
const MTF_W_H1: f64 = 0.20;

pub fn build_synthesis(
    primary_tf: &str,
    symbol: &str,
    candles_d:  &[CandleV3],
    candles_h4: &[CandleV3],
    candles_h1: &[CandleV3],
) -> Synthesis {
    let d  = score_timeframe(candles_d,  "D");
    let h4 = score_timeframe(candles_h4, "H4");
    let h1 = score_timeframe(candles_h1, "H1");

    let mtf_composite = d.composite * MTF_W_D + h4.composite * MTF_W_H4 + h1.composite * MTF_W_H1;
    let mtf_direction = direction_from(mtf_composite);
    let agree_d  = if d.direction  == mtf_direction { 1.0 } else { 0.0 };
    let agree_h4 = if h4.direction == mtf_direction { 1.0 } else { 0.0 };
    let agree_h1 = if h1.direction == mtf_direction { 1.0 } else { 0.0 };
    let alignment_score = (agree_d + agree_h4 + agree_h1) / 3.0 * 100.0;

    // Primary block = the requested TF.
    let primary = match primary_tf {
        "H4" => &h4,
        "H1" => &h1,
        _    => &d,
    };

    let rationale = build_rationale(&primary.trend, &primary.momentum, &primary.structure);

    let last_ts = candles_d.last().map(|c| c.timestamp.clone()).unwrap_or_default();

    Synthesis {
        timestamp:         last_ts,
        symbol:            symbol.into(),
        primary_timeframe: primary_tf.into(),

        direction:  primary.direction.clone(),
        confidence: primary.confidence,
        composite:  primary.composite,

        trend:     primary.trend.clone(),
        momentum:  primary.momentum.clone(),
        structure: primary.structure.clone(),
        context:   primary.context.clone(),

        rationale,

        multi_timeframe: MultiTimeframe {
            daily: d, h4, h1,
            mtf_composite,
            alignment_score,
            mtf_direction,
        },
    }
}
