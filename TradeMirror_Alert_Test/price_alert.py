import os
import json
import time
import threading
from pathlib import Path
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv()

OANDA_API_TOKEN = os.getenv("OANDA_API_TOKEN")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

OANDA_BASE = "https://api-fxtrade.oanda.com/v3"
OANDA_REST_URL = f"{OANDA_BASE}/accounts"
OANDA_STREAM_URL = "https://stream-fxtrade.oanda.com/v3/accounts"

# Same tf strings the app uses (see AlertsPanel.tsx ALL_TFS) mapped to OANDA's
# candle granularity codes (see to_oanda granularity match in src-tauri/src/lib.rs).
GRANULARITY = {
    "1W": "W", "1D": "D", "4H": "H4", "1H": "H1",
    "15M": "M15", "5M": "M5", "1M": "M1",
}
RSI_MACD_POLL_SECONDS = 60

# Shared with the TradeMirror app (see src/pages/AnalyticsV3.tsx), which reads/
# writes the same two files so both processes agree regardless of OS or cwd.
TRADEMIRROR_DIR = Path.home() / ".trademirror"
ALERTS_FILE = TRADEMIRROR_DIR / "alerts.json"
ALERT_LOG_FILE = TRADEMIRROR_DIR / "alert_log.json"

headers = {
    "Authorization": f"Bearer {OANDA_API_TOKEN}"
}

# alerts.json and alert_log.json are now touched from two threads (the tick
# stream below and the RSI/MACD poll loop further down) — save_json_file's
# open(..., "w") isn't atomic, so an unguarded concurrent load_json_file()
# could read a half-written file and crash on JSONDecodeError, and two
# unguarded read-modify-write cycles could race and silently drop one
# thread's status update. Reentrant so a caller that already holds it (e.g.
# handle_price_update, wrapping its whole read-decide-write cycle) can still
# call load_alerts()/save_alerts() without deadlocking on itself.
_io_lock = threading.RLock()


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def send_telegram(message):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    data = {"chat_id": TELEGRAM_CHAT_ID, "text": message}
    response = requests.post(url, data=data)
    response.raise_for_status()


def get_account_id():
    response = requests.get(OANDA_REST_URL, headers=headers)
    response.raise_for_status()
    return response.json()["accounts"][0]["id"]


def load_json_file(path, fallback):
    with _io_lock:
        try:
            with open(path, "r", encoding="utf-8") as file:
                return json.load(file)
        except FileNotFoundError:
            return fallback


def save_json_file(path, data):
    with _io_lock:
        with open(path, "w", encoding="utf-8") as file:
            json.dump(data, file, indent=2)


def load_alerts():
    return load_json_file(ALERTS_FILE, [])


def save_alerts(alerts):
    save_json_file(ALERTS_FILE, alerts)


def load_alert_log():
    return load_json_file(ALERT_LOG_FILE, [])


def save_alert_log(log_entries):
    save_json_file(ALERT_LOG_FILE, log_entries)


def get_notification_setting(alert, key):
    notifications = alert.get("notifications", {})
    return bool(notifications.get(key, False))


def is_active_untriggered(alert):
    return alert.get("active") is True and alert.get("status") == "watching"


def get_active_instruments(alerts):
    # Only above/below/crosses need a live tick stream — rsi/rsi_macd_cross
    # alerts are evaluated separately against polled candles (see
    # run_rsi_macd_supervisor), so there's no need to subscribe to their
    # instrument here too.
    instruments = {
        alert["instrument"]
        for alert in alerts
        if is_active_untriggered(alert) and alert.get("direction") in ("above", "below", "crosses")
    }

    return ",".join(sorted(instruments))


# Per-alert arming state for "above"/"below" alerts. An alert can only
# trigger after we have observed the price on the non-trigger side at
# least once since the engine first saw the alert. This prevents an
# alert from firing immediately on creation when price is already past
# the level.
armed_state = {}

# Per-alert last-known side of the level for "crosses" alerts — which
# side of alert_price the price was on the previous time we checked.
crosses_last_side = {}


def _is_in_trigger_zone(price, alert):
    direction = alert["direction"]
    alert_price = alert["price"]

    if direction == "above":
        return price >= alert_price

    if direction == "below":
        return price <= alert_price

    return False


