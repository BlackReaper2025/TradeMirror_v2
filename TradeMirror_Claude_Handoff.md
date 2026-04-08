# TradeMirror - Claude Code Build Brief

## What TradeMirror is
TradeMirror is a desktop-first trading dashboard focused on trader psychology.

The product should feel premium, calm, dark, and highly professional. The visual direction is inspired by the attached reference dashboard: rounded glass-like panels, subtle glow, clean spacing, strong hierarchy, and a luxury fintech feel.

Important: use the reference image for mood and layout direction, but do not clone another company's exact branding or visual details. This product may later be sold, so it must become its own original brand.

## Product goal
Build a desktop app first.
Later, reuse as much of the same UI and code as possible for a web app.

## Recommended stack
- Desktop shell: Tauri
- Frontend: React + TypeScript
- Build tool: Vite
- Styling: Tailwind CSS
- Local database: SQLite
- Database layer: Drizzle ORM
- Charts: Recharts

## Why this stack
- One shared frontend for desktop now and web later
- Fast to build with Claude Code
- Easy to create a polished dashboard UI
- Local-first storage is simple for version 1
- Good long-term path to a future cloud/web product

## Core product rules
1. Desktop first, web-ready architecture
2. Premium visual quality from the start
3. Psychology-first design
4. Local-first MVP
5. Build only what matters for version 1

## Main features for version 1

### 1) Dashboard
Show:
- account balance
- today's P&L
- avg win
- avg loss
- win rate
- live market session
- current time (HH:MM:SS)
- current date
- quote / psychology support
- dynamic color state based on today's P&L

### 2) Trade log
Each trade should support:
- account
- date and time
- instrument
- side
- setup name
- entry
- stop
- target
- size
- fees
- result
- screenshots
- technical notes
- journal notes
- emotions before trade
- emotions after trade
- mistakes
- lessons
- confidence
- discipline score
- tags

### 3) Calendar
Calendar should show for each day:
- total P&L
- number of trades

Clicking a day should open that day's trades and journal details.

### 4) Inspiration panel
User can connect the app to a local desktop folder.
The app displays inspirational images from that folder.

### 5) Quote panel
Show motivational, insightful, and psychology-focused quotes.

### 6) Dynamic psychology theme
Theme should respond to current day performance:
- green = daily target hit
- yellow = positive but target not hit yet
- red = negative day

This should influence:
- accent glow
- key stat highlights
- borders or edge lighting
- subtle chart emphasis
- some callout states

Do not make it gaudy. Keep it tasteful.

### 7) Risk calculator
Include:
- account selector
- account size
- risk percent or risk dollars
- entry
- stop
- target
- position size result
- risk/reward result

### 8) Equity curve
Line chart showing account balance over time.

### 9) Multiple accounts
Support multiple accounts per user, for example:
- Robinhood
- OANDA
- FTMO
- E8

The dashboard should show one selected account at a time.
A separate portfolio distribution panel should show the total distribution across all accounts.

### 10) Fatigue timer
User sets a countdown timer.
When the timer ends:
- show a full-screen warning overlay / splash
- warn about mental fatigue
- encourage stopping trading
- allow bypass / dismiss

### 11) Market session panel
Show:
- session state: Asia, London, NY, Roll Over Hour, Pre-Asia, or Closed
- blinking/live indicator when a market is active
- current clock
- current date

## Suggested app sections
- Dashboard
- Trade Log
- Calendar
- Risk Calculator
- Analytics
- Inspiration
- Settings

## Data model to create first

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

### quotes
- id
- text
- author
- category
- is_active

### inspiration_folders
- id
- local_path
- is_active

### fatigue_settings
- id
- duration_minutes
- is_enabled
- bypass_count

### app_settings
- id
- selected_account_id
- theme_mode
- last_opened_page

## Design system rules
- Dark luxury fintech feel
- Rounded panels
- Soft glow
- Thin borders
- Clean spacing
- Strong hierarchy
- Minimal clutter
- Smooth subtle motion only
- No cheap neon effect
- No over-busy charts
- Keep typography crisp and readable

## Layout direction
Create a dashboard shell similar in spirit to the reference:
- left or right vertical sidebar
- large balance chart panel
- donut / portfolio panel
- summary/stat cards
- lower activity / history panels
- modular card-based dashboard

## Engineering rules
- Build reusable components
- Keep business logic separate from UI
- Keep database access clean and typed
- Make all major panels independent and composable
- Prepare for future web app reuse
- Use fake seeded demo data first, then real data
- Commit in small, clean steps

## Build order

### Phase 1 - static shell
Goal: create the premium dashboard UI with mock data only
- scaffold Tauri + React + TypeScript + Vite + Tailwind
- build app shell
- build sidebar
- build reusable panel/card component
- create dashboard mock layout
- create theme token system
- add green/yellow/red dynamic theme switching
- create mock charts and cards

### Phase 2 - local data foundation
- add SQLite
- add Drizzle schema
- add migrations
- add seeded demo data
- connect dashboard cards to local data

### Phase 3 - trade log
- create trade form
- create trade table/list
- create journal inputs
- create edit/delete flow
- calculate derived stats

### Phase 4 - analytics
- calendar
- equity curve
- account distribution
- filters
- daily summaries

### Phase 5 - psychology features
- quote rotation
- inspiration folder picker
- fatigue timer overlay
- market session panel

### Phase 6 - polish
- onboarding
- settings
- desktop packaging
- backup/export/import
- empty states
- error handling
- final visual pass

## What NOT to build yet
- broker API sync
- cloud sync
- auth
- team accounts
- mobile app
- AI coaching
- advanced notifications
- social features

## Very first task
Build the static dashboard shell with mock data and premium styling.
The shell should already feel close to a real product before any database work starts.

## Success standard
When the app first opens, it should immediately feel:
- calm
- premium
- focused
- psychologically supportive
- trustworthy
- sellable later with brand cleanup
