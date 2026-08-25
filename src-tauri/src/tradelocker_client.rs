// ─── TradeLocker read-only client (Phase 5) ───────────────────────────────────
// Login (email/password/server) → JWT session, then read-only account state /
// positions / orders / order history. No order placement, modification, or
// cancellation is implemented here — Phase 5 is read-only by design.
//
// TradeLocker's /trade/* endpoints return bare value arrays rather than named
// JSON fields (e.g. positions: [["id", "206", ...]]); the field names for each
// row come from a separate /trade/config call (accountDetailsConfig.columns,
// positionsConfig.columns, etc). Rather than hardcode column order — which is
// broker/white-label configurable and not guaranteed to match any one example —
// every read here fetches /trade/config and zips its column ids with the row
// values, so a config-driven schema is dynamically respected.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

fn base_url(env: &str) -> &'static str {
    if env.eq_ignore_ascii_case("live") {
        "https://live.tradelocker.com/backend-api"
    } else {
        "https://demo.tradelocker.com/backend-api"
    }
}

fn client() -> &'static reqwest::blocking::Client {
    static CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .unwrap_or_default()
    })
}

// Retries transient network failures (timeouts, connection resets) only —
// HTTP-level error statuses (bad credentials, 4xx/5xx) surface immediately
// rather than being retried blindly.
fn with_retries(
    attempts: u32,
    mut f: impl FnMut() -> Result<reqwest::blocking::Response, reqwest::Error>,
) -> Result<reqwest::blocking::Response, String> {
    let mut last_err = String::new();
    for i in 0..attempts {
        match f() {
            Ok(resp) => return Ok(resp),
            Err(e) => {
                last_err = format!("TradeLocker network error: {}", e);
                if i + 1 < attempts {
                    std::thread::sleep(Duration::from_millis(500 * 2u64.pow(i)));
                }
            }
        }
    }
    Err(last_err)
}

// ─── Credentials (OS-native secure storage via the `keyring` crate) ──────────

#[derive(Serialize, Deserialize, Clone)]
struct StoredCredentials {
    email: String,
    password: String,
    server: String,
    env: String,
}

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new("TradeMirror", "tradelocker").map_err(|e| format!("Keyring error: {}", e))
}

fn save_credentials(creds: &StoredCredentials) -> Result<(), String> {
    let entry = keyring_entry()?;
    let json = serde_json::to_string(creds).map_err(|e| e.to_string())?;
    entry
        .set_password(&json)
        .map_err(|e| format!("Could not save TradeLocker credentials to the OS credential store: {}", e))
}

fn load_credentials() -> Result<Option<StoredCredentials>, String> {
    let entry = keyring_entry()?;
    match entry.get_password() {
        Ok(json) => serde_json::from_str(&json)
            .map(Some)
            .map_err(|e| format!("Stored TradeLocker credentials are corrupted: {}", e)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Could not read TradeLocker credentials from the OS credential store: {}", e)),
    }
}

fn clear_credentials() -> Result<(), String> {
    let entry = keyring_entry()?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Could not clear TradeLocker credentials: {}", e)),
    }
}

// ─── Session (in-memory only — tokens are never persisted to disk) ───────────

#[derive(Clone)]
struct Session {
    access_token: String,
    refresh_token: String,
    env: String,
}

static SESSION: Mutex<Option<Session>> = Mutex::new(None);

#[derive(Deserialize)]
struct TokenResponse {
    #[serde(rename = "accessToken")]
    access_token: String,
    #[serde(rename = "refreshToken")]
    refresh_token: String,
}

fn do_login(email: &str, password: &str, server: &str, env: &str) -> Result<(String, String), String> {
    let url = format!("{}/auth/jwt/token", base_url(env));
    let body = serde_json::json!({ "email": email, "password": password, "server": server });
    let resp = with_retries(3, || client().post(&url).json(&body).send())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        eprintln!("[tradelocker] login rejected for {} on {} ({}): {}", email, server, status, text);
        return Err(format!("TradeLocker login rejected ({}): {}", status, text));
    }
    let parsed: TokenResponse = resp
        .json()
        .map_err(|e| format!("TradeLocker login response could not be parsed: {}", e))?;
    println!("[tradelocker] logged in as {} on {} ({})", email, server, env);
    Ok((parsed.access_token, parsed.refresh_token))
}

fn do_refresh(refresh_token: &str, env: &str) -> Result<(String, String), String> {
    let url = format!("{}/auth/jwt/refresh", base_url(env));
    let body = serde_json::json!({ "refreshToken": refresh_token });
    let resp = with_retries(3, || client().post(&url).json(&body).send())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        return Err(format!("TradeLocker session refresh rejected ({}): {}", status, text));
    }
    let parsed: TokenResponse = resp
        .json()
        .map_err(|e| format!("TradeLocker refresh response could not be parsed: {}", e))?;
    Ok((parsed.access_token, parsed.refresh_token))
}

