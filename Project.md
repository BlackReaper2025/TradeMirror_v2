# TradeMirror - Project Brief

## What TradeMirror is
TradeMirror is a desktop-first trading dashboard focused on trader psychology.

The product should feel premium, calm, dark, and highly professional. It should function as a trading psychology operating system, not just a data dashboard.

The long-term vision includes an intelligent “brain” layer that acts as a trading coach.

---

## Product Goal
- Build a desktop app first
- Maintain a clean path to a future web version
- Create a product that is visually premium and sellable

---

## Current Development Focus

The primary focus of development is the **Dashboard**.

The dashboard must:
- feel complete and premium
- display all key information clearly
- function as the central control hub of the app

All layout, styling, and interaction decisions should prioritize making the dashboard visually strong, stable, and psychologically effective before expanding other areas.

---

## Core Product Philosophy
1. Desktop-first, web-ready architecture
2. Premium visual quality from the start
3. Psychology-first design
4. Local-first MVP
5. Build only what matters for version 1

---

## Layout System (Global Rule)
- The entire app uses a **12-column grid system**
- All screens and tabs must follow this layout system
- No margin hacks, negative margins, or manual offsets for layout
- Panel placement must be controlled through grid column/row spans only
- Layout should feel like a **collage-style dashboard**, not a rigid grid

---

## Recommended Stack
- Desktop shell: Tauri
- Frontend: React + TypeScript
- Build tool: Vite
- Styling: Tailwind CSS
- Local database: SQLite
- Database layer: Drizzle ORM
- Charts: Recharts

---

## Core Features (Version 1)

### Dashboard (Primary Screen)
Displays:
- Account balance
- Today’s P&L
- Avg win / avg loss
- Win rate
- Equity curve
- Market session + live clock
- Psychology quote panel
- Fatigue timer
- Risk calculator
- Trade log preview
- Calendar preview

This is the main screen and should remain open most of the time.

---

### News / Market Sentiment Tab
Displays:
- Latest market headlines
- Market sentiment overview
- Prices of key assets:
  - BTC
  - Gold
  - USOIL
  - Treasuries
  - Dow
  - S&P 500
  - Nasdaq
- User-defined watchlist (stocks / forex pairs)

Purpose:
- Quickly understand current market conditions before trading

---

### Trading Tab (OANDA Integration - Planned)
- Direct integration with OANDA API
- Ability to place trades inside the app
- Automatic trade logging from OANDA activity

Notes:
- Manual trade logging must still be supported
- This tab is separate from the Dashboard

---

### Trade Log
- Full manual trade entry
- Technical + psychological data capture
- Tags, notes, screenshots
- Journal inputs:
  - emotions before/after
  - mistakes
  - lessons
  - discipline score

---

### Calendar
- Daily P&L
- Trade count per day
- Click into day for full breakdown

---

### Risk Calculator
- Position sizing
- Risk/reward calculation
- Account-based inputs

---

### Equity Curve
- Line chart showing account balance over time

---

### Multiple Accounts
Support:
- Prop firms
- Brokers (Robinhood, OANDA, etc.)

Dashboard shows one selected account at a time.

---

### Fatigue Timer
- Countdown timer
- When triggered:
  - full-screen warning overlay
  - encourages stopping trading
  - can be dismissed

---

### Quotes Panel
- Displays psychology-focused quotes
- Must always be clearly visible (not truncated)

---

### Inspiration Panel (Optional)
- Pulls images from a local folder
- Displays rotating motivational content

---

## Dynamic Psychology Theme

The theme system is a core feature of TradeMirror and must function as a psychological feedback system, not just a visual indicator.

### Core Principle
Theme color should reflect **trading performance relative to behavior and context**, not just raw P&L.

The system must evaluate:

1. P&L direction (positive / negative)
2. Trade quality:
   - discipline
   - rule adherence
   - execution quality
3. Risk behavior:
   - position sizing
   - overtrading
   - revenge trading
