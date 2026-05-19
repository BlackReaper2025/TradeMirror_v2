# TradeMirror Price Alerts — ChatGPT Handoff

## Purpose

This file gives a new ChatGPT chat the full context for the TradeMirror Price Alerts work.

## Product context

TradeMirror is a desktop-first trading dashboard focused on trading psychology.

The long-term goal is to let the user create and manage price alerts inside TradeMirror, with alert options for:

- In-app alert
- Telegram alert
- Alert history/logging

The current alert prototype runs outside TradeMirror as a Python proof-of-concept.

## Current working pipeline

```text
OANDA streaming price data -> Python alert engine -> Telegram bot -> iPhone/desktop notification
```

## What has been proven

We successfully proved:

- Telegram bot can send messages to the user
- Telegram chat ID works
- OANDA API connection works
- OANDA streaming price feed works
- EUR_USD price streaming works
- GBP_USD price streaming works
- Multiple alerts can be watched at once
- Multiple instruments can be watched at once
- Alerts can trigger Telegram notifications
- Triggered alerts can be written to a local log file

## Important user preference

When changing code/config files, create downloadable replacement files instead of asking the user to manually edit files.

Always clearly say:

```text
This file replaces: <filename>
```

## Current folder

The current test folder is:

```text
D:\Dev\TradeMirror_v2\TradeMirror\TradeMirror_Alert_Test
```

## Current files in the alert test folder

```text
price_alert.py
alerts.json
alert_log.json
.env
reset_alerts.py
clear_alert_log.py
README_TradeMirror_Alert_Test.md
PriceAlertsEngine.md
price_alert_polling_backup.py
```

## Private files / credentials

The `.env` file contains private credentials and should never be uploaded, pasted, screenshotted, or committed.

Required `.env` values:

```text
OANDA_API_TOKEN=private_oanda_token
TELEGRAM_BOT_TOKEN=private_telegram_bot_token
TELEGRAM_CHAT_ID=private_telegram_chat_id
```

## Telegram bot context

Telegram bot is working.

The bot username used for this project is:

```text
AlphaHouseAlert_bot
```

The user had earlier token exposure issues and learned to revoke/regenerate bot tokens through BotFather.

Do not ask the user to paste bot tokens into chat.

## Current alert engine behavior

`price_alert.py`:

- loads `.env`
- connects to OANDA REST API to get account ID
- opens OANDA streaming pricing connection
- reads alert definitions from `alerts.json`
- streams only the instruments required by active watching alerts
- checks mid price against alert conditions
- sends Telegram alert if enabled
- logs triggered alert to `alert_log.json`
- updates alert status from `watching` to `triggered`

## Current alert object shape

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

```text
watching = active and waiting for price condition
triggered = alert fired and should not fire again
paused = inactive but preserved
deleted = hidden/removed later by app
```

## Direction values

```text
above = trigger when current mid price >= alert price
below = trigger when current mid price <= alert price
```

## Current normal baseline alerts

The latest clean baseline watches:

```text
EUR_USD above 1.1800
EUR_USD below 1.1650
GBP_USD above 1.3700
```

This baseline should not trigger immediately based on the last observed prices:

```text
EUR_USD around 1.17212
GBP_USD around 1.35750
```

## Latest confirmed PowerShell output

The clean baseline showed:

```text
TradeMirror Price Alerts Engine started
Watching alerts:
- EURUSD above 1.1800 | EUR_USD | above 1.18 | telegram=True | in_app=True
- EURUSD below 1.1650 | EUR_USD | below 1.165 | telegram=True | in_app=True
- GBPUSD above 1.3700 | GBP_USD | above 1.37 | telegram=True | in_app=True

Streaming prices for: EUR_USD,GBP_USD
EUR_USD: 1.17212
GBP_USD: 1.35750
```

No Telegram alert fired, which was expected.

## n8n status

n8n is not currently used.

The current direct alert path is:

```text
OANDA -> Python -> Telegram
```

n8n may be useful later for broader workflows:

```text
price alert -> Telegram + email + Discord + Google Sheet + daily summary
```

For fast price alerts, the current direct Python path is cleaner.

## Where to start next

The next phase is TradeMirror integration planning.

Recommended next step:

1. Ask Claude Code to inspect the TradeMirror project structure.
2. Identify the best location for a future Price Alerts UI.
3. Do not modify files yet.
4. Decide whether alerts belong in:
   - a dedicated Alerts tab
   - the future Markets tab
   - Settings

Recommended product direction:

A dedicated Alerts tab or a panel inside the future Markets tab is better than burying this in Settings.

## Next milestone

```text
TradeMirror UI creates/edits alerts.json
Python engine watches alerts.json
Telegram fires when alert is hit
TradeMirror reads alert_log.json to show alert history
```

## Suggested next ChatGPT task

Ask:

```text
Help me plan the next TradeMirror integration step for the Price Alerts Engine. Keep it surgical. I want to use Claude Code efficiently and avoid broad edits.
```
