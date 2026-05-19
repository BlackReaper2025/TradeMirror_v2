# TradeMirror Alert Test

## Purpose

This folder tests the first working version of the TradeMirror Price Alerts Engine.

Current pipeline:

OANDA streaming price feed -> Python alert engine -> Telegram alert -> local alert log

## Files

- `price_alert.py`
  - Main alert engine
  - Streams OANDA prices
  - Reads alerts from `alerts.json`
  - Sends Telegram alerts
  - Logs triggered alerts to `alert_log.json`

- `alerts.json`
  - Active alert definitions
  - Replace this file when testing different alerts

- `alert_log.json`
  - Triggered alert history
  - Starts as an empty list: `[]`

- `.env`
  - Private tokens
  - Do not upload or commit this file

- `reset_alerts.py`
  - Resets triggered alerts back to watching

- `clear_alert_log.py`
  - Clears old alert history from `alert_log.json`

## Required `.env` values

```text
OANDA_API_TOKEN=your_oanda_api_token
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
```

## Install requirements

```bash
pip install requests python-dotenv
```

## Run alert engine

```bash
python price_alert.py
```

Expected PowerShell output:

```text
TradeMirror Price Alerts Engine started
Watching alerts:
- EURUSD above 1.1800 | EUR_USD | above 1.18 | telegram=True | in_app=True

Streaming prices for: EUR_USD
EUR_USD: 1.17212
```

## Reset triggered alerts

```bash
python reset_alerts.py
```

## Clear alert log

```bash
python clear_alert_log.py
```

## Normal alert file

Use an alert like this when you do not want it to trigger immediately:

```json
[
  {
    "id": "eurusd_above_11800",
    "name": "EURUSD above 1.1800",
    "instrument": "EUR_USD",
    "direction": "above",
    "price": 1.18,
    "active": true,
    "status": "watching",
    "notifications": {
      "in_app": true,
      "telegram": true
    },
    "created_at_utc": "2026-05-03T00:00:00+00:00",
    "triggered_at_utc": null,
    "last_hit_price": null
  }
]
```

## Immediate test alert

Use an alert like this when you want to confirm Telegram still fires:

```json
[
  {
    "id": "eurusd_immediate_trigger_test",
    "name": "EURUSD immediate trigger test",
    "instrument": "EUR_USD",
    "direction": "above",
    "price": 1.17,
    "active": true,
    "status": "watching",
    "notifications": {
      "in_app": true,
      "telegram": true
    },
    "created_at_utc": "2026-05-03T00:00:00+00:00",
    "triggered_at_utc": null,
    "last_hit_price": null
  }
]
```

## TradeMirror integration direction

Later, TradeMirror should create and edit `alerts.json` from the app UI.

The app should support:

- Create alert
- Edit alert
- Reset alert
- Delete alert
- Toggle in-app alert
- Toggle Telegram alert
- View alert history from `alert_log.json`

## Current limitation

The Python engine currently runs separately from the TradeMirror app.

Later options:

1. Keep Python as a companion process
2. Rebuild the alert engine inside the Tauri backend
3. Let TradeMirror write `alerts.json` while Python monitors it
