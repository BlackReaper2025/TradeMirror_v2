use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};
use tauri::Manager;

// ─── List image files in a folder ─────────────────────────────────────────────

#[tauri::command]
fn list_images(folder: String) -> Vec<String> {
    use std::fs;
    use std::path::Path;

    let path = Path::new(&folder);
    if !path.is_dir() {
        return vec![];
    }

    let extensions = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif"];

    let mut paths: Vec<String> = fs::read_dir(path)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter_map(|e| {
                    let p = e.path();
                    if !p.is_file() { return None; }
                    let ext = p.extension()
                        .and_then(|x| x.to_str())
                        .map(|s| s.to_lowercase())
                        .unwrap_or_default();
                    if extensions.contains(&ext.as_str()) {
                        p.to_str().map(|s| s.to_string())
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    paths.sort();
    paths
}


// ─── Read a file from disk ────────────────────────────────────────────────────

#[tauri::command]
fn read_credentials_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

// ─── Copy a trade entry/exit screenshot into the app's data dir ───────────────

#[tauri::command]
fn save_trade_screenshot(app: tauri::AppHandle, source_path: String, kind: String) -> Result<String, String> {
    use std::time::{SystemTime, UNIX_EPOCH};

    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("screenshots");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let ext = std::path::Path::new(&source_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?;
    let file_name = format!("{}-{}-{}.{}", kind, now.as_millis(), now.subsec_nanos(), ext);
    let dest = dir.join(file_name);

    std::fs::copy(&source_path, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

// ─── Save an in-memory chart screenshot (base64 PNG) into the app's data dir ──

#[tauri::command]
fn save_chart_screenshot(app: tauri::AppHandle, data_base64: String, kind: String) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use std::time::{SystemTime, UNIX_EPOCH};

    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("screenshots");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let bytes = STANDARD.decode(data_base64.as_bytes()).map_err(|e| e.to_string())?;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?;
    let file_name = format!("{}-{}-{}.png", kind, now.as_millis(), now.subsec_nanos());
    let dest = dir.join(file_name);

    std::fs::write(&dest, bytes).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

// ─── Send Telegram test notification ─────────────────────────────────────────

#[tauri::command]
fn send_test_notification() -> Result<(), String> {
    let token = std::fs::read_to_string(TELEGRAM_TOKEN_PATH)
        .map_err(|e| format!("Could not read Telegram token: {}", e))?
        .trim()
        .to_string();
    let chat_id = std::fs::read_to_string(TELEGRAM_CHAT_ID_PATH)
        .map_err(|e| format!("Could not read Telegram chat ID: {}", e))?
        .trim()
        .to_string();

    let url = format!("https://api.telegram.org/bot{}/sendMessage", token);
    reqwest::blocking::Client::new()
        .post(&url)
        .json(&serde_json::json!({
            "chat_id": chat_id,
            "text": "🔔 TradeMirror Test Notification\n\nAlert system is working correctly."
        }))
        .send()
        .map_err(|e| format!("Telegram request failed: {}", e))?;

    Ok(())
}

#[tauri::command]
fn send_telegram_message(text: String) -> Result<(), String> {
    let token = std::fs::read_to_string(TELEGRAM_TOKEN_PATH)
        .map_err(|e| format!("Could not read Telegram token: {}", e))?
        .trim()
        .to_string();
    let chat_id = std::fs::read_to_string(TELEGRAM_CHAT_ID_PATH)
        .map_err(|e| format!("Could not read Telegram chat ID: {}", e))?
        .trim()
        .to_string();

    let url = format!("https://api.telegram.org/bot{}/sendMessage", token);
    reqwest::blocking::Client::new()
        .post(&url)
        .json(&serde_json::json!({ "chat_id": chat_id, "text": text }))
        .send()
        .map_err(|e| format!("Telegram request failed: {}", e))?;

    Ok(())
}

// ─── Analytics V3 — sync OANDA → indicators → SQLite ─────────────────────────

const OANDA_KEY_PATH: &str = "C:\\Users\\Geoff\\.trademirror\\oanda-api-key.txt";
const TELEGRAM_TOKEN_PATH: &str = "C:\\Users\\Geoff\\.trademirror\\telegram-bot-token.txt";
const TELEGRAM_CHAT_ID_PATH: &str = "C:\\Users\\Geoff\\.trademirror\\telegram-chat-id.txt";

/// Normalizes a display pair ("EURUSD", "EUR/USD", "EUR_USD") to OANDA's
/// underscored instrument form. Mirrors the conversion already used by
/// get_live_candles / get_live_candles_computed / get_synthesis.
///
/// CFD indices/energy don't derive from the display symbol via the generic
/// 3+3 split (e.g. "US500" is not "US5_00") and OANDA's own codes for them
/// don't match the display name at all, so they need an explicit table.
fn to_oanda_instrument(pair: &str) -> String {
    if pair.contains('_') {
        return pair.to_string();
    }
    if pair.contains('/') {
        return pair.replace('/', "_");
    }
    match pair {
        "US500" => "SPX500_USD".to_string(),
        "US100" => "NAS100_USD".to_string(),
        "US30"  => "US30_USD".to_string(),
        "USOIL" => "WTICO_USD".to_string(),
        "NATGAS" => "NATGAS_USD".to_string(),
        "US02Y" => "USB02Y_USD".to_string(),
        "US05Y" => "USB05Y_USD".to_string(),
        "US10Y" => "USB10Y_USD".to_string(),
        "US30Y" => "USB30Y_USD".to_string(),
        "DE30"  => "DE30_EUR".to_string(),
        "UK100" => "UK100_GBP".to_string(),
        "JP225" => "JP225_USD".to_string(),
        "FR40"  => "FR40_EUR".to_string(),
        "EU50"  => "EU50_EUR".to_string(),
        "HK33"  => "HK33_HKD".to_string(),
        "AU200" => "AU200_AUD".to_string(),
        _ => format!("{}_{}", &pair[..3], &pair[3..]),
    }
}

/// Core sync logic — usable from both the Tauri command and the background thread.
/// `pair` is a display pair like "EURUSD"; it is normalized to the OANDA instrument
/// form for the fetch and back to a bare symbol (no separators) for storage.
fn background_sync(db_path: &str, pair: &str) -> Result<usize, String> {
    let api_key = read_oanda_key()?;
    let instrument = to_oanda_instrument(pair);
    let symbol = instrument.replace('_', "");
    let raw = oanda_client::fetch_raw_candles(&api_key, &instrument, 500)?;
    let rows = indicators::compute(raw, &symbol);
    let count = rows.len();
    candle_store::upsert_candles(db_path, &symbol, "D", &rows)?;
    Ok(count)
}

/// Seconds until next 22:10 UTC (≈ 18:10 ET). If already past today's window, schedules for tomorrow.
fn secs_until_daily_sync() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let secs_in_day = now % 86400;
    let target: u64 = 22 * 3600 + 10 * 60; // 22:10 UTC
    if secs_in_day < target {
        target - secs_in_day
    } else {
        86400 - secs_in_day + target
    }
}

#[tauri::command]
fn sync_oanda_candles_v3(app: tauri::AppHandle, pair: String) -> Result<usize, String> {
    let db_path = app.path().app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("trademirror.db");
    background_sync(db_path.to_str().unwrap_or(""), &pair)
}

// ─── Analytics V3 ─────────────────────────────────────────────────────────────
mod analytics_v3_demo;
mod candle_store;
mod economic_events_store;
mod oanda_client;
mod treasury_auctions_store;
mod indicators;
mod scoring;
mod backtest;
use analytics_v3_demo::CandleV3;

/// Read the OANDA API key from disk (first non-empty line), cached for the
/// process lifetime — this used to be re-read from disk on every single
/// command call (get_live_price polls every 5s, others every 10-60s), which
/// added a filesystem round-trip to each one for a value that's effectively
/// constant during a session. Same OnceLock pattern as oanda_client::client().
/// A key file edit while the app is running needs a restart to pick up —
/// acceptable given how rarely the key itself changes.
fn read_oanda_key() -> Result<String, String> {
    use std::sync::OnceLock;
    static KEY: OnceLock<Result<String, String>> = OnceLock::new();
    KEY.get_or_init(|| {
        let contents = std::fs::read_to_string(OANDA_KEY_PATH)
            .map_err(|e| format!("Could not read OANDA key file: {}", e))?;
        let key = contents.lines().next().unwrap_or("").trim().to_string();
        if key.is_empty() { Err("OANDA API key is empty".into()) } else { Ok(key) }
    }).clone()
}

#[tauri::command]
fn get_candles_v3(app: tauri::AppHandle, pair: String) -> Result<Vec<CandleV3>, String> {
    let db_path = app.path().app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("trademirror.db");

    let symbol = to_oanda_instrument(&pair).replace('_', "");
    let rows = candle_store::read_candles(
        db_path.to_str().unwrap_or(""),
        &symbol, "D", 500,
    ).unwrap_or_default();

    if rows.is_empty() {
        Ok(analytics_v3_demo::demo_rows())
    } else {
        Ok(rows)
    }
}


// ─── Forex news — RSS fetch ───────────────────────────────────────────────────

#[derive(serde::Serialize, Clone)]
struct NewsItem {
    title: String,
    link: String,
    pub_date: String,
    source: String,
}

fn parse_rss(xml: &str, source: &str) -> Vec<NewsItem> {
    use quick_xml::Reader;
    use quick_xml::events::Event;

    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut items: Vec<NewsItem> = Vec::new();
    let mut buf = Vec::new();
    let mut in_item = false;
    let mut cur_tag = String::new();
    let mut cur_title = String::new();
    let mut cur_link = String::new();
    let mut cur_date = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let name = std::str::from_utf8(e.local_name().as_ref()).unwrap_or("").to_string();
                if matches!(name.as_str(), "item" | "entry") {
                    in_item = true;
                    cur_title.clear(); cur_link.clear(); cur_date.clear();
                }
                cur_tag = name;
            }
            Ok(Event::End(ref e)) => {
                let ln = e.local_name();
                let name = std::str::from_utf8(ln.as_ref()).unwrap_or("");
                if matches!(name, "item" | "entry") && in_item && !cur_title.is_empty() {
                    items.push(NewsItem {
                        title: cur_title.clone(),
                        link: cur_link.clone(),
                        pub_date: cur_date.clone(),
                        source: source.to_string(),
                    });
                    in_item = false;
                }
                cur_tag.clear();
            }
            Ok(Event::Text(ref e)) => {
                if in_item {
                    if let Ok(text) = e.unescape() {
                        let text = text.trim().to_string();
                        if !text.is_empty() {
                            match cur_tag.as_str() {
                                "title" => cur_title = text,
                                "link" => { if cur_link.is_empty() { cur_link = text; } }
                                "pubDate" | "published" | "updated" | "date" => cur_date = text,
                                _ => {}
                            }
                        }
                    }
                }
            }
            Ok(Event::CData(ref e)) => {
                if in_item {
                    let text = std::str::from_utf8(e.as_ref()).unwrap_or("").trim().to_string();
                    if !text.is_empty() && cur_tag == "title" {
                        cur_title = text;
                    }
                }
            }
            Ok(Event::Empty(ref e)) => {
                let eln = e.local_name();
                let name = std::str::from_utf8(eln.as_ref()).unwrap_or("");
                if in_item && name == "link" {
                    for attr in e.attributes().flatten() {
                        let key = std::str::from_utf8(attr.key.as_ref()).unwrap_or("");
                        if key == "href" {
                            if let Ok(val) = std::str::from_utf8(&attr.value) {
                                cur_link = val.to_string();
                            }
                        }
                    }
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    items
}

fn fetch_rss_items(url: &str, source_name: &str) -> Vec<NewsItem> {
    let xml = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(6))
        .user_agent("TradeMirror/1.0")
        .build()
        .ok()
        .and_then(|c| c.get(url).send().ok())
        .and_then(|r| r.text().ok());
    match xml {
        Some(text) => parse_rss(&text, source_name),
        None => vec![],
    }
}

#[tauri::command]
fn get_forex_news() -> Vec<NewsItem> {
    let sources: &[(&str, &str)] = &[
        ("https://www.forexlive.com/feed/news", "ForexLive"),
        ("https://www.fxstreet.com/rss/news",   "FXStreet"),
    ];
    let handles: Vec<_> = sources.iter().map(|&(url, name)| {
        let url  = url.to_string();
        let name = name.to_string();
        std::thread::spawn(move || fetch_rss_items(&url, &name))
    }).collect();
    let mut all: Vec<NewsItem> = handles.into_iter()
        .filter_map(|h| h.join().ok())
        .flatten()
        .collect();
    all.truncate(60);
    all
}

// ─── Economic calendar — unofficial ForexFactory JSON feed ───────────────────
// No official free economic-calendar API exists with impact ratings; this feed
// is undocumented and unauthenticated (used widely by open-source calendar
// widgets) and is rate-limited, so the frontend polls it infrequently.
#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct EconomicEvent {
    title: String,
    country: String,
    date: String,
    impact: String,
    forecast: String,
    previous: String,
    #[serde(default)]
    actual: String,
}

#[tauri::command]
fn get_economic_calendar(app: tauri::AppHandle) -> Result<Vec<EconomicEvent>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .user_agent("Mozilla/5.0 (compatible; TradeMirror/1.0)")
        .build()
        .map_err(|e| e.to_string())?;

    // "thisweek" is the only window this free feed actually serves — there is
    // no "ff_calendar_nextweek.json" (confirmed: 404s, always has). A prior
    // attempt to pull it and merge it in silently failed on every single call
    // since the .json() parse of that 404 page never succeeds, so it merged
    // nothing while still burning one of the ~2-requests-per-5-minutes this
    // host allows — meaning the one call that *does* work only got half its
    // rate-limit budget. Late in the calendar week (Fri/Sat) "thisweek" will
    // legitimately thin out toward zero remaining events; that's a ceiling of
    // this data source, not something fixable client-side.
    let events: Vec<EconomicEvent> = client
        .get("https://nfs.faireconomy.media/ff_calendar_thisweek.json")
        .send().map_err(|e| format!("request: {}", e))?
        .json::<Vec<EconomicEvent>>()
        .map_err(|e| format!("parse: {}", e))?;

    // Best-effort persistence: this feed drops every event once it scrolls out
    // of its own current-week window, which is what makes a past release's
    // actual/forecast/previous unrecoverable for the News indicator's
    // surprise tooltip. Saving each poll (keyed on title+date, so the same
    // event just gets its `actual` filled in once released) is what lets that
    // data survive. A save failure shouldn't break the calendar feature the
    // rest of the app already relies on, so it's logged, not propagated.
    if let Ok(db_path) = app.path().app_data_dir().map(|d| d.join("trademirror.db")) {
        if let Err(e) = economic_events_store::upsert_events(db_path.to_str().unwrap_or(""), &events) {
            eprintln!("[economic_events] persist failed: {}", e);
        }
    }

    Ok(events)
}

/// All economic events ever persisted by `get_economic_calendar`'s polling —
/// the News indicator's only source for actual/forecast/previous on releases
/// that have scrolled out of the live feed's current-week window.
#[tauri::command]
fn get_stored_economic_events(app: tauri::AppHandle) -> Result<Vec<EconomicEvent>, String> {
    let db_path = app.path().app_data_dir().map_err(|e: tauri::Error| e.to_string())?
        .join("trademirror.db");
    economic_events_store::read_events(db_path.to_str().unwrap_or(""))
}

// ─── Treasury auctions — TreasuryDirect's official auction-results API ───────
// The ForexFactory calendar feed only carries 2 of the 7 fields the News
// indicator's auction marker wants (high yield, bid-to-cover) and doesn't
// reliably include USD auctions at all. TreasuryDirect's own public API
// (treasurydirect.gov, no key required) has the real published results —
// confirmed field names by fetching it directly, not guessed. It has no
// "tail"/"when-issued yield" field either (Treasury's results simply don't
// publish that; it's a market-quoted figure, not an auction-result one), so
// those two stay genuinely unavailable rather than invented.
#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TreasuryAuction {
    cusip: String,
    security_term: String,
    auction_date: String,
    issue_date: String,
    #[serde(default)]
    high_yield: String,
    #[serde(default)]
    bid_to_cover_ratio: String,
    #[serde(default)]
    indirect_bidder_accepted: String,
    #[serde(default)]
    direct_bidder_accepted: String,
    #[serde(default)]
    primary_dealer_accepted: String,
    #[serde(default)]
    total_accepted: String,
    #[serde(default)]
    offering_amount: String,
    // auctionDate is date-only (midnight, no timezone) — not the real
    // auction time, and parsing it naively is what put markers on the
    // wrong hour depending on the app's local system timezone. Real
    // auctions close for competitive bidding, and results become official,
    // at this field instead — confirmed "01:00 PM" (always US Eastern) on
    // every recent 10Y/30Y auction checked against the live API.
    #[serde(default)]
    closing_time_competitive: String,
}

/// Fetches recent 10-Year note and 30-Year bond auctions (including their
/// later reopenings — TreasuryDirect terms a reopening by its remaining
/// maturity, "9-Year Xx-Month" for the 10-Year and "29-Year Xx-Month" for
/// the 30-Year) from TreasuryDirect, persists them, and returns the
/// freshly-fetched set.
/// `days` bounds the query window — a modest recent window is enough since
/// this polls periodically and every past auction is already in the DB from
/// a prior poll; it just needs to not miss whatever's newest.
#[tauri::command]
fn sync_treasury_auctions(app: tauri::AppHandle) -> Result<Vec<TreasuryAuction>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("Mozilla/5.0 (compatible; TradeMirror/1.0)")
        .build()
        .map_err(|e| e.to_string())?;

    let fetch_type = |security_type: &str| -> Result<Vec<TreasuryAuction>, String> {
        client
            .get(format!(
                "https://www.treasurydirect.gov/TA_WS/securities/auctioned?type={}&days=120&format=json",
                security_type
            ))
            .send().map_err(|e| format!("request: {}", e))?
            .json::<Vec<TreasuryAuction>>()
            .map_err(|e| format!("parse: {}", e))
    };

    let mut auctions: Vec<TreasuryAuction> = fetch_type("Note")?
        .into_iter()
        .filter(|a| a.security_term == "10-Year" || a.security_term.starts_with("9-Year"))
        .collect();
    auctions.extend(
        fetch_type("Bond")?
            .into_iter()
            .filter(|a| a.security_term == "30-Year" || a.security_term.starts_with("29-Year")),
    );

    if let Ok(db_path) = app.path().app_data_dir().map(|d| d.join("trademirror.db")) {
        if let Err(e) = treasury_auctions_store::upsert_auctions(db_path.to_str().unwrap_or(""), &auctions) {
            eprintln!("[treasury_auctions] persist failed: {}", e);
        }
    }

    Ok(auctions)
}

/// All 10Y/30Y auctions ever persisted by `sync_treasury_auctions`.
#[tauri::command]
fn get_stored_treasury_auctions(app: tauri::AppHandle) -> Result<Vec<TreasuryAuction>, String> {
    let db_path = app.path().app_data_dir().map_err(|e: tauri::Error| e.to_string())?
        .join("trademirror.db");
    treasury_auctions_store::read_auctions(db_path.to_str().unwrap_or(""))
}

/// One-time deep backfill of 10Y/30Y auction history — `sync_treasury_auctions`
/// only reaches back ~120 days because it hits `securities/auctioned`, which
/// caps out around 250 total records across every note/bond term regardless
/// of the `days` value requested (confirmed directly against the live API —
/// larger `days` values returned the identical record count). The
/// `securities/search` endpoint instead accepts an exact `securityTerm`
/// filter and returns TreasuryDirect's true full history for that term
/// alone — genuinely back to 1979 for both 10-Year notes and 30-Year bonds.
/// Six term variants cover both buckets' original issuances and their later
/// reopenings (TreasuryDirect labels a reopening by its remaining maturity
/// at issuance, not by its original term — e.g. a 30-Year bond's second-year
/// reopening is termed "29-Year 10-Month", confirmed against the live API).
#[tauri::command]
fn backfill_treasury_auctions(app: tauri::AppHandle) -> Result<usize, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .user_agent("Mozilla/5.0 (compatible; TradeMirror/1.0)")
        .build()
        .map_err(|e| e.to_string())?;

    let terms: [(&str, &str); 6] = [
        ("Note", "10-Year"), ("Note", "9-Year 10-Month"), ("Note", "9-Year 11-Month"),
        ("Bond", "30-Year"), ("Bond", "29-Year 10-Month"), ("Bond", "29-Year 11-Month"),
    ];

    let mut auctions: Vec<TreasuryAuction> = Vec::new();
    for (security_type, term) in terms {
        let url = format!(
            "https://www.treasurydirect.gov/TA_WS/securities/search?type={}&securityTerm={}&format=json",
            security_type,
            term.replace(' ', "%20"),
        );
        let batch: Vec<TreasuryAuction> = client
            .get(&url)
            .send().map_err(|e| format!("request ({}): {}", term, e))?
            .json::<Vec<TreasuryAuction>>()
            .map_err(|e| format!("parse ({}): {}", term, e))?;
        auctions.extend(batch);
    }

    let count = auctions.len();
    let db_path = app.path().app_data_dir().map_err(|e: tauri::Error| e.to_string())?
        .join("trademirror.db");
    treasury_auctions_store::upsert_auctions(db_path.to_str().unwrap_or(""), &auctions)?;
    Ok(count)
}

