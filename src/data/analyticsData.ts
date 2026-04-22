import { useSyncExternalStore } from 'react';

export interface SignalGroup {
  bias: "bullish" | "bearish" | "neutral";
  score: number;
  conditions: string[];
}

export interface AnalysisResult {
  direction: "LONG" | "SHORT";
  confidence: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskReward: number;
  longScore: number;
  shortScore: number;
  signals: {
    trend: SignalGroup;
    momentum: SignalGroup;
    structure: SignalGroup;
    volatility: SignalGroup;
  };
}

export interface EurusdSnapshot {
  timestamp: string;
  symbol: string;
  open: number; high: number; low: number; close: number;
  volume: number; volumeSma20: number;
  ema9: number; ema20: number; ema50: number; sma200: number;
  macd: number; macdSignal: number; macdHistogram: number;
  adx: number; diPlus: number; diMinus: number;
  rsi14: number; rsiTrend: "UP" | "DOWN" | "FLAT";
  stochRsiK: number; stochRsiD: number;
  cci: number;
  pivotPoint: number;
  r1: number; r2: number; r3: number;
  s1: number; s2: number; s3: number;
  kijun: number; tenkan: number; senkouA: number; senkouB: number;
  atr14: number;
  bbUpper: number; bbMiddle: number; bbLower: number;
  keltnerUpper: number; keltnerMiddle: number; keltnerLower: number;
  histVol: number;
  priceAboveCloud: boolean;
  priceAboveKijun: boolean;
  insideBar: boolean;
  rsiDivergence: boolean;
}

export const eurusdSnapshot: EurusdSnapshot = {
  timestamp: "2026-04-20T18:00:00Z",
  symbol: "EURUSD",
  open: 1.0832, high: 1.0889, low: 1.0808, close: 1.0871,
  volume: 142800, volumeSma20: 128500,
  ema9: 1.0855, ema20: 1.0840, ema50: 1.0812, sma200: 1.0765,
  macd: 0.00142, macdSignal: 0.00098, macdHistogram: 0.00044,
  adx: 28.4, diPlus: 24.1, diMinus: 16.3,
  rsi14: 58.2, rsiTrend: "UP",
  stochRsiK: 72.1, stochRsiD: 65.4,
  cci: 124.5,
  pivotPoint: 1.0848,
  r1: 1.0889, r2: 1.0925, r3: 1.0966,
  s1: 1.0807, s2: 1.0771, s3: 1.0730,
  kijun: 1.0839, tenkan: 1.0862, senkouA: 1.0821, senkouB: 1.0798,
  atr14: 0.00614,
  bbUpper: 1.0934, bbMiddle: 1.0840, bbLower: 1.0746,
  keltnerUpper: 1.0921, keltnerMiddle: 1.0840, keltnerLower: 1.0759,
  histVol: 6.8,
  priceAboveCloud: true,
  priceAboveKijun: true,
  insideBar: false,
  rsiDivergence: false,
};

export const analysisResult: AnalysisResult = {
  direction: "LONG",
  confidence: 78,
  entry: 1.0871,
  stopLoss: 1.0808,
  tp1: 1.0925,
  tp2: 1.0966,
  tp3: 1.1010,
  riskReward: 2.7,
  longScore: 7,
  shortScore: 2,
  signals: {
    trend: {
      bias: "bullish",
      score: 5,
      conditions: [
        "Price > EMA 9 / 20 / 50 / SMA 200",
        "MACD 0.00142 > Signal 0.00098",
        "Histogram expanding (+0.00044)",
        "ADX 28.4 — strong trend",
        "+DI 24.1 > −DI 16.3",
      ],
    },
    momentum: {
      bias: "bullish",
      score: 2,
      conditions: [
        "RSI 58.2 — rising, bullish zone",
        "StochRSI K 72.1 above D 65.4",
        "CCI 124.5 — bullish momentum",
      ],
    },
    structure: {
      bias: "bullish",
      score: 3,
      conditions: [
        "Price above Ichimoku cloud",
        "Price above Kijun 1.0839",
        "Price testing R1 1.0889",
      ],
    },
    volatility: {
      bias: "neutral",
      score: 0,
      conditions: [
        "ATR 0.0061 — moderate",
        "Price within Bollinger bands",
        "No volatility spike detected",
      ],
    },
  },
};

