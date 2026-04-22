import type {
  EurusdSnapshot, AnalysisResult, EvidenceCard,
  EmaPoint, MacdPoint, MomentumPoint, VolatilityPoint, DirectionalPoint,
} from '../../data/analyticsData';
import type { SheetRow } from '../googleSheets';

export interface ComputedAnalytics {
  eurusdSnapshot:      EurusdSnapshot;
  analysisResult:      AnalysisResult;
  signalTags:          Array<{ label: string; active: boolean; bias: 'bullish' | 'bearish' | 'neutral' }>;
  evidenceCards:       EvidenceCard[];
  emaStackData:        EmaPoint[];
  macdChartData:       MacdPoint[];
  momentumChartData:   MomentumPoint[];
  volatilityChartData: VolatilityPoint[];
  directionalChartData: DirectionalPoint[];
}

type Bias = 'bullish' | 'bearish' | 'neutral';

function bias(b: boolean | null): Bias {
  if (b === null) return 'neutral';
  return b ? 'bullish' : 'bearish';
}

function sign(v: number): string { return v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1); }
function pips(v: number): string { return (v > 0 ? '+' : '') + (v * 10000).toFixed(1); }
function adxLabel(adx: number): string { return adx > 30 ? 'Strong' : adx > 20 ? 'Moderate' : 'Weak'; }