// ─── OANDA live price streaming ───────────────────────────────────────────────

/// Fetch the latest mid price for the given pair (defaults to EUR_USD).
/// Uses M1 candles — universally available on all OANDA accounts.
/// Reads the API key exactly as background_sync does (proven to work).
#[tauri::command]
async fn get_live_price(pair: Option<String>) -> Result<f64, String> {
    let api_key = read_oanda_key()?;

    let pair = pair.unwrap_or_else(|| "EUR/USD".to_string());
    let instrument = to_oanda_instrument(&pair);

    let url = format!(
        "https://api-fxtrade.oanda.com/v3/instruments/{}/candles?granularity=M1&count=1&price=M",
        instrument
    );
    let resp: serde_json::Value = reqwest::Client::new()
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Accept-Datetime-Format", "RFC3339")
        .send().await.map_err(|e| format!("request: {:?}", e))?
        .json().await.map_err(|e| format!("parse: {}", e))?;

    resp["candles"][0]["mid"]["c"].as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .ok_or_else(|| format!("unexpected response: {}", resp))
}

// ─── Live candles for any timeframe (price chart) ────────────────────────────

#[tauri::command]
fn get_live_candles(pair: String, tf: String) -> Result<Vec<oanda_client::RawCandle>, String> {
    let api_key = read_oanda_key()?;

    let instrument = to_oanda_instrument(&pair);

    let granularity = match tf.as_str() {
        "1W"  => "W",
        "1D"  => "D",
        "4H"  => "H4",
        "1H"  => "H1",
        "15M" => "M15",
        "5M"  => "M5",
        "1M"  => "M1",
        _     => return Err(format!("Unknown timeframe: {}", tf)),
    };

    oanda_client::fetch_raw_candles_tf(&api_key, &instrument, granularity, 1000)
}

