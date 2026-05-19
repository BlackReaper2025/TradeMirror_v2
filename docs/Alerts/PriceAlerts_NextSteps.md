# Next Steps — TradeMirror Price Alerts

## Current state

The standalone alert engine works.

Confirmed:

```text
OANDA streaming -> Python engine -> Telegram alert -> local alert log
```

## Immediate next step

Do not build the UI yet.

First ask Claude Code to inspect the project structure and identify the safest integration location.

## Recommended first Claude prompt

```text
Review the project structure for the best place to add a future Price Alerts UI.

Look for existing pages, routing, settings panels, data folders, and any existing OANDA/market-related files.

Do not modify files.

Return:
- recommended page/component file location
- whether this belongs in Settings, Markets, or a new Alerts tab
- exact files that would need edits later
- safest first implementation step

Only inspect. Do not change anything else.
```

## Likely product decision

Best home for this feature:

```text
Alerts tab
```

or

```text
Markets tab panel
```

Avoid burying it only in Settings.

Settings should only hold credentials/preferences later, such as:

```text
Enable Telegram alerts
Telegram bot connected
Default instruments
Alert sound on/off
```

## Suggested implementation phases

### Phase 1 — Read-only UI shell

Create a simple Price Alerts panel in TradeMirror using static mock alerts.

No file writing yet.

### Phase 2 — Read local alerts

Have the app read `alerts.json` and display current alerts.

### Phase 3 — Create alerts

Add form fields:

```text
Instrument
Direction
Price
Telegram on/off
In-app on/off
```

Save new alerts to `alerts.json`.

### Phase 4 — Alert history

Read `alert_log.json` and display triggered alert history.

### Phase 5 — Engine management

Decide how the Python engine starts/stops:

Option A:

```text
User starts Python manually
```

Option B:

```text
TradeMirror launches companion Python process
```

Option C:

```text
Rebuild alert engine inside Tauri backend
```

Recommended near-term path:

```text
Option A first, Option B later
```

## What not to do yet

Do not add broker trading/execution.

Do not place live trades.

Do not add n8n yet.

Do not overbuild automation.

Do not expose tokens in the app frontend.