def _directional_hit(price, alert):
    alert_id = alert["id"]
    in_zone = _is_in_trigger_zone(price, alert)

    armed = armed_state.get(alert_id)

    if armed is None:
        # First time we see this alert. If price is already in the
        # trigger zone, do NOT fire — wait for price to leave and
        # come back. If price is on the safe side, arm immediately.
        armed_state[alert_id] = not in_zone
        return False

    if not armed:
        # Still waiting for price to reach the safe side first.
        if not in_zone:
            armed_state[alert_id] = True
        return False

    # Armed — fire on first entry into the trigger zone.
    return in_zone


def _crosses_hit(price, alert):
    # Fires the moment price crosses alert_price from either direction —
    # unlike above/below, there's no "safe side" to re-arm from, just a
    # side change since the last price we saw for this alert.
    alert_id = alert["id"]
    alert_price = alert["price"]
    side = "above" if price > alert_price else "below" if price < alert_price else None

    prev_side = crosses_last_side.get(alert_id)
    crosses_last_side[alert_id] = side

    if prev_side is None or side is None:
        # First observation (establish baseline) or an exact price match
        # (ambiguous which side it crossed from) — don't fire either way.
        return False

    return side != prev_side


def alert_hit(price, alert):
    direction = alert["direction"]

    if direction == "crosses":
        return _crosses_hit(price, alert)

    return _directional_hit(price, alert)


def log_triggered_alert(alert, instrument, hit_price):
    log_entries = load_alert_log()

    log_entries.append({
        "event_id": f'{alert["id"]}_{datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")}',
        "alert_id": alert["id"],
        "triggered_at_utc": utc_now(),
        "name": alert["name"],
        "instrument": instrument,
        "direction": alert["direction"],
        "alert_price": alert["price"],
        "hit_price": round(hit_price, 5),
        "notifications": alert.get("notifications", {})
    })

    save_alert_log(log_entries)


def print_watched_alerts(alerts):
    active_alerts = [alert for alert in alerts if is_active_untriggered(alert)]

    print("TradeMirror Price Alerts Engine started")
    print("Watching alerts:")

    for alert in active_alerts:
        print(
            f'- {alert["name"]} | {alert["instrument"]} | '
            f'{alert["direction"]} {alert["price"]} | '
            f'telegram={get_notification_setting(alert, "telegram")} | '
            f'in_app={get_notification_setting(alert, "in_app")}'
        )


def handle_price_update(instrument, price):
    print(f"{instrument}: {price:.5f}")

    # Whole read-decide-write cycle is one atomic unit — otherwise the RSI/MACD
    # thread could load its own copy of alerts.json between our load and our
    # save below and overwrite this trigger when it writes back.
    with _io_lock:
        alerts = load_alerts()
        updated = False

        for alert in alerts:
            if not is_active_untriggered(alert):
                continue

            if alert["instrument"] != instrument:
                continue

            if alert_hit(price, alert):
                alert["status"] = "triggered"
                alert["triggered_at_utc"] = utc_now()
                alert["last_hit_price"] = round(price, 5)

                message = (
                    f'🚨 {alert["name"]}\n'
                    f'{instrument} hit {price:.5f}\n'
                    f'Alert level: {alert["price"]}'
                )

                if get_notification_setting(alert, "telegram"):
                    send_telegram(message)

                log_triggered_alert(alert, instrument, price)

                updated = True
                print(f'Alert triggered and logged: {alert["name"]}')

        if updated:
            save_alerts(alerts)


def stream_prices(account_id, instruments):
    """Stream prices for the given instruments string.

    Returns when the active instrument set in alerts.json changes
    (so the caller can reconnect with the new subscription) or when
    no active alerts remain.
    """
    url = f"{OANDA_STREAM_URL}/{account_id}/pricing/stream"
    params = {"instruments": instruments}

    print(f"\nStreaming prices for: {instruments}")

    with requests.get(url, headers=headers, params=params, stream=True) as response:
        response.raise_for_status()

        for line in response.iter_lines():
            if not line:
                continue

            data = json.loads(line.decode("utf-8"))

            msg_type = data.get("type")

            # On every heartbeat, re-check alerts.json so newly-added
            # instruments get picked up without a manual restart.
            if msg_type == "HEARTBEAT":
                current = get_active_instruments(load_alerts())
                if current != instruments:
                    print(f"Instrument set changed: {instruments} -> {current}. Reconnecting...")
                    return current
                continue

            if msg_type != "PRICE":
                continue

            instrument = data["instrument"]
            bid = float(data["bids"][0]["price"])
            ask = float(data["asks"][0]["price"])
            mid = (bid + ask) / 2

            handle_price_update(instrument, mid)

    return get_active_instruments(load_alerts())


