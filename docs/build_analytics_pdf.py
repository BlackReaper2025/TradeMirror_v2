"""Build Analytics_PDF.pdf — comprehensive reference of all indicators
exposed by the TradeMirror analytics engine. Intended as the source-of-truth
for trend / momentum scoring design."""
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem,
    HRFlowable, KeepTogether, PageBreak,
)
from reportlab.lib.colors import HexColor

OUT = r"D:\Dev\TradeMirror_v2\TradeMirror\docs\Analytics_PDF.pdf"

styles = getSampleStyleSheet()

H1 = ParagraphStyle(
    "H1", parent=styles["Heading1"],
    fontName="Helvetica-Bold", fontSize=14, leading=18,
    spaceBefore=8, spaceAfter=4, textColor=HexColor("#111111"),
)
H2 = ParagraphStyle(
    "H2", parent=styles["Heading2"],
    fontName="Helvetica-Bold", fontSize=11, leading=14,
    spaceBefore=6, spaceAfter=2, textColor=HexColor("#333333"),
)
BODY = ParagraphStyle(
    "Body", parent=styles["BodyText"],
    fontName="Helvetica", fontSize=9.5, leading=13,
    spaceAfter=2, alignment=TA_LEFT,
)
LEAD = ParagraphStyle(
    "Lead", parent=BODY,
    fontName="Helvetica-Oblique", textColor=HexColor("#555555"),
    spaceAfter=4,
)

def hr():
    return HRFlowable(width="100%", thickness=0.6, color=HexColor("#999999"),
                      spaceBefore=2, spaceAfter=6)

def bullets(items):
    return ListFlowable(
        [ListItem(Paragraph(t, BODY), leftIndent=10, bulletColor=HexColor("#444444"))
         for t in items],
        bulletType="bullet", start="•", leftIndent=14, bulletFontSize=8,
    )

def section(title, lead, items):
    return KeepTogether([
        Paragraph(title, H1),
        hr(),
        Paragraph(lead, LEAD) if lead else Spacer(1, 0),
        bullets(items),
        Spacer(1, 6),
    ])

doc = SimpleDocTemplate(
    OUT, pagesize=letter,
    leftMargin=0.85 * inch, rightMargin=0.85 * inch,
    topMargin=0.7 * inch, bottomMargin=0.7 * inch,
    title="TradeMirror — Analytics Indicator Reference",
)

story = []

# ── Title block ────────────────────────────────────────────────────────────
story.append(Paragraph("TradeMirror — Analytics Indicator Reference", H1))
story.append(Paragraph(
    "Complete inventory of every indicator, oscillator, and structural metric exposed "
    "by the centralized analytics engine (CandleV3 / SheetRow). This is the canonical "
    "set of inputs available to trend and momentum scoring logic.",
    LEAD,
))
story.append(hr())
story.append(Spacer(1, 4))

# ── PRICE ──────────────────────────────────────────────────────────────────
story.append(section(
    "PRICE",
    "Raw OHLC data for the selected asset and timeframe. The foundation every other indicator is derived from.",
    [
        "<b>Date / Timestamp:</b> Session date and ISO timestamp.",
        "<b>Open:</b> Session opening price.",
        "<b>High:</b> Session high.",
        "<b>Low:</b> Session low.",
        "<b>Close:</b> Session closing price — the primary input for every indicator that follows.",
        "<b>Symbol:</b> Instrument identifier (e.g. EURUSD).",
    ],
))

