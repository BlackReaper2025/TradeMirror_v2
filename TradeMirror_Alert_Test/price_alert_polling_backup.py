import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

OANDA_API_TOKEN = os.getenv("OANDA_API_TOKEN")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

OANDA_REST_URL = "https://api-fxtrade.oanda.com/v3/accounts"
OANDA_STREAM_URL = "https://stream-fxtrade.oanda.com/v3/accounts"
ALERTS_FILE = "alerts.json"

headers = {
    "Authorization": f"Bearer {OANDA_API_TOKEN}"
}


def send_telegram(message):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    data = {"chat_id": TELEGRAM_CHAT_ID, "text": message}
    response = requests.post(url, data=data)
    response.raise_for_status()


def get_account_id():
    response = requests.get(OANDA_REST_URL, headers=headers)
    response.raise_for_status()
    return response.json()["accounts"][0]["id"]


def load_alerts():
    with open(ALERTS_FILE, "r") as file:
        return json.load(file)


def save_alerts(alerts):
    with open(ALERTS_FILE, "w") as file:
        json.dump(alerts, file, indent=2)


def get_active_instruments(alerts):
    instruments = set()

    for alert in alerts:
        if alert["active"] and not alert["triggered"]:
            instruments.add(alert["instrument"])

    return ",".join(instruments)


def alert_hit(price, alert):
    if alert["direction"] == "above":
        return price >= alert["price"]

    if alert["direction"] == "below":
        return price <= alert["price"]

    return False


def handle_price_update(instrument, price):
    alerts = load_alerts()
    updated = False

    print(f"{instrument}: {price:.5f}")

    for alert in alerts:
        if not alert["active"] or alert["triggered"]:
            continue

        if alert["instrument"] != instrument:
            continue

        if alert_hit(price, alert):
            message = (
                f'🚨 {alert["name"]}\n'
                f'{instrument} hit {price:.5f}\n'
                f'Alert level: {alert["price"]}'
            )

            if alert["telegram"]:
                send_telegram(message)

            alert["triggered"] = True
            updated = True
            print(f'Alert triggered: {alert["name"]}')

    if updated:
        save_alerts(alerts)


def stream_prices(account_id):
    alerts = load_alerts()
    instruments = get_active_instruments(alerts)

    if not instruments:
        print("No active untriggered alerts found.")
        return

    url = f"{OANDA_STREAM_URL}/{account_id}/pricing/stream"
    params = {"instruments": instruments}

    print(f"Streaming prices for: {instruments}")
    send_telegram(f"TradeMirror streaming alerts started: {instruments}")

    with requests.get(url, headers=headers, params=params, stream=True) as response:
        response.raise_for_status()

        for line in response.iter_lines():
            if not line:
                continue

            data = json.loads(line.decode("utf-8"))

            if data.get("type") != "PRICE":
                continue

            instrument = data["instrument"]
            bid = float(data["bids"][0]["price"])
            ask = float(data["asks"][0]["price"])
            mid = (bid + ask) / 2

            handle_price_update(instrument, mid)


def main():
    account_id = get_account_id()
    stream_prices(account_id)


main()