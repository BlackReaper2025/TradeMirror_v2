# TradeMirror — Project.md (Unified Master Project File)

## Identity
TradeMirror is evolving into:
- a trading intelligence platform
- a centralized analytics engine
- a modular execution system
- a psychology-first trading operating system

It is NOT just:
- a dashboard
- a charting tool
- a disconnected bot

---

# Division Of Labor

## Geoff
- Vision
- Trading judgment
- Strategy approval
- Risk decisions
- Final authority

Geoff is:
> the captain

---

## ChatGPT
- Architecture
- Systems planning
- Product strategy
- Workflow design
- Risk framework design
- Utility scoring design
- Claude prompt generation
- Long-term scalability planning

ChatGPT is:
> the systems brain

---

## Claude Code
- Backend implementation
- Frontend implementation
- Refactoring
- Database work
- OANDA integration
- Strategy engine implementation
- Risk engine implementation
- Alerts engine integration
- UI implementation

Claude Code is:
> the hands on the keyboard

---

## NotebookLM
- Strategy research
- Technical analysis research
- Book summarization
- Pattern extraction
- Strategy ideation

NotebookLM is:
> the research library

---

# Current State

Current completed systems:
- Dashboard COMPLETE
- Trade Log COMPLETE
- Analytics V3 BUILT
- OANDA daily EURUSD backend exists
- Daily indicators operational
- Market Structure panel partially implemented
- Price Alerts Engine already developed separately
- Telegram alert bot exists: AlphaAlert

Current immediate priorities:
1. Minor app tweaks and stabilization
2. Improve Market Structure panel
3. Add Regime Detection panel
4. Integrate Alerts system into TradeMirror
5. Expand alerts to support indicator conditions
6. THEN begin deeper bot development

The bot is NOT the immediate next step.

The current focus is:
> strengthening the analytics and intelligence foundation first

Important clarification:

The current immediate priorities remain:

1. Minor app tweaks and stabilization
2. Improve Market Structure panel
3. Add Regime Detection panel
4. Integrate Alerts system into TradeMirror
5. Expand alerts to support indicator conditions

These systems are considered:
> intelligence validation infrastructure

NOT:
> autonomous trading infrastructure

The purpose of these priorities is to:
- stabilize analytics
- validate centralized indicator outputs
- validate live market interpretation
- validate alert timing and consistency
- improve market observability
- improve system explainability

The goal is NOT to prematurely automate trading decisions.

---

# Safer Development Path (Post-Validation Phase)

After the current priorities are completed, TradeMirror development will temporarily narrow scope to prioritize:

- simplicity
- stability
- data integrity
- replay consistency
- explainability
- maintainability
- measurable edge validation

The project will intentionally avoid premature expansion into:
- autonomous execution
- advanced utility scoring
- deep confidence scoring systems
- ML systems
- excessive strategy abstraction
- unnecessary intelligence layers

This does NOT mean abandoning the long-term vision.

The long-term vision remains:
> a professional trading intelligence platform

However, future expansion must occur:
> only after infrastructure and edge validation are proven.

---

# Critical Architecture Rule

DO NOT rebuild TradeMirror from scratch.

The bot and alerts systems must be integrated directly into the existing architecture.

Existing systems already provide:
- OANDA ingestion
- indicator generation
- Analytics V3 visualization
- desktop infrastructure
- frontend framework
- early price alert infrastructure

These are major strategic advantages.

---

# Analytics V3 Strategic Importance

Analytics V3 is NOT just UI.

It becomes:
- strategy validation system
- bot debugging system
- signal interpretation system
- execution monitoring layer
- indicator alert validation layer

Analytics V3 must remain tightly connected to the centralized indicator engine.

---

# Current Analytics Priorities

## Priority 1 — Market Structure Enhancement

The Market Structure panel is now a core intelligence system.

Required capabilities:
- Swing High detection
- Swing Low detection
- Higher High / Higher Low tracking
- Lower High / Lower Low tracking
- BOS detection
- CHOCH detection
- Bullish/Bearish/Range state
- Structure break signals

Why this matters:
> indicators lag, structure reflects market narrative

Market structure becomes one of the most important systems in the entire platform.

---

## Priority 2 — Regime Detection Panel

TradeMirror must include a dedicated Regime Detection panel.

Purpose:
- identify broad market conditions
- improve signal interpretation
- improve market observability
- validate market context assumptions

Initial regime states should remain intentionally simple:
- Trending
- Ranging
- Unclear

Early regime detection is:
> descriptive infrastructure

NOT:
> predictive intelligence

Initial core logic sources:
- ADX
- ATR vs ATR SMA
- Bollinger Band width

Avoid overengineering regime classification early.

---

## Priority 3 — Alerts System Integration

TradeMirror will include a dedicated Alerts system integrated into the core architecture.

The alerts system should support:
- price alerts
- indicator alerts
- strategy alerts later
- Telegram notifications
- in-app notifications
- future desktop notifications

Current Telegram bot:
- AlphaAlert

---

# Core System Architecture

OANDA API
→ Central Candle Database
→ Shared Indicator Engine
→ Structured Indicator Output Layer
→ Consumers:
   - Analytics V3
   - Alerts Engine
   - Strategy Engine
   - Risk Engine
   - Backtester
   - Paper Trader
   - Live Execution
   - ML Systems Later

---

# Shared Indicator Engine Rule

TradeMirror must maintain:
- ONE candle source
- ONE indicator engine
- ONE structured indicator output layer