/// Returns (accessToken, refreshToken, env) for the active session, logging in
/// from stored credentials if nothing is cached yet (e.g. app just restarted).
fn get_session_tokens() -> Result<(String, String, String), String> {
    {
        let guard = SESSION.lock().unwrap();
        if let Some(s) = guard.as_ref() {
            return Ok((s.access_token.clone(), s.refresh_token.clone(), s.env.clone()));
        }
    }
    let creds = load_credentials()?.ok_or_else(|| "TradeLocker is not connected".to_string())?;
    let (access_token, refresh_token) = do_login(&creds.email, &creds.password, &creds.server, &creds.env)?;
    *SESSION.lock().unwrap() = Some(Session {
        access_token: access_token.clone(),
        refresh_token: refresh_token.clone(),
        env: creds.env.clone(),
    });
    Ok((access_token, refresh_token, creds.env))
}

/// Refreshes the session, but only if it's still the same stale access token
/// the caller actually tried and got a 401 for. TradeLocker's refresh
/// response issues a brand new refresh token each call, which reads as
/// single-use/rotating — a naive "just refresh" here would let concurrent
/// requests (tradelockerSync.ts fires positions/orders/instruments together
/// via Promise.all) race the SAME refresh token against the server the
/// moment it expires, and every loser would come back rejected. Holding the
/// lock across the network call serializes that: the first caller to notice
/// actually refreshes, everyone else waiting on the lock just picks up the
/// result instead of firing their own doomed refresh.
fn refresh_session_if_needed(env: &str, stale_access_token: &str, refresh_token: &str) -> Result<String, String> {
    let mut guard = SESSION.lock().unwrap();
    if let Some(s) = guard.as_ref() {
        if s.access_token != stale_access_token {
            return Ok(s.access_token.clone()); // someone else already refreshed while we waited for the lock
        }
    }
    let (access_token, new_refresh) = do_refresh(refresh_token, env)?;
    *guard = Some(Session {
        access_token: access_token.clone(),
        refresh_token: new_refresh,
        env: env.to_string(),
    });
    Ok(access_token)
}

/// GET one /trade/* path (or /trade/config) with automatic session bootstrap
/// and a single refresh-and-retry if the access token has expired (401).
fn trade_get(path: &str, acc_num: &str) -> Result<serde_json::Value, String> {
    let (mut access_token, refresh_token, env) = get_session_tokens()?;
    let url = format!("{}{}", base_url(&env), path);

    let send = |token: &str| {
        with_retries(3, || {
            client()
                .get(&url)
                .header("Authorization", format!("Bearer {}", token))
                .header("accNum", acc_num)
                .send()
        })
    };

    let mut resp = send(&access_token)?;
    if resp.status().as_u16() == 401 {
        println!("[tradelocker] access token expired, refreshing session for {}", path);
        access_token = refresh_session_if_needed(&env, &access_token, &refresh_token)?;
        resp = send(&access_token)?;
    }
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        eprintln!("[tradelocker] request to {} failed ({}): {}", path, status, text);
        return Err(format!("TradeLocker request to {} failed ({}): {}", path, status, text));
    }
    resp.json::<serde_json::Value>()
        .map_err(|e| format!("TradeLocker response for {} could not be parsed: {}", path, e))
}

// ─── Config-driven column names ───────────────────────────────────────────────

/// `panel` is one of "accountDetails", "positions", "orders", "ordersHistory"
/// (the config key is `{panel}Config`, matching TradeLocker's naming).
fn get_columns(acc_num: &str, panel: &str) -> Result<Vec<String>, String> {
    let raw = trade_get("/trade/config", acc_num)?;
    let key = format!("{}Config", panel);
    let cols = raw
        .get("d")
        .and_then(|d| d.get(&key))
        .and_then(|c| c.get("columns"))
        .and_then(|c| c.as_array())
        .ok_or_else(|| format!("TradeLocker config response is missing '{}' columns", key))?;
    Ok(cols
        .iter()
        .filter_map(|c| c.get("id").and_then(|i| i.as_str()).map(|s| s.to_string()))
        .collect())
}

fn zip_rows(columns: &[String], rows: &[serde_json::Value]) -> Vec<HashMap<String, serde_json::Value>> {
    rows.iter()
        .filter_map(|row| {
            row.as_array()
                .map(|arr| columns.iter().cloned().zip(arr.iter().cloned()).collect())
        })
        .collect()
}

// ─── Public API ────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct TlAccountSummary {
    pub id: String,
    pub name: String,
    pub currency: String,
    pub status: String,
    #[serde(rename = "accNum")]
    pub acc_num: String,
}

#[derive(Deserialize)]
struct AllAccountsResponse {
    accounts: Vec<TlAccountSummary>,
}

