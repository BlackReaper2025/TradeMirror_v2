// Positioning snapshot persistence + outcome resolution.
//
// Tables (see migration 0005_positioning.sql):
//   positioning_snapshots — one row per (pair, daily 18:00 snapshot)
//   positioning_outcomes  — one row per resolved snapshot
//
// Time strategy: all timestamps stored as ISO 8601 UTC strings. Comparisons go
// through `iso_to_unix` so fractional-second OANDA timestamps line up with our
// own second-precision stamps. No chrono dependency.

use rusqlite::{Connection, params, OptionalExtension};
use serde::Serialize;

use crate::analytics_v3_demo::CandleV3;
use crate::indicators;
use crate::oanda_client;
use crate::scoring::{self, positioning};

// ─── Time helpers (UTC, no chrono) ────────────────────────────────────────────

pub fn unix_now() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64
}

fn is_leap(y: i32) -> bool {
    (y % 4 == 0) && (y % 100 != 0 || y % 400 == 0)
}

const MONTH_DAYS: [u32; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

fn month_len(year: i32, month: u32) -> u32 {
    if month == 2 && is_leap(year) { 29 } else { MONTH_DAYS[(month - 1) as usize] }
}

pub fn iso_from_unix(unix_secs: i64) -> String {
    let secs = if unix_secs < 0 { 0 } else { unix_secs as u64 };
    let secs_in_day = (secs % 86_400) as u32;
    let mut days = (secs / 86_400) as i64;

    let hour   = secs_in_day / 3600;
    let minute = (secs_in_day % 3600) / 60;
    let second = secs_in_day % 60;

    let mut year = 1970i32;
    loop {
        let year_days = if is_leap(year) { 366 } else { 365 };
        if days < year_days as i64 { break; }
        days -= year_days as i64;
        year += 1;
    }
    let mut month = 1u32;
    loop {
        let ml = month_len(year, month) as i64;
        if days < ml { break; }
        days -= ml;
        month += 1;
    }
    let day = (days as u32) + 1;
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", year, month, day, hour, minute, second)
}

pub fn iso_to_unix(s: &str) -> Option<i64> {
    let year:   i32 = s.get(0..4)?.parse().ok()?;
    let month:  u32 = s.get(5..7)?.parse().ok()?;
    let day:    u32 = s.get(8..10)?.parse().ok()?;
    let hour:   u32 = s.get(11..13)?.parse().ok()?;
    let minute: u32 = s.get(14..16)?.parse().ok()?;
    let second: u32 = s.get(17..19)?.parse().ok()?;

    let mut days: i64 = 0;
    for y in 1970..year {
        days += if is_leap(y) { 366 } else { 365 };
    }
    for m in 1..month {
        days += month_len(year, m) as i64;
    }
    days += (day - 1) as i64;
    Some(days * 86_400 + (hour as i64) * 3600 + (minute as i64) * 60 + second as i64)
}

// ─── Public types ─────────────────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug)]
pub struct PositioningSnapshot {
    pub id:              i64,
    pub created_at:      String,
    pub valid_until:     String,
    pub pair:            String,
    pub tf:              String,
    pub direction:       String,
    pub confidence:      f64,
    pub composite:       f64,
    pub trend_score:     f64,
    pub momentum_score:  f64,
    pub structure_score: f64,
    pub regime:          String,
    pub volatility:      String,
    pub mtf_alignment:   f64,
    pub entry:           f64,
    pub stop_loss:       f64,
    pub tp1:             f64,
    pub tp2:             f64,
    pub tp3:             f64,
    pub risk_pips:       f64,
    pub rationale_json:  String,
    pub synthesis_json:  String,
}

#[derive(Serialize, Clone, Debug)]
pub struct PositioningOutcome {
    pub id:                 i64,
    pub snapshot_id:        i64,
    pub resolved_at:        String,
    pub first_level_hit:    String,    // "tp1" | "tp2" | "tp3" | "sl" | "none"
    pub bars_to_resolution: i32,
    pub mfe_pips:           f64,
    pub mae_pips:           f64,
    pub r_multiple:         f64,
    pub intraday_tf:        String,
    pub notes:              Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct ResolvedSnapshot {
    pub snapshot: PositioningSnapshot,
    pub outcome:  Option<PositioningOutcome>,
}

#[derive(Serialize, Clone, Debug)]
pub struct SliceStats {
    pub key:          String,
    pub n:            u32,
    pub win_rate:     f64,
    pub expectancy_r: f64,
    pub avg_mfe:      f64,
    pub avg_mae:      f64,
}

#[derive(Serialize, Clone, Debug)]
pub struct AccuracyStats {
    pub pair:             String,
    pub window_days:      u32,
    pub n_snapshots:      u32,
    pub n_resolved:       u32,
    pub n_skipped:        u32,
    pub win_rate:         f64,
    pub expectancy_r:     f64,
    pub total_r:          f64,
    pub avg_mfe:          f64,
    pub avg_mae:          f64,
    pub by_regime:        Vec<SliceStats>,
    pub by_confidence:    Vec<SliceStats>,
    pub by_mtf_alignment: Vec<SliceStats>,
}

// ─── Active-pairs config (phase 1: hardcoded EUR/USD) ─────────────────────────

pub fn active_pairs() -> Vec<String> {
    vec!["EUR/USD".into()]
}

fn pair_to_instrument(pair: &str) -> String {
    if pair.contains('_') {
        pair.to_string()
    } else if pair.contains('/') {
        pair.replace('/', "_")
    } else if pair.len() == 6 {
        format!("{}_{}", &pair[..3], &pair[3..])
    } else {
        pair.to_string()
    }
}

// ─── Snapshot writer ──────────────────────────────────────────────────────────

const SNAPSHOT_VALIDITY_SECS: i64   = 24 * 3600;
const BACKFILL_MAX_DAYS:      usize = 15;

/// Synthetic per-business-day snapshot key: "{date}T22:00:00Z" (≈ daily close).
/// Keying every snapshot by business date makes the live scheduler, the cron
/// runner and the backfill all idempotent — one snapshot per pair per day,
/// regardless of which path wrote it.
fn snapshot_created_at(business_date: &str) -> String {
    format!("{}T22:00:00Z", business_date)
}

/// Snapshot id for a given (pair, created_at), if it exists.
fn snapshot_id_for(db_path: &str, pair: &str, created_at: &str) -> Result<Option<i64>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id FROM positioning_snapshots WHERE pair = ?1 AND created_at = ?2",
        params![pair, created_at],
        |row| row.get::<_, i64>(0),
    ).optional().map_err(|e| e.to_string())
}

