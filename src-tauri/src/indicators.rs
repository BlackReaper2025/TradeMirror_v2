use crate::oanda_client::RawCandle;
use crate::analytics_v3_demo::CandleV3;

/// EMA over a full close series. Returns one value per input bar.
/// Bars before the first full period are seeded with SMA then EMA from there.
fn ema_series(closes: &[f64], period: usize) -> Vec<f64> {
    if closes.is_empty() || period == 0 {
        return vec![0.0; closes.len()];
    }
    let k = 2.0 / (period as f64 + 1.0);
    let mut result = vec![0.0f64; closes.len()];
    let seed_end = period.min(closes.len());
    // Seed with SMA of first `period` bars (or all bars if fewer).
    let seed = closes[..seed_end].iter().sum::<f64>() / seed_end as f64;
    result[seed_end - 1] = seed;
    for i in seed_end..closes.len() {
        result[i] = closes[i] * k + result[i - 1] * (1.0 - k);
    }
    // Fill early bars by back-propagating the seed.
    for i in (0..seed_end - 1).rev() {
        result[i] = result[i + 1];
    }
    result
}

/// Wilder-smoothed RSI (standard). Returns one value per input bar (0–100).
/// Early bars before the first full period are back-filled with the seed value.
fn rsi_series(closes: &[f64], period: usize) -> Vec<f64> {
    if closes.len() < 2 || period == 0 {
        return vec![50.0; closes.len()];
    }
    let mut result = vec![50.0f64; closes.len()];
    // Seed avg gain/loss from the first `period` changes.
    let seed_len = period.min(closes.len() - 1);
    let (mut avg_gain, mut avg_loss) = (0.0f64, 0.0f64);
    for i in 1..=seed_len {
        let diff = closes[i] - closes[i - 1];
        if diff > 0.0 { avg_gain += diff; } else { avg_loss += diff.abs(); }
    }
    avg_gain /= seed_len as f64;
    avg_loss /= seed_len as f64;

    let seed_rsi = if avg_loss == 0.0 { 100.0 } else { 100.0 - 100.0 / (1.0 + avg_gain / avg_loss) };
    result[seed_len] = seed_rsi;

    // Wilder smoothing for remaining bars.
    for i in (seed_len + 1)..closes.len() {
        let diff = closes[i] - closes[i - 1];
        let gain = if diff > 0.0 { diff } else { 0.0 };
        let loss = if diff < 0.0 { diff.abs() } else { 0.0 };
        avg_gain = (avg_gain * (period as f64 - 1.0) + gain) / period as f64;
        avg_loss = (avg_loss * (period as f64 - 1.0) + loss) / period as f64;
        result[i] = if avg_loss == 0.0 { 100.0 } else { 100.0 - 100.0 / (1.0 + avg_gain / avg_loss) };
    }
    // Back-fill early bars with the seed value.
    for i in 0..seed_len {
        result[i] = seed_rsi;
    }
    result
}

/// ATR using Wilder smoothing. First bar TR = high - low (no prev close).
fn atr_series(highs: &[f64], lows: &[f64], closes: &[f64], period: usize) -> Vec<f64> {
    let n = highs.len();
    if n == 0 || period == 0 { return vec![0.0; n]; }
    let mut tr = vec![0.0f64; n];
    tr[0] = highs[0] - lows[0];
    for i in 1..n {
        let hl  = highs[i] - lows[i];
        let hpc = (highs[i]  - closes[i - 1]).abs();
        let lpc = (lows[i]   - closes[i - 1]).abs();
        tr[i] = hl.max(hpc).max(lpc);
    }
    // Seed with simple average of first `period` TRs, then Wilder-smooth.
    let mut result = vec![0.0f64; n];
    let seed_end = period.min(n);
    let seed = tr[..seed_end].iter().sum::<f64>() / seed_end as f64;
    result[seed_end - 1] = seed;
    for i in seed_end..n {
        result[i] = (result[i - 1] * (period as f64 - 1.0) + tr[i]) / period as f64;
    }
    for i in 0..seed_end - 1 { result[i] = seed; }
    result
}