// ─── Live candles with computed indicators for any timeframe ─────────────────

#[tauri::command]
fn get_live_candles_computed(pair: String, tf: String) -> Result<Vec<CandleV3>, String> {
    let api_key = read_oanda_key()?;

    let instrument = to_oanda_instrument(&pair);
    let symbol = instrument.replace('_', "");

    let granularity = match tf.as_str() {
        "1W"  => "W",
        "1D"  => "D",
        "4H"  => "H4",
        "1H"  => "H1",
        "15M" => "M15",
        "5M"  => "M5",
        "1M"  => "M1",
        _     => return Err(format!("Unknown timeframe: {}", tf)),
    };

    let raw = oanda_client::fetch_raw_candles_tf(&api_key, &instrument, granularity, 1000)?;
    Ok(indicators::compute(raw, &symbol))
}

// ─── Synthesis: regime-weighted multi-timeframe scoring ──────────────────────

#[tauri::command]
fn get_synthesis(pair: String, tf: String) -> Result<scoring::Synthesis, String> {
    let api_key = read_oanda_key()?;

    let instrument = to_oanda_instrument(&pair);
    let symbol = instrument.replace('_', "");

    let primary_tf = match tf.as_str() {
        "1D" | "D"  => "D",
        "4H" | "H4" => "H4",
        "1H" | "H1" => "H1",
        other       => return Err(format!("Unsupported primary timeframe for synthesis: {}", other)),
    };

    let fetch = |gran: &str, n: u32| -> Result<Vec<CandleV3>, String> {
        let raw = oanda_client::fetch_raw_candles_tf(&api_key, &instrument, gran, n)?;
        Ok(indicators::compute(raw, &symbol))
    };

    // 250 bars give all indicator series ample warm-up (incl. EMA200, ADX 2x period seed).
    let candles_d  = fetch("D",  250)?;
    let candles_h4 = fetch("H4", 250)?;
    let candles_h1 = fetch("H1", 250)?;

    Ok(scoring::build_synthesis(
        primary_tf,
        &pair,
        &candles_d, &candles_h4, &candles_h1,
    ))
}