/// Full snapshot pipeline for a pair using the latest candles.
/// `force = true` (manual trigger) refreshes today's snapshot in place; `force = false`
/// (scheduler / cron) skips if today's snapshot already exists, and skips if the daily
/// bar has not closed yet (not due).
pub fn run_snapshot_for(db_path: &str, api_key: &str, pair: &str, force: bool) -> Result<i64, String> {
    let instrument = pair_to_instrument(pair);
    let fetch = |gran: &str, n: u32| -> Result<Vec<CandleV3>, String> {
        Ok(indicators::compute(oanda_client::fetch_raw_candles_tf(api_key, &instrument, gran, n)?))
    };

    let candles_d = fetch("D", 250)?;
    let last = candles_d.last().ok_or_else(|| "no daily candle returned".to_string())?;
    let created = snapshot_created_at(&last.date);

    if !force {
        if let Some(id) = snapshot_id_for(db_path, pair, &created)? {
            return Ok(id); // already recorded for this business day
        }
        let created_unix = iso_to_unix(&created).unwrap_or(0);
        if unix_now() < created_unix {
            return Err("snapshot not due yet (daily bar still forming)".into());
        }
    }

    let candles_h4 = fetch("H4", 250)?;
    let candles_h1 = fetch("H1", 250)?;
    write_snapshot_from_candles(db_path, pair, &candles_d, &candles_h4, &candles_h1, force)
}

