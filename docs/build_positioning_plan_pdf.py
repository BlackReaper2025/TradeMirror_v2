"""Build AI_Positioning_Tracking_Plan.pdf — implementation plan for daily AI
positioning snapshots + outcome tracking + future RL/ML in TradeMirror.

This PDF is designed to be self-contained: any future Claude session can read
it cold and execute the work without needing the original conversation."""
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem,
    HRFlowable, KeepTogether, PageBreak, Table, TableStyle,
)
from reportlab.lib.colors import HexColor
from reportlab.lib import colors

OUT = r"D:\Dev\TradeMirror_v2\TradeMirror\docs\AI_Positioning_Tracking_Plan.pdf"

styles = getSampleStyleSheet()

H1 = ParagraphStyle("H1", parent=styles["Heading1"],
    fontName="Helvetica-Bold", fontSize=15, leading=19,
    spaceBefore=10, spaceAfter=4, textColor=HexColor("#111111"))
H2 = ParagraphStyle("H2", parent=styles["Heading2"],
    fontName="Helvetica-Bold", fontSize=11, leading=14,
    spaceBefore=8, spaceAfter=2, textColor=HexColor("#222222"))
H3 = ParagraphStyle("H3", parent=styles["Heading3"],
    fontName="Helvetica-Bold", fontSize=10, leading=13,
    spaceBefore=4, spaceAfter=2, textColor=HexColor("#444444"))
BODY = ParagraphStyle("Body", parent=styles["BodyText"],
    fontName="Helvetica", fontSize=9.5, leading=13,
    spaceAfter=2, alignment=TA_LEFT)
LEAD = ParagraphStyle("Lead", parent=BODY,
    fontName="Helvetica-Oblique", textColor=HexColor("#555555"),
    spaceAfter=4)
CODE = ParagraphStyle("Code", parent=BODY,
    fontName="Courier", fontSize=8.5, leading=11,
    leftIndent=12, backColor=HexColor("#f4f4f4"),
    borderColor=HexColor("#dddddd"), borderWidth=0.5, borderPadding=6,
    spaceBefore=3, spaceAfter=3)

def hr():
    return HRFlowable(width="100%", thickness=0.6, color=HexColor("#999999"),
                      spaceBefore=2, spaceAfter=6)

def bullets(items):
    return ListFlowable(
        [ListItem(Paragraph(t, BODY), leftIndent=10, bulletColor=HexColor("#444444"))
         for t in items],
        bulletType="bullet", start="•", leftIndent=14, bulletFontSize=8)

def num_list(items):
    return ListFlowable(
        [ListItem(Paragraph(t, BODY), leftIndent=10) for t in items],
        bulletType="1", leftIndent=16, bulletFontSize=9)

def section(title, lead, content):
    flow = [Paragraph(title, H1), hr()]
    if lead:
        flow.append(Paragraph(lead, LEAD))
    if isinstance(content, list):
        flow.extend(content)
    else:
        flow.append(content)
    flow.append(Spacer(1, 4))
    return flow

doc = SimpleDocTemplate(
    OUT, pagesize=letter,
    leftMargin=0.8 * inch, rightMargin=0.8 * inch,
    topMargin=0.7 * inch, bottomMargin=0.7 * inch,
    title="TradeMirror — AI Positioning Tracking & Learning Plan",
)

story = []

# ── Title block ────────────────────────────────────────────────────────────
story.append(Paragraph("TradeMirror — AI Positioning Tracking &amp; Learning Plan", H1))
story.append(Paragraph(
    "Implementation reference for daily AI positioning snapshots, outcome tracking, "
    "and the eventual reinforcement / machine learning loop. Self-contained: any "
    "future Claude Code session should be able to execute this without prior context.",
    LEAD,
))
story.append(hr())
story.append(Spacer(1, 4))

# ── 1. Feature requirements ────────────────────────────────────────────────
story.extend(section(
    "1. Feature Requirements (Geoff's spec)",
    None,
    bullets([
        "<b>Daily snapshot</b> at ~6pm local time. The most recent daily OANDA candle has just closed (5pm NY), so this is the first moment fresh daily data is available.",
        "<b>Validity:</b> the snapshot is the active AI positioning for the next 24 hours, until the next day's snapshot replaces it.",
        "<b>Day-trading tuned:</b> entries / stops / TPs sized for an intraday holding window — not swing.",
        "<b>Outcome tracking:</b> every snapshot must be resolved against subsequent price action. Did TP1 / TP2 / TP3 hit? Did SL hit? What was max favourable / adverse excursion?",
        "<b>Goal metric:</b> maximise positive P&amp;L over a rolling window. Track win rate, R-multiple expectancy, and per-condition breakdowns.",
        "<b>Learning loop:</b> use accumulated outcomes to tune scoring weights and, eventually, train an ML calibration model on top of the deterministic features.",
        "<b>Multi-pair architecture:</b> EUR/USD is phase 1, but every table / command / weight set must be keyed by pair from day one.",
    ]),
))

