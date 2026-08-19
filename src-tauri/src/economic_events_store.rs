use rusqlite::{params, Connection};
use crate::EconomicEvent;

// ─── Upsert ───────────────────────────────────────────────────────────────────
// The unofficial calendar feed only ever serves the current Sun-Sat window, so
// whatever it returns is discarded again within days. Persisting each poll
// here — keyed on (title, date), same natural-key idiom candle_store uses for
// (symbol, timeframe, date) — is what lets a release's `actual` value survive
// past its own calendar week for the News indicator's surprise/interpretation
// tooltip.

pub fn upsert_events(db_path: &str, events: &[EconomicEvent]) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute_batch("PRAGMA journal_mode=WAL;").map_err(|e| e.to_string())?;
    conn.execute_batch("BEGIN;").map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "INSERT OR REPLACE INTO economic_events (
            title, country, date, impact, forecast, previous, actual
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    ).map_err(|e| e.to_string())?;

    for e in events {
        stmt.execute(params![
            e.title, e.country, e.date, e.impact, e.forecast, e.previous, e.actual,
        ]).map_err(|e| e.to_string())?;
    }

    conn.execute_batch("COMMIT;").map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Read ─────────────────────────────────────────────────────────────────────

pub fn read_events(db_path: &str) -> Result<Vec<EconomicEvent>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT title, country, date, impact, forecast, previous, actual
         FROM economic_events
         ORDER BY date ASC",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok(EconomicEvent {
            title:    row.get(0)?,
            country:  row.get(1)?,
            date:     row.get(2)?,
            impact:   row.get(3)?,
            forecast: row.get(4)?,
            previous: row.get(5)?,
            actual:   row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