/// Reconstruct any missing daily snapshots from OANDA history (catch-up after the
/// app / PC was off). Walks the most recent trading days; for each one without a
/// snapshot, rebuilds the as-of synthesis (daily series sliced to that day + H4/H1
/// fetched up to that day's close) and writes it with the historical timestamp.
/// Capped to the last BACKFILL_MAX_DAYS trading days. Returns the number written.
pub fn backfill_missing(db_path: &str, api_key: &str, pair: &str) -> Result<usize, String> {
    let instrument = pair_to_instrument(pair);
    let daily = indicators::compute(oanda_client::fetch_raw_candles_tf(api_key, &instrument, "D", 250)?);
    if daily.len() < 2 { return Ok(0); }

    let last_idx = daily.len() - 1;             // current/forming bar — never backfilled
    let start    = last_idx.saturating_sub(BACKFILL_MAX_DAYS);

    let mut count = 0usize;
    for i in start..last_idx {
        let created = snapshot_created_at(&daily[i].date);
        if snapshot_id_for(db_path, pair, &created)?.is_some() { continue; }

        // As-of close ≈ the next bar's open timestamp.
        let to_iso = daily[i + 1].timestamp.clone();
        let h4 = indicators::compute(oanda_client::fetch_raw_candles_tf_to(api_key, &instrument, "H4", 250, &to_iso)?);
        let h1 = indicators::compute(oanda_client::fetch_raw_candles_tf_to(api_key, &instrument, "H1", 250, &to_iso)?);
        let daily_slice = &daily[..=i];

        if write_snapshot_from_candles(db_path, pair, daily_slice, &h4, &h1, false).is_ok() {
            count += 1;
        }
    }
    Ok(count)
}

/// Build synthesis + derive positioning from a candle set and persist it.
/// created_at is the synthetic per-business-day key from the last daily candle.
/// Idempotent via UPSERT on (pair, created_at) — the snapshot id is preserved
/// across refreshes so any linked outcome row stays valid.
fn write_snapshot_from_candles(
    db_path:    &str,
    pair:       &str,
    candles_d:  &[CandleV3],
    candles_h4: &[CandleV3],
    candles_h1: &[CandleV3],
    force:      bool,
) -> Result<i64, String> {
    let last = candles_d.last().ok_or_else(|| "no daily candle returned".to_string())?;
    let created = snapshot_created_at(&last.date);

    if !force {
        if let Some(id) = snapshot_id_for(db_path, pair, &created)? {
            return Ok(id);
        }
    }

    let synth = scoring::build_synthesis("D", pair, candles_d, candles_h4, candles_h1);
    let pip_size = positioning::pip_size_for(pair);
    let atr_pips = if pip_size > 0.0 { last.atr14 / pip_size } else { 0.0 };
    let pos = positioning::derive(&synth, last.close, atr_pips, pip_size, last.r1, last.s1);

    let created_unix = iso_to_unix(&created).ok_or_else(|| "bad created_at".to_string())?;
    let valid  = iso_from_unix(created_unix + SNAPSHOT_VALIDITY_SECS);
    let regime = format!("{:?}", synth.context.regime);
    let vol    = format!("{:?}", synth.context.volatility);
    let rationale_json = serde_json::to_string(&synth.rationale).unwrap_or_else(|_| "[]".into());
    let synthesis_json = serde_json::to_string(&synth).unwrap_or_else(|_| "{}".into());

    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO positioning_snapshots (
            created_at, valid_until, pair, tf,
            direction, confidence, composite,
            trend_score, momentum_score, structure_score,
            regime, volatility, mtf_alignment,
            entry, stop_loss, tp1, tp2, tp3, risk_pips,
            rationale_json, synthesis_json
         ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
            ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21
         )
         ON CONFLICT(pair, created_at) DO UPDATE SET
            valid_until = excluded.valid_until,
            tf = excluded.tf,
            direction = excluded.direction,
            confidence = excluded.confidence,
            composite = excluded.composite,
            trend_score = excluded.trend_score,
            momentum_score = excluded.momentum_score,
            structure_score = excluded.structure_score,
            regime = excluded.regime,
            volatility = excluded.volatility,
            mtf_alignment = excluded.mtf_alignment,
            entry = excluded.entry,
            stop_loss = excluded.stop_loss,
            tp1 = excluded.tp1,
            tp2 = excluded.tp2,
            tp3 = excluded.tp3,
            risk_pips = excluded.risk_pips,
            rationale_json = excluded.rationale_json,
            synthesis_json = excluded.synthesis_json",
        params![
            created, valid, pair, "1D",
            pos.direction, synth.confidence, synth.composite,
            synth.trend.value, synth.momentum.value, synth.structure.value,
            regime, vol, synth.multi_timeframe.alignment_score,
            pos.entry, pos.stop_loss, pos.tp1, pos.tp2, pos.tp3, pos.risk_pips,
            rationale_json, synthesis_json,
        ],
    ).map_err(|e| e.to_string())?;

    snapshot_id_for(db_path, pair, &created)
        .map(|opt| opt.unwrap_or_else(|| conn.last_insert_rowid()))
}

