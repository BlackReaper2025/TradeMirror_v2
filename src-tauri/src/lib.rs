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

// ─── Analytics V3 — sync OANDA → indicators → SQLite ─────────────────────────

const OANDA_KEY_PATH: &str = "C:\\Users\\Geoff\\.trademirror\\oanda-api-key.txt";
const TELEGRAM_TOKEN_PATH: &str = "C:\\Users\\Geoff\\.trademirror\\telegram-bot-token.txt";
const TELEGRAM_CHAT_ID_PATH: &str = "C:\\Users\\Geoff\\.trademirror\\telegram-chat-id.txt";

/// Core sync logic — usable from both the Tauri command and the background thread.
fn background_sync(db_path: &str) -> Result<usize, String> {
    let contents = std::fs::read_to_string(OANDA_KEY_PATH)
        .map_err(|e| format!("Could not read OANDA key file: {}", e))?;
    let api_key = contents.lines().next().unwrap_or("").trim().to_string();
    if api_key.is_empty() {
        return Err("OANDA API key is empty".into());
    }
    let raw = oanda_client::fetch_raw_candles(&api_key, "EUR_USD", 500)?;
    let rows = indicators::compute(raw);
    let count = rows.len();
    candle_store::upsert_candles(db_path, "EURUSD", "D", &rows)?;
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
fn sync_oanda_candles_v3(app: tauri::AppHandle) -> Result<usize, String> {
    let db_path = app.path().app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("trademirror.db");
    background_sync(db_path.to_str().unwrap_or(""))
}

// ─── Analytics V3 ─────────────────────────────────────────────────────────────
mod analytics_v3_demo;
mod candle_store;
mod oanda_client;
mod indicators;
use analytics_v3_demo::CandleV3;

#[tauri::command]
fn get_candles_v3(app: tauri::AppHandle) -> Result<Vec<CandleV3>, String> {
    let db_path = app.path().app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("trademirror.db");

    let rows = candle_store::read_candles(
        db_path.to_str().unwrap_or(""),
        "EURUSD", "D", 500,
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

// ─── OANDA live price streaming ───────────────────────────────────────────────

/// Fetch the latest mid price for EUR_USD.
/// Uses M1 candles — universally available on all OANDA accounts.
/// Reads the API key exactly as background_sync does (proven to work).
#[tauri::command]
async fn get_live_price() -> Result<f64, String> {
    let contents = std::fs::read_to_string(OANDA_KEY_PATH)
        .map_err(|e| format!("key file: {}", e))?;
    let api_key = contents.lines().next().unwrap_or("").trim().to_string();
    if api_key.is_empty() { return Err("OANDA key file is empty".into()); }

    let resp: serde_json::Value = reqwest::Client::new()
        .get("https://api-fxtrade.oanda.com/v3/instruments/EUR_USD/candles?granularity=M1&count=1&price=M")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Accept-Datetime-Format", "RFC3339")
        .send().await.map_err(|e| format!("request: {:?}", e))?
        .json().await.map_err(|e| format!("parse: {}", e))?;

    resp["candles"][0]["mid"]["c"].as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .ok_or_else(|| format!("unexpected response: {}", resp))
}

// ─── Analytics V3 — Ichimoku history (100 rows for cloud + Chikou) ───────────

#[tauri::command]
fn get_ichi_rows_v3(app: tauri::AppHandle) -> Result<Vec<CandleV3>, String> {
    let db_path = app.path().app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("trademirror.db");

    Ok(candle_store::read_candles(
        db_path.to_str().unwrap_or(""),
        "EURUSD", "D", 100,
    ).unwrap_or_default())
}

// ─── Live candles for any timeframe (price chart) ────────────────────────────

#[tauri::command]
fn get_live_candles(pair: String, tf: String) -> Result<Vec<oanda_client::RawCandle>, String> {
    let contents = std::fs::read_to_string(OANDA_KEY_PATH)
        .map_err(|e| format!("key file: {}", e))?;
    let api_key = contents.lines().next().unwrap_or("").trim().to_string();
    if api_key.is_empty() { return Err("OANDA key file is empty".into()); }

    let instrument = if pair.contains('_') {
        pair.clone()
    } else if pair.contains('/') {
        pair.replace('/', "_")
    } else {
        format!("{}_{}", &pair[..3], &pair[3..])
    };

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

    oanda_client::fetch_raw_candles_tf(&api_key, &instrument, granularity, 200)
}

// ─── Live candles with computed indicators for any timeframe ─────────────────

#[tauri::command]
fn get_live_candles_computed(pair: String, tf: String) -> Result<Vec<CandleV3>, String> {
    let contents = std::fs::read_to_string(OANDA_KEY_PATH)
        .map_err(|e| format!("key file: {}", e))?;
    let api_key = contents.lines().next().unwrap_or("").trim().to_string();
    if api_key.is_empty() { return Err("OANDA key file is empty".into()); }

    let instrument = if pair.contains('_') {
        pair.clone()
    } else if pair.contains('/') {
        pair.replace('/', "_")
    } else {
        format!("{}_{}", &pair[..3], &pair[3..])
    };

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

    let raw = oanda_client::fetch_raw_candles_tf(&api_key, &instrument, granularity, 200)?;
    Ok(indicators::compute(raw))
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
                let _ = background_sync(&bg_path);

                // Then loop: wait until next 22:10 UTC, sync, repeat.
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(secs_until_daily_sync()));
                    let _ = background_sync(&bg_path);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![list_images, read_credentials_file, write_text_file, get_candles_v3, get_ichi_rows_v3, sync_oanda_candles_v3, send_test_notification, get_forex_news, get_live_price, get_live_candles, get_live_candles_computed])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