// ─── Headless positioning cron (runs without the GUI) ────────────────────────

/// Database path used by the headless cron, matching Tauri's app_data_dir:
/// %APPDATA%\com.geoff.trademirror\trademirror.db on Windows.
fn cron_db_path() -> String {
    let base = std::env::var("APPDATA").unwrap_or_default();
    format!("{}\\com.geoff.trademirror\\trademirror.db", base)
}

/// One-shot backtest runner for the headless binary (src/bin/backtest.rs).
/// Reads daily EURUSD from the shared DB, runs the strategy-validation harness,
/// and prints the results. Read-only: never writes trades or places orders.
pub fn run_backtest_cli() {
    let db_path = cron_db_path();
    // Timeframe from CLI arg (e.g. `cargo run --bin backtest -- M5`); default M15.
    let tf = std::env::args().nth(1).unwrap_or_else(|| "M15".to_string());

    if tf != "D" {
        let rows = candle_store::read_candles(&db_path, "EURUSD", &tf, 5_000_000).unwrap_or_default();
        if rows.len() < 320 {
            println!("[backtest] only {} {} candles. Backfill first (e.g. `cargo run --bin backfill_m5`).", rows.len(), tf);
            return;
        }
        let cfg = backtest::BtConfig::m15();
        let reports = backtest::run_all(&rows, &cfg, &backtest::m15_suite(&rows));
        let label = format!("EURUSD {} (MTF confluence)", tf);
        println!("{}", backtest::format_reports(&reports, &cfg, rows.len(), &label));
        return;
    }

    let d = candle_store::read_candles(&db_path, "EURUSD", "D", 100_000).unwrap_or_default();
    let cfg = backtest::BtConfig::daily();
    if d.len() < cfg.warmup + 20 {
        println!("[backtest] only {} daily candles.", d.len());
        return;
    }
    let reports = backtest::run_all(&d, &cfg, &backtest::all_strategies());
    println!("{}", backtest::format_reports(&reports, &cfg, d.len(), "EURUSD Daily"));
}

