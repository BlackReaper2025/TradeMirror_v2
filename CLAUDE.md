# Claude Code Rules — TradeMirror

## Core Rules

- Only perform the exact task requested
- Only modify the specified file
- Do not change anything else
- Preserve all functionality

---

## Output Rules

- Show only changed code
- No full file unless asked
- No explanations unless asked
- Keep responses minimal

- Last line must always be:
DONE

---

## UI Protection Rules

- DO NOT modify Dashboard
- DO NOT modify Trade Log
- DO NOT modify existing Analytics panels

- DO NOT:
  - use margin hacks
  - use manual offsets
  - break grid layout

Use:
- proper grid system only

---

## Architecture Rules

- Backend must be separate from UI
- Do not mix logic into components
- Do not compute indicators in UI

---

## Data Rule (CRITICAL)

Backend must output data in EXACT same format as Google Sheets.

Purpose:
- zero UI changes
- direct plug-in replacement

---

## Development Order

1. OANDA API connection
2. Candle storage (SQLite)
3. Indicator engine
4. Data adapter
5. Brain logic
6. UI integration

---

## Constraints

- No paid services
- Local only
- Use existing stack:
  - React
  - TypeScript
  - SQLite
  - Drizzle

---

## Prompt Discipline

Every prompt must include:

- file name
- exact task
- "Only modify this file"
- "Do not change anything else"

---

## Philosophy

- Replace systems, not rebuild them
- Preserve working UI
- Build backend in isolation
- Match data before connecting UI