export const priceHistory = [
  { time: "06:00", price: 1.0803, ema9: 1.0798 },
  { time: "07:00", price: 1.0811, ema9: 1.0803 },
  { time: "08:00", price: 1.0818, ema9: 1.0808 },
  { time: "09:00", price: 1.0824, ema9: 1.0813 },
  { time: "10:00", price: 1.0829, ema9: 1.0818 },
  { time: "11:00", price: 1.0820, ema9: 1.0819 },
  { time: "12:00", price: 1.0815, ema9: 1.0818 },
  { time: "13:00", price: 1.0826, ema9: 1.0819 },
  { time: "14:00", price: 1.0833, ema9: 1.0821 },
  { time: "15:00", price: 1.0841, ema9: 1.0824 },
  { time: "16:00", price: 1.0848, ema9: 1.0827 },
  { time: "17:00", price: 1.0852, ema9: 1.0830 },
  { time: "18:00", price: 1.0858, ema9: 1.0835 },
  { time: "19:00", price: 1.0865, ema9: 1.0839 },
  { time: "20:00", price: 1.0860, ema9: 1.0842 },
  { time: "21:00", price: 1.0854, ema9: 1.0843 },
  { time: "22:00", price: 1.0862, ema9: 1.0845 },
  { time: "23:00", price: 1.0869, ema9: 1.0848 },
  { time: "00:00", price: 1.0863, ema9: 1.0849 },
  { time: "01:00", price: 1.0870, ema9: 1.0851 },
  { time: "02:00", price: 1.0876, ema9: 1.0854 },
  { time: "03:00", price: 1.0871, ema9: 1.0856 },
  { time: "04:00", price: 1.0868, ema9: 1.0857 },
  { time: "05:00", price: 1.0874, ema9: 1.0859 },
  { time: "06:00", price: 1.0879, ema9: 1.0862 },
  { time: "07:00", price: 1.0883, ema9: 1.0864 },
  { time: "08:00", price: 1.0878, ema9: 1.0865 },
  { time: "09:00", price: 1.0884, ema9: 1.0867 },
  { time: "10:00", price: 1.0889, ema9: 1.0870 },
  { time: "11:00", price: 1.0871, ema9: 1.0871 },
];

// ─── Signal tags ─────────────────────────────────────────────────────────────
export const signalTags: Array<{ label: string; active: boolean; bias: "bullish" | "bearish" | "neutral" }> = [
  { label: "EMA Stack",   active: true,  bias: "bullish" },
  { label: "MACD Bull",   active: true,  bias: "bullish" },
  { label: "RSI Rising",  active: true,  bias: "bullish" },
  { label: "ADX Strong",  active: true,  bias: "bullish" },
  { label: "+DI > −DI",   active: true,  bias: "bullish" },
  { label: "Above Cloud", active: true,  bias: "bullish" },
  { label: "Volume High", active: true,  bias: "bullish" },
  { label: "Near R1",     active: false, bias: "bearish" },
  { label: "StochRSI OB", active: false, bias: "bearish" },
];

// ─── Historical signal outcomes ───────────────────────────────────────────────
export type SignalOutcome = "win" | "loss" | "pending";

export const signalHistory: SignalOutcome[] = [
  "win",  "win",  "loss", "win",  "win",  "win",  "loss", "win",  "loss", "win",
  "win",  "win",  "win",  "loss", "win",  "win",  "win",  "loss", "win",  "win",
  "loss", "win",  "win",  "win",  "win",  "loss", "win",  "win",  "win",  "pending",
];

export const historicalAccuracy = 82;

// ─── Evidence cards ───────────────────────────────────────────────────────────
export type Status = "bullish" | "bearish" | "neutral";

export interface EvidenceValue {
  label: string;
  value: string;
  status: Status;
}

export interface EvidenceCard {
  id: string;
  label: string;
  bias: Status;
  values: EvidenceValue[];
}