/// ADX with +DI and -DI using Wilder smoothing.
/// Returns (plus_di, minus_di, adx) per bar, all as 0–100 values.
fn adx_series(highs: &[f64], lows: &[f64], closes: &[f64], period: usize)
    -> (Vec<f64>, Vec<f64>, Vec<f64>)
{
    let n = highs.len();
    let p = period as f64;
    let mut plus_di  = vec![0.0f64; n];
    let mut minus_di = vec![0.0f64; n];
    let mut adx_out  = vec![0.0f64; n];
    if n < 2 || period == 0 { return (plus_di, minus_di, adx_out); }

    // Raw directional movement and true range per bar.
    let mut dm_plus  = vec![0.0f64; n];
    let mut dm_minus = vec![0.0f64; n];
    let mut tr_raw   = vec![0.0f64; n];
    tr_raw[0] = highs[0] - lows[0];
    for i in 1..n {
        let up   = highs[i]  - highs[i - 1];
        let down = lows[i - 1] - lows[i];
        dm_plus[i]  = if up > down && up > 0.0 { up }   else { 0.0 };
        dm_minus[i] = if down > up && down > 0.0 { down } else { 0.0 };
        let hl  = highs[i] - lows[i];
        let hpc = (highs[i]  - closes[i - 1]).abs();
        let lpc = (lows[i]   - closes[i - 1]).abs();
        tr_raw[i] = hl.max(hpc).max(lpc);
    }

    // Wilder-smooth TR, +DM, -DM then compute +DI/-DI.
    let seed_end = period.min(n);
    let mut s_tr  = tr_raw[..seed_end].iter().sum::<f64>();
    let mut s_dmp = dm_plus[..seed_end].iter().sum::<f64>();
    let mut s_dmm = dm_minus[..seed_end].iter().sum::<f64>();

    let di_p = |dmp: f64, tr: f64| if tr > 0.0 { 100.0 * dmp / tr } else { 0.0 };
    plus_di[seed_end - 1]  = di_p(s_dmp, s_tr);
    minus_di[seed_end - 1] = di_p(s_dmm, s_tr);

    for i in seed_end..n {
        s_tr  = s_tr  - s_tr  / p + tr_raw[i];
        s_dmp = s_dmp - s_dmp / p + dm_plus[i];
        s_dmm = s_dmm - s_dmm / p + dm_minus[i];
        plus_di[i]  = di_p(s_dmp, s_tr);
        minus_di[i] = di_p(s_dmm, s_tr);
    }
    for i in 0..seed_end - 1 {
        plus_di[i]  = plus_di[seed_end - 1];
        minus_di[i] = minus_di[seed_end - 1];
    }

    // DX then Wilder-smooth to ADX.
    let dx: Vec<f64> = (0..n).map(|i| {
        let sum = plus_di[i] + minus_di[i];
        if sum > 0.0 { 100.0 * (plus_di[i] - minus_di[i]).abs() / sum } else { 0.0 }
    }).collect();
    let adx_seed_end = (2 * period - 1).min(n);
    let adx_seed = dx[..adx_seed_end].iter().sum::<f64>() / adx_seed_end as f64;
    adx_out[adx_seed_end - 1] = adx_seed;
    for i in adx_seed_end..n {
        adx_out[i] = (adx_out[i - 1] * (p - 1.0) + dx[i]) / p;
    }
    for i in 0..adx_seed_end - 1 { adx_out[i] = adx_seed; }

    (plus_di, minus_di, adx_out)
}

/// Stochastic RSI: normalises RSI into 0–100, then smooths %K and %D with SMA.
/// Returns (%K, %D) per bar.
fn stoch_rsi_series(rsi: &[f64], period: usize, k_smooth: usize, d_smooth: usize)
    -> (Vec<f64>, Vec<f64>)
{
    let n = rsi.len();
    let mut raw_k = vec![50.0f64; n];
    for i in 0..n {
        let start = if i + 1 >= period { i + 1 - period } else { 0 };
        let window = &rsi[start..=i];
        let hi = window.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let lo = window.iter().cloned().fold(f64::INFINITY,     f64::min);
        raw_k[i] = if hi > lo { (rsi[i] - lo) / (hi - lo) * 100.0 } else { 50.0 };
    }
    let k = sma_smooth(&raw_k, k_smooth);
    let d = sma_smooth(&k,     d_smooth);
    (k, d)
}

fn sma_smooth(vals: &[f64], period: usize) -> Vec<f64> {
    let n = vals.len();
    let mut out = vec![0.0f64; n];
    for i in 0..n {
        let start = if i + 1 >= period { i + 1 - period } else { 0 };
        let window = &vals[start..=i];
        out[i] = window.iter().sum::<f64>() / window.len() as f64;
    }
    out
}