# ── 2. Current state ───────────────────────────────────────────────────────
story.extend(section(
    "2. Current TradeMirror State (build on what exists)",
    "As of this document's creation, the following infrastructure is already in place. The new feature consumes these — do not duplicate.",
    [
        Paragraph("Centralised scoring engine — <code>src-tauri/src/scoring/</code>", H3),
        bullets([
            "<b>mod.rs</b> — Synthesis, ScoreBlock, SignalContribution, Rationale, MultiTimeframe, RegimeContext types; composite aggregator with regime weights; <code>build_synthesis()</code> orchestrator.",
            "<b>trend.rs</b> — signed trend sub-score: EMA stack, SMA200, MACD line, ADX+DI, Ichimoku, Avg Price.",
            "<b>momentum.rs</b> — signed momentum sub-score: RSI(14) zone, StochRSI, MACD hist, CCI, Williams %R, Momentum(10), ROC(5), Avg Delta.",
            "<b>structure.rs</b> — market structure with ATR displacement filter, real-time event detection, 6-tier state (Strong Bullish / Bullish / Shifting / Range / Bearish / Strong Bearish).",
            "<b>volatility.rs</b> — 5-tier regime classifier (StrongTrending / Trending / Expansion / Ranging / Compression) with joint BB+ATR conditions and DI dominance gate.",
        ]),
        Paragraph("Tauri command currently exposed", H3),
        Paragraph(
            "<code>get_synthesis(pair: String, tf: String) -&gt; Synthesis</code> in "
            "<code>src-tauri/src/lib.rs</code>. Fetches D + H4 + H1 candles for the given pair, scores each, "
            "returns the full Synthesis including <code>rationale[]</code>, <code>multi_timeframe</code>, "
            "and <code>context: RegimeContext</code>.",
            BODY,
        ),
        Paragraph("Frontend bridge", H3),
        bullets([
            "<code>src/lib/brain/synthesis.ts</code> — TS mirror of Synthesis types, <code>fetchSynthesis()</code> wrapper, <code>synthesisToAnalysisResult()</code> mapper for the AI Synthesis panel.",
            "AI Synthesis panel in <code>src/pages/AnalyticsV3.tsx</code> currently consumes synthesis on app load and on pair change (no auto-refresh).",
            "Positioning today: entry = current daily close, stop = entry ± 1.5 × ATR(14) in price units, TPs = pivot R1/R2/R3 or S1/S2/S3.",
        ]),
        Paragraph("Persistence — already present", H3),
        bullets([
            "SQLite via <code>tauri-plugin-sql</code> + Drizzle ORM on the frontend.",
            "Migrations live in <code>src-tauri/migrations/</code>.",
            "<code>candles_v3</code> table already stores daily candles with all indicator columns (<code>0002_candles_v3.sql</code>).",
            "<code>src-tauri/src/candle_store.rs</code> handles candle reads/writes.",
        ]),
        Paragraph("Architecture rules (from CLAUDE.md — must follow)", H3),
        bullets([
            "ONE candle source, ONE indicator engine, ONE structured output layer. Do not duplicate.",
            "Backend in Rust, UI consumes via Tauri commands. Don't compute indicators in the UI.",
            "Replay consistency: bar <i>i</i> never reads <i>i+1</i>.",
            "Validation before prediction; ML is not phase 1.",
            "Local-first, no paid services, existing stack only (Tauri, React, SQLite, Drizzle).",
        ]),
    ],
))