export const evidenceCards: EvidenceCard[] = [
  {
    id: "trend",
    label: "Trend",
    bias: "bullish",
    values: [
      { label: "EMA Stack",    value: "Aligned Up",   status: "bullish" },
      { label: "SMA 200",      value: "1.0765 below", status: "bullish" },
      { label: "Trend Str.",   value: "Strong",        status: "bullish" },
    ],
  },
  {
    id: "macd",
    label: "MACD",
    bias: "bullish",
    values: [
      { label: "MACD Line",  value: "+14.2",        status: "bullish" },
      { label: "Signal",     value: "+9.8",         status: "bullish" },
      { label: "Histogram",  value: "Expanding Up", status: "bullish" },
    ],
  },
  {
    id: "momentum",
    label: "Momentum",
    bias: "bullish",
    values: [
      { label: "RSI (14)",    value: "58.2 Up",  status: "bullish" },
      { label: "StochRSI K",  value: "72.1",    status: "bullish" },
      { label: "CCI",         value: "+124.5",  status: "bullish" },
    ],
  },
  {
    id: "volatility",
    label: "Volatility",
    bias: "neutral",
    values: [
      { label: "ATR (14)",  value: "0.00614",   status: "neutral" },
      { label: "BB Width",  value: "Moderate",  status: "neutral" },
      { label: "Hist. Vol", value: "6.8%",      status: "neutral" },
    ],
  },
  {
    id: "directional",
    label: "Directional",
    bias: "bullish",
    values: [
      { label: "+DI",  value: "24.1",        status: "bullish" },
      { label: "−DI",  value: "16.3",        status: "bearish" },
      { label: "ADX",  value: "28.4 strong", status: "bullish" },
    ],
  },
];

// ─── Directional chart data (20 bars, H4, +DI > -DI, ADX rising) ─────────────
export interface DirectionalPoint {
  i:       number;
  date?:   string;
  diPlus:  number;
  diMinus: number;
  adx:     number;
}

export const directionalChartData: DirectionalPoint[] = [
  { i:  1, diPlus: 14.2, diMinus: 22.1, adx: 16.4 },
  { i:  2, diPlus: 15.1, diMinus: 21.4, adx: 17.2 },
  { i:  3, diPlus: 15.8, diMinus: 20.6, adx: 17.8 },
  { i:  4, diPlus: 16.9, diMinus: 20.1, adx: 18.5 },
  { i:  5, diPlus: 17.4, diMinus: 19.8, adx: 19.3 },
  { i:  6, diPlus: 18.2, diMinus: 19.2, adx: 19.8 },
  { i:  7, diPlus: 19.5, diMinus: 18.7, adx: 20.6 },
  { i:  8, diPlus: 20.3, diMinus: 18.1, adx: 21.4 },
  { i:  9, diPlus: 21.1, diMinus: 17.6, adx: 22.3 },
  { i: 10, diPlus: 21.8, diMinus: 17.2, adx: 23.1 },
  { i: 11, diPlus: 22.4, diMinus: 17.0, adx: 24.0 },
  { i: 12, diPlus: 22.9, diMinus: 16.8, adx: 24.8 },
  { i: 13, diPlus: 23.3, diMinus: 16.5, adx: 25.6 },
  { i: 14, diPlus: 23.6, diMinus: 16.4, adx: 26.4 },
  { i: 15, diPlus: 23.9, diMinus: 16.5, adx: 27.1 },
  { i: 16, diPlus: 24.0, diMinus: 16.6, adx: 27.6 },
  { i: 17, diPlus: 24.2, diMinus: 16.4, adx: 28.0 },
  { i: 18, diPlus: 24.3, diMinus: 16.3, adx: 28.2 },
  { i: 19, diPlus: 24.1, diMinus: 16.4, adx: 28.3 },
  { i: 20, diPlus: 24.1, diMinus: 16.3, adx: 28.4 },
];

// ─── Volatility chart data (20 bars, H4, Bollinger Bands) ────────────────────
export interface VolatilityPoint {
  i:        number;
  date?:    string;
  price:    number;
  bbUpper:  number;
  bbMiddle: number;
  bbLower:  number;
}

