# TradeMirror — Project.md (Final)

## Identity
TradeMirror is a desktop-first trading psychology dashboard.

It is not just a dashboard.
It is a **trading operating system** focused on:
- discipline
- behavior
- decision quality

---

## Current State (IMPORTANT)

- Dashboard: COMPLETE (do not modify layout)
- Trade Log: COMPLETE (preserve)
- Analytics Screen: BUILT using Google Sheets (preserve structure)

Current priority:
→ Replace Google Sheets with backend pipeline
→ Build AI Brain (BrainBot)

---

## Core Rule

DO NOT rebuild the Analytics screen.

ONLY replace the data source.

---

## System Architecture (Version 3)

OANDA API → Backend (Brain) → Database → UI

Google Sheets is deprecated.

---

## Data Compatibility Rule (CRITICAL)

Backend output MUST match the exact structure of the current Google Sheets.

Reason:
- Analytics screen already works
- Avoid UI rewrites
- Preserve all panel logic

Reference:
Google Sheets contains 80+ structured columns across:
- price
- volume
- volatility
- momentum
- trend
- structure  [oai_citation:4‡EURUSD_AutoSheets.pdf](sediment://file_00000000ab9c720ca014ebc961eb5add)  

---

## Timeframe Expansion

Current: Daily

Next:
1. 4H
2. 1H
3. 15m

Each timeframe must:
- be independently selectable
- use same data structure

---

## BrainBot System

### Purpose
Convert raw data → trading decisions

Output:
- Direction (Long / Short)
- Entry
- Stop Loss
- Take Profit
- Confidence score

---

## Brain Layers

### Layer 1 — Market State
- EMA alignment
- ATR vs ATR SMA
- ADX

Output:
- Trend
- Volatility
- Regime

---

### Layer 2 — Structure (NEW PANEL)

Must be calculated:

- Higher High / Higher Low
- Lower High / Lower Low
- Break of Structure (BOS)
- Change of Character (CHOCH)

Output:
- Bullish / Bearish / Range

---

### Layer 3 — Regime Detection (NEW PANEL)

- ADX-based trend detection
- ATR expansion vs compression

Output:
- Trending
- Ranging
- Expanding
- Compressing

---

### Layer 4 — Signal

Use existing indicators:
- RSI
- MACD
- Momentum
- Volume

(No new indicators needed)

---

### Layer 5 — Execution

- Entry: confluence
- Stop: ATR-based
- Target: pivot / structure

---

### Layer 6 — Confidence Score

Weighted scoring:
- trend alignment
- momentum
- structure
- volatility
- context

---

## UI Rules (DO NOT BREAK)

- 12-column grid system
- No margin hacks (marginRight, etc.)
- No layout overrides
- Preserve all panel positions
- Preserve all existing functionality  [oai_citation:5‡Project.md](sediment://file_000000003c18722fb8ecc0a10da6a91b)  

---

## Design System

- Dark, premium fintech aesthetic
- Subtle glow
- Clean spacing
- No clutter
- No flashy effects

---

## Development Strategy

DO NOT:
- rebuild UI
- change panel structure
- change analytics layout

DO:
- build backend separately
- match data shape exactly
- plug backend into existing UI

---

## Build Phases (Version 3)

Phase 1:
- OANDA API connection

Phase 2:
- Store candles (SQLite)

Phase 3:
- Rebuild indicators (backend)

Phase 4:
- Data adapter (match sheets)

Phase 5:
- Brain logic

Phase 6:
- UI connection

---

## Key Insight

You are not building a dashboard anymore.

You are building:

→ A decision engine  
→ A trading brain  
→ A behavior feedback system