def run_stream_supervisor(account_id):
    """Keep the price stream alive and resubscribe when the
    active-alert instrument set changes."""
    alerts = load_alerts()
    print_watched_alerts(alerts)

    while True:
        instruments = get_active_instruments(load_alerts())

        if not instruments:
            print("No active watching alerts found. Waiting for new alerts...")
            time.sleep(5)
            continue

        try:
            stream_prices(account_id, instruments)
        except requests.exceptions.RequestException as exc:
            print(f"Stream error: {exc}. Reconnecting in 3s...")
            time.sleep(3)


# ─── RSI / RSI×MACD Cross alerts ───────────────────────────────────────────
#
# These can't ride the tick stream above — RSI/MACD are computed over closed
# candles, not raw ticks — so they get their own poll loop against OANDA's
# REST candles endpoint. The math here (Wilder RSI, EMA-seeded MACD) mirrors
# src-tauri/src/indicators.rs's rsi_series/ema_series/macd_series and the
# trigger conditions mirror the evaluate() effect in src/pages/AnalyticsV3.tsx,
# so a "watching" alert behaves identically whether the app is open or not.

def fetch_closes(instrument, granularity, count=200):
    url = f"{OANDA_BASE}/instruments/{instrument}/candles"
    params = {"granularity": granularity, "count": count, "price": "M"}
    response = requests.get(url, headers=headers, params=params)
    response.raise_for_status()
    return [float(c["mid"]["c"]) for c in response.json()["candles"]]


def compute_ema_series(closes, period):
    n = len(closes)
    if n == 0 or period == 0:
        return [0.0] * n
    k = 2.0 / (period + 1)
    result = [0.0] * n
    seed_end = min(period, n)
    seed = sum(closes[:seed_end]) / seed_end
    result[seed_end - 1] = seed
    for i in range(seed_end, n):
        result[i] = closes[i] * k + result[i - 1] * (1 - k)
    for i in range(seed_end - 1):
        result[i] = result[seed_end - 1]
    return result


def compute_rsi_series(closes, period=14):
    n = len(closes)
    if n < 2 or period == 0:
        return [50.0] * n
    result = [50.0] * n
    seed_len = min(period, n - 1)
    avg_gain = 0.0
    avg_loss = 0.0
    for i in range(1, seed_len + 1):
        diff = closes[i] - closes[i - 1]
        if diff > 0:
            avg_gain += diff
        else:
            avg_loss += abs(diff)
    avg_gain /= seed_len
    avg_loss /= seed_len
    seed_rsi = 100.0 if avg_loss == 0 else 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)
    result[seed_len] = seed_rsi
    for i in range(seed_len + 1, n):
        diff = closes[i] - closes[i - 1]
        gain = diff if diff > 0 else 0.0
        loss = -diff if diff < 0 else 0.0
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
        result[i] = 100.0 if avg_loss == 0 else 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)
    for i in range(seed_len):
        result[i] = seed_rsi
    return result


def compute_macd_histogram(closes, fast=12, slow=26, signal=9):
    ema_fast = compute_ema_series(closes, fast)
    ema_slow = compute_ema_series(closes, slow)
    macd_line = [f - s for f, s in zip(ema_fast, ema_slow)]
    signal_line = compute_ema_series(macd_line, signal)
    return [m - s for m, s in zip(macd_line, signal_line)]


RSI_CONDITION_LABEL = {
    "cross_above_70": "RSI crossed above 70",
    "cross_below_30": "RSI crossed below 30",
    "hit_50": "RSI hit 50",
}