/// CCI = (Typical Price − SMA(TP, period)) / (0.015 × Mean Deviation).
fn cci_series(highs: &[f64], lows: &[f64], closes: &[f64], period: usize) -> Vec<f64> {
    let n = highs.len();
    let mut result = vec![0.0f64; n];
    for i in 0..n {
        let start  = if i + 1 >= period { i + 1 - period } else { 0 };
        let tp_win: Vec<f64> = (start..=i).map(|j| (highs[j] + lows[j] + closes[j]) / 3.0).collect();
        let sma    = tp_win.iter().sum::<f64>() / tp_win.len() as f64;
        let md     = tp_win.iter().map(|v| (v - sma).abs()).sum::<f64>() / tp_win.len() as f64;
        let tp     = (highs[i] + lows[i] + closes[i]) / 3.0;
        result[i]  = if md > 0.0 { (tp - sma) / (0.015 * md) } else { 0.0 };
    }
    result
}

/// Bollinger Bands: middle = SMA(period), upper/lower = middle ± mult * stdev.
/// Returns (upper, middle, lower) per bar.
fn bollinger_series(closes: &[f64], period: usize, mult: f64)
    -> (Vec<f64>, Vec<f64>, Vec<f64>)
{
    let n = closes.len();
    let mut upper  = vec![0.0f64; n];
    let mut middle = vec![0.0f64; n];
    let mut lower  = vec![0.0f64; n];
    for i in 0..n {
        let start = if i + 1 >= period { i + 1 - period } else { 0 };
        let window = &closes[start..=i];
        let sma = window.iter().sum::<f64>() / window.len() as f64;
        let variance = window.iter().map(|v| (v - sma).powi(2)).sum::<f64>() / window.len() as f64;
        let sd = variance.sqrt();
        middle[i] = sma;
        upper[i]  = sma + mult * sd;
        lower[i]  = sma - mult * sd;
    }
    (upper, middle, lower)
}

/// Simple moving average. Each bar uses a window of min(i+1, period) bars.
fn sma_series(closes: &[f64], period: usize) -> Vec<f64> {
    closes.iter().enumerate().map(|(i, _)| {
        let start = if i + 1 >= period { i + 1 - period } else { 0 };
        let window = &closes[start..=i];
        window.iter().sum::<f64>() / window.len() as f64
    }).collect()
}

/// MACD: EMA(fast) − EMA(slow), signal = EMA(macd_line, signal_period).
/// Returns (macd, signal, histogram) per bar.
fn macd_series(closes: &[f64], fast: usize, slow: usize, signal: usize)
    -> (Vec<f64>, Vec<f64>, Vec<f64>)
{
    let ema_fast = ema_series(closes, fast);
    let ema_slow = ema_series(closes, slow);
    let macd_line: Vec<f64> = ema_fast.iter().zip(&ema_slow).map(|(f, s)| f - s).collect();
    let signal_line = ema_series(&macd_line, signal);
    let histogram: Vec<f64> = macd_line.iter().zip(&signal_line).map(|(m, s)| m - s).collect();
    (macd_line, signal_line, histogram)
}

