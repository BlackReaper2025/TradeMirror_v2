# Claude Code Rules — TradeMirror

# Core Rules
- Only perform the exact task requested
- Only modify the specified file
- Do not change anything else
- Preserve all functionality
- Preserve architecture consistency

---

# Output Rules
- While actively working on a coding task, DO NOT stream progress updates
- DO NOT describe steps, actions, or intermediate changes
- Only respond when the task is complete OR blocked
- Keep ALL responses as short and to the point as possible to conserve tokens
- DO NOT show progress text or running commentary while executing a task

Allowed responses:
- "DONE"
- A direct question if clarification is required
- A concise error or blocker message if something fails

No other output is permitted during execution

- Show only changed code
- No full file unless asked
- No explanations unless asked
- Keep responses minimal

Last line must always be:
DONE

---

# UI Protection Rules
- DO NOT modify Dashboard layout
- DO NOT rebuild Analytics V3
- DO NOT break Trade Log structure

DO NOT:
- use margin hacks
- use manual offsets
- break grid layout

---

# Architecture Rules
- Backend separate from UI
- Do not compute indicators in UI
- Keep systems modular
- Preserve centralized architecture
- Prioritize simplicity and explainability
- Avoid unnecessary abstraction
- Avoid premature architecture expansion

---

# Analytics-First Development Rule (CRITICAL)

Analytics V3 is the primary development sandbox.

New intelligence systems should appear in:
> Analytics V3 first

before:
- automation
- execution
- autonomous trading systems

Analytics V3 is:
- strategy validation system
- debugging system
- signal visualization system
- intelligence validation layer
- indicator alert validation layer

Preserve compatibility at all times.

Important clarification:

Analytics V3 is currently:
> validation infrastructure

NOT:
> autonomous intelligence infrastructure

---

# Current Development Priorities (CRITICAL)

Current priority order:

1. Minor app stabilization
2. Market Structure enhancement
3. Regime Detection panel
4. Alerts system integration
5. Indicator-based alerts
6. Structured indicator outputs
7. Multi-timeframe architecture later
8. Bot systems later

Claude must NOT prematurely prioritize:
- autonomous execution
- deep strategy automation
- ML systems
- overbuilt bot infrastructure
- advanced confidence systems
- utility scoring expansion

The current focus is:
> strengthening the intelligence foundation first

---

# Shared Indicator Engine Rule (CRITICAL)

TradeMirror must maintain:
- ONE candle source
- ONE indicator engine
- ONE structured indicator output layer

Claude must NEVER:
- create duplicate EMA calculations
- create duplicate RSI calculations
- create duplicate MACD calculations
- create separate bot-only pipelines
- create separate alert-only indicator pipelines

Consumers include:
- Analytics V3
- Alerts Engine
- Strategy Engine
- Backtester
- Paper Trader
- Live Execution
- ML later

---

# Structured Indicator Output Rule

Indicators must expose:
- numerical values
- bullish/bearish states
- confidence scores
- trend strength
- volatility regime
- normalized outputs
- alert-ready condition states

All systems must consume:
> shared structured outputs

Important constraint:

Structured outputs are currently intended for:
- validation
- observability
- explainability
- replay consistency

NOT:
- autonomous decision authority

---

# Market Structure Rule (CRITICAL)

Market Structure is NOT just another indicator panel.

It is a foundational intelligence layer.

Market Structure systems should support:
- Swing High detection
- Swing Low detection
- Higher High / Higher Low logic
- Lower High / Lower Low logic
- BOS detection
- CHOCH detection
- Bullish/Bearish/Range states

Claude should architect Market Structure systems as:
> reusable intelligence infrastructure

NOT:
> isolated panel logic

Important constraint:

Market Structure is currently:
> descriptive infrastructure

NOT:
> predictive trade intelligence

---

# Regime Detection Rule (CRITICAL)

Regime Detection is a foundational intelligence system.

Regime logic must remain reusable and centralized.

Initial regime states:
- Trending
- Ranging
- Unclear

Regime systems should support:
- alerts
- validation
- contextual interpretation
- replay analysis

DO NOT:
- overengineer regime classification
- create highly granular regime states early
- treat regime outputs as predictive certainty