// ─── Snapshot queries ─────────────────────────────────────────────────────────

const SNAPSHOT_COLS: &str =
    "id, created_at, valid_until, pair, tf, \
     direction, confidence, composite, \
     trend_score, momentum_score, structure_score, \
     regime, volatility, mtf_alignment, \
     entry, stop_loss, tp1, tp2, tp3, risk_pips, \
     rationale_json, synthesis_json";

fn map_snapshot_row(row: &rusqlite::Row) -> rusqlite::Result<PositioningSnapshot> {
    Ok(PositioningSnapshot {
        id:              row.get(0)?,
        created_at:      row.get(1)?,
        valid_until:     row.get(2)?,
        pair:            row.get(3)?,
        tf:              row.get(4)?,
        direction:       row.get(5)?,
        confidence:      row.get(6)?,
        composite:       row.get(7)?,
        trend_score:     row.get(8)?,
        momentum_score:  row.get(9)?,
        structure_score: row.get(10)?,
        regime:          row.get(11)?,
        volatility:      row.get(12)?,
        mtf_alignment:   row.get(13)?,
        entry:           row.get(14)?,
        stop_loss:       row.get(15)?,
        tp1:             row.get(16)?,
        tp2:             row.get(17)?,
        tp3:             row.get(18)?,
        risk_pips:       row.get(19)?,
        rationale_json:  row.get(20)?,
        synthesis_json:  row.get(21)?,
    })
}

fn read_outcome(conn: &Connection, snapshot_id: i64) -> Option<PositioningOutcome> {
    conn.query_row(
        "SELECT id, snapshot_id, resolved_at, first_level_hit, bars_to_resolution,
                mfe_pips, mae_pips, r_multiple, intraday_tf, notes
         FROM positioning_outcomes WHERE snapshot_id = ?1",
        params![snapshot_id],
        |row| Ok(PositioningOutcome {
            id:                 row.get(0)?,
            snapshot_id:        row.get(1)?,
            resolved_at:        row.get(2)?,
            first_level_hit:    row.get(3)?,
            bars_to_resolution: row.get(4)?,
            mfe_pips:           row.get(5)?,
            mae_pips:           row.get(6)?,
            r_multiple:         row.get(7)?,
            intraday_tf:        row.get(8)?,
            notes:              row.get(9)?,
        }),
    ).ok()
}

pub fn get_snapshot(db_path: &str, id: i64) -> Result<PositioningSnapshot, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let q = format!("SELECT {} FROM positioning_snapshots WHERE id = ?1", SNAPSHOT_COLS);
    conn.query_row(&q, params![id], map_snapshot_row).map_err(|e| e.to_string())
}

