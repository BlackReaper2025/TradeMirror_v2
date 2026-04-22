# EURUSD AI Analysis Rules

## Objective
Determine:
1. Direction: LONG or SHORT
2. Entry level
3. Stop loss
4. Take profit targets

Use full dataset. Do not rely on single indicators.

---

## Signal Priority (highest → lowest)

1. Trend (MA + MACD + ADX)
2. Momentum (RSI, StochRSI, CCI)
3. Structure (Pivot, Keltner, Ichimoku)
4. Volatility (ATR, Bollinger)
5. Price Action (body, wick, patterns)

---

## Long Bias Conditions (score +1 each)

- Price > EMA(9,20,50) and SMA(200)
- MACD > Signal AND histogram increasing
- RSI(14) rising between 45–65
- ADX > 25
- +DI > -DI
- Price above Kijun + above Ichimoku Cloud
- RSI Trend = UP
- Volume > SMA(20)
- Break above R1 OR bounce from S1

---

## Short Bias Conditions (score -1 each)

- Price < EMA(9,20,50) and SMA(200)
- MACD < Signal AND histogram decreasing
- RSI(14) falling between 35–55
- ADX > 25
- -DI > +DI
- Price below Kijun + below Ichimoku Cloud
- RSI Trend = DOWN
- Volume > SMA(20)
- Rejection at R1 OR break below S1

---

## Entry Logic

Enter only when:
- Trend + Momentum align
- At least 5 conditions agree

Preferred zones:
- Breakout: R1 / S1
- Pullback: Keltner / Ichimoku support/resistance

---

## Stop Loss

- 1.5x–2x ATR(14)
- Long: below swing low or Keltner Lower
- Short: above swing high or Keltner Upper

---

## Take Profit

Primary:
- R1, R2, R3 (long)
- S1, S2, S3 (short)

Secondary:
- Bollinger Bands
- Ichimoku cloud edges

---

## Avoid Trades If

- ADX < 20
- Inside bar = 1
- Price inside Ichimoku cloud
- MACD histogram shrinking
- RSI divergence present
- High volatility spike (Hist Vol rising fast)

---

## Notes

- Combine signals — no single indicator decisions
- Favor confluence over frequency
- Reduce confidence in mixed conditions