// ─── OANDA trading-account client (Phase 8) — read-only ──────────────────────
// Distinct from oanda_client.rs, which only fetches market-data candles. This
// module reads the user's own OANDA account: balance/summary, open positions,
// open trades, closed-trade history, and pending orders. No order placement,
// modification, or cancellation is implemented — read-only by design.
//
// Reuses the same OANDA API key already on file for market data (read_oanda_key
// in lib.rs) — a personal access token is valid for both market-data and
// account-level v20 endpoints on the accounts it's authorized for.

use std::sync::OnceLock;

const BASE_URL: &str = "https://api-fxtrade.oanda.com/v3";

fn client() -> &'static reqwest::blocking::Client {
    static CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();
    CLIENT.get_or_init(reqwest::blocking::Client::new)
}

fn get(api_key: &str, path: &str) -> Result<serde_json::Value, String> {
    let url = format!("{}{}", BASE_URL, path);
    let resp = client()
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .map_err(|e| format!("OANDA account request failed: {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        eprintln!("[oanda_account] request to {} failed ({}): {}", path, status, text);
        return Err(format!("OANDA account request to {} failed ({}): {}", path, status, text));
    }
    resp.json::<serde_json::Value>()
        .map_err(|e| format!("OANDA account response for {} could not be parsed: {}", path, e))
}

pub fn get_accounts(api_key: &str) -> Result<serde_json::Value, String> {
    get(api_key, "/accounts")
}

pub fn get_account_summary(api_key: &str, account_id: &str) -> Result<serde_json::Value, String> {
    get(api_key, &format!("/accounts/{}/summary", account_id))
}

pub fn get_open_positions(api_key: &str, account_id: &str) -> Result<serde_json::Value, String> {
    get(api_key, &format!("/accounts/{}/openPositions", account_id))
}

pub fn get_open_trades(api_key: &str, account_id: &str) -> Result<serde_json::Value, String> {
    get(api_key, &format!("/accounts/{}/openTrades", account_id))
}

/// Most recent closed trades (capped at 50 per call — plenty for periodic
/// reconciliation; not intended as a full historical backfill).
pub fn get_trades_history(api_key: &str, account_id: &str) -> Result<serde_json::Value, String> {
    get(api_key, &format!("/accounts/{}/trades?state=CLOSED&count=50", account_id))
}

pub fn get_pending_orders(api_key: &str, account_id: &str) -> Result<serde_json::Value, String> {
    get(api_key, &format!("/accounts/{}/pendingOrders", account_id))
}
