# Price Alerts Engine

## Purpose

This engine monitors OANDA price data and triggers TradeMirror alerts.

Current working pipeline:

OANDA streaming price feed -> Python alert engine -> Telegram alert -> local alert log

## Current files

- `price_alert.py`
  - Runs the alert engine
  - Connects to OANDA
  - Streams price updates
  - Reads `alerts.json`
  - Sends Telegram alerts
  - Writes triggered events to `alert_log.json`

- `alerts.json`
  - Stores active price alerts
  - This is the file TradeMirror can eventually create/edit from the app UI

- `alert_log.json`
  - Stores alert trigger history
  - TradeMirror can eventually read this to show alert history

- `.env`
  - Stores private credentials
  - Must not be committed to GitHub

## Required `.env` values

OANDA_API_TOKEN=your_oanda_token
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id

## Alert object shape

```json
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
```

## Alert status values

- `watching` = active and waiting for price condition
- `triggered` = alert fired and should not fire again
- `paused` = inactive but preserved
- `deleted` = hidden/removed by the app later

## Direction values

- `above` = trigger when current mid price is greater than or equal to alert price
- `below` = trigger when current mid price is less than or equal to alert price

## Notification settings

- `notifications.in_app`
  - Future TradeMirror in-app notification
  - Currently stored but not displayed by the app yet

- `notifications.telegram`
  - Sends a Telegram bot message when true

## TradeMirror integration goal

Future TradeMirror UI should allow the user to:

1. Create a price alert
2. Pick instrument
3. Pick above/below
4. Enter price level
5. Toggle in-app alert
6. Toggle Telegram alert
7. View alert status
8. Reset or delete triggered alerts
9. View alert history from `alert_log.json`

## Current limitation

The Python engine currently runs separately from the TradeMirror app.

Future options:

1. Keep Python engine as a companion process
2. Rebuild alert engine directly in the Tauri backend
3. Let TradeMirror write `alerts.json` while Python watches it