# ── 3. Architecture overview ───────────────────────────────────────────────
story.append(PageBreak())
story.extend(section(
    "3. Architecture Overview",
    None,
    [
        Paragraph(
            "Five subsystems, each independent and testable:",
            BODY,
        ),
        num_list([
            "<b>Scheduler</b> — fires once per day per active pair at 18:00 local time. Calls the snapshot writer.",
            "<b>Snapshot writer</b> — runs <code>build_synthesis()</code> for the pair, derives day-trading-tuned positioning, writes a row to <code>positioning_snapshots</code>.",
            "<b>Outcome resolver</b> — periodic background task (e.g. hourly). For every open snapshot whose <code>valid_until</code> has passed without resolution, walks subsequent intraday bars (15m or 1H) and records first-level-hit + MFE/MAE in <code>positioning_outcomes</code>.",
            "<b>Reporting views</b> — SQL queries / UI panel that surface win rate, expectancy, per-regime / per-confidence-band breakdowns. This is the human-facing 'is there edge?' check.",
            "<b>Weight tuner (later)</b> — once enough outcomes are recorded per slice, automated suggestions for tuning per-signal weights in scoring/*. Manual review before deploy.",
        ]),
        Paragraph(
            "Data flow:",
            BODY,
        ),
        Paragraph(
            "OANDA → candles_v3 → indicators.rs::compute → scoring::build_synthesis → "
            "positioning_writer (day-trading tuning applied here) → positioning_snapshots → "
            "[24h later] outcome_resolver → positioning_outcomes → reporting views → eventual weight tuner.",
            CODE,
        ),
    ],
))

# ── 4. Database schema ─────────────────────────────────────────────────────
story.extend(section(
    "4. Database Schema",
    "Two new SQLite tables. Both keyed by pair from day one for multi-pair support.",
    [
        Paragraph("Table: <b>positioning_snapshots</b>", H3),
        Paragraph(
            "One row per (pair, day). Captures the full Synthesis state used to derive positioning, "
            "plus the positioning itself. The Synthesis rationale is stored as a JSON blob for RAG / "
            "post-hoc analysis.",
            BODY,
        ),
        Paragraph(
            "CREATE TABLE positioning_snapshots (<br/>"
            "&nbsp;&nbsp;id              INTEGER PRIMARY KEY AUTOINCREMENT,<br/>"
            "&nbsp;&nbsp;created_at      TEXT NOT NULL,    -- ISO 8601, UTC<br/>"
            "&nbsp;&nbsp;valid_until     TEXT NOT NULL,    -- created_at + 24h<br/>"
            "&nbsp;&nbsp;pair            TEXT NOT NULL,    -- e.g. 'EUR/USD'<br/>"
            "&nbsp;&nbsp;tf              TEXT NOT NULL,    -- '1D' for now<br/>"
            "&nbsp;&nbsp;direction       TEXT NOT NULL,    -- 'LONG' | 'SHORT' | 'NEUTRAL'<br/>"
            "&nbsp;&nbsp;confidence      REAL NOT NULL,    -- 0..100<br/>"
            "&nbsp;&nbsp;composite       REAL NOT NULL,    -- signed -100..+100<br/>"
            "&nbsp;&nbsp;trend_score     REAL NOT NULL,<br/>"
            "&nbsp;&nbsp;momentum_score  REAL NOT NULL,<br/>"
            "&nbsp;&nbsp;structure_score REAL NOT NULL,<br/>"
            "&nbsp;&nbsp;regime          TEXT NOT NULL,    -- StrongTrending | Trending | Expansion | Ranging | Compression<br/>"
            "&nbsp;&nbsp;volatility      TEXT NOT NULL,    -- Expanding | Neutral | Contracting<br/>"
            "&nbsp;&nbsp;mtf_alignment   REAL NOT NULL,    -- 0..100<br/>"
            "&nbsp;&nbsp;entry           REAL NOT NULL,<br/>"
            "&nbsp;&nbsp;stop_loss       REAL NOT NULL,<br/>"
            "&nbsp;&nbsp;tp1             REAL NOT NULL,<br/>"
            "&nbsp;&nbsp;tp2             REAL NOT NULL,<br/>"
            "&nbsp;&nbsp;tp3             REAL NOT NULL,<br/>"
            "&nbsp;&nbsp;risk_pips       REAL NOT NULL,    -- |entry - stop_loss| in pips<br/>"
            "&nbsp;&nbsp;rationale_json  TEXT NOT NULL,    -- full Synthesis.rationale[] as JSON<br/>"
            "&nbsp;&nbsp;synthesis_json  TEXT NOT NULL,    -- full Synthesis object for replay<br/>"
            "&nbsp;&nbsp;UNIQUE (pair, created_at)<br/>"
            ");<br/>"
            "CREATE INDEX idx_snap_pair_date ON positioning_snapshots(pair, created_at);",
            CODE,
        ),
        Paragraph("Table: <b>positioning_outcomes</b>", H3),
        Paragraph(
            "CREATE TABLE positioning_outcomes (<br/>"
            "&nbsp;&nbsp;id                       INTEGER PRIMARY KEY AUTOINCREMENT,<br/>"
            "&nbsp;&nbsp;snapshot_id              INTEGER NOT NULL REFERENCES positioning_snapshots(id),<br/>"
            "&nbsp;&nbsp;resolved_at              TEXT NOT NULL,<br/>"
            "&nbsp;&nbsp;first_level_hit          TEXT NOT NULL,    -- 'tp1' | 'tp2' | 'tp3' | 'sl' | 'none'<br/>"
            "&nbsp;&nbsp;bars_to_resolution       INTEGER NOT NULL, -- count of intraday bars from snapshot to hit<br/>"
            "&nbsp;&nbsp;mfe_pips                 REAL NOT NULL,    -- max favourable excursion in pips<br/>"
            "&nbsp;&nbsp;mae_pips                 REAL NOT NULL,    -- max adverse excursion in pips<br/>"
            "&nbsp;&nbsp;r_multiple               REAL NOT NULL,    -- P&amp;L in R units (R = risk_pips)<br/>"
            "&nbsp;&nbsp;intraday_tf              TEXT NOT NULL,    -- '15M' or '1H', whichever was used<br/>"
            "&nbsp;&nbsp;notes                    TEXT,<br/>"
            "&nbsp;&nbsp;UNIQUE (snapshot_id)<br/>"
            ");",
            CODE,
        ),
        Paragraph(
            "<b>first_level_hit</b> semantics: walk intraday bars chronologically; the first bar whose "
            "range crosses any of TP1/TP2/TP3/SL determines the outcome. Ties (bar contains both) resolved "
            "as SL hit (conservative). 'none' means snapshot expired without any level hit.",
            BODY,
        ),
        Paragraph(
            "<b>r_multiple</b>: ( hit_level_price − entry ) / ( entry − stop_loss ), signed by direction. "
            "TP1 ≈ +1R if pivots and stop are aligned; SL = −1R by definition.",
            BODY,
        ),
    ],
))

