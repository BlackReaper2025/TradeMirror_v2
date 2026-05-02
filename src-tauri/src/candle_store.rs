use rusqlite::{Connection, params};
use crate::analytics_v3_demo::CandleV3;

// ─── Upsert ───────────────────────────────────────────────────────────────────

pub fn upsert_candles(
    db_path: &str,
    symbol: &str,
    timeframe: &str,
    rows: &[CandleV3],
) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute_batch("PRAGMA journal_mode=WAL;").map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "INSERT OR REPLACE INTO candles_v3 (
            symbol, timeframe, date, timestamp,
            open, high, low, close, volume, volume_sma20,
            sma20, sma50, sma200,
            ema9, ema20, ema50, ema200,
            macd, macd_signal, macd_histogram,
            adx, di_plus, di_minus,
            rsi9, rsi14, rsi_trend,
            stoch_rsi_k, stoch_rsi_d, cci,
            pivot_point, r1, r2, r3, s1, s2, s3,
            kijun, tenkan, senkou_a, senkou_b,
            atr14, bb_upper, bb_middle, bb_lower,
            keltner_upper, keltner_middle, keltner_lower,
            hist_vol,
            price_above_cloud, price_above_kijun,
            inside_bar, rsi_divergence
        ) VALUES (
            ?1,  ?2,  ?3,  ?4,
            ?5,  ?6,  ?7,  ?8,  ?9,  ?10,
            ?11, ?12, ?13,
            ?14, ?15, ?16, ?17,
            ?18, ?19, ?20,
            ?21, ?22, ?23,
            ?24, ?25, ?26,
            ?27, ?28, ?29,
            ?30, ?31, ?32, ?33, ?34, ?35, ?36,
            ?37, ?38, ?39, ?40,
            ?41, ?42, ?43, ?44,
            ?45, ?46, ?47,
            ?48,
            ?49, ?50,
            ?51, ?52
        )",
    ).map_err(|e| e.to_string())?;

    for r in rows {
        stmt.execute(params![
            symbol, timeframe, r.date, r.timestamp,
            r.open, r.high, r.low, r.close, r.volume, r.volume_sma20,
            r.sma20, r.sma50, r.sma200,
            r.ema9, r.ema20, r.ema50, r.ema200,
            r.macd, r.macd_signal, r.macd_histogram,
            r.adx, r.di_plus, r.di_minus,
            r.rsi9, r.rsi14, r.rsi_trend,
            r.stoch_rsi_k, r.stoch_rsi_d, r.cci,
            r.pivot_point, r.r1, r.r2, r.r3, r.s1, r.s2, r.s3,
            r.kijun, r.tenkan, r.senkou_a, r.senkou_b,
            r.atr14, r.bb_upper, r.bb_middle, r.bb_lower,
            r.keltner_upper, r.keltner_middle, r.keltner_lower,
            r.hist_vol,
            r.price_above_cloud as i32, r.price_above_kijun as i32,
            r.inside_bar as i32, r.rsi_divergence as i32,
        ]).map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ─── Read ─────────────────────────────────────────────────────────────────────

pub fn read_candles(
    db_path: &str,
    symbol: &str,
    timeframe: &str,
    limit: usize,
) -> Result<Vec<CandleV3>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT
            date, timestamp,
            open, high, low, close, volume, volume_sma20,
            sma20, sma50, sma200,
            ema9, ema20, ema50, ema200,
            macd, macd_signal, macd_histogram,
            adx, di_plus, di_minus,
            rsi9, rsi14, rsi_trend,
            stoch_rsi_k, stoch_rsi_d, cci,
            pivot_point, r1, r2, r3, s1, s2, s3,
            kijun, tenkan, senkou_a, senkou_b,
            atr14, bb_upper, bb_middle, bb_lower,
            keltner_upper, keltner_middle, keltner_lower,
            hist_vol,
            price_above_cloud, price_above_kijun,
            inside_bar, rsi_divergence
         FROM candles_v3
         WHERE symbol = ?1 AND timeframe = ?2
         ORDER BY date DESC
         LIMIT ?3",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![symbol, timeframe, limit as i64], |row| {
        Ok(CandleV3 {
            date:           row.get(0)?,
            timestamp:      row.get(1)?,
            symbol:         symbol.to_string(),
            open:           row.get(2)?,
            high:           row.get(3)?,
            low:            row.get(4)?,
            close:          row.get(5)?,
            volume:         row.get(6)?,
            volume_sma20:   row.get(7)?,
            sma20:          row.get(8)?,
            sma50:          row.get(9)?,
            sma200:         row.get(10)?,
            ema9:           row.get(11)?,
            ema20:          row.get(12)?,
            ema50:          row.get(13)?,
            ema200:         row.get(14)?,
            macd:           row.get(15)?,
            macd_signal:    row.get(16)?,
            macd_histogram: row.get(17)?,
            adx:            row.get(18)?,
            di_plus:        row.get(19)?,
            di_minus:       row.get(20)?,
            rsi9:           row.get(21)?,
            rsi14:          row.get(22)?,
            rsi_trend:      row.get(23)?,
            stoch_rsi_k:    row.get(24)?,
            stoch_rsi_d:    row.get(25)?,
            cci:            row.get(26)?,
            pivot_point:    row.get(27)?,
            r1:             row.get(28)?,
            r2:             row.get(29)?,
            r3:             row.get(30)?,
            s1:             row.get(31)?,
            s2:             row.get(32)?,
            s3:             row.get(33)?,
            kijun:          row.get(34)?,
            tenkan:         row.get(35)?,
            senkou_a:       row.get(36)?,
            senkou_b:       row.get(37)?,
            atr14:          row.get(38)?,
            bb_upper:       row.get(39)?,
            bb_middle:      row.get(40)?,
            bb_lower:       row.get(41)?,
            keltner_upper:  row.get(42)?,
            keltner_middle: row.get(43)?,
            keltner_lower:  row.get(44)?,
            hist_vol:              row.get(45)?,
            price_above_cloud: row.get::<_, i32>(46)? != 0,
            price_above_kijun: row.get::<_, i32>(47)? != 0,
            inside_bar:        row.get::<_, i32>(48)? != 0,
            rsi_divergence:    row.get::<_, i32>(49)? != 0,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    result.reverse(); // DESC fetch → reverse to ASC for charts
    Ok(result)
}