# ── SESSION CONTEXT ────────────────────────────────────────────────────────
story.append(section(
    "SESSION CONTEXT",
    "Bar-level derived metrics that describe the character of the current session and contextualize it against the prior bar.",
    [
        "<b>% Change:</b> Session return from prior close to current close. Captures both the overnight gap and the intraday move. Positive = bullish session; negative = bearish.",
        "<b>Gap %:</b> Difference between today's open and yesterday's close, as a percentage. A positive gap signals overnight bullish sentiment; negative signals bearish. Gaps above 0.05% are meaningful for daily FX.",
        "<b>Range (pips):</b> (High − Low) × 10,000. Total session volatility in pips. A wide range vs recent average indicates a high-conviction session; a narrow range signals consolidation or indecision.",
        "<b>Body Fill %:</b> |Close − Open| ÷ (High − Low) × 100. What fraction of the total range was captured by the candle body. High fill = directional conviction; low fill = wick-dominated indecision.",
        "<b>Body (pips):</b> |Close − Open| × 10,000 — absolute body size.",
        "<b>Upper Wick (pips):</b> High − max(Open, Close), in pips — distance buyers pushed beyond the body and gave back.",
        "<b>Lower Wick (pips):</b> min(Open, Close) − Low, in pips — distance sellers pushed beyond the body and gave back.",
        "<b>Inside Bar:</b> Today's high is below yesterday's high AND today's low is above yesterday's low — the full session is 'inside' the prior bar. Signals volatility contraction. Breakouts above the high or below the low are common entry triggers.",
    ],
))

# ── VOLUME ─────────────────────────────────────────────────────────────────
story.append(section(
    "VOLUME",
    "Participation metrics. Coloured by session direction so bullish vs bearish flow is visible at a glance.",
    [
        "<b>Volume:</b> Raw session volume from OANDA. Plotted as green bars when close ≥ open (Volume Bull), red bars when close &lt; open (Volume Bear).",
        "<b>Vol SMA(20):</b> 20-session simple moving average of volume — the baseline for measuring whether participation is elevated or suppressed. Volume significantly above this line amplifies the significance of the concurrent price move; volume below it suggests low-conviction conditions.",
        "<b>Volume Ratio:</b> Current volume ÷ Vol SMA(20). Ratios ≥ 1.5 mark high-volume sessions; &lt; 0.7 marks consolidation/low participation. Ratio combined with bar direction yields the high-volume bull/bear surge classifications.",
    ],
))

# ── AVERAGE PRICE & RATE OF CHANGE ─────────────────────────────────────────
story.append(section(
    "AVERAGE PRICE &amp; RATE OF CHANGE",
    "Short-horizon drift and rate metrics. Useful for distinguishing consistent pressure from one-bar spikes.",
    [
        "<b>Average Price (HLC/3 SMA5):</b> 5-session simple moving average of typical price (High + Low + Close) ÷ 3. Unlike a close-only MA, it weights the full session range. Close above this average = buyers dominate; below = sellers hold the edge.",
        "<b>Rate of Change (5):</b> (Close − Close[5]) ÷ Close[5] × 100. Percentage gain or loss over exactly one trading week. Positive = net bullish week; negative = net bearish. Accelerating ROC confirms momentum; decelerating ROC warns of fatigue. Extreme readings signal overextension.",
        "<b>Average Delta (5-bar):</b> Mean of (Close[i] − Close[i−1]) × 10,000 over the last 5 bars. Positive = net buying drift; negative = net selling drift. Small avg delta with large ROC = one or two sessions drove the move; large avg delta = consistent pressure across all five sessions.",
        "<b>Momentum(10):</b> (Close − Close[10]) ÷ Close[10] × 100. Unbounded percentage change vs 10-session prior close. Captures raw speed of the move — accelerating positive momentum confirms trend strength; decelerating warns of slowdown.",
    ],
))