4. (Future) Market context:
   - volatility
   - trading conditions
   - news environment

---

### Theme States

- **Green**
  - Strong performance
  - Rules followed
  - Clean execution
  - Behavior aligned with trading plan

- **Yellow**
  - Mixed performance
  - Positive P&L but flawed behavior, OR
  - Negative P&L with strong discipline

- **Red**
  - Poor performance
  - Rule-breaking behavior
  - Emotional or impulsive trading
  - High-risk mistakes

---

### Key Insight

The system should prioritize **behavior over outcome**.

Examples:
- Positive P&L with poor discipline → Yellow or Red
- Negative P&L with perfect execution → Yellow
- Strong execution and profit → Green

---

### Design Impact

Theme state influences:
- glow
- borders
- highlights
- key UI elements
- subtle chart emphasis

The effect must remain:
- subtle
- premium
- non-distracting

---

### Implementation Strategy

- Start with a simplified version using available data:
  - P&L
  - basic trade stats
- Design the system so it can evolve into a more advanced scoring model
- Thresholds must be flexible and not hardcoded to fixed dollar targets

---

## Brain Layer (Future System)

TradeMirror will include an intelligent “brain” layer.

Purpose:
- Analyze trades and user behavior
- Detect strengths and weaknesses
- Identify hidden patterns
- Provide psychological coaching
- Encourage good trading behavior
- Warn against destructive behavior

This system will evolve over time and is not fully defined yet.

---

## Splash Screen
- Appears on app launch
- Premium, calm, and branded
- Sets psychological tone for trading session

---

## User Workflow (Daily Flow)

Typical usage flow:

1. User opens app
2. Splash screen appears
3. User lands on Dashboard
4. Reviews account stats and performance
5. Checks News / Market Sentiment tab
6. Evaluates current market conditions
7. Places trades:
   - via OANDA tab (in-app), or
   - externally (prop firm / broker)
8. Trades are logged (automatically or manually)
9. User monitors performance on Dashboard
10. User receives feedback (future brain layer)
11. User reflects and journals trades

The Dashboard should remain the central screen throughout usage.

---

## Data Model (Initial)

### accounts
- id
- name
- broker_or_firm
- starting_balance
- current_balance
- daily_target
- account_type
- is_active

### trades
- id
- account_id
- opened_at
- closed_at
- instrument
- side
- setup_name
- entry_price
- stop_price
- target_price
- size
- fees
- pnl
- screenshot_path
- technical_notes
- tags

### trade_journal
- id
- trade_id
- emotion_before
- emotion_after
- mistakes
- lessons
- confidence_score
- discipline_score
- freeform_notes

### daily_stats
- id
- account_id
- day
- total_pnl
- trade_count
- avg_win
- avg_loss
- win_rate

---

## Design System Rules
- Dark luxury fintech aesthetic
- Rounded panels
- Subtle glow
- Thin borders
- Clean spacing
- Strong hierarchy
- Minimal clutter
- Smooth, subtle motion only
- No flashy or cheap effects

---

## Build Order

### Phase 1 - UI Foundation
- App shell
- Sidebar
- Dashboard layout
- Reusable panels
- Mock data
- Dynamic theme

### Phase 2 - Data Layer
- SQLite + Drizzle
- Schema + migrations
- Seeded data

### Phase 3 - Trade System
- Trade entry
- Trade log
- Journal system

### Phase 4 - Analytics
- Calendar
- Equity curve
- Stats

### Phase 5 - Psychology Features
- Quotes
- Fatigue timer
- Inspiration panel

### Phase 6 - Expansion
- OANDA integration
- News / sentiment tab
- Brain layer (initial version)

### Phase 7 - Polish
- Splash screen
- Animations
- Settings
- Packaging

---

## What NOT to Build Yet
- Cloud sync
- Authentication
- Mobile app
- Advanced AI coaching (beyond initial brain layer)
- Social features