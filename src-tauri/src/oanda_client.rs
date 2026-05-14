use serde::Deserialize;

const BASE_URL: &str = "https://api-fxtrade.oanda.com/v3";

// ─── Raw candle (OHLCV only) ──────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct RawCandle {
    pub date:      String,   // "YYYY-MM-DD"
    pub timestamp: String,   // full ISO from OANDA
    pub open:      f64,
    pub high:      f64,
    pub low:       f64,
    pub close:     f64,
    pub volume:    f64,
}

// ─── OANDA response shapes ────────────────────────────────────────────────────

#[derive(Deserialize)]
struct OandaResponse {
    candles: Vec<OandaCandle>,
}

#[derive(Deserialize)]
struct OandaCandle {
    time:     String,
    volume:   u64,
    mid:      OandaMid,
}

#[derive(Deserialize)]
struct OandaMid {
    o: String,
    h: String,
    l: String,
    c: String,
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

pub fn fetch_raw_candles(
    api_key:    &str,
    instrument: &str,       // e.g. "EUR_USD"
    count:      u32,
) -> Result<Vec<RawCandle>, String> {
    let url = format!(
        "{}/instruments/{}/candles?granularity=D&count={}&price=M",
        BASE_URL, instrument, count,
    );

    let response = reqwest::blocking::Client::new()
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Accept-Datetime-Format", "RFC3339")
        .send()
        .map_err(|e| format!("OANDA request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body   = response.text().unwrap_or_default();
        return Err(format!("OANDA error {}: {}", status, body));
    }

    let parsed: OandaResponse = response.json()
        .map_err(|e| format!("OANDA parse error: {}", e))?;

    let candles = parsed.candles
        .into_iter()
        .map(|c| {
            // OANDA daily candles open at 17:00 ET = 21:00–22:00 UTC.
            // The timestamp is therefore the *previous* calendar day in UTC.
            // Advance by one day when hour >= 12 to get the correct forex business date.
            let raw_date = c.time.get(..10).unwrap_or(&c.time);
            let utc_hour: u32 = c.time.get(11..13)
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);
            let date = if utc_hour >= 12 {
                advance_date(raw_date)
            } else {
                raw_date.to_string()
            };
            RawCandle {
                date,
                timestamp: c.time,
                open:   parse_f64(&c.mid.o),
                high:   parse_f64(&c.mid.h),
                low:    parse_f64(&c.mid.l),
                close:  parse_f64(&c.mid.c),
                volume: c.volume as f64,
            }
        })
        .collect();

    Ok(candles)
}

pub fn fetch_raw_candles_tf(
    api_key:     &str,
    instrument:  &str,
    granularity: &str,
    count:       u32,
) -> Result<Vec<RawCandle>, String> {
    let url = format!(
        "{}/instruments/{}/candles?granularity={}&count={}&price=M",
        BASE_URL, instrument, granularity, count,
    );

    let response = reqwest::blocking::Client::new()
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Accept-Datetime-Format", "RFC3339")
        .send()
        .map_err(|e| format!("OANDA request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body   = response.text().unwrap_or_default();
        return Err(format!("OANDA error {}: {}", status, body));
    }

    let parsed: OandaResponse = response.json()
        .map_err(|e| format!("OANDA parse error: {}", e))?;

    let candles = parsed.candles
        .into_iter()
        .map(|c| {
            let raw_date = c.time.get(..10).unwrap_or(&c.time);
            let date = if granularity == "D" {
                let utc_hour: u32 = c.time.get(11..13)
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
                if utc_hour >= 12 { advance_date(raw_date) } else { raw_date.to_string() }
            } else {
                raw_date.to_string()
            };
            RawCandle {
                date,
                timestamp: c.time,
                open:   parse_f64(&c.mid.o),
                high:   parse_f64(&c.mid.h),
                low:    parse_f64(&c.mid.l),
                close:  parse_f64(&c.mid.c),
                volume: c.volume as f64,
            }
        })
        .collect();

    Ok(candles)
}

fn parse_f64(s: &str) -> f64 {
    s.parse().unwrap_or(0.0)
}

/// Advance a "YYYY-MM-DD" string by one calendar day.
fn advance_date(date: &str) -> String {
    let parts: Vec<&str> = date.splitn(3, '-').collect();
    if parts.len() != 3 { return date.to_string(); }
    let y: i32 = parts[0].parse().unwrap_or(0);
    let m: i32 = parts[1].parse().unwrap_or(0);
    let d: i32 = parts[2].parse().unwrap_or(0);
    let days_in_month = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) { 29 } else { 28 },
        _ => 30,
    };
    let (ny, nm, nd) = if d < days_in_month {
        (y, m, d + 1)
    } else if m < 12 {
        (y, m + 1, 1)
    } else {
        (y + 1, 1, 1)
    };
    format!("{:04}-{:02}-{:02}", ny, nm, nd)
}
