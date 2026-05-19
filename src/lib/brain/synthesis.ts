// TradeMirror — Synthesis bridge
//
// Owns:
//   • TypeScript mirror of the Rust scoring::Synthesis struct
//   • fetchSynthesis() — Tauri command wrapper
//   • synthesisToAnalysisResult() — maps the new Synthesis into the legacy AnalysisResult
//     shape so the existing AI Synthesis panel can render without restructuring.
//
// Positioning (entry / SL / TPs) is computed locally from the current candle + ATR + pivots
// since it isn't part of the Synthesis itself.

import { invoke } from '@tauri-apps/api/core';
import type { AnalysisResult, SignalGroup } from '../../data/analyticsDataV3';
import type { SheetRow } from '../googleSheets';

// ─── TS types mirroring src-tauri/src/scoring ────────────────────────────────

export type Bias = 'bullish' | 'bearish' | 'neutral';
export type RegimeState = 'StrongTrending' | 'Trending' | 'Expansion' | 'Ranging' | 'Compression';
export type VolatilityState = 'Expanding' | 'Neutral' | 'Contracting';
export type Direction = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface SignalContribution {
  id:             string;
  name:           string;
  value:          number;
  max_abs:        number;
  bias:           Bias;
  evidence:       string;
  why_it_matters: string;
}

export interface ScoreBlock {
  value:      number;
  bias:       Bias;
  components: SignalContribution[];
}

export interface RegimeContext {
  regime:         RegimeState;
  volatility:     VolatilityState;
  adx:            number;
  atr_ratio:      number;
  bb_width_ratio: number;
  squeeze_on:     boolean;
  squeeze_bars:   number;
}

export interface Rationale {
  component:      'trend' | 'momentum' | 'structure';
  signal_id:      string;
  signal_name:    string;
  evidence:       string;
  weight:         number;
  why_it_matters: string;
}

export interface TimeframeScore {
  timeframe:  string;
  composite:  number;
  direction:  Direction;
  confidence: number;
  trend:      ScoreBlock;
  momentum:   ScoreBlock;
  structure:  ScoreBlock;
  context:    RegimeContext;
}

export interface MultiTimeframe {
  daily:           TimeframeScore;
  h4:              TimeframeScore;
  h1:              TimeframeScore;
  mtf_composite:   number;
  alignment_score: number;
  mtf_direction:   Direction;
}

export interface Synthesis {
  timestamp:         string;
  symbol:            string;
  primary_timeframe: string;

  direction:  Direction;
  confidence: number;
  composite:  number;

  trend:     ScoreBlock;
  momentum:  ScoreBlock;
  structure: ScoreBlock;
  context:   RegimeContext;

  rationale: Rationale[];

  multi_timeframe: MultiTimeframe;
}

// ─── Tauri command wrapper ───────────────────────────────────────────────────

export async function fetchSynthesis(pair: string, tf: '1D' | '4H' | '1H'): Promise<Synthesis> {
  return invoke<Synthesis>('get_synthesis', { pair, tf });
}

// ─── Synthesis → legacy AnalysisResult mapper ────────────────────────────────

function biasFromBlock(block: ScoreBlock): Bias { return block.bias; }

function evidenceLines(block: ScoreBlock, limit = 3): string[] {
  // Sort by contribution magnitude and surface the top reasons as condition strings.
  return [...block.components]
    .filter(c => Math.abs(c.value) > 0.001)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, limit)
    .map(c => `${c.name}: ${c.evidence}`);
}

function volatilityConditions(ctx: RegimeContext): string[] {
  const conditions: string[] = [
    `Regime: ${ctx.regime}`,
    `Volatility: ${ctx.volatility} (ATR ${ctx.atr_ratio.toFixed(2)}× avg)`,
    `BB width ${ctx.bb_width_ratio.toFixed(2)}× 20-bar avg` +
      (ctx.squeeze_on ? ` · Squeeze ON (${ctx.squeeze_bars} bars)` : ''),
  ];
  return conditions;
}

function volatilityBias(ctx: RegimeContext): Bias {
  if (ctx.regime === 'Compression')                    return 'neutral';
  if (ctx.volatility === 'Expanding')                  return 'bullish';   // expansion supports breakouts/trends
  if (ctx.volatility === 'Contracting')                return 'neutral';
  return 'neutral';
}