# ── 5. Day-trading positioning derivation ──────────────────────────────────
story.append(PageBreak())
story.extend(section(
    "5. Day-Trading Positioning Derivation",
    "Current synthesisToAnalysisResult uses 1.5× ATR(14) stops and pivot R/S levels. For day trading, tighten this so positions resolve within the 24h window.",
    [
        Paragraph("Recommended rules (override the current positioning() helper for daily snapshots)", H3),
        bullets([
            "<b>Entry:</b> daily close at snapshot time (already the case).",
            "<b>Stop loss:</b> 0.75 × ATR(14) instead of 1.5× — tighter, suitable for intraday hold. Bound: minimum 15 pips, maximum 60 pips for EUR/USD-style majors.",
            "<b>TP1:</b> closest pivot in direction (R1 for long, S1 for short) — typically the most-frequently-hit intraday target.",
            "<b>TP2:</b> 1.5R from entry — a deterministic target based on risk size, not pivot dependent.",
            "<b>TP3:</b> 2.5R from entry — stretch target.",
            "<b>Risk filter:</b> if confidence &lt; 25 OR regime = Compression OR mtf_alignment &lt; 33, skip the snapshot (write a row with direction='NEUTRAL' and no positioning). Compression breakouts are unpredictable; low alignment is low-edge.",
        ]),
        Paragraph(
            "Place this in a new <code>src-tauri/src/scoring/positioning.rs</code> module that owns the "
            "day-trading derivation. <code>build_synthesis()</code> already has all inputs needed; "
            "positioning is a thin wrapper that consumes the resulting Synthesis.",
            BODY,
        ),
        Paragraph("Rust signature", H3),
        Paragraph(
            "pub struct DayTradePositioning {<br/>"
            "&nbsp;&nbsp;pub direction:   String,    // LONG | SHORT | NEUTRAL<br/>"
            "&nbsp;&nbsp;pub entry:       f64,<br/>"
            "&nbsp;&nbsp;pub stop_loss:   f64,<br/>"
            "&nbsp;&nbsp;pub tp1:         f64,<br/>"
            "&nbsp;&nbsp;pub tp2:         f64,<br/>"
            "&nbsp;&nbsp;pub tp3:         f64,<br/>"
            "&nbsp;&nbsp;pub risk_pips:   f64,<br/>"
            "&nbsp;&nbsp;pub skipped:     bool,      // true if risk filter rejected<br/>"
            "&nbsp;&nbsp;pub skip_reason: Option&lt;String&gt;,<br/>"
            "}<br/>"
            "<br/>"
            "pub fn derive(synth: &amp;Synthesis, atr_pips: f64, pip_size: f64) -&gt; DayTradePositioning;",
            CODE,
        ),
        Paragraph(
            "<b>pip_size</b> must be passed because pip definitions differ: EUR/USD = 0.0001, USD/JPY = 0.01, "
            "GBP/JPY = 0.01, etc. Caller derives from the pair string. Keep this in a small "
            "<code>pip_size_for(pair: &amp;str) -&gt; f64</code> helper.",
            BODY,
        ),
    ],
))

