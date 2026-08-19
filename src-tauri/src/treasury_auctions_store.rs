use rusqlite::{params, Connection};
use crate::TreasuryAuction;

// ─── Upsert ───────────────────────────────────────────────────────────────────
// Same natural-key upsert idiom as candle_store/economic_events_store — CUSIP
// is Treasury's own unique identifier for a security, so it's a safe key for
// "insert once, then just keep whatever we already have."

pub fn upsert_auctions(db_path: &str, auctions: &[TreasuryAuction]) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute_batch("PRAGMA journal_mode=WAL;").map_err(|e| e.to_string())?;
    conn.execute_batch("BEGIN;").map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "INSERT OR REPLACE INTO treasury_auctions (
            cusip, security_term, auction_date, issue_date,
            high_yield, bid_to_cover_ratio,
            indirect_bidder_accepted, direct_bidder_accepted, primary_dealer_accepted,
            total_accepted, offering_amount, closing_time_competitive
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
    ).map_err(|e| e.to_string())?;

    for a in auctions {
        stmt.execute(params![
            a.cusip, a.security_term, a.auction_date, a.issue_date,
            a.high_yield, a.bid_to_cover_ratio,
            a.indirect_bidder_accepted, a.direct_bidder_accepted, a.primary_dealer_accepted,
            a.total_accepted, a.offering_amount, a.closing_time_competitive,
        ]).map_err(|e| e.to_string())?;
    }

    conn.execute_batch("COMMIT;").map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Read ─────────────────────────────────────────────────────────────────────

pub fn read_auctions(db_path: &str) -> Result<Vec<TreasuryAuction>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT cusip, security_term, auction_date, issue_date,
                high_yield, bid_to_cover_ratio,
                indirect_bidder_accepted, direct_bidder_accepted, primary_dealer_accepted,
                total_accepted, offering_amount, closing_time_competitive
         FROM treasury_auctions
         ORDER BY auction_date ASC",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok(TreasuryAuction {
            cusip:                    row.get(0)?,
            security_term:            row.get(1)?,
            auction_date:             row.get(2)?,
            issue_date:               row.get(3)?,
            high_yield:               row.get(4)?,
            bid_to_cover_ratio:       row.get(5)?,
            indirect_bidder_accepted: row.get(6)?,
            direct_bidder_accepted:   row.get(7)?,
            primary_dealer_accepted:  row.get(8)?,
            total_accepted:           row.get(9)?,
            offering_amount:          row.get(10)?,
            closing_time_competitive: row.get(11)?,
        })
    }).map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
