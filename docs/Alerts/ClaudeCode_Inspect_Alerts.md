# Claude Code Prompt — Inspect TradeMirror for Price Alerts Integration

Use this prompt in Claude Code.

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

## Notes for ChatGPT

After Claude returns the structure review, create the next surgical prompt based on the exact file names Claude identifies.

Do not ask Claude to build the feature yet until the file locations are clear.