# ── 6. Scheduling ──────────────────────────────────────────────────────────
story.extend(section(
    "6. Scheduling — 18:00 Local Daily",
    None,
    [
        Paragraph(
            "OANDA's daily candle closes at 17:00 New York (22:00 UTC during EDT, 21:00 UTC during EST). "
            "Geoff wants the snapshot ~18:00 local — one hour after the new daily bar is available. "
            "On Tauri/Windows the cleanest approach is a <b>tokio background task</b> spawned at app startup.",
            BODY,
        ),
        Paragraph("Rust implementation sketch", H3),
        Paragraph(
            "// In src-tauri/src/lib.rs run() — spawn after app setup<br/>"
            "tauri::async_runtime::spawn(async move {<br/>"
            "&nbsp;&nbsp;loop {<br/>"
            "&nbsp;&nbsp;&nbsp;&nbsp;let now = chrono::Local::now();<br/>"
            "&nbsp;&nbsp;&nbsp;&nbsp;let next = compute_next_1800(now);<br/>"
            "&nbsp;&nbsp;&nbsp;&nbsp;let wait = (next - now).to_std().unwrap_or_default();<br/>"
            "&nbsp;&nbsp;&nbsp;&nbsp;tokio::time::sleep(wait).await;<br/>"
            "&nbsp;&nbsp;&nbsp;&nbsp;for pair in active_pairs() {<br/>"
            "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;run_snapshot_for(&amp;pair).await;<br/>"
            "&nbsp;&nbsp;&nbsp;&nbsp;}<br/>"
            "&nbsp;&nbsp;}<br/>"
            "});",
            CODE,
        ),
        Paragraph(
            "<b>active_pairs()</b> reads from a config table or a hardcoded list initially (['EUR/USD']). "
            "<b>run_snapshot_for</b> performs: fetch candles → build synthesis → derive positioning → "
            "insert row into positioning_snapshots. Also expose a Tauri command <code>force_snapshot(pair)</code> "
            "for manual triggering during testing.",
            BODY,
        ),
        Paragraph(
            "<b>Crash-tolerance:</b> on app start, if no snapshot exists for today and current local time is "
            "&gt; 18:00, immediately run a catch-up snapshot. Otherwise sleep until next 18:00.",
            BODY,
        ),
    ],
))

# ── 7. Outcome resolution pipeline ─────────────────────────────────────────
story.extend(section(
    "7. Outcome Resolution Pipeline",
    None,
    [
        Paragraph(
            "Every open snapshot (no outcome row, valid_until ≤ now) must be resolved by walking intraday "
            "bars. Use H1 candles by default (288 max bars over 24h is unnecessary precision; H1 gives "
            "24 bars and matches typical day-trading granularity).",
            BODY,
        ),
        Paragraph("Algorithm", H3),
        num_list([
            "Query <code>positioning_snapshots WHERE id NOT IN (SELECT snapshot_id FROM positioning_outcomes) AND valid_until &lt;= now()</code>.",
            "For each snapshot: fetch H1 candles for <code>pair</code> covering [created_at, valid_until].",
            "If direction = NEUTRAL: record outcome with first_level_hit='none', r_multiple=0, MFE=MAE=0. Skip the walk.",
            "Otherwise walk bars chronologically. Track running MFE and MAE in pips.",
            "For each bar, check if bar.high ≥ TP-level (for longs) or bar.low ≤ TP-level (for shorts). Same for SL. First level crossed wins.",
            "If bar crosses both SL and a TP on the same bar (gap or wide range): record as SL hit (conservative).",
            "If no level hit by end of window: first_level_hit='none', r_multiple = (final_close - entry) / risk_in_price * direction_sign.",
            "Insert row into positioning_outcomes.",
        ]),
        Paragraph(
            "Run this resolver on a 60-minute tokio interval. Idempotent — won't re-resolve completed snapshots.",
            BODY,
        ),
        Paragraph("Tauri commands needed", H3),
        Paragraph(
            "fn list_open_snapshots() -&gt; Vec&lt;Snapshot&gt;<br/>"
            "fn list_resolved_snapshots(pair: String, limit: u32) -&gt; Vec&lt;ResolvedSnapshot&gt;<br/>"
            "fn force_resolve(snapshot_id: i64) -&gt; Result&lt;Outcome, String&gt;<br/>"
            "fn force_snapshot(pair: String) -&gt; Result&lt;i64, String&gt;<br/>"
            "fn get_accuracy_stats(pair: String, days: u32) -&gt; AccuracyStats",
            CODE,
        ),
    ],
))