export function analyze(rows: SheetRow[]): ComputedAnalytics {
  if (rows.length === 0) throw new Error('No data rows');

  const cur  = rows[rows.length - 1];
  const prev = rows.length > 1 ? rows[rows.length - 2] : cur;

  // ─── Derived booleans ───────────────────────────────────────────────────────
  const priceAboveCloud = cur.senkouA > 0 && cur.senkouB > 0
    && cur.close > Math.max(cur.senkouA, cur.senkouB);
  const priceAboveKijun = cur.kijun > 0 && cur.close > cur.kijun;
  const emaAlignedUp    = cur.close > cur.ema9 && cur.ema9 > cur.ema20 && cur.ema20 > cur.ema50;
  const emaAlignedDown  = cur.close < cur.ema9 && cur.ema9 < cur.ema20 && cur.ema20 < cur.ema50;
  const histExpanding   = cur.macdHistogram > prev.macdHistogram;

  const rsiTrend: 'UP' | 'DOWN' | 'FLAT' =
    cur.rsi14 > prev.rsi14 + 0.5 ? 'UP' :
    cur.rsi14 < prev.rsi14 - 0.5 ? 'DOWN' : 'FLAT';

  // ─── Scoring ────────────────────────────────────────────────────────────────
  let longScore  = 0;
  let shortScore = 0;

  if (cur.sma200 > 0 && cur.close > cur.ema9 && cur.close > cur.ema20 && cur.close > cur.ema50 && cur.close > cur.sma200) longScore++;
  if (cur.macd > cur.macdSignal && histExpanding)           longScore++;
  if (cur.rsi14 >= 45 && cur.rsi14 <= 65 && rsiTrend === 'UP')  longScore++;
  if (cur.adx > 25)                                         longScore++;
  if (cur.diPlus > cur.diMinus)                             longScore++;
  if (priceAboveKijun && priceAboveCloud)                   longScore++;
  if (rsiTrend === 'UP')                                    longScore++;
  if (cur.volumeSma20 > 0 && cur.volume > cur.volumeSma20)  longScore++;
  if (cur.r1 > 0 && (cur.close > cur.r1 || (cur.s1 > 0 && Math.abs(cur.close - cur.s1) < cur.atr14 * 0.5))) longScore++;

  if (cur.sma200 > 0 && cur.close < cur.ema9 && cur.close < cur.ema20 && cur.close < cur.ema50 && cur.close < cur.sma200) shortScore++;
  if (cur.macd < cur.macdSignal && !histExpanding)          shortScore++;
  if (cur.rsi14 >= 35 && cur.rsi14 <= 55 && rsiTrend === 'DOWN') shortScore++;
  if (cur.adx > 25)                                         shortScore++;
  if (cur.diMinus > cur.diPlus)                             shortScore++;
  if (!priceAboveKijun && !priceAboveCloud)                 shortScore++;
  if (rsiTrend === 'DOWN')                                  shortScore++;
  if (cur.volumeSma20 > 0 && cur.volume > cur.volumeSma20)  shortScore++;
  if (cur.s1 > 0 && (cur.close < cur.s1 || (cur.r1 > 0 && Math.abs(cur.close - cur.r1) < cur.atr14 * 0.5))) shortScore++;

  const direction  = longScore >= shortScore ? 'LONG' : 'SHORT';
  const confidence = Math.round((Math.max(longScore, shortScore) / 9) * 100);

  // ─── Entry / SL / TP ────────────────────────────────────────────────────────
  const entry = cur.close;
  const atr   = cur.atr14 > 0 ? cur.atr14 : 0.0050;

  const stopLoss = direction === 'LONG'
    ? parseFloat((entry - 1.5 * atr).toFixed(5))
    : parseFloat((entry + 1.5 * atr).toFixed(5));

  const [tp1, tp2, tp3] = direction === 'LONG'
    ? [cur.r1 || entry + atr, cur.r2 || entry + 2 * atr, cur.r3 || entry + 3 * atr]
    : [cur.s1 || entry - atr, cur.s2 || entry - 2 * atr, cur.s3 || entry - 3 * atr];

  const riskReward = stopLoss !== entry
    ? parseFloat((Math.abs(tp1 - entry) / Math.abs(entry - stopLoss)).toFixed(1))
    : 0;

  // ─── EurusdSnapshot ─────────────────────────────────────────────────────────
  const pivotPoint = parseFloat(((cur.high + cur.low + cur.close) / 3).toFixed(5));

  const eurusdSnapshot: EurusdSnapshot = {
    timestamp:       new Date(cur.date).toISOString(),
    symbol:          'EURUSD',
    open:            cur.open,
    high:            cur.high,
    low:             cur.low,
    close:           cur.close,
    volume:          cur.volume,
    volumeSma20:     cur.volumeSma20,
    ema9:            cur.ema9,
    ema20:           cur.ema20,
    ema50:           cur.ema50,
    sma200:          cur.sma200,
    macd:            cur.macd,
    macdSignal:      cur.macdSignal,
    macdHistogram:   cur.macdHistogram,
    adx:             cur.adx,
    diPlus:          cur.diPlus,
    diMinus:         cur.diMinus,
    rsi14:           cur.rsi14,
    rsiTrend,
    stochRsiK:       cur.stochRsiK,
    stochRsiD:       cur.stochRsiD,
    cci:             cur.cci,
    pivotPoint,
    r1:              cur.r1,
    r2:              cur.r2,
    r3:              cur.r3,
    s1:              cur.s1,
    s2:              cur.s2,
    s3:              cur.s3,
    kijun:           cur.kijun,
    tenkan:          cur.tenkan,
    senkouA:         cur.senkouA,
    senkouB:         cur.senkouB,
    atr14:           cur.atr14,
    bbUpper:         cur.bbUpper,
    bbMiddle:        cur.bbMiddle,
    bbLower:         cur.bbLower,
    keltnerUpper:    cur.keltnerUpper,
    keltnerMiddle:   cur.keltnerMiddle,
    keltnerLower:    cur.keltnerLower,
    histVol:         cur.histVol,
    priceAboveCloud,
    priceAboveKijun,
    insideBar:       cur.insideBar,
    rsiDivergence:   false,
  };

  // ─── Evidence cards ─────────────────────────────────────────────────────────
  const emaStackLabel  = emaAlignedUp ? 'Aligned Up' : emaAlignedDown ? 'Aligned Down' : 'Mixed';
  const emaStackStatus = bias(emaAlignedUp ? true : emaAlignedDown ? false : null);

  const sma200Label = cur.sma200 > 0
    ? `${cur.sma200.toFixed(4)} ${cur.close > cur.sma200 ? 'below' : 'above'}`
    : 'N/A';

  const bbWidth     = cur.bbUpper - cur.bbLower;
  const bbWidthLabel = bbWidth > 2 * atr ? 'Wide' : bbWidth < 0.5 * atr ? 'Narrow' : 'Moderate';

  const histLabel = cur.macdHistogram > 0
    ? (histExpanding ? 'Expanding Up'   : 'Shrinking Up')
    : (histExpanding ? 'Expanding Down' : 'Shrinking Down');
  const histStatus: Bias = cur.macdHistogram > 0 && histExpanding ? 'bullish'
    : cur.macdHistogram < 0 && !histExpanding ? 'bearish' : 'neutral';

  const trendBias: Bias = longScore > shortScore ? 'bullish' : longScore < shortScore ? 'bearish' : 'neutral';

  const evidenceCards: EvidenceCard[] = [
    {
      id: 'trend', label: 'Trend', bias: trendBias,
      values: [
        { label: 'EMA Stack',  value: emaStackLabel,  status: emaStackStatus },
        { label: 'SMA 200',    value: sma200Label,    status: bias(cur.close > cur.sma200) },
        { label: 'Trend Str.', value: adxLabel(cur.adx), status: bias(cur.adx > 25) },
      ],
    },
    {
      id: 'macd', label: 'MACD', bias: bias(cur.macd > cur.macdSignal),
      values: [
        { label: 'MACD Line',  value: pips(cur.macd),        status: bias(cur.macd > 0) },
        { label: 'Signal',     value: pips(cur.macdSignal),  status: bias(cur.macdSignal > 0) },
        { label: 'Histogram',  value: histLabel,             status: histStatus },
      ],
    },
    {
      id: 'momentum', label: 'Momentum',
      bias: bias(cur.rsi14 > 55 ? true : cur.rsi14 < 45 ? false : null),
      values: [
        { label: 'RSI (14)',   value: `${cur.rsi14.toFixed(1)} ${rsiTrend === 'UP' ? 'Up' : rsiTrend === 'DOWN' ? 'Down' : 'Flat'}`, status: bias(cur.rsi14 > 55 ? true : cur.rsi14 < 45 ? false : null) },
        { label: 'StochRSI K', value: cur.stochRsiK.toFixed(1), status: bias(cur.stochRsiK > 50) },
        { label: 'CCI',        value: sign(cur.cci),             status: bias(cur.cci > 0) },
      ],
    },
    {
      id: 'volatility', label: 'Volatility', bias: 'neutral',
      values: [
        { label: 'ATR (14)',  value: cur.atr14.toFixed(5), status: 'neutral' },
        { label: 'BB Width',  value: bbWidthLabel,         status: 'neutral' },
        { label: 'Hist. Vol', value: `${cur.histVol.toFixed(1)}%`, status: 'neutral' },
      ],
    },
    {
      id: 'directional', label: 'Directional', bias: bias(cur.diPlus > cur.diMinus),
      values: [
        { label: '+DI', value: cur.diPlus.toFixed(1),  status: bias(cur.diPlus > cur.diMinus) },
        { label: '−DI', value: cur.diMinus.toFixed(1), status: bias(cur.diMinus > cur.diPlus ? false : null) },
        { label: 'ADX', value: `${cur.adx.toFixed(1)} ${adxLabel(cur.adx).toLowerCase()}`, status: bias(cur.adx > 25) },
      ],
    },
  ];

  // ─── Analysis result ─────────────────────────────────────────────────────────
  const analysisResult: AnalysisResult = {
    direction:   direction as 'LONG' | 'SHORT',
    confidence,
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    riskReward,
    longScore,
    shortScore,
    signals: {
      trend: {
        bias: trendBias,
        score: longScore,
        conditions: [
          `${emaStackLabel} EMA stack`,
          `MACD ${pips(cur.macd)} vs Signal ${pips(cur.macdSignal)}`,
          `Histogram ${histLabel}`,
          `ADX ${cur.adx.toFixed(1)} — ${adxLabel(cur.adx).toLowerCase()} trend`,
          `+DI ${cur.diPlus.toFixed(1)} ${cur.diPlus > cur.diMinus ? '>' : '<'} −DI ${cur.diMinus.toFixed(1)}`,
        ],
      },
      momentum: {
        bias: bias(cur.rsi14 > 55 ? true : cur.rsi14 < 45 ? false : null),
        score: 2,
        conditions: [
          `RSI ${cur.rsi14.toFixed(1)} — ${rsiTrend === 'UP' ? 'rising' : rsiTrend === 'DOWN' ? 'falling' : 'flat'}`,
          `StochRSI K ${cur.stochRsiK.toFixed(1)} vs D ${cur.stochRsiD.toFixed(1)}`,
          `CCI ${cur.cci.toFixed(1)}`,
        ],
      },
      structure: {
        bias: bias(priceAboveCloud && priceAboveKijun ? true : !priceAboveCloud && !priceAboveKijun ? false : null),
        score: 3,
        conditions: [
          priceAboveCloud ? 'Price above Ichimoku cloud' : 'Price below Ichimoku cloud',
          `Price ${priceAboveKijun ? 'above' : 'below'} Kijun ${cur.kijun.toFixed(4)}`,
          `R1 ${cur.r1.toFixed(4)} / S1 ${cur.s1.toFixed(4)}`,
        ],
      },
      volatility: {
        bias: 'neutral',
        score: 0,
        conditions: [
          `ATR ${cur.atr14.toFixed(4)} — ${bbWidthLabel.toLowerCase()} range`,
          `BB Width: ${bbWidthLabel}`,
          cur.histVol > 10 ? 'Elevated historical volatility' : 'Low historical volatility',
        ],
      },
    },
  };

  // ─── Signal tags ─────────────────────────────────────────────────────────────
  const signalTags = [
    { label: 'EMA Stack',   active: emaAlignedUp,                                         bias: 'bullish' as const },
    { label: 'MACD Bull',   active: cur.macd > cur.macdSignal,                            bias: 'bullish' as const },
    { label: 'RSI Rising',  active: rsiTrend === 'UP',                                    bias: 'bullish' as const },
    { label: 'ADX Strong',  active: cur.adx > 25,                                         bias: 'bullish' as const },
    { label: '+DI > −DI',   active: cur.diPlus > cur.diMinus,                             bias: 'bullish' as const },
    { label: 'Above Cloud', active: priceAboveCloud,                                      bias: 'bullish' as const },
    { label: 'Volume High', active: cur.volumeSma20 > 0 && cur.volume > cur.volumeSma20,  bias: 'bullish' as const },
    { label: 'Near R1',     active: cur.r1 > 0 && Math.abs(cur.close - cur.r1) < atr,    bias: 'bearish' as const },
    { label: 'StochRSI OB', active: cur.stochRsiK > 80,                                  bias: 'bearish' as const },
  ];

  // ─── Chart data (last 20 rows) ───────────────────────────────────────────────
  const emaStackData: EmaPoint[] = rows.map((r, i) => ({
    i: i + 1, date: r.date, price: r.close, ema9: r.ema9, ema20: r.ema20, ema50: r.ema50, ema200: r.ema200,
  }));

  const macdChartData: MacdPoint[] = rows.map((r, i) => ({
    i: i + 1, date: r.date, macd: r.macd, signal: r.macdSignal, histogram: r.macdHistogram,
  }));

  const momentumChartData: MomentumPoint[] = rows.map((r, i) => ({
    i: i + 1, date: r.date, rsi14: r.rsi14, rsi9: r.rsi9, stochRsi: r.stochRsiK,
  }));

  const volatilityChartData: VolatilityPoint[] = rows.map((r, i) => ({
    i: i + 1, date: r.date, price: r.close, bbUpper: r.bbUpper, bbMiddle: r.bbMiddle, bbLower: r.bbLower,
  }));

  const directionalChartData: DirectionalPoint[] = rows.map((r, i) => ({
    i: i + 1, date: r.date, diPlus: r.diPlus, diMinus: r.diMinus, adx: r.adx,
  }));

  return {
    eurusdSnapshot,
    analysisResult,
    signalTags,
    evidenceCards,
    emaStackData,
    macdChartData,
    momentumChartData,
    volatilityChartData,
    directionalChartData,
  };
}