# ── MOVING AVERAGES ────────────────────────────────────────────────────────
story.append(section(
    "MOVING AVERAGES",
    "Trend baselines at multiple horizons. The full EMA + SMA stack is available to scoring logic.",
    [
        "<b>SMA(20):</b> 20-period simple moving average. Equivalent to the Bollinger midline.",
        "<b>SMA(50):</b> 50-period simple moving average. Mid-term mean.",
        "<b>SMA(200):</b> 200-period simple moving average — the long-term trend anchor. Price above = bull-market context; below = bear-market context.",
        "<b>EMA(9):</b> Fastest exponential MA — highly responsive to recent price action. Acts as dynamic short-term support in uptrends. A close below EMA9 in an uptrend is often the first warning of weakness.",
        "<b>EMA(20):</b> Responsive short-to-medium-term trend filter. Reacts faster than SMA20. Price above in an uptrend confirms short-term bullish structure.",
        "<b>EMA(50):</b> Primary medium-term trend reference. Faster than SMA50 — earlier signals on trend changes. Institutionally watched.",
        "<b>EMA(100):</b> Intermediate trend anchor between EMA50 and EMA200.",
        "<b>EMA(200):</b> Long-term trend anchor. Price above = bull-market context; below = bear. EMA Golden Cross (EMA50 above EMA200) and Death Cross (EMA50 below EMA200) are widely followed structural signals.",
        "<b>EMA Stack Alignment:</b> Derived state — EMA9 &gt; EMA20 &gt; EMA50 &gt; EMA200 = full bullish stack; reverse = full bearish stack. Strongest trend confirmation when all four align.",
    ],
))

# ── MACD ───────────────────────────────────────────────────────────────────
story.append(section(
    "MACD",
    "Trend / momentum hybrid using two EMAs and a signal smoother. Standard 12 / 26 / 9 settings.",
    [
        "<b>MACD Line:</b> EMA(12) − EMA(26). Positive = short-term average above long-term (bullish); negative = bearish. Zero-line crossovers are trend-change signals (lag price).",
        "<b>Signal Line:</b> 9-period EMA of the MACD line. MACD crossing above signal = buy trigger; crossing below = sell trigger. Crossovers far from zero are more reliable than those near zero.",
        "<b>Histogram:</b> MACD − Signal, plotted as bars. Green when MACD &gt; signal (bullish momentum); red when MACD &lt; signal (bearish momentum). Growing bars = accelerating momentum; shrinking bars = slowing / potential reversal. Histogram turns <i>before</i> the lines cross — leading indicator of momentum shifts.",
    ],
))

# ── PIVOT POINTS ───────────────────────────────────────────────────────────
story.append(section(
    "PIVOT POINTS",
    "Classic floor-trader pivots derived from the prior session's H/L/C. Provide intraday support/resistance levels.",
    [
        "<b>Pivot Point (PP):</b> (Prior H + Prior L + Prior C) ÷ 3. The session's central reference. Price above PP = bullish bias; below = bearish bias.",
        "<b>Resistance R1 / R2 / R3:</b> Progressively stronger resistance above PP. A close above any R level turns it into new support. R3 is rarely tested in a single session — reaching it signals an exceptionally strong bullish move.",
        "<b>Support S1 / S2 / S3:</b> Progressively stronger support below PP. A close below any S level turns it into new resistance. S3 violations are typically associated with high-volatility, trend-driven sessions.",
    ],
))

# ── BOLLINGER BANDS ────────────────────────────────────────────────────────
story.append(section(
    "BOLLINGER BANDS",
    "Volatility-adjusted envelope around the 20-period SMA. Standard settings: SMA(20) ± 2σ.",
    [
        "<b>BB Upper:</b> SMA(20) + 2 × stdev(20). Touches / pierces signal overbought in ranges OR breakout strength in trends.",
        "<b>BB Middle (SMA20):</b> The mean-reversion target in ranging markets; dynamic support (uptrend) or resistance (downtrend) in trends.",
        "<b>BB Lower:</b> SMA(20) − 2 × stdev(20). Touches / pierces signal oversold in ranges OR breakdown strength in trends.",
        "<b>BB Width:</b> (Upper − Lower) × 10,000 (pips). Widens in high-volatility regimes; contracts during squeezes.",
        "<b>%B:</b> (Close − Lower) ÷ (Upper − Lower) × 100. 100% = at upper band, 50% = at midline, 0% = at lower band. Normalized location within the bands.",
        "<b>Historical Volatility (annualized):</b> Annualized standard deviation of log returns × √252. Rising = active/trending market; falling = consolidation. Cross-check with BB Width to confirm whether compression is genuine.",
    ],
))

