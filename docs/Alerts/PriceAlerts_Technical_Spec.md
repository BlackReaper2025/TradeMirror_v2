# TradeMirror Price Alerts Engine — Technical Spec

## Overview

The Price Alerts Engine is a local Python prototype that monitors OANDA streaming prices and sends Telegram alerts when configured price levels are hit.

## Runtime files

```text
price_alert.py
alerts.json
alert_log.json
.env
```

## Helper files

```text
reset_alerts.py
clear_alert_log.py
```

## Documentation files

```text
README_TradeMirror_Alert_Test.md
PriceAlertsEngine.md
```

## Data flow

```text
1. price_alert.py starts
2. Loads credentials from .env
3. Gets OANDA account ID
4. Loads alerts.json
5. Builds instrument list from active watching alerts
6. Opens OANDA pricing stream
7. Receives PRICE events
8. Calculates mid price from bid/ask
9. Checks each matching alert
10. Sends Telegram message if notifications.telegram is true
11. Writes event to alert_log.json
12. Updates alert status to triggered
```

## Alert file contract

TradeMirror should eventually write alert definitions to `alerts.json`.

Required fields:

```json
{
  "id": "string_unique_id",
  "name": "string",
  "instrument": "EUR_USD",
  "direction": "above",
  "price": 1.18,
  "active": true,
  "status": "watching",
  "notifications": {
    "in_app": true,
    "telegram": true
  },
  "created_at_utc": "ISO timestamp",
  "triggered_at_utc": null,
  "last_hit_price": null
}
```

## Alert log contract

Triggered events are appended to `alert_log.json`.

Expected shape:

```json
{
  "event_id": "alert_id_YYYYMMDDTHHMMSSZ",
  "alert_id": "eurusd_above_11800",
  "triggered_at_utc": "ISO timestamp",
  "name": "EURUSD above 1.1800",
  "instrument": "EUR_USD",
  "direction": "above",
  "alert_price": 1.18,
  "hit_price": 1.18001,
  "notifications": {
    "in_app": true,
    "telegram": true
  }
}
```

## Future TradeMirror UI requirements

The app should eventually support:

- Create price alert
- Select instrument
- Select above/below
- Enter price level
- Toggle Telegram alert
- Toggle in-app alert
- View active alerts
- View triggered alerts
- Reset triggered alert
- Delete or pause alert
- View alert history from `alert_log.json`

## Recommended implementation sequence

1. Inspect current TradeMirror structure.
2. Add a read-only Alerts panel using mock/static alert data.
3. Add UI form for creating alerts, but keep it local mock state first.
4. Wire UI to read `alerts.json`.
5. Wire UI to write `alerts.json`.
6. Wire UI to read `alert_log.json`.
7. Decide whether Python remains companion engine or gets rebuilt into Tauri backend.

## Important caution

Do not integrate credentials into the frontend.

Do not expose:

```text
OANDA_API_TOKEN
TELEGRAM_BOT_TOKEN
```

The `.env` file must remain private.