export const volatilityChartData: VolatilityPoint[] = [
  { i:  1, price: 1.0712, bbUpper: 1.0754, bbMiddle: 1.0698, bbLower: 1.0642 },
  { i:  2, price: 1.0724, bbUpper: 1.0761, bbMiddle: 1.0703, bbLower: 1.0645 },
  { i:  3, price: 1.0718, bbUpper: 1.0758, bbMiddle: 1.0706, bbLower: 1.0654 },
  { i:  4, price: 1.0731, bbUpper: 1.0769, bbMiddle: 1.0711, bbLower: 1.0653 },
  { i:  5, price: 1.0745, bbUpper: 1.0782, bbMiddle: 1.0718, bbLower: 1.0654 },
  { i:  6, price: 1.0739, bbUpper: 1.0778, bbMiddle: 1.0721, bbLower: 1.0664 },
  { i:  7, price: 1.0758, bbUpper: 1.0795, bbMiddle: 1.0728, bbLower: 1.0661 },
  { i:  8, price: 1.0771, bbUpper: 1.0806, bbMiddle: 1.0737, bbLower: 1.0668 },
  { i:  9, price: 1.0765, bbUpper: 1.0803, bbMiddle: 1.0743, bbLower: 1.0683 },
  { i: 10, price: 1.0779, bbUpper: 1.0815, bbMiddle: 1.0750, bbLower: 1.0685 },
  { i: 11, price: 1.0792, bbUpper: 1.0826, bbMiddle: 1.0758, bbLower: 1.0690 },
  { i: 12, price: 1.0787, bbUpper: 1.0824, bbMiddle: 1.0763, bbLower: 1.0702 },
  { i: 13, price: 1.0801, bbUpper: 1.0836, bbMiddle: 1.0771, bbLower: 1.0706 },
  { i: 14, price: 1.0815, bbUpper: 1.0849, bbMiddle: 1.0780, bbLower: 1.0711 },
  { i: 15, price: 1.0822, bbUpper: 1.0857, bbMiddle: 1.0789, bbLower: 1.0721 },
  { i: 16, price: 1.0810, bbUpper: 1.0847, bbMiddle: 1.0793, bbLower: 1.0739 },
  { i: 17, price: 1.0834, bbUpper: 1.0868, bbMiddle: 1.0801, bbLower: 1.0734 },
  { i: 18, price: 1.0848, bbUpper: 1.0881, bbMiddle: 1.0811, bbLower: 1.0741 },
  { i: 19, price: 1.0841, bbUpper: 1.0876, bbMiddle: 1.0817, bbLower: 1.0758 },
  { i: 20, price: 1.0857, bbUpper: 1.0891, bbMiddle: 1.0826, bbLower: 1.0761 },
];

// ─── Momentum chart data (20 bars, H4, rising RSI + StochRSI) ────────────────
export interface MomentumPoint {
  i:        number;
  date?:    string;
  rsi14:    number;
  rsi9:     number;
  stochRsi: number;
}

export const momentumChartData: MomentumPoint[] = [
  { i:  1, rsi14: 38.2, rsi9: 35.4, stochRsi: 12.4 },
  { i:  2, rsi14: 39.8, rsi9: 37.9, stochRsi: 18.7 },
  { i:  3, rsi14: 37.5, rsi9: 35.1, stochRsi: 14.1 },
  { i:  4, rsi14: 41.3, rsi9: 39.8, stochRsi: 24.3 },
  { i:  5, rsi14: 43.6, rsi9: 42.7, stochRsi: 33.8 },
  { i:  6, rsi14: 42.1, rsi9: 41.2, stochRsi: 28.5 },
  { i:  7, rsi14: 45.9, rsi9: 46.3, stochRsi: 42.1 },
  { i:  8, rsi14: 48.4, rsi9: 49.8, stochRsi: 54.6 },
  { i:  9, rsi14: 47.2, rsi9: 48.1, stochRsi: 49.3 },
  { i: 10, rsi14: 50.6, rsi9: 52.4, stochRsi: 58.8 },
  { i: 11, rsi14: 53.1, rsi9: 55.6, stochRsi: 64.2 },
  { i: 12, rsi14: 51.8, rsi9: 53.9, stochRsi: 60.7 },
  { i: 13, rsi14: 54.7, rsi9: 57.2, stochRsi: 68.4 },
  { i: 14, rsi14: 56.3, rsi9: 59.1, stochRsi: 71.9 },
  { i: 15, rsi14: 55.4, rsi9: 58.3, stochRsi: 69.2 },
  { i: 16, rsi14: 53.9, rsi9: 56.4, stochRsi: 65.1 },
  { i: 17, rsi14: 57.2, rsi9: 60.8, stochRsi: 73.6 },
  { i: 18, rsi14: 58.8, rsi9: 62.4, stochRsi: 76.4 },
  { i: 19, rsi14: 57.6, rsi9: 61.1, stochRsi: 72.1 },
  { i: 20, rsi14: 58.2, rsi9: 61.7, stochRsi: 72.1 },
];