# ── KELTNER CHANNELS ───────────────────────────────────────────────────────
story.append(section(
    "KELTNER CHANNELS",
    "ATR-based envelope around EMA(20). Less reactive than Bollinger Bands — useful for trend-riding rules.",
    [
        "<b>Keltner Upper:</b> EMA(20) + 2 × ATR(14). A close above signals bullish breakout or overbought extreme. In strong trends, price can ride the upper band.",
        "<b>Keltner Middle:</b> EMA(20). Acts as a dynamic magnet — in ranges price gravitates back to it; in trends it acts as dynamic support / resistance. The slope of the midline shows current trend direction.",
        "<b>Keltner Lower:</b> EMA(20) − 2 × ATR(14). A close below signals bearish breakdown or oversold extreme. In downtrends, price can ride the lower band.",
    ],
))

# ── SQUEEZE ────────────────────────────────────────────────────────────────
story.append(section(
    "SQUEEZE",
    "BB vs Keltner compression detector — identifies volatility-contraction setups that often precede sharp directional moves.",
    [
        "<b>Squeeze State:</b> ON when Bollinger Bands are fully inside Keltner Channels (BB Upper &lt; KC Upper AND BB Lower &gt; KC Lower). OFF otherwise.",
        "<b>Squeeze Duration:</b> Count of consecutive bars in the current squeeze state. Extended squeezes (5+ bars) often precede the largest expansion moves.",
        "<b>Squeeze Fired:</b> Transitional event — squeeze was ON last bar, OFF this bar. The highest-conviction entry window; direction confirmed by squeeze momentum.",
        "<b>Squeeze Momentum:</b> Close − average of [20-bar mid-range, SMA(20)] × 10,000. Direction (sign) and slope (rising/falling) of momentum at the fire moment.",
        "<b>BB / KC Width Ratio:</b> Numeric measure of compression — &lt; 1.0 = squeezing, ≥ 1.0 = expanded.",
    ],
))

# ── ATR ────────────────────────────────────────────────────────────────────
story.append(section(
    "ATR",
    "Volatility benchmark in price units. Used for stop sizing and volatility regime classification.",
    [
        "<b>ATR(14):</b> Wilder-smoothed average of True Range over 14 bars. True Range = max(H−L, |H−PrevC|, |L−PrevC|). Expressed in pips for FX. Rising = expanding ranges, wider stops required; falling = compression, tighter stops viable.",
        "<b>ATR SMA(20):</b> 20-bar SMA of ATR(14) — the benchmark for 'normal' volatility. ATR &gt; 1.25 × ATR SMA(20) = elevated-volatility regime (size down). ATR &lt; 0.75 × ATR SMA(20) = compression (precursor to breakouts).",
        "<b>ATR Ratio:</b> ATR(14) ÷ ATR SMA(20). Used by the regime detector to classify volatility as Expanding (&gt; 1.10) / Neutral / Contracting (&lt; 0.90).",
    ],
))

# ── RSI ────────────────────────────────────────────────────────────────────
story.append(section(
    "RSI (9 &amp; 14)",
    "Relative Strength Index in two flavours — fast (RSI 9) for entry timing, standard (RSI 14) for higher-quality bias signals. Both use Wilder smoothing.",
    [
        "<b>RSI(9):</b> 9-period RSI. Highly responsive — useful for spotting short-term exhaustion quickly, but prone to false signals in strong trends. Above 70 = overbought; below 30 = oversold.",
        "<b>RSI(14):</b> Standard 14-period RSI. Smoother and more reliable — fewer but higher-quality signals. Above 70 = overbought; below 30 = oversold. Readings here carry more weight than RSI(9).",
        "<b>RSI Trend:</b> Slope state of RSI(14) — UP / DOWN / FLAT — derived from a short SMA of RSI(14). Crossover between RSI and its trend line is an early momentum-shift signal.",
        "<b>RSI Divergence:</b> Flag — true when price makes a new high/low but RSI fails to confirm. Classic early reversal warning.",
        "<b>Stochastic RSI %K:</b> Stochastic applied to RSI(14) values rather than price, smoothed 3 periods. Oscillates 0–100. Far more aggressive than raw RSI. Above 80 = overbought; below 20 = oversold.",
        "<b>Stochastic RSI %D:</b> 3-period SMA of %K. Lags %K — %K crossing above %D = buy signal; crossing below = sell signal. Crossovers in extreme territory are more reliable.",
    ],
))

