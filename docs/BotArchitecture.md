# TradeMirror — Bot Architecture

## Overview

The TradeMirror bot is built on a single shared intelligence pipeline. The same engine that powers the live Analytics panels is the engine that evaluates trade conditions and executes orders. There is no separate bot pipeline. There is no duplication.

---

## Core Principle

> The Rust backend is the brain. The frontend is the display.

All time-sensitive work happens in Rust:
- Price ingestion
- Candle management
- Indicator calculation
- Condition evaluation
- Trade execution
- Telegram notification

The frontend receives push notifications from Rust and renders them. It never computes anything that matters for the bot.

---

## Data Flow

```
OANDA Streaming Price Feed (WebSocket tick stream)
  │
  ▼
Rust: Price Tick Handler
  │  - receives each price tick for subscribed pairs
  │  - updates the current (unclosed) candle for each active timeframe
  │
  ▼
Rust: Candle Buffer (in-memory, per pair + timeframe)
  │  - maintains a rolling window of closed candles (e.g. last 200)
  │  - detects candle close by timestamp boundary
  │  - on close: appends new candle, drops oldest if over limit
  │
  ▼
Rust: Indicator Engine (incremental recompute)
  │  - recomputes all indicators on each tick (for live values)
  │    or on candle close (for confirmed values)
  │  - indicators computed: EMA, RSI, MACD, ADX, ATR, Bollinger,
  │    Keltner, CCI, Williams %R, ROC, Squeeze, and others
  │  - outputs a structured IndicatorSnapshot per (pair, timeframe)
  │
  ├──► Rust: Condition Engine
  │      - evaluates strategy rules against the latest IndicatorSnapshot
  │      - example rule: MACD bullish cross AND RSI < 30
  │      - example rule: MACD bearish cross AND RSI > 70
  │      - when conditions are met:
  │          → Rust: OANDA Order Execution (direct API call, same process)
  │          → Rust: Telegram HTTP notification (via AlphaAlert)
  │
  └──► Tauri Events (push to frontend)
         - emits updated IndicatorSnapshot to the UI
         - Analytics panels subscribe and re-render in real-time
         - no polling, no request/response round-trips
```

---

## Why Rust Handles Everything

On a 1M timeframe, every second matters. Consider the latency stack if condition checking happened in the frontend:

```
Tick arrives in Rust
  → Rust sends event to frontend          (+1-5ms)
  → Frontend receives and processes       (+1-5ms)
  → Frontend evaluates condition          (+1ms)
  → Frontend calls Tauri to execute trade (+1-5ms)
  → Rust calls OANDA API                  (+50-200ms network)
```

Versus condition checking in Rust:

```
Tick arrives in Rust
  → Rust updates indicators               (+<1ms)
  → Rust evaluates condition              (+<1ms)
  → Rust calls OANDA API                  (+50-200ms network)
```

The OANDA network call is the irreducible latency floor. Everything before it should be eliminated. Keeping the condition engine in Rust removes 10-20ms of unnecessary frontend round-trip from every single evaluation.

On 1M candles this is the difference between acting on the candle that triggered the signal versus acting on the next one.

---

## Candle Buffer Design

Each pair + timeframe combination maintains its own buffer:

```
CandleBuffer {
  pair:      "EUR_USD"
  timeframe: "M1"
  candles:   Vec<Candle>  // rolling 200 candles, oldest dropped
  live:      Candle        // current unclosed candle, updated each tick
}
```

Supported timeframes: M1, M5, M15, H1, H4, D, W

The buffer is held entirely in Rust memory — no SQLite read/write on the hot path. SQLite is only used for historical persistence and replay. The live bot path never touches disk.

---

## Indicator Engine Design

On each tick or candle close, the indicator engine receives the candle buffer and produces a structured output:

```
IndicatorSnapshot {
  pair:            "EUR_USD"
  timeframe:       "M1"
  timestamp:       u64
  close:           f64

  // Trend
  ema9:            f64
  ema20:           f64
  ema50:           f64
  ema100:          f64
  ema200:          f64
  adx:             f64
  di_plus:         f64
  di_minus:        f64

  // Momentum
  rsi9:            f64
  rsi14:           f64
  macd:            f64
  macd_signal:     f64
  macd_histogram:  f64
  cci:             f64
  wr:              f64
  roc:             f64

  // Volatility
  bb_upper:        f64
  bb_middle:       f64
  bb_lower:        f64
  keltner_upper:   f64
  keltner_middle:  f64
  keltner_lower:   f64
  atr14:           f64
  squeeze_on:      bool

  // State flags (alert-ready)
  macd_bullish_cross:  bool
  macd_bearish_cross:  bool
  rsi9_oversold:       bool   // rsi9 < 30
  rsi9_overbought:     bool   // rsi9 > 70
  rsi14_oversold:      bool
  rsi14_overbought:    bool
}
```

The Analytics panels receive and display this struct. The Condition Engine reads the same struct to evaluate rules. One output, multiple consumers.

---

## Condition Engine Design

The condition engine is a rule evaluator. Each strategy rule is a function that takes an `IndicatorSnapshot` and returns true or false.

```
Rule: BullishMacdRsiDivergence
  → macd_bullish_cross == true
  → rsi14 < 30
  → action: BUY

Rule: BearishMacdRsiDivergence
  → macd_bearish_cross == true
  → rsi14 > 70
  → action: SELL
```

Rules are composable. Multiple conditions on multiple timeframes can be combined later (e.g. H1 bias + M5 entry). The engine is designed for this from the start.

When a rule fires:
1. OANDA order is placed immediately (same Rust process, no IPC)
2. Telegram notification is sent via HTTP
3. Trade record is written to SQLite
4. Tauri event is pushed to the frontend (alert panel update)

---

## Shared vs. Dedicated Pipelines

| System | Candle Buffer | Indicator Engine | Notes |
|---|---|---|---|
| Analytics panels | shared | shared | display only |
| Alerts engine | shared | shared | condition monitoring |
| Bot condition engine | shared | shared | evaluates rules |
| Trade execution | — | — | fires on condition trigger |
| Backtester | separate (historical) | shared logic | replay mode |

There is never more than one indicator calculation happening per (pair, timeframe). All consumers read from the same IndicatorSnapshot.

---

## Telegram Integration

When a condition fires, Rust sends an HTTP POST to AlphaAlert (the existing Telegram bot).

Payload includes:
- pair and timeframe
- rule that fired
- entry price
- direction (BUY / SELL)
- timestamp

The notification arrives in Telegram within ~1 second of condition detection.

---

## What Gets Built First

1. **OANDA streaming connection in Rust** — persistent WebSocket tick stream
2. **Candle buffer per (pair, timeframe)** — in-memory rolling window
3. **Indicator engine** — recomputes on tick/close, produces IndicatorSnapshot
4. **Tauri push events** — sends IndicatorSnapshot to frontend
5. **Analytics panels updated** — subscribe to events, display live indicators

The Condition Engine and trade execution are added later (bot phase), but the infrastructure they require is built in steps 1-4. When the bot phase begins, the condition engine plugs directly into the existing indicator stream with no architectural changes required.

---

## What Does NOT Change

- The existing daily SQLite pipeline (`get_candles_v3`) remains untouched for historical replay
- The Analytics V3 UI layout and panel structure are preserved
- The existing OANDA daily sync continues running for end-of-day persistence
- The existing Telegram bot (AlphaAlert) is reused as the notification router