fn fetch_all_accounts(access_token: &str, env: &str) -> Result<Vec<TlAccountSummary>, String> {
    let url = format!("{}/auth/jwt/all-accounts", base_url(env));
    let resp = with_retries(3, || {
        client()
            .get(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
    })?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        return Err(format!("TradeLocker all-accounts request failed ({}): {}", status, text));
    }
    let parsed: AllAccountsResponse = resp
        .json()
        .map_err(|e| format!("TradeLocker all-accounts response could not be parsed: {}", e))?;
    Ok(parsed.accounts)
}

/// Logs in, saves credentials to the OS credential store, and returns the
/// user's TradeLocker accounts so the caller can pick which one to link.
pub fn connect(email: &str, password: &str, server: &str, env: &str) -> Result<Vec<TlAccountSummary>, String> {
    let (access_token, refresh_token) = do_login(email, password, server, env)?;
    *SESSION.lock().unwrap() = Some(Session {
        access_token: access_token.clone(),
        refresh_token,
        env: env.to_string(),
    });
    let accounts = fetch_all_accounts(&access_token, env)?;
    save_credentials(&StoredCredentials {
        email: email.to_string(),
        password: password.to_string(),
        server: server.to_string(),
        env: env.to_string(),
    })?;
    Ok(accounts)
}

pub fn disconnect() -> Result<(), String> {
    *SESSION.lock().unwrap() = None;
    clear_credentials()
}

/// Lists accounts using the already-saved session/credentials — used to
/// re-populate the account picker after an app restart, when the user is
/// already connected but hasn't just gone through the login form.
pub fn list_accounts() -> Result<Vec<TlAccountSummary>, String> {
    let (access_token, _refresh_token, env) = get_session_tokens()?;
    fetch_all_accounts(&access_token, &env)
}

#[derive(Serialize)]
pub struct TlStatus {
    pub connected: bool,
    pub email: Option<String>,
    pub server: Option<String>,
    pub env: Option<String>,
}

pub fn status() -> TlStatus {
    match load_credentials() {
        Ok(Some(c)) => TlStatus { connected: true, email: Some(c.email), server: Some(c.server), env: Some(c.env) },
        _ => TlStatus { connected: false, email: None, server: None, env: None },
    }
}

pub fn get_account_state(account_id: &str, acc_num: &str) -> Result<HashMap<String, serde_json::Value>, String> {
    let columns = get_columns(acc_num, "accountDetails")?;
    let raw = trade_get(&format!("/trade/accounts/{}/state", account_id), acc_num)?;
    let data = raw
        .get("d")
        .and_then(|d| d.get("accountDetailsData"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(columns.into_iter().zip(data.into_iter()).collect())
}

pub fn get_positions(account_id: &str, acc_num: &str) -> Result<Vec<HashMap<String, serde_json::Value>>, String> {
    let columns = get_columns(acc_num, "positions")?;
    let raw = trade_get(&format!("/trade/accounts/{}/positions", account_id), acc_num)?;
    let rows = raw
        .get("d")
        .and_then(|d| d.get("positions"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(zip_rows(&columns, &rows))
}

pub fn get_orders(account_id: &str, acc_num: &str) -> Result<Vec<HashMap<String, serde_json::Value>>, String> {
    let columns = get_columns(acc_num, "orders")?;
    let raw = trade_get(&format!("/trade/accounts/{}/orders", account_id), acc_num)?;
    let rows = raw
        .get("d")
        .and_then(|d| d.get("orders"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(zip_rows(&columns, &rows))
}

pub fn get_orders_history(account_id: &str, acc_num: &str) -> Result<Vec<HashMap<String, serde_json::Value>>, String> {
    let columns = get_columns(acc_num, "ordersHistory")?;
    let raw = trade_get(&format!("/trade/accounts/{}/ordersHistory", account_id), acc_num)?;
    let rows = raw
        .get("d")
        .and_then(|d| d.get("ordersHistory"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(zip_rows(&columns, &rows))
}

// Unlike positions/orders, /instruments returns plain named objects rather
// than a config+rows tuple, so no column-zipping is needed here.
#[derive(Serialize, Deserialize, Clone)]
pub struct TlInstrument {
    #[serde(rename = "tradableInstrumentId")]
    pub tradable_instrument_id: serde_json::Value, // API returns this as a number; kept generic to avoid a type mismatch panic
    pub name: String,
}

#[derive(Deserialize)]
struct InstrumentsData {
    instruments: Vec<TlInstrument>,
}

pub fn get_instruments(account_id: &str, acc_num: &str) -> Result<Vec<TlInstrument>, String> {
    let raw = trade_get(&format!("/trade/accounts/{}/instruments", account_id), acc_num)?;
    let data: InstrumentsData = serde_json::from_value(raw.get("d").cloned().unwrap_or(serde_json::Value::Null))
        .map_err(|e| format!("TradeLocker instruments response could not be parsed: {}", e))?;
    Ok(data.instruments)
}