NEVER create:
- duplicate RSI calculations
- duplicate MACD pipelines
- duplicate EMA logic
- separate bot-only indicators
- separate alert-only indicators

All systems must consume identical outputs.

---

# Structured Indicator Output Layer

Indicators must expose:
- numerical values
- bullish/bearish states
- confidence scores
- trend strength
- volatility regime
- normalized outputs
- alert-ready condition states

This becomes:
> the bridge between analytics, alerts, automation, and execution

---

# Alerts Engine System

Current external alert pipeline:
OANDA streaming price feed
→ Python alert engine
→ Telegram alert
→ local alert log

Long-term TradeMirror architecture:
OANDA Data
→ Central Candle Store
→ Shared Indicator Engine
→ Alerts Engine
→ Notification Router
→ Telegram / In-App UI

Important constraint:

Alerts are currently:
> validation and monitoring tools

NOT:
> automated execution triggers

The alerts system should primarily help validate:
- indicator consistency
- structure consistency
- timing consistency
- live vs replay behavior

---

# Alerts Screen

TradeMirror will include a dedicated Alerts screen.

The Alerts screen should allow:
- create alerts
- edit alerts
- pause alerts
- delete alerts
- reset triggered alerts
- monitor active alerts
- view triggered alert history
- toggle Telegram notifications
- toggle in-app notifications

---

# Alert Types

## Price Alerts
Examples:
- EURUSD above 1.1800
- EURUSD below 1.1650

## Indicator Alerts
Examples:
- RSI crosses below 30
- RSI crosses above 70
- MACD crosses signal line
- ADX rises above 25
- ATR volatility expansion
- EMA crossover
- Bollinger breakout
- Keltner breakout
- Market structure BOS
- CHOCH detection

Indicator alerts MUST consume:
> the centralized indicator engine

---

# Market Structure Philosophy

The AI brain cannot understand trend narrative without market structure.

Required future additions:
- liquidity pool detection
- equal highs / equal lows
- previous day high / low
- session highs / lows
- FVG detection
- imbalance zones

But these are NOT immediate priorities.

Immediate priority order:
1. Market Structure
2. Regime Detection
3. Multi-timeframe expansion
4. Liquidity logic later

Important constraint:

Market Structure systems are currently intended to:
- improve chart interpretation
- improve signal validation
- improve contextual understanding

NOT:
- generate autonomous trade decisions
- function as a standalone predictive engine

---

# BrainBot Long-Term Purpose

The long-term purpose of BrainBot is to eventually assist with:
- Directional bias
- Trade context
- Entry evaluation
- Risk awareness
- Market condition interpretation

However:

BrainBot development is intentionally delayed until:
- data integrity is stable
- replay systems are validated
- indicator consistency is verified
- alerts systems are stable
- measurable strategy expectancy exists

The current project phase is:
> intelligence validation and infrastructure stabilization

---

# Multi-Timeframe Expansion

Current:
- Daily

Expansion order:
1. 4H
2. 1H
3. 15M
4. Weekly
5. 5M

Multi-timeframe purpose:
- Daily → Bias
- 4H → Structure
- 1H → Setup
- 15M → Entry

All timeframes must use:
- identical structures
- centralized indicator engine

Alerts must also support timeframe selection.

---

# Risk Philosophy

Required protections:
- Max risk per trade
- Max daily loss
- Max weekly loss
- Drawdown protection
- Consecutive loss lockout
- Emergency kill switch
- ATR-aware stop logic

System priority:
> survivability over aggressiveness

---

# Development Strategy

DO NOT:
- rebuild UI
- rebuild Analytics V3
- create duplicate indicator systems
- create duplicate alert indicator logic

DO:
- preserve UI
- centralize indicators
- build backend separately
- create structured outputs
- integrate alerts as a core platform consumer

---

# Updated Development Priority

## Current Immediate Development Phase
1. Minor UI/app stabilization
2. Improve Market Structure panel
3. Add Regime Detection panel
4. Integrate Alerts system
5. Add indicator-based alerts
6. Improve structured indicator outputs

## Post-Validation Stabilization Phase
7. Validate candle integrity
8. Validate indicator consistency
9. Build replay consistency tools
10. Validate live vs replay behavior
11. Validate one small strategy path
12. Validate paper trading workflows

## Secondary Expansion Phase
13. Multi-timeframe architecture
14. Shared intelligence systems
15. Strategy engine
16. Risk engine

## Later Phase
17. Backtesting
18. Paper trading
19. Live execution
20. ML later

---

# Machine Learning Philosophy

ML is NOT phase 1.

ML should:
- assist decisions
- augment probabilities
- compare against rules-based systems

ML should NEVER bypass:
- risk engine
- emergency safeguards

ML remains a distant later-phase system.

TradeMirror must first prove:
- stable infrastructure
- stable data
- stable indicators
- stable replay systems
- measurable trading edge

before ML expansion is considered.

---

# Core Survivability Principle

TradeMirror must avoid:
- architecture sprawl
- intelligence inflation
- false confidence from analytics
- premature automation
- complexity without measurable edge

Every new system must justify itself by improving at least one of:
- data integrity
- explainability
- validation quality
- replay consistency
- measurable trading performance
- debugging capability

Sophistication alone is NOT progress.

---

# Final Goal

TradeMirror should become:
- stable
- explainable
- scalable
- psychologically sustainable
- professionally structured