// ─── MACD chart data (20 bars, H4, bullish crossover) ────────────────────────
export interface MacdPoint {
  i:         number;
  date?:     string;
  macd:      number;
  signal:    number;
  histogram: number;
}

export const macdChartData: MacdPoint[] = [
  { i:  1, macd: -0.00182, signal: -0.00210, histogram: -0.00028 },
  { i:  2, macd: -0.00165, signal: -0.00198, histogram: -0.00033 },
  { i:  3, macd: -0.00141, signal: -0.00183, histogram: -0.00042 },
  { i:  4, macd: -0.00112, signal: -0.00164, histogram: -0.00052 },
  { i:  5, macd: -0.00078, signal: -0.00141, histogram: -0.00063 },
  { i:  6, macd: -0.00041, signal: -0.00115, histogram: -0.00074 },
  { i:  7, macd:  0.00003, signal: -0.00085, histogram:  0.00088 },
  { i:  8, macd:  0.00048, signal: -0.00054, histogram:  0.00102 },
  { i:  9, macd:  0.00089, signal: -0.00021, histogram:  0.00110 },
  { i: 10, macd:  0.00124, signal:  0.00014, histogram:  0.00110 },
  { i: 11, macd:  0.00153, signal:  0.00047, histogram:  0.00106 },
  { i: 12, macd:  0.00141, signal:  0.00072, histogram:  0.00069 },
  { i: 13, macd:  0.00158, signal:  0.00094, histogram:  0.00064 },
  { i: 14, macd:  0.00172, signal:  0.00112, histogram:  0.00060 },
  { i: 15, macd:  0.00168, signal:  0.00126, histogram:  0.00042 },
  { i: 16, macd:  0.00151, signal:  0.00133, histogram:  0.00018 },
  { i: 17, macd:  0.00161, signal:  0.00139, histogram:  0.00022 },
  { i: 18, macd:  0.00175, signal:  0.00147, histogram:  0.00028 },
  { i: 19, macd:  0.00159, signal:  0.00150, histogram:  0.00009 },
  { i: 20, macd:  0.00142, signal:  0.00148, histogram: -0.00006 },
];

// ─── EMA stack chart data (20 bars, H4, bullish stack) ────────────────────────
export interface EmaPoint {
  i:      number;
  date?:  string;
  price:  number;
  ema9:   number;
  ema20:  number;
  ema50:  number;
  ema200: number;
}

// ─── Live data store (populated from Google Sheets) ──────────────────────────
export interface LiveAnalyticsData {
  eurusdSnapshot:       EurusdSnapshot;
  analysisResult:       AnalysisResult;
  signalTags:           Array<{ label: string; active: boolean; bias: 'bullish' | 'bearish' | 'neutral' }>;
  signalHistory:        SignalOutcome[];
  historicalAccuracy:   number;
  evidenceCards:        EvidenceCard[];
  emaStackData:         EmaPoint[];
  macdChartData:        MacdPoint[];
  momentumChartData:    MomentumPoint[];
  volatilityChartData:  VolatilityPoint[];
  directionalChartData: DirectionalPoint[];
}