# ── 8. Reporting + UI ──────────────────────────────────────────────────────
story.append(PageBreak())
story.extend(section(
    "8. Reporting Views &amp; UI",
    None,
    [
        Paragraph("New 'AI Positioning' page or panel", H3),
        bullets([
            "Header: today's snapshot — direction, confidence, entry/SL/TP1/TP2/TP3, regime, rationale top 3.",
            "Body: recent history table — last 30 snapshots with their outcomes (TP1/TP2/TP3/SL/none), R-multiple, MFE/MAE.",
            "Aggregate metrics tile: win rate, expectancy (R), avg MFE, avg MAE, total R over window.",
            "Slice breakdowns: per-regime (rows of metrics), per-confidence-band (low/mid/high), per-MTF-alignment-band, per top-driver signal_id.",
        ]),
        Paragraph("AccuracyStats Rust struct", H3),
        Paragraph(
            "pub struct AccuracyStats {<br/>"
            "&nbsp;&nbsp;pub pair: String,<br/>"
            "&nbsp;&nbsp;pub window_days: u32,<br/>"
            "&nbsp;&nbsp;pub n_snapshots: u32,<br/>"
            "&nbsp;&nbsp;pub n_resolved: u32,<br/>"
            "&nbsp;&nbsp;pub n_skipped: u32,<br/>"
            "&nbsp;&nbsp;pub win_rate: f64,        // proportion of resolved where r_multiple &gt; 0<br/>"
            "&nbsp;&nbsp;pub expectancy_r: f64,    // mean r_multiple across resolved<br/>"
            "&nbsp;&nbsp;pub total_r: f64,<br/>"
            "&nbsp;&nbsp;pub avg_mfe: f64,<br/>"
            "&nbsp;&nbsp;pub avg_mae: f64,<br/>"
            "&nbsp;&nbsp;pub by_regime: Vec&lt;SliceStats&gt;,<br/>"
            "&nbsp;&nbsp;pub by_confidence: Vec&lt;SliceStats&gt;,<br/>"
            "&nbsp;&nbsp;pub by_mtf_alignment: Vec&lt;SliceStats&gt;,<br/>"
            "&nbsp;&nbsp;pub by_top_signal: Vec&lt;SliceStats&gt;,<br/>"
            "}",
            CODE,
        ),
    ],
))

# ── 9. Multi-pair architecture ────────────────────────────────────────────
story.extend(section(
    "9. Multi-Pair Architecture",
    "Geoff's instruction: design for multi-pair from day one, even though EUR/USD is the only active pair at build time.",
    bullets([
        "Every table row includes a <code>pair</code> column. No pair-implicit logic.",
        "<code>active_pairs()</code> reads a configurable list (table <code>tracked_pairs</code> or app config file). Initially returns <code>['EUR/USD']</code>; expansion is config-only, no code change.",
        "<code>pip_size_for(pair)</code> handles JPY pairs (0.01) vs majors (0.0001) vs metals (0.1).",
        "Indicator engine is already pair-agnostic — same signals work for every instrument.",
        "Per-pair weights come later: introduce a <code>pair_weight_overrides</code> table once the validation phase shows different pairs require different scoring profiles. Until then all pairs share the default weights.",
        "Scheduler iterates all active pairs sequentially at 18:00; each pair takes ~3 OANDA calls (D + H4 + H1) so the full sweep is &lt;30 seconds for ~5 pairs.",
        "Reporting UI: pair selector at top filters all aggregates.",
    ]),
))