/// Backfill ~`target_bars` of an intraday timeframe into candles_v3 by paging
/// backward through OANDA's `to` cursor, then computing indicators once over the
/// full continuous series. Intraday rows are keyed by full timestamp in `date`
/// so they don't collide on the day-only unique key used by daily candles.
fn backfill_tf(
    db_path: &str, api_key: &str,
    instrument: &str, store_symbol: &str, granularity: &str, target_bars: usize,
) -> Result<usize, String> {
    use std::collections::BTreeMap;
    const PAGE: u32 = 5000;
    const MAX_PAGES: usize = 60;

    let mut by_ts: BTreeMap<String, oanda_client::RawCandle> = BTreeMap::new();

    let batch = oanda_client::fetch_raw_candles_tf(api_key, instrument, granularity, PAGE)?;
    if batch.is_empty() { return Err("OANDA returned no candles".into()); }
    let mut oldest = batch.iter().map(|c| c.timestamp.clone()).min().unwrap_or_default();
    for c in batch { by_ts.insert(c.timestamp.clone(), c); }

    let mut pages = 1usize;
    while by_ts.len() < target_bars && pages < MAX_PAGES {
        let b = oanda_client::fetch_raw_candles_tf_to(api_key, instrument, granularity, PAGE, &oldest)?;
        if b.len() <= 1 { break; }
        let new_oldest = b.iter().map(|c| c.timestamp.clone()).min().unwrap_or_default();
        for c in b { by_ts.insert(c.timestamp.clone(), c); }
        pages += 1;
        if new_oldest == oldest { break; } // no progress → end of history
        oldest = new_oldest;
        println!("[backfill] page {} — {} bars so far, oldest {}", pages, by_ts.len(), oldest);
    }

    let raw: Vec<oanda_client::RawCandle> = by_ts.into_values().collect();
    println!("[backfill] fetched {} raw {} candles over {} page(s); computing indicators…",
        raw.len(), granularity, pages);

    let mut rows = indicators::compute(raw, store_symbol);
    for r in rows.iter_mut() { r.date = r.timestamp.clone(); } // unique key for intraday
    let n = rows.len();
    candle_store::upsert_candles(db_path, store_symbol, granularity, &rows)?;
    Ok(n)
}