# ── MOMENTUM OSCILLATORS ───────────────────────────────────────────────────
story.append(section(
    "MOMENTUM OSCILLATORS",
    "Bounded and unbounded oscillators that capture the speed and extremity of recent moves.",
    [
        "<b>CCI (Commodity Channel Index, 20):</b> (Typical Price − SMA TP) ÷ (0.015 × mean deviation). Above +100 = overbought; below −100 = oversold; ±100 to 0 = neutral. Leading indicator — turns before price and excels at identifying extremes and divergences. Above ±200 = unsustainable extreme.",
        "<b>CCI MA(14):</b> 14-bar SMA of CCI. Crossovers between CCI and its MA often signal early momentum shifts before the raw line reaches an extreme.",
        "<b>Williams %R (14):</b> ((HighestHigh − Close) ÷ (HighestHigh − LowestLow)) × −100 over a 14-bar window. Range: −100 (most oversold) to 0 (most overbought). Above −20 = overbought; below −80 = oversold. When %R stays near 0 during a rally it confirms bullish strength; when it fails to reach −20 on bounces in a downtrend, bearish momentum is dominant.",
        "<b>Momentum(10):</b> (Close − Close[10]) ÷ Close[10] × 100 — unbounded percentage change. Captures raw speed; accelerating positive momentum confirms trend strength.",
    ],
))

# ── ADX / DMI ──────────────────────────────────────────────────────────────
story.append(section(
    "ADX / DIRECTIONAL MOVEMENT",
    "Wilder's Directional Movement system. Measures trend strength and direction separately.",
    [
        "<b>+DI(14):</b> Positive Directional Indicator. Strength of upward price movement. When +DI &gt; −DI, bulls control directional movement. Rising +DI = strengthening upside pressure.",
        "<b>−DI(14):</b> Negative Directional Indicator. Strength of downward price movement. When −DI &gt; +DI, bears dominate. A crossover of −DI above +DI with ADX above 25 is a classic bearish trend entry signal.",
        "<b>ADX(14):</b> Average Directional Index. Wilder-smoothed DX. Measures trend strength <i>regardless of direction</i> — rises in both up and down trends. &lt; 20 = ranging (avoid trend signals); ≥ 25 = trending; ≥ 40 = strong trend. Rising ADX confirms a developing trend; falling ADX signals fading regardless of direction.",
    ],
))

# ── ICHIMOKU ───────────────────────────────────────────────────────────────
story.append(section(
    "ICHIMOKU CLOUD",
    "Multi-component trend, momentum and support/resistance system. All five components are exposed.",
    [
        "<b>Tenkan (Conversion Line):</b> (9-period high + low) ÷ 2. Plotted at the current bar. Short-term momentum. A TK cross above Kijun is a bullish entry signal. Acts as near-term support in uptrends.",
        "<b>Kijun (Base Line):</b> (26-period high + low) ÷ 2. Plotted at the current bar. Medium-term trend anchor and the most important Ichimoku S/R level. Price above Kijun = bullish; below = bearish.",
        "<b>Senkou A (Leading Span A):</b> (Tenkan + Kijun) ÷ 2, plotted 26 bars FORWARD. Forms the faster cloud boundary. When A &gt; B the cloud is bullish.",
        "<b>Senkou B (Leading Span B):</b> (52-period high + low) ÷ 2, plotted 26 bars FORWARD. Slower, stronger cloud boundary. When B &gt; A the cloud is bearish. Thicker cloud = stronger S/R zone.",
        "<b>Chikou (Lagging Span):</b> Today's close plotted 26 bars BACK. Confirms trend by comparing current close to historical price. Above price from 26 bars ago = bullish; below = bearish.",
        "<b>Price Above Cloud:</b> Boolean flag — true when close &gt; max(Senkou A, Senkou B). Headline bullish-context flag for scoring.",
        "<b>Price Above Kijun:</b> Boolean flag — true when close &gt; Kijun. Primary intermediate-trend flag.",
    ],
))

