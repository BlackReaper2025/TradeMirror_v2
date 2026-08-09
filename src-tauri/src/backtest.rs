// Backtest / strategy-validation harness.
//
// Pure, replay-consistent simulation over the shared `candles_v3` engine output.
// A decision at the close of bar i uses only data up to i; entry fills at the
// open of bar i+1. One position at a time. Each strategy carries its own stop
// and exit rule (fixed ATR target, or an ATR trailing stop). Results are in
// R-multiples (1R = initial stop distance) and split into in-sample vs
// out-of-sample so an edge that only exists in-sample is visible.
//
// Multi-timeframe (MTF) strategies aggregate the M15 series up to H1/H4 in
// memory (ONE candle source), run them through the same `indicators::compute`,
// and gate entries on higher-timeframe agreement — all look-ahead-free (a bar
// only ever reads the most recently CLOSED higher-timeframe bar).
//
// This is VALIDATION infrastructure: it measures historical edge. It never
// places orders and holds no decision authority.

use std::rc::Rc;
use crate::analytics_v3_demo::CandleV3;
use crate::oanda_client::RawCandle;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Side { Long, Short }

#[derive(Clone, Copy)]
pub enum ExitRule {
    Target(f64), // fixed take-profit at f64 * ATR(entry); fixed stop
    Trail(f64),  // trailing stop f64 * ATR(entry) from the running peak; no cap
}

#[derive(Clone, Copy)]
pub struct BtConfig {
    pub spread:       f64,
    pub warmup:       usize,
    pub oos_fraction: f64,
}

impl BtConfig {
    pub fn daily() -> Self { BtConfig { spread: 0.00012, warmup: 200, oos_fraction: 0.30 } }
    pub fn m15()   -> Self { BtConfig { spread: 0.00012, warmup: 300, oos_fraction: 0.30 } }
}

pub struct Strategy {
    pub name:      &'static str,
    pub signal:    Box<dyn Fn(&[CandleV3], usize) -> Option<Side>>,
    pub stop_mult: f64,
    pub exit:      ExitRule,
}

#[derive(Clone, Copy)]
struct Trade { entry_idx: usize, r: f64 }

// ─── Simulation ────────────────────────────────────────────────────────────────

fn simulate(candles: &[CandleV3], strat: &Strategy, cfg: &BtConfig) -> Vec<Trade> {
    let n = candles.len();
    let mut trades = Vec::new();
    let mut i = cfg.warmup;

    while i + 1 < n {
        let side = match (strat.signal)(candles, i) {
            Some(s) => s,
            None => { i += 1; continue; }
        };
        let atr = candles[i].atr14;
        if !(atr > 0.0) { i += 1; continue; }

        let risk  = strat.stop_mult * atr;
        let entry = candles[i + 1].open;

        let (exit_price, exit_idx) = match strat.exit {
            ExitRule::Target(tmult) => exit_target(candles, i + 1, side, entry, risk, tmult * atr),
            ExitRule::Trail(trmult) => exit_trail(candles, i + 1, side, entry, risk, trmult * atr),
        };

        let raw = match side {
            Side::Long  => exit_price - entry,
            Side::Short => entry - exit_price,
        };
        trades.push(Trade { entry_idx: i + 1, r: (raw - cfg.spread) / risk });
        i = exit_idx.max(i + 1);
    }
    trades
}

fn exit_target(c: &[CandleV3], start: usize, side: Side, entry: f64, risk: f64, reward: f64) -> (f64, usize) {
    let n = c.len();
    let (stop, target) = match side {
        Side::Long  => (entry - risk, entry + reward),
        Side::Short => (entry + risk, entry - reward),
    };
    for j in start..n {
        match side {
            Side::Long  => {
                if c[j].low  <= stop   { return (stop, j); }
                if c[j].high >= target { return (target, j); }
            }
            Side::Short => {
                if c[j].high >= stop   { return (stop, j); }
                if c[j].low  <= target { return (target, j); }
            }
        }
    }
    (c[n - 1].close, n - 1)
}