def evaluate_rsi_and_macd_alerts():
    # Snapshot read — deliberately outside the lock below. Building the
    # candidate list and fetching candles from OANDA can take a few seconds
    # across several instrument/timeframe pairs, and holding _io_lock for all
    # of that would stall the tick-stream thread's price alerts for just as
    # long. Configs (timeframes/condition/directionBias) don't change fast
    # enough for a snapshot to matter here.
    snapshot = load_alerts()
    rsi_alerts = [a for a in snapshot if is_active_untriggered(a) and a.get("direction") == "rsi" and a.get("rsiConfig")]
    macd_alerts = [a for a in snapshot if is_active_untriggered(a) and a.get("direction") == "rsi_macd_cross" and a.get("rsiMacdConfig")]
    if not rsi_alerts and not macd_alerts:
        return

    needed = set()
    for a in rsi_alerts:
        for tf in a["rsiConfig"]["timeframes"]:
            needed.add((a["instrument"], tf))
    for a in macd_alerts:
        for tf in a["rsiMacdConfig"]["timeframes"]:
            needed.add((a["instrument"], tf))

    closes_by_key = {}
    for instrument, tf in needed:
        granularity = GRANULARITY.get(tf)
        if not granularity:
            continue
        try:
            closes = fetch_closes(instrument, granularity)
            if len(closes) >= 40:
                closes_by_key[(instrument, tf)] = closes
        except requests.exceptions.RequestException as exc:
            print(f"Candle fetch failed for {instrument} {tf}: {exc}")

    # id -> (tf, hit_price, message) for every alert whose condition fired
    # against the snapshot. Nothing is written yet.
    fires_for = {}

    for alert in rsi_alerts:
        config = alert["rsiConfig"]
        for tf in config["timeframes"]:
            closes = closes_by_key.get((alert["instrument"], tf))
            if not closes:
                continue
            rsi = compute_rsi_series(closes, 14)
            prev_rsi, curr_rsi = rsi[-2], rsi[-1]
            condition = config["condition"]

            if condition == "cross_above_70":
                fires = prev_rsi <= 70 and curr_rsi > 70
            elif condition == "cross_below_30":
                fires = prev_rsi >= 30 and curr_rsi < 30
            elif condition == "hit_50":
                fires = (prev_rsi < 50 and curr_rsi >= 50) or (prev_rsi > 50 and curr_rsi <= 50)
            else:
                fires = False

            if fires:
                message = (
                    f'🚨 {alert["name"]}\n'
                    f'{alert["instrument"].replace("_", "/")} · {RSI_CONDITION_LABEL[condition]}\n'
                    f'Timeframe: {tf}'
                )
                fires_for[alert["id"]] = (tf, closes[-1], message)
                break

    for alert in macd_alerts:
        config = alert["rsiMacdConfig"]
        for tf in config["timeframes"]:
            closes = closes_by_key.get((alert["instrument"], tf))
            if not closes:
                continue
            rsi = compute_rsi_series(closes, 14)
            hist = compute_macd_histogram(closes, 12, 26, 9)
            prev_hist, curr_hist = hist[-2], hist[-1]
            curr_rsi = rsi[-1]

            is_bullish = prev_hist <= 0 and curr_hist > 0 and curr_rsi < 30
            is_bearish = prev_hist >= 0 and curr_hist < 0 and curr_rsi > 70

            bias = config["directionBias"]
            fires = (
                (bias == "bullish" and is_bullish) or
                (bias == "bearish" and is_bearish) or
                (bias == "both" and (is_bullish or is_bearish))
            )

            if fires:
                dir_label = "Bullish" if is_bullish else "Bearish"
                message = (
                    f'🚨 {alert["name"]}\n'
                    f'{alert["instrument"].replace("_", "/")} · {dir_label} MACD×RSI cross\n'
                    f'Timeframe: {tf}'
                )
                fires_for[alert["id"]] = (tf, closes[-1], message)
                break

    if not fires_for:
        return

    # Commit phase — fresh read, re-validated, single atomic write. A fresh
    # read matters here: the alert could have been edited or already handled
    # by the tick-stream thread since the snapshot above.
    with _io_lock:
        alerts = load_alerts()
        updated = False
        for alert in alerts:
            hit = fires_for.get(alert["id"])
            if hit is None or not is_active_untriggered(alert):
                continue
            tf, hit_price, message = hit
            alert["status"] = "triggered"
            alert["triggered_at_utc"] = utc_now()
            alert["last_hit_price"] = round(hit_price, 5)
            if get_notification_setting(alert, "telegram"):
                send_telegram(message)
            log_triggered_alert(alert, alert["instrument"], hit_price)
            print(f'Alert triggered and logged: {alert["name"]}')
            updated = True
        if updated:
            save_alerts(alerts)


def run_rsi_macd_supervisor():
    print("RSI / RSI×MACD alert evaluator started (polling every 60s)")
    while True:
        try:
            evaluate_rsi_and_macd_alerts()
        except Exception as exc:  # keep the loop alive across any single bad cycle
            print(f"RSI/MACD evaluation error: {exc}")
        time.sleep(RSI_MACD_POLL_SECONDS)


def main():
    account_id = get_account_id()
    threading.Thread(target=run_rsi_macd_supervisor, daemon=True).start()
    run_stream_supervisor(account_id)


main()