# ── MARKET STRUCTURE ───────────────────────────────────────────────────────
story.append(section(
    "MARKET STRUCTURE",
    "Foundational intelligence layer — describes the market narrative independently of indicators.",
    [
        "<b>Swing High (SH):</b> Local price peak confirmed by being the highest high within the surrounding N bars on each side (default N = 3). Marks potential resistance and defines the upper boundary of structure.",
        "<b>Swing Low (SL):</b> Local price trough confirmed by being the lowest low within the surrounding N bars on each side. Marks potential support and defines the lower boundary of structure.",
        "<b>HH / HL:</b> Higher High and Higher Low — sequential bullish structure. Two consecutive HH+HL = bullish state.",
        "<b>LH / LL:</b> Lower High and Lower Low — sequential bearish structure. Two consecutive LH+LL = bearish state.",
        "<b>BOS (Break of Structure):</b> Continuation event — new SH printed above the prior SH in an existing bullish trend (or new SL below prior SL in a bearish trend). Confirms the prevailing direction.",
        "<b>CHOCH (Change of Character):</b> Reversal event — new SH printed in what was a bearish trend (or new SL in a bullish trend). First structural signal of a regime flip.",
        "<b>Structure State:</b> Bullish / Bearish / Range — derived from the last two SH+SL pairs.",
    ],
))

# ── REGIME DETECTION ───────────────────────────────────────────────────────
story.append(section(
    "REGIME DETECTION",
    "Descriptive classifier — labels current conditions so scoring logic can weight signals appropriately.",
    [
        "<b>Regime State:</b> Trending / Ranging / Compression. <i>Compression</i> when BB Width &lt; 0.75 × 20-bar avg BB Width. <i>Trending</i> when ADX &gt; 25. Otherwise <i>Ranging</i>.",
        "<b>Volatility State:</b> Expanding / Neutral / Contracting. Based on ATR(14) vs ATR SMA(20) — Expanding &gt; 1.10×, Contracting &lt; 0.90×, else Neutral.",
        "<b>Use in scoring:</b> Trend-following signals carry higher weight in Trending regimes; mean-reversion signals carry higher weight in Ranging regimes; both are suppressed during Compression (breakout-watch only).",
    ],
))

# ── CANDLE CONTEXT ─────────────────────────────────────────────────────────
story.append(section(
    "CANDLE CONTEXT",
    "Three-tier pattern detector run over the most recent 12 candles.",
    [
        "<b>Tier 1 — Multi-Candle Story:</b> Highest reliability. Patterns requiring a prior directional move plus a pivot/pause candle plus a follow-through confirmation. Includes Morning Star, Evening Star, Bullish/Bearish Engulfing, Piercing Line, Dark Cloud Cover.",
        "<b>Tier 2 — Single-Candle Rejection:</b> Single candles with extreme wicks. Context-dependent: Hammer (bullish at bottom of decline), Hanging Man (bearish after rally), Inverted Hammer (needs bullish confirmation), Shooting Star (needs bearish follow-through).",
        "<b>Tier 3 — Needs Confirmation:</b> Structural signals requiring the next candle to confirm — early alerts, not entry signals. Tweezers (defended level), Harami, Harami Cross.",
    ],
))

# ── FAILURE SWING ──────────────────────────────────────────────────────────
story.append(section(
    "FAILURE SWING",
    "Statistical view of intra-candle rejection — quantifies how today's wick rejection compares to historical context.",
    [
        "<b>Failure Swing Value:</b> On bullish bars (close &gt; open) = (Open − Low) × 10,000 — the lower wick. On bearish bars (close &lt; open) = (High − Open) × 10,000 — the upper wick. Doji bars are excluded.",
        "<b>Failure Swing CDF:</b> Cumulative distribution function over all historical qualifying bars. Reads as: 'X% of sessions had a failure swing ≤ this pip value'. Steep early rise = small failure swings dominate; gradual slope = wide distribution / frequent large wicks.",
        "<b>Percentile Bands (p25 / p50 / p75 / p90):</b> Reference levels on the CDF. The 75th percentile separates routine intraday noise from meaningful rejection. Today's value above p75 = above-average rejection; above p90 = extreme session; below p50 = quiet/low-conviction day.",
    ],
))