pub fn list_open_snapshots(db_path: &str) -> Result<Vec<PositioningSnapshot>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let q = format!(
        "SELECT {} FROM positioning_snapshots
         WHERE id NOT IN (SELECT snapshot_id FROM positioning_outcomes)
         ORDER BY created_at DESC",
        SNAPSHOT_COLS
    );
    let mut stmt = conn.prepare(&q).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_snapshot_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn list_resolved_snapshots(
    db_path: &str,
    pair:    &str,
    limit:   u32,
) -> Result<Vec<ResolvedSnapshot>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let q = format!(
        "SELECT {} FROM positioning_snapshots
         WHERE pair = ?1
         ORDER BY created_at DESC
         LIMIT ?2",
        SNAPSHOT_COLS
    );
    let mut stmt = conn.prepare(&q).map_err(|e| e.to_string())?;
    let snaps: Vec<PositioningSnapshot> = stmt
        .query_map(params![pair, limit as i64], map_snapshot_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut out = Vec::with_capacity(snaps.len());
    for s in snaps {
        let outcome = read_outcome(&conn, s.id);
        out.push(ResolvedSnapshot { snapshot: s, outcome });
    }
    Ok(out)
}

// ─── Outcome resolver ─────────────────────────────────────────────────────────

/// Whether the bar's range hits TP1 or SL (single-TP system).
/// Conservative tie-break: if both fall inside the same bar, SL wins.
fn first_hit_in_bar(
    bar: &oanda_client::RawCandle,
    is_long: bool,
    tp1: f64, sl: f64,
) -> Option<&'static str> {
    let hit_sl  = if is_long { bar.low  <= sl  } else { bar.high >= sl  };
    let hit_tp1 = if is_long { bar.high >= tp1 } else { bar.low  <= tp1 };
    if hit_sl  { return Some("sl"); }
    if hit_tp1 { return Some("tp1"); }
    None
}