/// Headless entry: backfill ~3 years of EURUSD M15 into the shared DB.
pub fn backfill_m15_cli() {
    let db_path = cron_db_path();
    let api_key = match read_oanda_key() {
        Ok(k) => k,
        Err(e) => { eprintln!("[backfill] {}", e); return; }
    };
    println!("[backfill] EURUSD M15 → {}", db_path);
    match backfill_tf(&db_path, &api_key, "EUR_USD", "EURUSD", "M15", 80_000) {
        Ok(n)  => println!("[backfill] done — stored {} M15 candles", n),
        Err(e) => eprintln!("[backfill] failed: {}", e),
    }
}

/// Headless entry: backfill ~3 years of EURUSD M5 into the shared DB.
pub fn backfill_m5_cli() {
    let db_path = cron_db_path();
    let api_key = match read_oanda_key() {
        Ok(k) => k,
        Err(e) => { eprintln!("[backfill] {}", e); return; }
    };
    println!("[backfill] EURUSD M5 → {}", db_path);
    match backfill_tf(&db_path, &api_key, "EUR_USD", "EURUSD", "M5", 240_000) {
        Ok(n)  => println!("[backfill] done — stored {} M5 candles", n),
        Err(e) => eprintln!("[backfill] failed: {}", e),
    }
}