# ── DERIVED FLAGS ──────────────────────────────────────────────────────────
story.append(section(
    "DERIVED FLAGS &amp; STATES",
    "Boolean / categorical outputs already computed by the engine — ready for direct use in scoring rules without additional math.",
    [
        "<b>Inside Bar:</b> Boolean — current bar fully contained in prior bar's range.",
        "<b>Price Above Cloud:</b> Boolean — close above max(Senkou A, Senkou B).",
        "<b>Price Above Kijun:</b> Boolean — close above Kijun line.",
        "<b>RSI Divergence:</b> Boolean — price/RSI divergence detected.",
        "<b>RSI Trend:</b> Categorical — UP / DOWN / FLAT, slope of RSI(14).",
        "<b>Squeeze State:</b> Boolean — BB inside KC.",
        "<b>Structure State:</b> Categorical — Bullish / Bearish / Range.",
        "<b>Regime State:</b> Categorical — Trending / Ranging / Compression.",
        "<b>Volatility State:</b> Categorical — Expanding / Neutral / Contracting.",
        "<b>Last BOS / CHOCH:</b> Most recent structural event with direction (bull / bear).",
    ],
))

# ── SCORING NOTES ──────────────────────────────────────────────────────────
story.append(PageBreak())
story.append(Paragraph("APPENDIX — Suggested Scoring Groupings", H1))
story.append(hr())
story.append(Paragraph(
    "A starting partition for trend &amp; momentum scoring. Each group is independent and can carry "
    "its own weight in the composite score. Indicators may participate in more than one group "
    "if their interpretation differs (e.g. MACD line = trend, MACD histogram = momentum).",
    LEAD,
))
story.append(Spacer(1, 4))

story.append(Paragraph("Trend (directional bias)", H2))
story.append(bullets([
    "EMA stack alignment (9 / 20 / 50 / 100 / 200)",
    "SMA(50), SMA(200) — long-horizon anchor",
    "MACD line vs zero, MACD signal cross",
    "ADX &gt; 25 with +DI vs −DI dominance",
    "Price vs Kijun, Price vs Ichimoku Cloud",
    "Market Structure state + most recent BOS / CHOCH",
    "Average Price (HLC/3 SMA5) vs close",
]))

story.append(Paragraph("Momentum (rate / extremity)", H2))
story.append(bullets([
    "RSI(9), RSI(14), RSI Trend, RSI Divergence",
    "Stochastic RSI %K / %D and their crossover",
    "MACD histogram (expanding vs contracting)",
    "CCI vs ±100, CCI vs CCI MA(14)",
    "Williams %R vs −20 / −80",
    "Momentum(10), Rate of Change(5)",
    "Average Delta (5-bar) — consistency of pressure",
]))

story.append(Paragraph("Volatility / regime weight", H2))
story.append(bullets([
    "ATR(14) vs ATR SMA(20) — Expanding / Neutral / Contracting",
    "Bollinger Width and %B",
    "Historical Volatility (annualized)",
    "Squeeze state and duration",
    "Regime state — Trending / Ranging / Compression",
]))

story.append(Paragraph("Confirmation / filters", H2))
story.append(bullets([
    "Volume ratio vs Vol SMA(20)",
    "Body Fill %, Range (pips), Inside Bar",
    "Failure Swing percentile rank (today vs p25 / p50 / p75 / p90)",
    "Candle Context tier (T1 / T2 / T3) and bias",
    "Pivot Point context — distance to R1/R2/R3 and S1/S2/S3",
]))

doc.build(story)
print(f"Wrote {OUT}")