function positioning(current: SheetRow, direction: Direction): {
  entry: number; stopLoss: number; tp1: number; tp2: number; tp3: number; riskReward: number;
} {
  const entry    = current.close;
  const atr      = current.atr14 > 0 ? current.atr14 : 0.0050;
  const isLong   = direction !== 'SHORT';

  const stopLoss = isLong
    ? parseFloat((entry - 1.5 * atr).toFixed(5))
    : parseFloat((entry + 1.5 * atr).toFixed(5));

  const r1 = current.r1 || entry + atr;
  const r2 = current.r2 || entry + 2 * atr;
  const r3 = current.r3 || entry + 3 * atr;
  const s1 = current.s1 || entry - atr;
  const s2 = current.s2 || entry - 2 * atr;
  const s3 = current.s3 || entry - 3 * atr;

  const tp1 = isLong ? r1 : s1;
  const tp2 = isLong ? r2 : s2;
  const tp3 = isLong ? r3 : s3;

  const riskReward = stopLoss !== entry
    ? parseFloat((Math.abs(tp1 - entry) / Math.abs(entry - stopLoss)).toFixed(1))
    : 0;

  return { entry, stopLoss, tp1, tp2, tp3, riskReward };
}

export function synthesisToAnalysisResult(synth: Synthesis, current: SheetRow): AnalysisResult {
  // Direction: panel only renders LONG / SHORT — pick by composite sign when NEUTRAL.
  const direction: 'LONG' | 'SHORT' = synth.direction === 'SHORT' ? 'SHORT'
    : synth.direction === 'LONG' ? 'LONG'
    : synth.composite < 0 ? 'SHORT' : 'LONG';

  const { entry, stopLoss, tp1, tp2, tp3, riskReward } = positioning(current, direction);

  // long/shortScore: panel uses these as a quick visible numeric. Use |composite|/10
  // for the winning side and zero for the loser to keep the badge readable.
  const mag        = Math.round(Math.abs(synth.composite) / 10);
  const longScore  = direction === 'LONG'  ? mag : 0;
  const shortScore = direction === 'SHORT' ? mag : 0;

  // Indicator chips: top-magnitude contributors only — the compact panel row
  // can't grow beyond its grid height, so we cap to the most influential signals
  // (|value| >= 5) and limit each side to 4 chips. Full list remains in
  // synth.rationale for the expanded view / RAG.
  const CHIP_MIN_MAG = 5;
  const CHIP_PER_SIDE_MAX = 4;
  const ranked = [...synth.trend.components, ...synth.momentum.components, ...synth.structure.components]
    .filter(c => Math.abs(c.value) >= CHIP_MIN_MAG)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const longIndicators  = ranked.filter(c => c.bias === 'bullish').slice(0, CHIP_PER_SIDE_MAX).map(c => c.name);
  const shortIndicators = ranked.filter(c => c.bias === 'bearish').slice(0, CHIP_PER_SIDE_MAX).map(c => c.name);

  const trendGroup: SignalGroup = {
    bias:       biasFromBlock(synth.trend),
    score:      Math.round(Math.abs(synth.trend.value) / 10),
    conditions: evidenceLines(synth.trend, 4),
  };
  const momentumGroup: SignalGroup = {
    bias:       biasFromBlock(synth.momentum),
    score:      Math.round(Math.abs(synth.momentum.value) / 10),
    conditions: evidenceLines(synth.momentum, 4),
  };
  const structureGroup: SignalGroup = {
    bias:       biasFromBlock(synth.structure),
    score:      Math.round(Math.abs(synth.structure.value) / 10),
    conditions: evidenceLines(synth.structure, 4),
  };
  const volatilityGroup: SignalGroup = {
    bias:       volatilityBias(synth.context),
    score:      0,
    conditions: volatilityConditions(synth.context),
  };

  return {
    direction,
    confidence: Math.round(synth.confidence),
    entry, stopLoss, tp1, tp2, tp3, riskReward,
    longScore, shortScore,
    longIndicators, shortIndicators,
    signals: {
      trend:      trendGroup,
      momentum:   momentumGroup,
      structure:  structureGroup,
      volatility: volatilityGroup,
    },
  };
}

// ─── Convenience accessors for follow-up consumers (RAG, MTF panel) ──────────

/** Top N most influential rationale items across all components. */
export function topRationale(synth: Synthesis, n = 5): Rationale[] {
  return synth.rationale.slice(0, n);
}

/** Compact MTF alignment summary suitable for a header strip. */
export function mtfSummary(synth: Synthesis): {
  daily: { dir: Direction; conf: number };
  h4:    { dir: Direction; conf: number };
  h1:    { dir: Direction; conf: number };
  alignment: number;
  mtfDirection: Direction;
} {
  const m = synth.multi_timeframe;
  return {
    daily: { dir: m.daily.direction, conf: Math.round(m.daily.confidence) },
    h4:    { dir: m.h4.direction,    conf: Math.round(m.h4.confidence) },
    h1:    { dir: m.h1.direction,    conf: Math.round(m.h1.confidence) },
    alignment:    Math.round(m.alignment_score),
    mtfDirection: m.mtf_direction,
  };
}
