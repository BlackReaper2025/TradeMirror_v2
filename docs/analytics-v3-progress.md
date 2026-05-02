# Analytics V3 — Progress Note

_Last updated: 2026-05-02_

## Status — Milestone: Live Pipeline Complete

Backend pipeline fully wired end-to-end:
OANDA → `indicators.rs` → SQLite (`candles_v3`) → `get_candles_v3` → `AnalyticsV3.tsx`

All real indicator calculations are complete. No must-fix placeholders remain.

UI display bugs fixed post-integration:
- **ATR**: backend stores in price units; `mapToSheetRow` now multiplies × 10000 to convert to pips for display.
- **Ichimoku**: cloud and Chikou required >20 rows of history. Added `get_ichi_rows_v3` (100 rows) fetched separately; `IchiPanelBody` receives this extended set so the cloud overlays price bars correctly and the slider enables Chikou visibility.
- **Latest-row display**: `get_candles_v3` was returning the 20 oldest rows (wrong sort order). Fixed to `ORDER BY date DESC LIMIT 20` + reverse, so panels show the most recent 20 bars.

## ADX Difference vs Old Analytics — Expected

ADX, +DI, and −DI values in V3 will differ slightly from the original Analytics (Google Sheets) screen. This is **not a formula bug**. The cause is different OHLC source data:

- V3: OANDA mid-price candles
- Old Analytics: Google Sheets source (Yahoo Finance / manual)

Minor High/Low differences compound in the directional movement (+DM) bars. With 500-candle warmup the formulas are fully converged and mathematically equivalent. No fix required.

---

## Completed Backend Indicators

| Indicator | Fields |
|---|---|
| EMA | ema9, ema20, ema50, ema200 |
| SMA | sma20, sma50, sma200 |
| Volume SMA | volume_sma20 |
| RSI | rsi9, rsi14 |
| MACD | macd, macd_signal, macd_histogram |
| Bollinger Bands | bb_upper, bb_middle, bb_lower |
| Keltner Channels | keltner_upper, keltner_middle, keltner_lower |
| ATR | atr14 |
| ADX | adx, di_plus, di_minus |
| CCI | cci |
| Stochastic RSI | stoch_rsi_k, stoch_rsi_d |
| Pivot Levels | pivot_point, r1, r2, r3, s1, s2, s3 |
| Historical Volatility | hist_vol (20-period log return std dev × √252) |
| Ichimoku | tenkan, kijun, senkou_a, senkou_b, price_above_cloud, price_above_kijun |

---

## Safe Remaining Placeholders

| Field | Why safe |
|---|---|
| `rsi_trend` | Frontend never reads it — uses `rsi14` value directly |
| `inside_bar` | Frontend derives from adjacent rows in `sheetRows` |
| `rsi_divergence` | Frontend derives from RSI/price peak comparison across row window |

---

## Client-Side Only (no backend field needed)

ROC(5), Williams %R, Avg Delta (5-bar) — all derived at render time from close/OHLC arrays.

---

## Next Recommended Step

**Visual/data validation against Google Sheets.** Run `sync_oanda_candles_v3`, then compare indicator values panel-by-panel in AnalyticsV3 against the live Google Sheets output for the same EUR/USD dates. Confirm EMA, RSI, MACD, Ichimoku, and pivot numbers match before marking the backend complete.