export const emaStackData: EmaPoint[] = [
  { i:  1, price: 1.0712, ema9: 1.0704, ema20: 1.0698, ema50: 1.0681, ema200: 1.0634 },
  { i:  2, price: 1.0724, ema9: 1.0714, ema20: 1.0703, ema50: 1.0684, ema200: 1.0636 },
  { i:  3, price: 1.0718, ema9: 1.0716, ema20: 1.0706, ema50: 1.0686, ema200: 1.0638 },
  { i:  4, price: 1.0731, ema9: 1.0722, ema20: 1.0711, ema50: 1.0689, ema200: 1.0641 },
  { i:  5, price: 1.0745, ema9: 1.0732, ema20: 1.0718, ema50: 1.0693, ema200: 1.0643 },
  { i:  6, price: 1.0739, ema9: 1.0735, ema20: 1.0721, ema50: 1.0696, ema200: 1.0645 },
  { i:  7, price: 1.0758, ema9: 1.0745, ema20: 1.0728, ema50: 1.0700, ema200: 1.0648 },
  { i:  8, price: 1.0771, ema9: 1.0756, ema20: 1.0737, ema50: 1.0705, ema200: 1.0651 },
  { i:  9, price: 1.0765, ema9: 1.0759, ema20: 1.0743, ema50: 1.0709, ema200: 1.0653 },
  { i: 10, price: 1.0779, ema9: 1.0768, ema20: 1.0750, ema50: 1.0713, ema200: 1.0656 },
  { i: 11, price: 1.0792, ema9: 1.0779, ema20: 1.0758, ema50: 1.0718, ema200: 1.0659 },
  { i: 12, price: 1.0787, ema9: 1.0781, ema20: 1.0763, ema50: 1.0721, ema200: 1.0661 },
  { i: 13, price: 1.0801, ema9: 1.0790, ema20: 1.0771, ema50: 1.0726, ema200: 1.0664 },
  { i: 14, price: 1.0815, ema9: 1.0801, ema20: 1.0780, ema50: 1.0731, ema200: 1.0667 },
  { i: 15, price: 1.0822, ema9: 1.0810, ema20: 1.0789, ema50: 1.0737, ema200: 1.0670 },
  { i: 16, price: 1.0810, ema9: 1.0810, ema20: 1.0793, ema50: 1.0741, ema200: 1.0672 },
  { i: 17, price: 1.0834, ema9: 1.0820, ema20: 1.0801, ema50: 1.0746, ema200: 1.0675 },
  { i: 18, price: 1.0848, ema9: 1.0832, ema20: 1.0811, ema50: 1.0752, ema200: 1.0678 },
  { i: 19, price: 1.0841, ema9: 1.0835, ema20: 1.0817, ema50: 1.0757, ema200: 1.0681 },
  { i: 20, price: 1.0857, ema9: 1.0845, ema20: 1.0826, ema50: 1.0763, ema200: 1.0684 },
];

// ─── Live data store ──────────────────────────────────────────────────────────
// Declared after all static arrays so _defaultData can be a stable const,
// which is required by useSyncExternalStore (uses Object.is for change detection).

export interface LiveAnalyticsData {
  eurusdSnapshot:       EurusdSnapshot;
  analysisResult:       AnalysisResult;
  signalTags:           Array<{ label: string; active: boolean; bias: 'bullish' | 'bearish' | 'neutral' }>;
  signalHistory:        SignalOutcome[];
  historicalAccuracy:   number;
  evidenceCards:        EvidenceCard[];
  emaStackData:         EmaPoint[];
  macdChartData:        MacdPoint[];
  momentumChartData:    MomentumPoint[];
  volatilityChartData:  VolatilityPoint[];
  directionalChartData: DirectionalPoint[];
}

const _defaultData: LiveAnalyticsData = {
  eurusdSnapshot,
  analysisResult,
  signalTags,
  signalHistory,
  historicalAccuracy,
  evidenceCards,
  emaStackData,
  macdChartData,
  momentumChartData,
  volatilityChartData,
  directionalChartData,
};

type Listener = () => void;
const _listeners = new Set<Listener>();
let _liveData: LiveAnalyticsData | null = null;

export function setLiveAnalytics(data: LiveAnalyticsData): void {
  _liveData = data;
  _listeners.forEach(l => l());
}

export function useAnalytics(): LiveAnalyticsData {
  return useSyncExternalStore(
    (cb) => { _listeners.add(cb); return () => { _listeners.delete(cb); }; },
    () => _liveData ?? _defaultData,
    () => _liveData ?? _defaultData,
  );
}
