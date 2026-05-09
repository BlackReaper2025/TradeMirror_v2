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

// ─── Analytics V3 — sync OANDA → indicators → SQLite ─────────────────────────

const OANDA_KEY_PATH: &str = "C:\\Users\\Geoff\\.trademirror\\oanda-api-key.txt";

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
        .invoke_handler(tauri::generate_handler![list_images, read_credentials_file, write_text_file, get_candles_v3, get_ichi_rows_v3, sync_oanda_candles_v3])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
