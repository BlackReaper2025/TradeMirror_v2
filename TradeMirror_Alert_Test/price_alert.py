import os
import json
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv()

OANDA_API_TOKEN = os.getenv("OANDA_API_TOKEN")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

OANDA_REST_URL = "https://api-fxtrade.oanda.com/v3/accounts"
OANDA_STREAM_URL = "https://stream-fxtrade.oanda.com/v3/accounts"

ALERTS_FILE = "alerts.json"
ALERT_LOG_FILE = "alert_log.json"

headers = {
    "Authorization": f"Bearer {OANDA_API_TOKEN}"
}


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
    try:
        with open(path, "r", encoding="utf-8") as file:
            return json.load(file)
    except FileNotFoundError:
        return fallback


def save_json_file(path, data):
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
    instruments = {
        alert["instrument"]
        for alert in alerts
        if is_active_untriggered(alert)
    }

    return ",".join(sorted(instruments))


# Per-alert arming state. An alert can only trigger after we have
# observed the price on the non-trigger side at least once since
# the engine first saw the alert. This prevents an alert from firing
# immediately on creation when price is already past the level.
armed_state = {}


def _is_in_trigger_zone(price, alert):
    direction = alert["direction"]
    alert_price = alert["price"]

    if direction == "above":
        return price >= alert_price

    if direction == "below":
        return price <= alert_price

    return False


def alert_hit(price, alert):
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
    alerts = load_alerts()
    updated = False

    print(f"{instrument}: {price:.5f}")

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
            import time
            time.sleep(5)
            continue

        try:
            stream_prices(account_id, instruments)
        except requests.exceptions.RequestException as exc:
            print(f"Stream error: {exc}. Reconnecting in 3s...")
            import time
            time.sleep(3)


def main():
    account_id = get_account_id()
    run_stream_supervisor(account_id)


main()