fn exit_trail(c: &[CandleV3], start: usize, side: Side, entry: f64, risk: f64, trail: f64) -> (f64, usize) {
    let n = c.len();
    match side {
        Side::Long => {
            let (mut stop, mut peak) = (entry - risk, entry);
            for j in start..n {
                if c[j].low <= stop { return (stop, j); }
                if c[j].high > peak { peak = c[j].high; let ns = peak - trail; if ns > stop { stop = ns; } }
            }
        }
        Side::Short => {
            let (mut stop, mut trough) = (entry + risk, entry);
            for j in start..n {
                if c[j].high >= stop { return (stop, j); }
                if c[j].low < trough { trough = c[j].low; let ns = trough + trail; if ns < stop { stop = ns; } }
            }
        }
    }
    (c[n - 1].close, n - 1)
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

#[derive(Clone, Copy)]
pub struct Metrics {
    pub n_trades:       usize,
    pub win_rate:       f64,
    pub expectancy_r:   f64,
    pub avg_win_r:      f64,
    pub avg_loss_r:     f64,
    pub profit_factor:  f64,
    pub max_drawdown_r: f64,
    pub total_r:        f64,
}

fn metrics_from(rs: &[f64]) -> Metrics {
    let n = rs.len();
    if n == 0 {
        return Metrics { n_trades: 0, win_rate: 0.0, expectancy_r: 0.0, avg_win_r: 0.0,
                         avg_loss_r: 0.0, profit_factor: 0.0, max_drawdown_r: 0.0, total_r: 0.0 };
    }
    let wins:   Vec<f64> = rs.iter().cloned().filter(|&r| r > 0.0).collect();
    let losses: Vec<f64> = rs.iter().cloned().filter(|&r| r <= 0.0).collect();
    let gross_win:  f64 = wins.iter().sum();
    let gross_loss: f64 = -losses.iter().sum::<f64>();
    let total:      f64 = rs.iter().sum();

    let mut peak = 0.0_f64; let mut eq = 0.0_f64; let mut max_dd = 0.0_f64;
    for &r in rs { eq += r; if eq > peak { peak = eq; } let dd = peak - eq; if dd > max_dd { max_dd = dd; } }

    Metrics {
        n_trades: n,
        win_rate: wins.len() as f64 / n as f64 * 100.0,
        expectancy_r: total / n as f64,
        avg_win_r:  if wins.is_empty()   { 0.0 } else {  gross_win  / wins.len()   as f64 },
        avg_loss_r: if losses.is_empty() { 0.0 } else { -gross_loss / losses.len() as f64 },
        profit_factor: if gross_loss > 0.0 { gross_win / gross_loss }
                       else if gross_win > 0.0 { f64::INFINITY } else { 0.0 },
        max_drawdown_r: max_dd,
        total_r: total,
    }
}

pub struct StrategyReport {
    pub name:          String,
    pub all:           Metrics,
    pub in_sample:     Metrics,
    pub out_of_sample: Metrics,
}

pub fn run_all(candles: &[CandleV3], cfg: &BtConfig, strats: &[Strategy]) -> Vec<StrategyReport> {
    let split = ((candles.len() as f64) * (1.0 - cfg.oos_fraction)) as usize;
    strats.iter().map(|s| {
        let trades = simulate(candles, s, cfg);
        let all_r: Vec<f64> = trades.iter().map(|t| t.r).collect();
        let is_r:  Vec<f64> = trades.iter().filter(|t| t.entry_idx <  split).map(|t| t.r).collect();
        let oos_r: Vec<f64> = trades.iter().filter(|t| t.entry_idx >= split).map(|t| t.r).collect();
        let exit_label = match s.exit {
            ExitRule::Target(t) => format!("tgt {:.1}R", t / s.stop_mult),
            ExitRule::Trail(tr) => format!("trail {:.1}ATR", tr),
        };
        StrategyReport {
            name:          format!("{} [{}]", s.name, exit_label),
            all:           metrics_from(&all_r),
            in_sample:     metrics_from(&is_r),
            out_of_sample: metrics_from(&oos_r),
        }
    }).collect()
}

// ─── Higher-timeframe aggregation (one candle source) ──────────────────────────

/// Group consecutive M15 bars by a time-bucket key into OHLCV bars, tracking the
/// index of each bucket's LAST constituent M15 bar (for look-ahead-free mapping).
fn aggregate<F: Fn(&CandleV3) -> String>(m15: &[CandleV3], key_of: F) -> (Vec<RawCandle>, Vec<usize>) {
    let mut bars = Vec::new();
    let mut last = Vec::new();
    let mut key = String::new();
    let mut open_b = false;
    let (mut o, mut h, mut l, mut c, mut v) = (0.0, 0.0, 0.0, 0.0, 0.0);
    let (mut date, mut ts, mut li) = (String::new(), String::new(), 0usize);

    for (i, b) in m15.iter().enumerate() {
        let k = key_of(b);
        if !open_b || k != key {
            if open_b {
                bars.push(RawCandle { date: date.clone(), timestamp: ts.clone(), open: o, high: h, low: l, close: c, volume: v });
                last.push(li);
            }
            key = k; open_b = true;
            o = b.open; h = b.high; l = b.low; c = b.close; v = b.volume;
            date = b.date.clone(); ts = b.timestamp.clone();
        } else {
            if b.high > h { h = b.high; }
            if b.low  < l { l = b.low; }
            c = b.close; v += b.volume;
        }
        li = i;
    }
    if open_b {
        bars.push(RawCandle { date, timestamp: ts, open: o, high: h, low: l, close: c, volume: v });
        last.push(li);
    }
    (bars, last)
}

/// For each M15 index, the index of the latest higher-TF bar that has fully
/// closed by then (largest k with last_idx[k] <= i). None until the first close.
fn map_htf(last_idx: &[usize], n_m15: usize) -> Vec<Option<usize>> {
    let mut out = vec![None; n_m15];
    let (mut k, mut cur) = (0usize, None);
    for i in 0..n_m15 {
        while k < last_idx.len() && last_idx[k] <= i { cur = Some(k); k += 1; }
        out[i] = cur;
    }
    out
}

fn stack_bias(c: &CandleV3) -> i8 {
    if c.ema20 > c.ema50 && c.ema50 > c.ema200 { 1 }
    else if c.ema20 < c.ema50 && c.ema50 < c.ema200 { -1 }
    else { 0 }
}

fn h4_key(c: &CandleV3) -> String {
    let hour: u32 = c.timestamp.get(11..13).and_then(|s| s.parse().ok()).unwrap_or(0);
    format!("{}T{:02}", c.timestamp.get(0..10).unwrap_or(""), (hour / 4) * 4)
}

// ─── Strategy suites (hand-designed; I act as the quant) ───────────────────────

/// M15 comparison suite: best simple variants from the prior round + MTF-confluence
/// (M15 pullback entry taken only when H1 AND H4 EMA-stacks agree with it).
pub fn m15_suite(m15: &[CandleV3]) -> Vec<Strategy> {
    use ExitRule::*;

    let (h1_raw, h1_last) = aggregate(m15, |c| c.timestamp.get(0..13).unwrap_or(&c.timestamp).to_string());
    let (h4_raw, h4_last) = aggregate(m15, h4_key);
    let h1     = Rc::new(crate::indicators::compute(h1_raw));
    let h4     = Rc::new(crate::indicators::compute(h4_raw));
    let h1_map = Rc::new(map_htf(&h1_last, m15.len()));
    let h4_map = Rc::new(map_htf(&h4_last, m15.len()));

    let mk = |session: bool| -> Box<dyn Fn(&[CandleV3], usize) -> Option<Side>> {
        let (h1, h4, h1m, h4m) = (h1.clone(), h4.clone(), h1_map.clone(), h4_map.clone());
        Box::new(move |c, i| {
            let side = sig_trend_pullback(c, i)?;
            if session && !(7..=16).contains(&hour_utc(&c[i])) { return None; }
            let b1 = h1m[i].map(|k| stack_bias(&h1[k])).unwrap_or(0);
            let b4 = h4m[i].map(|k| stack_bias(&h4[k])).unwrap_or(0);
            let want = match side { Side::Long => 1i8, Side::Short => -1i8 };
            if b1 == want && b4 == want { Some(side) } else { None }
        })
    };

    vec![
        Strategy { name: "trend_pullback",        signal: Box::new(sig_trend_pullback),         stop_mult: 1.5, exit: Target(3.0) },
        Strategy { name: "trend_pullback_session",signal: Box::new(sig_trend_pullback_session), stop_mult: 1.5, exit: Target(3.0) },
        Strategy { name: "mtf_pullback",          signal: mk(false), stop_mult: 1.5, exit: Target(3.0) },
        Strategy { name: "mtf_pullback",          signal: mk(false), stop_mult: 1.5, exit: Trail(2.0) },
        Strategy { name: "mtf_pullback_session",  signal: mk(true),  stop_mult: 1.5, exit: Target(3.0) },
    ]
}

/// O(n) single-timeframe strategies (daily fallback / contrast).
pub fn rule_strategies() -> Vec<Strategy> {
    use ExitRule::*;
    vec![
        Strategy { name: "ema_macd_trend",         signal: Box::new(sig_ema_macd_trend),         stop_mult: 1.5, exit: Target(3.0) },
        Strategy { name: "trend_pullback",         signal: Box::new(sig_trend_pullback),         stop_mult: 1.5, exit: Target(3.0) },
        Strategy { name: "trend_pullback_session", signal: Box::new(sig_trend_pullback_session), stop_mult: 1.5, exit: Trail(2.0) },
    ]
}

pub fn all_strategies() -> Vec<Strategy> {
    let mut s = rule_strategies();
    s.push(Strategy { name: "brain_synthesis", signal: Box::new(sig_brain_synthesis), stop_mult: 1.5, exit: ExitRule::Target(3.0) });
    s
}

// ── entry signals ──
fn uptrend(c: &CandleV3) -> bool   { c.ema20 > c.ema50 && c.ema50 > c.ema200 }
fn downtrend(c: &CandleV3) -> bool { c.ema20 < c.ema50 && c.ema50 < c.ema200 }
fn hour_utc(c: &CandleV3) -> u32 {
    c.timestamp.get(11..13).and_then(|s| s.parse().ok()).unwrap_or(99)
}

fn sig_ema_macd_trend(c: &[CandleV3], i: usize) -> Option<Side> {
    if i < 1 { return None; }
    let (cur, prev) = (&c[i], &c[i - 1]);
    let up   = prev.macd_histogram <= 0.0 && cur.macd_histogram > 0.0;
    let down = prev.macd_histogram >= 0.0 && cur.macd_histogram < 0.0;
    if cur.ema50 > cur.ema200 && up   { return Some(Side::Long); }
    if cur.ema50 < cur.ema200 && down { return Some(Side::Short); }
    None
}

fn sig_trend_pullback(c: &[CandleV3], i: usize) -> Option<Side> {
    if i < 1 { return None; }
    let (cur, prev) = (&c[i], &c[i - 1]);
    if uptrend(cur) && prev.low <= prev.ema20 && cur.close > cur.ema20 && cur.close > cur.open {
        return Some(Side::Long);
    }
    if downtrend(cur) && prev.high >= prev.ema20 && cur.close < cur.ema20 && cur.close < cur.open {
        return Some(Side::Short);
    }
    None
}

fn sig_trend_pullback_session(c: &[CandleV3], i: usize) -> Option<Side> {
    let s = sig_trend_pullback(c, i)?;
    if (7..=16).contains(&hour_utc(&c[i])) { Some(s) } else { None }
}

fn sig_brain_synthesis(c: &[CandleV3], i: usize) -> Option<Side> {
    match crate::scoring::score_timeframe(&c[..=i], "D").direction.as_str() {
        "LONG"  => Some(Side::Long),
        "SHORT" => Some(Side::Short),
        _       => None,
    }
}

// ─── Reporting ─────────────────────────────────────────────────────────────────

pub fn format_reports(reports: &[StrategyReport], cfg: &BtConfig, n_candles: usize, label: &str) -> String {
    use std::fmt::Write;
    let mut o = String::new();
    let _ = writeln!(o, "TradeMirror backtest — {}  ({} candles)", label, n_candles);
    let _ = writeln!(o, "spread={:.5}  1R = initial stop  |  OOS tail = {:.0}%  |  entry at next-bar open, cost per round-trip\n",
        cfg.spread, cfg.oos_fraction * 100.0);

    for r in reports {
        let _ = writeln!(o, "── {} ──", r.name);
        let _ = writeln!(o, "  {:<4}{:>7}{:>8}{:>9}{:>8}{:>8}{:>8}{:>10}{:>10}",
            "seg", "trades", "win%", "exp(R)", "PF", "avgW", "avgL", "maxDD(R)", "total(R)");
        for (seg, m) in [("ALL", &r.all), ("IS", &r.in_sample), ("OOS", &r.out_of_sample)] {
            let pf = if m.profit_factor.is_infinite() { "inf".to_string() } else { format!("{:.2}", m.profit_factor) };
            let _ = writeln!(o, "  {:<4}{:>7}{:>7.1}%{:>9.3}{:>8}{:>8.2}{:>8.2}{:>10.2}{:>10.2}",
                seg, m.n_trades, m.win_rate, m.expectancy_r, pf,
                m.avg_win_r, m.avg_loss_r, m.max_drawdown_r, m.total_r);
        }
        let _ = writeln!(o);
    }
    let _ = writeln!(o, "Read: expectancy(R) > 0 after costs = edge. Trust OOS over IS; a winner that's IS-only is overfit.");
    o
}