/// Resolve one snapshot by walking its intraday (H1) bars from creation to now.
/// The position is held OPEN until TP1 or SL is hit — there is no time expiry.
/// Returns `Some(outcome)` when resolved (TP1/SL hit, or NEUTRAL = no position),
/// or `None` if the position is still open (no level hit yet). Idempotent.
pub fn resolve_snapshot(
    db_path: &str,
    api_key: &str,
    snapshot_id: i64,
) -> Result<Option<PositioningOutcome>, String> {
    // Idempotent short-circuit.
    {
        let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
        if let Some(existing) = read_outcome(&conn, snapshot_id) {
            return Ok(Some(existing));
        }
    }

    let snap = get_snapshot(db_path, snapshot_id)?;
    let now = unix_now();
    let pip_size = positioning::pip_size_for(&snap.pair);

    // NEUTRAL / skipped snapshots have no position to track — resolve immediately.
    if snap.direction == "NEUTRAL" || snap.risk_pips == 0.0 {
        let outcome = PositioningOutcome {
            id: 0,
            snapshot_id: snap.id,
            resolved_at: iso_from_unix(now),
            first_level_hit: "none".into(),
            bars_to_resolution: 0,
            mfe_pips: 0.0,
            mae_pips: 0.0,
            r_multiple: 0.0,
            intraday_tf: "1H".into(),
            notes: Some("NEUTRAL - no positioning".into()),
        };
        return insert_outcome(db_path, &outcome).map(Some);
    }

    let created_unix = iso_to_unix(&snap.created_at)
        .ok_or_else(|| "invalid created_at".to_string())?;
    if now <= created_unix {
        return Ok(None); // not started yet
    }

    // Fetch H1 bars covering creation -> now (capped at OANDA's 5000 max), then
    // filter to the holding window. Position stays open until TP1 or SL is hit.
    let span_hours = ((now - created_unix) / 3600).max(1);
    let count      = (span_hours + 5).min(5000) as u32;
    let instrument = pair_to_instrument(&snap.pair);
    let now_iso    = iso_from_unix(now);
    let raw = oanda_client::fetch_raw_candles_tf_to(api_key, &instrument, "H1", count, &now_iso)?;

    let mut window: Vec<&oanda_client::RawCandle> = raw.iter()
        .filter(|c| iso_to_unix(&c.timestamp)
            .map(|t| t > created_unix && t <= now)
            .unwrap_or(false))
        .collect();
    window.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    let is_long    = snap.direction == "LONG";
    let entry      = snap.entry;
    let risk_price = entry - snap.stop_loss; // signed; preserves direction in the R formula

    let mut mfe_pips = 0.0_f64;
    let mut mae_pips = 0.0_f64;
    let mut resolved: Option<(&'static str, f64, i32)> = None; // (level, price, bars)

    for (i, c) in window.iter().enumerate() {
        let (favor, adverse) = if is_long {
            ((c.high - entry).max(0.0), (entry - c.low).max(0.0))
        } else {
            ((entry - c.low).max(0.0), (c.high - entry).max(0.0))
        };
        if pip_size > 0.0 {
            mfe_pips = mfe_pips.max(favor   / pip_size);
            mae_pips = mae_pips.max(adverse / pip_size);
        }

        if let Some(level) = first_hit_in_bar(c, is_long, snap.tp1, snap.stop_loss) {
            let price = if level == "sl" { snap.stop_loss } else { snap.tp1 };
            resolved = Some((level, price, (i as i32) + 1));
            break;
        }
    }

    // Still open — no TP1/SL hit yet. Leave unresolved so it keeps running.
    let (level, price, bars) = match resolved {
        Some(t) => t,
        None    => return Ok(None),
    };

    let r_multiple = if risk_price != 0.0 { (price - entry) / risk_price } else { 0.0 };
    let outcome = PositioningOutcome {
        id: 0,
        snapshot_id: snap.id,
        resolved_at: iso_from_unix(now),
        first_level_hit: level.to_string(),
        bars_to_resolution: bars,
        mfe_pips,
        mae_pips,
        r_multiple,
        intraday_tf: "1H".into(),
        notes: None,
    };
    insert_outcome(db_path, &outcome).map(Some)
}

fn insert_outcome(db_path: &str, o: &PositioningOutcome) -> Result<PositioningOutcome, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO positioning_outcomes (
            snapshot_id, resolved_at, first_level_hit, bars_to_resolution,
            mfe_pips, mae_pips, r_multiple, intraday_tf, notes
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            o.snapshot_id, o.resolved_at, o.first_level_hit, o.bars_to_resolution,
            o.mfe_pips, o.mae_pips, o.r_multiple, o.intraday_tf, o.notes,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(PositioningOutcome { id: conn.last_insert_rowid(), ..o.clone() })
}

/// Walk every open snapshot whose validity window has passed and resolve it.
/// Idempotent — already-resolved snapshots are skipped. Returns count resolved.
pub fn resolve_all_pending(db_path: &str, api_key: &str) -> Result<usize, String> {
    let open = list_open_snapshots(db_path)?;
    let mut count = 0usize;
    for s in open {
        // No expiry gate: every open position is checked; it resolves only when
        // TP1 or SL has been hit, otherwise it stays open for the next pass.
        if matches!(resolve_snapshot(db_path, api_key, s.id), Ok(Some(_))) {
            count += 1;
        }
    }
    Ok(count)
}

// ─── Aggregate stats ──────────────────────────────────────────────────────────

struct AggregateRow {
    snapshot:        PositioningSnapshot,
    first_level_hit: Option<String>,
    r_multiple:      Option<f64>,
    mfe_pips:        Option<f64>,
    mae_pips:        Option<f64>,
}

pub fn get_accuracy_stats(db_path: &str, pair: &str, days: u32) -> Result<AccuracyStats, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let cutoff_iso = iso_from_unix(unix_now() - (days as i64) * 86_400);

    let mut stmt = conn.prepare(
        "SELECT s.id, s.created_at, s.valid_until, s.pair, s.tf,
                s.direction, s.confidence, s.composite,
                s.trend_score, s.momentum_score, s.structure_score,
                s.regime, s.volatility, s.mtf_alignment,
                s.entry, s.stop_loss, s.tp1, s.tp2, s.tp3, s.risk_pips,
                s.rationale_json, s.synthesis_json,
                o.first_level_hit, o.r_multiple, o.mfe_pips, o.mae_pips
         FROM positioning_snapshots s
         LEFT JOIN positioning_outcomes o ON o.snapshot_id = s.id
         WHERE s.pair = ?1 AND s.created_at >= ?2
         ORDER BY s.created_at ASC",
    ).map_err(|e| e.to_string())?;

    let iter = stmt.query_map(params![pair, cutoff_iso], |row| {
        Ok(AggregateRow {
            snapshot:        map_snapshot_row(row)?,
            first_level_hit: row.get(22)?,
            r_multiple:      row.get(23)?,
            mfe_pips:        row.get(24)?,
            mae_pips:        row.get(25)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut rows: Vec<AggregateRow> = Vec::new();
    for r in iter { rows.push(r.map_err(|e| e.to_string())?); }

    let n_snapshots = rows.len() as u32;
    let n_skipped   = rows.iter().filter(|r| r.snapshot.direction == "NEUTRAL").count() as u32;

    let resolved: Vec<&AggregateRow> = rows.iter()
        .filter(|r| r.snapshot.direction != "NEUTRAL" && r.first_level_hit.is_some())
        .collect();

    let n_resolved = resolved.len() as u32;
    let total_r: f64 = resolved.iter().filter_map(|r| r.r_multiple).sum();
    let wins = resolved.iter()
        .filter(|r| r.r_multiple.map(|v| v > 0.0).unwrap_or(false))
        .count() as u32;

    let win_rate     = if n_resolved > 0 { wins as f64 / n_resolved as f64 } else { 0.0 };
    let expectancy_r = if n_resolved > 0 { total_r / n_resolved as f64 } else { 0.0 };
    let avg_mfe = if n_resolved > 0 {
        resolved.iter().filter_map(|r| r.mfe_pips).sum::<f64>() / n_resolved as f64
    } else { 0.0 };
    let avg_mae = if n_resolved > 0 {
        resolved.iter().filter_map(|r| r.mae_pips).sum::<f64>() / n_resolved as f64
    } else { 0.0 };

    let by_regime = slice_stats(&resolved, |s| s.regime.clone());
    let by_confidence = slice_stats(&resolved, |s| {
        if s.confidence >= 60.0 { "3 high (>=60)".into() }
        else if s.confidence >= 40.0 { "2 mid (40-60)".into() }
        else { "1 low (<40)".into() }
    });
    let by_mtf_alignment = slice_stats(&resolved, |s| {
        if s.mtf_alignment >= 100.0 { "3 full (100)".into() }
        else if s.mtf_alignment >= 66.0 { "2 high (66-99)".into() }
        else { "1 partial (33-65)".into() }
    });

    Ok(AccuracyStats {
        pair: pair.into(),
        window_days: days,
        n_snapshots, n_resolved, n_skipped,
        win_rate, expectancy_r, total_r, avg_mfe, avg_mae,
        by_regime, by_confidence, by_mtf_alignment,
    })
}

fn slice_stats<F>(rows: &[&AggregateRow], key: F) -> Vec<SliceStats>
where
    F: Fn(&PositioningSnapshot) -> String,
{
    use std::collections::BTreeMap;
    let mut buckets: BTreeMap<String, Vec<(f64, f64, f64)>> = BTreeMap::new();
    for r in rows {
        if let (Some(rv), Some(mfe), Some(mae)) = (r.r_multiple, r.mfe_pips, r.mae_pips) {
            buckets.entry(key(&r.snapshot)).or_default().push((rv, mfe, mae));
        }
    }
    buckets.into_iter().map(|(k, vs)| {
        let n = vs.len() as u32;
        let wins = vs.iter().filter(|(r, ..)| *r > 0.0).count() as u32;
        SliceStats {
            key: k,
            n,
            win_rate:     if n > 0 { wins as f64 / n as f64 } else { 0.0 },
            expectancy_r: if n > 0 { vs.iter().map(|(r, ..)| r).sum::<f64>() / n as f64 } else { 0.0 },
            avg_mfe:      if n > 0 { vs.iter().map(|(_, m, _)| m).sum::<f64>() / n as f64 } else { 0.0 },
            avg_mae:      if n > 0 { vs.iter().map(|(_, _, m)| m).sum::<f64>() / n as f64 } else { 0.0 },
        }
    }).collect()
}
