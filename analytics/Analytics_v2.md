\# TradeMirror V2 — Analytics Screen



\## Scope (CRITICAL)

This task is ONLY for building the Analytics screen.



\- Do NOT modify Dashboard

\- Do NOT modify other tabs

\- Do NOT change global layout system

\- Only build the Analytics screen and its components



\---



\## Purpose



The Analytics screen is the first implementation of the TradeMirror “brain”.



It must:

\- analyze structured market data

\- synthesize signals across indicators

\- output a clear trading decision



Primary goal:

→ Quickly tell the user:

\- LONG or SHORT bias

\- optimal entry

\- stop loss

\- take profit levels



This is not a data table.

This is a decision engine UI.



\---



\## Data Source



\- Source: Google Sheets (EURUSD dataset)

\- Data updates daily at 6PM ET

\- Contains:

&#x20; - OHLC data

&#x20; - trend indicators (EMA, SMA, MACD)

&#x20; - momentum indicators (RSI, StochRSI, CCI)

&#x20; - volatility (ATR, Bollinger)

&#x20; - structure (Pivot Points, Keltner, Ichimoku)

&#x20; - volume



This dataset is already fully calculated.



The app does NOT calculate indicators.

It consumes and interprets them.



\---



\## Current Focus



\- Asset: EURUSD ONLY

\- No multi-asset switching yet (design placeholder allowed)



\---



\## Core Functionality



\### 1. AI Analysis Output (Primary Panel)



This is the most important panel.



It must display:



\- Direction:

&#x20; - LONG or SHORT (large, dominant visual)



\- Confidence Score:

&#x20; - percentage or rating



\- Entry Price



\- Stop Loss



\- Take Profit Targets:

&#x20; - TP1

&#x20; - TP2

&#x20; - TP3



\- Risk/Reward ratio



\---



\### 2. Signal Breakdown Panel



Show WHY the decision was made.



Sections:



\- Trend

\- Momentum

\- Structure

\- Volatility



Each section shows:

\- bullish / bearish bias

\- contributing indicators



Example:

\- Trend: Bullish (EMA stack aligned, MACD > signal)

\- Momentum: Neutral (RSI mid-range)

\- Structure: Bullish (above R1, above cloud)



\---



\### 3. Indicator Snapshot Panel



Display key indicators at a glance:



\- RSI(14)

\- MACD + Histogram

\- ADX

\- ATR

\- Price vs EMA/SMA

\- Price vs Ichimoku



This is NOT a full table.

Only high-signal data.



\---



\### 4. Chart Panel



\- Display price chart (Recharts)

\- Overlay:

&#x20; - EMA lines

&#x20; - key levels (R1/S1)

\- Optional:

&#x20; - highlight entry / stop / TP zones



\---



\### 5. Bias Summary Bar (Top or Center)



A compact visual summary:



Example:

\- Trend: Bullish

\- Momentum: Bullish

\- Structure: Neutral

\- Overall: LONG



\---



\## AI Logic Integration



This screen must use:



\- eurusd-rules.md (AI rules file)

\- Google Sheet data



Flow:



1\. Load latest row of dataset

2\. Apply rule logic

3\. Generate:

&#x20;  - direction

&#x20;  - confidence

&#x20;  - levels

4\. Render output



\---



\## UI Requirements



Must match Dashboard style:



\- dark theme

\- rounded panels

\- subtle glow

\- thin borders

\- premium spacing

\- no clutter



\---



\## Layout Rules



\- Use global 12-column grid

\- No margin hacks

\- Panels must align cleanly

\- Layout should feel modular and balanced



\---



\## Design Priority



1\. Clarity > complexity

2\. Decision > raw data

3\. Speed of understanding > completeness



User should understand bias in < 2 seconds.



\---



\## What NOT to Do



\- Do NOT display full spreadsheet

\- Do NOT overwhelm with indicators

\- Do NOT mix Dashboard elements into this screen

\- Do NOT calculate indicators manually

\- Do NOT build multi-asset system yet



\---



\## Future (Not Now)



\- Multi-asset selector

\- Real-time data

\- AI coaching feedback

\- Trade execution integration



\---



\## Build Goal



When user opens Analytics tab:



They should immediately know:

\- what the market bias is

\- what trade to take

\- where to enter and exit



No thinking required.