/// Transforms raw OANDA OHLCV candles into CandleV3 rows.
/// OHLCV and date are mapped directly; all indicator fields are
/// stubbed with 0.0 / false until real computation is added.
pub fn compute(raw: Vec<RawCandle>) -> Vec<CandleV3> {
    let closes:  Vec<f64> = raw.iter().map(|c| c.close).collect();
    let volumes: Vec<f64> = raw.iter().map(|c| c.volume).collect();
    let vol_sma20_v = sma_series(&volumes, 20);

    // Log returns: ln(close[i] / close[i-1]); bar 0 gets 0.0.
    let log_returns: Vec<f64> = (0..closes.len()).map(|i| {
        if i == 0 { 0.0 } else { (closes[i] / closes[i - 1]).ln() }
    }).collect();
    // 20-period rolling std dev of log returns, annualised by sqrt(252).
    let hist_vol_v: Vec<f64> = (0..closes.len()).map(|i| {
        let start = if i + 1 >= 20 { i + 1 - 20 } else { 0 };
        let window = &log_returns[start..=i];
        let n = window.len() as f64;
        let mean = window.iter().sum::<f64>() / n;
        let variance = window.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n;
        variance.sqrt() * 252_f64.sqrt()
    }).collect();

    let sma20_v  = sma_series(&closes,  20);
    let sma50_v  = sma_series(&closes,  50);
    let sma200_v = sma_series(&closes, 200);

    let ema9_v   = ema_series(&closes,   9);
    let ema20_v  = ema_series(&closes,  20);
    let ema50_v  = ema_series(&closes,  50);
    let ema100_v = ema_series(&closes, 100);
    let ema200_v = ema_series(&closes, 200);
    let rsi9_v   = rsi_series(&closes,   9);
    let rsi14_v  = rsi_series(&closes,  14);
    let (macd_v, macd_sig_v, macd_hist_v) = macd_series(&closes, 12, 26, 9);
    let (bb_upper_v, bb_mid_v, bb_lower_v) = bollinger_series(&closes, 20, 2.0);
    let highs:  Vec<f64> = raw.iter().map(|c| c.high).collect();
    let lows:   Vec<f64> = raw.iter().map(|c| c.low).collect();
    let atr14_v = atr_series(&highs, &lows, &closes, 14);
    let (di_plus_v, di_minus_v, adx_v) = adx_series(&highs, &lows, &closes, 14);
    let cci_v = cci_series(&highs, &lows, &closes, 20);
    let (srsi_k_v, srsi_d_v) = stoch_rsi_series(&rsi14_v, 14, 3, 3);

    // Pivot levels use prior candle H/L/C; bar 0 uses its own values.
    // Ichimoku helper: midpoint of highest high and lowest low over a window.
    let hl_mid = |end: usize, period: usize| -> f64 {
        let start = if end + 1 >= period { end + 1 - period } else { 0 };
        let h = highs[start..=end].iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let l = lows[start..=end].iter().cloned().fold(f64::INFINITY, f64::min);
        (h + l) / 2.0
    };
    let tenkan_v:  Vec<f64> = (0..highs.len()).map(|i| hl_mid(i,  9)).collect();
    let kijun_v:   Vec<f64> = (0..highs.len()).map(|i| hl_mid(i, 26)).collect();
    let senkou_a_v: Vec<f64> = tenkan_v.iter().zip(&kijun_v).map(|(t, k)| (t + k) / 2.0).collect();
    let senkou_b_v: Vec<f64> = (0..highs.len()).map(|i| hl_mid(i, 52)).collect();

    let pivot_v: Vec<(f64,f64,f64,f64,f64,f64,f64)> = (0..highs.len()).map(|i| {
        let (ph, pl, pc) = if i == 0 {
            (highs[0], lows[0], closes[0])
        } else {
            (highs[i-1], lows[i-1], closes[i-1])
        };
        let pp = (ph + pl + pc) / 3.0;
        let r1 = 2.0 * pp - pl;
        let r2 = pp + (ph - pl);
        let r3 = ph + 2.0 * (pp - pl);
        let s1 = 2.0 * pp - ph;
        let s2 = pp - (ph - pl);
        let s3 = pl - 2.0 * (ph - pp);
        (pp, r1, r2, r3, s1, s2, s3)
    }).collect();

    raw.into_iter().enumerate().map(|(i, c)| CandleV3 {
        date:           c.date,
        timestamp:      c.timestamp,
        symbol:         "EURUSD".into(),
        open:           c.open,
        high:           c.high,
        low:            c.low,
        close:          c.close,
        volume:         c.volume,
        // ── indicators (stubs — replace field by field as engine is built) ──
        volume_sma20:   vol_sma20_v[i],
        sma20:          sma20_v[i],
        sma50:          sma50_v[i],
        sma200:         sma200_v[i],
        ema9:           ema9_v[i],
        ema20:          ema20_v[i],
        ema50:          ema50_v[i],
        ema100:         ema100_v[i],
        ema200:         ema200_v[i],
        macd:           macd_v[i],
        macd_signal:    macd_sig_v[i],
        macd_histogram: macd_hist_v[i],
        adx:            adx_v[i],
        di_plus:        di_plus_v[i],
        di_minus:       di_minus_v[i],
        rsi9:           rsi9_v[i],
        rsi14:          rsi14_v[i],
        rsi_trend:      "FLAT".into(),
        stoch_rsi_k:    srsi_k_v[i],
        stoch_rsi_d:    srsi_d_v[i],
        cci:            cci_v[i],
        pivot_point:    pivot_v[i].0,
        r1: pivot_v[i].1, r2: pivot_v[i].2, r3: pivot_v[i].3,
        s1: pivot_v[i].4, s2: pivot_v[i].5, s3: pivot_v[i].6,
        kijun:          kijun_v[i],
        tenkan:         tenkan_v[i],
        senkou_a:       senkou_a_v[i],
        senkou_b:       senkou_b_v[i],
        atr14:          atr14_v[i],
        bb_upper:       bb_upper_v[i],
        bb_middle:      bb_mid_v[i],
        bb_lower:       bb_lower_v[i],
        keltner_upper:  ema20_v[i] + 2.0 * atr14_v[i],
        keltner_middle: ema20_v[i],
        keltner_lower:  ema20_v[i] - 2.0 * atr14_v[i],
        hist_vol:            hist_vol_v[i],
        price_above_cloud:   c.close > senkou_a_v[i].max(senkou_b_v[i]),
        price_above_kijun:   c.close > kijun_v[i],
        inside_bar:          false,
        rsi_divergence:      false,
    }).collect()
}