# ── 10. Validation phase ──────────────────────────────────────────────────
story.extend(section(
    "10. Validation Phase (NO ML)",
    "Per CLAUDE.md — 'validation before prediction; ML is not phase 1'. The first 60–90 days of snapshots are pure observation. Do not touch weights.",
    [
        bullets([
            "<b>Minimum sample:</b> 30 resolved snapshots per pair before <i>any</i> conclusions; 90+ before tuning anything.",
            "<b>Track religiously:</b> win rate, expectancy in R, max consecutive loss streak, max drawdown in R.",
            "<b>Slice analysis:</b> are certain regimes producing all the wins? Is high MTF alignment correlated with higher R? Does Compression regime add or destroy value?",
            "<b>Honesty check:</b> a system with win_rate &gt; 50% but expectancy ≤ 0 means TP1 hits often but losses are bigger than wins — fix sizing before declaring edge.",
            "<b>Out-of-sample test:</b> reserve the most recent 30 snapshots as a holdout. Tune on the rest, validate on the holdout. If holdout expectancy collapses, the tuning overfit.",
        ]),
        Paragraph(
            "<b>The validation phase outcome should be one of three verdicts:</b>",
            BODY,
        ),
        num_list([
            "<b>Edge confirmed</b> — expectancy &gt; +0.2R, win rate &gt; 35%, holdout matches. Proceed to weight tuning.",
            "<b>Edge unclear</b> — expectancy near 0, mixed slice signals. Either continue collecting or revisit signal selection.",
            "<b>No edge</b> — expectancy ≤ 0 across slices, holdout confirms. Re-design positioning logic before tuning.",
        ]),
    ],
))

# ── 11. Weight tuning + ML ─────────────────────────────────────────────────
story.append(PageBreak())
story.extend(section(
    "11. Weight Tuning &amp; Eventual ML",
    None,
    [
        Paragraph("Phase A — Manual weight tuning (post-validation, pre-ML)", H3),
        bullets([
            "For each signal_id in the rationale, compute conditional expectancy: 'when this signal contributed &gt; X to the composite, what was the resolved R-multiple?'",
            "Signals with positive conditional expectancy → increase their <code>value</code> magnitude in scoring/{trend,momentum,structure}.rs.",
            "Signals with neutral / negative → reduce or zero out.",
            "<b>Shadow run:</b> store proposed weights in a <code>weight_proposals</code> table; the scheduler can run both production and shadow weights in parallel for 30 days before promotion.",
            "Promote only when shadow expectancy beats production by &gt; 0.1R on out-of-sample data.",
        ]),
        Paragraph("Phase B — ML calibration layer (much later)", H3),
        bullets([
            "Inputs: the structured Synthesis features (sub-scores, regime one-hot, MTF alignment, per-signal contributions, ATR-normalised price location vs pivots).",
            "Target: probability that r_multiple &gt; +1 within 24h.",
            "Model: gradient-boosted trees (XGBoost) or a small MLP. Lightweight, runs in Rust via ONNX or tract.",
            "Output: a calibration multiplier applied to the deterministic confidence — never replaces the deterministic decision, only refines its strength.",
            "<b>Hard rule:</b> ML output must never bypass risk filters. If deterministic says skip, ML cannot un-skip.",
            "<b>Re-train cadence:</b> weekly or after every 50 new resolved snapshots. Always evaluate against the same holdout to detect regression.",
        ]),
        Paragraph("Phase C — Reinforcement learning (research only)", H3),
        Paragraph(
            "Once both Phase A and Phase B show stable edge, RL can experiment with adaptive position sizing "
            "(not entry/stop logic — that's the deterministic system's job). RL inputs: current drawdown, "
            "recent win streak, regime, confidence. RL output: size multiplier in [0.5x, 1.5x] applied to "
            "a fixed risk budget. <b>Not before 6+ months of validated outcomes.</b>",
            BODY,
        ),
    ],
))

# ── 12. Implementation order ───────────────────────────────────────────────
story.extend(section(
    "12. Implementation Order",
    "Build in this sequence; each phase is independently shippable and the user can stop at any point with a working subset.",
    num_list([
        "<b>Migration</b> — create the two new tables (<code>positioning_snapshots</code>, <code>positioning_outcomes</code>). New file <code>src-tauri/migrations/0003_positioning.sql</code>. Register in <code>lib.rs</code>.",
        "<b>positioning.rs</b> — new file in <code>src-tauri/src/scoring/</code> with day-trading positioning logic + <code>pip_size_for()</code> helper.",
        "<b>Snapshot writer</b> — function that calls build_synthesis + derive_positioning and inserts a row. Tauri command <code>force_snapshot(pair)</code>.",
        "<b>Scheduler</b> — tokio task in <code>run()</code> that wakes at 18:00 daily, calls snapshot writer for each active pair. Add catch-up logic for app-start-after-18:00.",
        "<b>Outcome resolver</b> — tokio task running hourly. Walks open snapshots, fetches H1 candles, records outcomes. Tauri command <code>force_resolve(id)</code>.",
        "<b>Reporting commands</b> — <code>list_resolved_snapshots</code>, <code>get_accuracy_stats</code>. Pure SQL aggregations.",
        "<b>UI panel</b> — new 'AI Positioning' page (or add to Analytics V3 as a new category panel). Render today's snapshot + history table + aggregate tiles. Use the design language from existing panels.",
        "<b>Active-pairs config</b> — small UI in Settings to enable/disable pairs. Default ['EUR/USD'].",
        "<b>Wait 60–90 days</b> — pure observation. Resist the urge to tune anything.",
        "<b>Phase A weight tuning</b> — only once expectancy is positive and out-of-sample holdout confirms.",
        "<b>Phase B ML</b> — only after Phase A is stable for 30+ days.",
        "<b>Phase C RL</b> — research only, much later.",
    ]),
))

