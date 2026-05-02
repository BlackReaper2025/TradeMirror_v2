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
            let date = c.time.get(..10).unwrap_or(&c.time).to_string();
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