Initial regime logic is:
> descriptive infrastructure

NOT:
> predictive intelligence

---

# Alerts Engine Rules

## Shared Indicator Rule

Indicator alerts MUST consume:
> the centralized indicator engine

Claude must NEVER:
- create separate RSI calculations for alerts
- create separate MACD calculations for alerts
- create duplicate EMA crossover logic
- create duplicate indicator pipelines

Alerts must use:
- shared candle data
- shared indicator outputs
- shared structured states

---

# Alerts Architecture Rule

Alerts are part of:
> the unified TradeMirror platform

NOT:
> a disconnected side utility

Alerts should integrate with:
- Analytics V3
- Strategy Engine later
- Risk Engine later
- TradeMirror Intelligence Center
- Telegram routing system

Important constraint:

Alerts are currently:
> validation and monitoring tools

NOT:
> automated execution triggers

The alerts system should primarily validate:
- indicator consistency
- structure consistency
- timing consistency
- live vs replay consistency

---

# Alerts Screen Rule

The Alerts screen should support:
- active alerts
- paused alerts
- triggered alerts
- alert history
- Telegram routing
- in-app routing
- indicator alerts
- future strategy alerts

---

# Indicator Alert Support

Claude should architect alerts to support:
- RSI thresholds
- MACD crossovers
- EMA crossovers
- ATR expansion
- ADX thresholds
- Market structure events
- BOS / CHOCH detection

Indicator alerts MUST consume:
> centralized structured outputs

---

# Notification Rule

Notification routing must remain modular.

Support:
- Telegram via AlphaAlert
- in-app alerts
- future desktop notifications

Avoid hardcoded notification logic.

---

# Replay Consistency Rule (CRITICAL)

TradeMirror must prioritize:
- replay consistency
- historical reproducibility
- live vs replay consistency
- indicator integrity
- timestamp consistency

Claude should avoid creating systems that:
- behave differently live vs replay
- recalculate inconsistently
- depend on hidden UI assumptions
- mutate historical indicator states

Replay correctness is more important than feature expansion.

---

# Survivability Rule (CRITICAL)

TradeMirror must avoid:
- architecture sprawl
- intelligence inflation
- false confidence from analytics
- premature automation
- unnecessary complexity
- excessive abstraction

Every major new system must justify itself by improving at least one of:
- data integrity
- explainability
- validation quality
- replay consistency
- debugging capability
- measurable trading performance

Sophistication alone is NOT progress.

---

# Development Order

## Current Immediate Phase
1. Stabilize candle pipeline
2. Stabilize centralized indicator engine
3. Improve Market Structure systems
4. Build Regime Detection system
5. Integrate Alerts system
6. Add indicator alert support
7. Build structured outputs
8. Validate data integrity

## Post-Validation Stabilization Phase
9. Validate replay consistency
10. Validate indicator integrity
11. Validate live vs replay behavior
12. Validate one small strategy path
13. Validate paper trading workflows

## Later Phase
14. Multi-timeframe systems
15. Strategy engine
16. Risk engine
17. Backtesting
18. Paper trading
19. Execution layer
20. ML later

---

# Do Not Prematurely Automate Rule

Claude must NOT:
- jump ahead into autonomous trading
- overbuild execution systems
- prematurely optimize ML systems
- tightly couple execution to unfinished intelligence systems
- prematurely build advanced scoring systems
- create predictive abstractions without validation

The intelligence layer must stabilize first.

---

# Constraints
- Local-first
- No paid services
- Use existing stack:
  - React
  - TypeScript
  - SQLite
  - Drizzle
  - Tauri

---

# Launch Command
claude --dangerously-skip-permissions

---

# Prompt Discipline

Every prompt should include:
- exact file name
- exact task
- “Only modify this file”
- “Do not change anything else”

Prompts should remain:
- surgical
- token-efficient
- one-task-at-a-time

---

# Philosophy

- Replace systems, not rebuild them
- Preserve working UI
- Centralize indicator logic
- Maintain long-term scalability
- Alerts are a core platform consumer
- Analytics V3 is part of the engine itself
- Intelligence infrastructure comes before automation
- Validation comes before prediction
- Explainability comes before sophistication
- Stability comes before expansion
- Measurable edge comes before automation