# ── Appendix: file paths to know ───────────────────────────────────────────
story.append(PageBreak())
story.extend(section(
    "Appendix A — File Paths Reference",
    "Files a future Claude session will need to read or modify.",
    bullets([
        "<code>src-tauri/src/lib.rs</code> — Tauri command registration, app entry point, scheduler spawn.",
        "<code>src-tauri/src/scoring/mod.rs</code> — Synthesis types, build_synthesis orchestrator.",
        "<code>src-tauri/src/scoring/trend.rs</code> · <code>momentum.rs</code> · <code>structure.rs</code> · <code>volatility.rs</code> — sub-scorers (read-only for this feature).",
        "<code>src-tauri/src/scoring/positioning.rs</code> — <b>new file</b> for day-trading positioning derivation.",
        "<code>src-tauri/src/candle_store.rs</code> — existing candle persistence; positioning_snapshots/outcomes follow the same pattern.",
        "<code>src-tauri/src/oanda_client.rs</code> — <code>fetch_raw_candles_tf(api_key, instrument, gran, count)</code> for both daily snapshots and H1 outcome resolution.",
        "<code>src-tauri/migrations/</code> — add <code>0003_positioning.sql</code> here.",
        "<code>src/lib/brain/synthesis.ts</code> — TS Synthesis types; extend with Positioning/Outcome types matching the Rust additions.",
        "<code>src/pages/AnalyticsV3.tsx</code> — current AI Synthesis panel; the new positioning UI either lives here or in a new page <code>src/pages/AIPositioning.tsx</code> wired via the sidebar (<code>src/components/layout/Sidebar.tsx</code>).",
        "<code>docs/Analytics_PDF.pdf</code> — indicator reference (for context on what features are available).",
        "<code>CLAUDE.md</code> — architecture rules. Re-read before every session.",
    ]),
))

story.extend(section(
    "Appendix B — Build &amp; Verify Commands",
    None,
    [
        Paragraph("Rust compile check (fast, no link)", H3),
        Paragraph("cargo check --manifest-path src-tauri/Cargo.toml", CODE),
        Paragraph("Full dev run (Tauri + Vite)", H3),
        Paragraph("npm run tauri dev", CODE),
        Paragraph("TypeScript strict check", H3),
        Paragraph("npx tsc --noEmit", CODE),
        Paragraph(
            "Geoff has confirmed: the Tauri app crashes under browser preview — do not use "
            "<code>preview_start</code> or any in-browser verification. <code>npm run tauri dev</code> is the "
            "only supported run path. Vite hot-reloads TS changes within ~1s; Rust changes trigger an "
            "automatic recompile + relaunch on file save.",
            BODY,
        ),
    ],
))

story.extend(section(
    "Appendix C — Open Decisions for Future Sessions",
    "Items deliberately left open at document creation time. Pick these up with Geoff before committing.",
    bullets([
        "<b>Local timezone</b> for the 18:00 schedule — assume America/Toronto unless Geoff specifies. Use <code>chrono-tz</code> if needed.",
        "<b>Position sizing</b> — this plan covers entry/SL/TP only. Risk size in dollars/percent per trade is a separate concern; integrate with the broker account info in Settings when ready.",
        "<b>Snapshot on weekends</b> — FX markets close Friday 5pm NY to Sunday 5pm NY. Should Friday's snapshot resolve over the weekend or skip the weekend? Probable answer: skip (no new bars to walk), and Monday's snapshot starts fresh.",
        "<b>Holiday handling</b> — same as weekends; OANDA returns no bars on closed days.",
        "<b>Manual override</b> — should Geoff be able to discard a snapshot (e.g. major news event makes the bias invalid)? Add a <code>discarded</code> flag to positioning_snapshots if yes.",
    ]),
))

doc.build(story)
print(f"Wrote {OUT}")