// ─── App entry point ──────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial_schema",
            sql: include_str!("../migrations/0001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "candles_v3",
            sql: include_str!("../migrations/0002_candles_v3.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_ema100",
            sql: include_str!("../migrations/0003_add_ema100.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "alerts",
            sql: include_str!("../migrations/0004_alerts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "positioning",
            sql: include_str!("../migrations/0005_positioning.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "drop_positioning",
            sql: include_str!("../migrations/0006_drop_positioning.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "economic_events",
            sql: include_str!("../migrations/0007_economic_events.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "treasury_auctions",
            sql: include_str!("../migrations/0008_treasury_auctions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "treasury_auctions_closing_time",
            sql: include_str!("../migrations/0009_treasury_auctions_closing_time.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:trademirror.db", migrations)
                .build(),
        )
        .setup(|app| {
            let db_path = app.path().app_data_dir()?.join("trademirror.db");
            let path_str = db_path.to_str().unwrap_or("").to_string();

            // Clear all candles so they are re-synced with corrected dates.
            // (Previous builds stored dates one day behind due to OANDA UTC offset bug.)
            if let Ok(conn) = rusqlite::Connection::open(&path_str) {
                let _ = conn.execute(
                    "DELETE FROM candles_v3 WHERE symbol='EURUSD' AND timeframe='D'",
                    [],
                );
            }

            // Background sync thread — syncs on startup then again every day at 22:10 UTC.
            let bg_path = path_str.clone();
            std::thread::spawn(move || {
                // Sync immediately on startup to catch any missed candles.
                let _ = background_sync(&bg_path, "EURUSD");
                // Then loop: wait until next 22:10 UTC, sync, repeat.
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(secs_until_daily_sync()));
                    let _ = background_sync(&bg_path, "EURUSD");
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![list_images, read_credentials_file, write_text_file, save_trade_screenshot, save_chart_screenshot, get_candles_v3, sync_oanda_candles_v3, send_test_notification, send_telegram_message, get_forex_news, get_economic_calendar, get_stored_economic_events, sync_treasury_auctions, get_stored_treasury_auctions, backfill_treasury_auctions, get_live_price, get_live_candles, get_live_candles_computed, get_synthesis])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
