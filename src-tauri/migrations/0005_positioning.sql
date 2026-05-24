-- AI Positioning Tracking — daily snapshots + resolved outcomes.
-- Both tables keyed by pair from day one for multi-pair support.

CREATE TABLE IF NOT EXISTS positioning_snapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at      TEXT    NOT NULL,            -- ISO 8601, UTC
  valid_until     TEXT    NOT NULL,            -- created_at + 24h
  pair            TEXT    NOT NULL,            -- e.g. 'EUR/USD'
  tf              TEXT    NOT NULL,            -- '1D' for now
  direction       TEXT    NOT NULL,            -- 'LONG' | 'SHORT' | 'NEUTRAL'
  confidence      REAL    NOT NULL,            -- 0..100
  composite       REAL    NOT NULL,            -- signed -100..+100
  trend_score     REAL    NOT NULL,
  momentum_score  REAL    NOT NULL,
  structure_score REAL    NOT NULL,
  regime          TEXT    NOT NULL,            -- StrongTrending | Trending | Expansion | Ranging | Compression
  volatility      TEXT    NOT NULL,            -- Expanding | Neutral | Contracting
  mtf_alignment   REAL    NOT NULL,            -- 0..100
  entry           REAL    NOT NULL,
  stop_loss       REAL    NOT NULL,
  tp1             REAL    NOT NULL,
  tp2             REAL    NOT NULL,
  tp3             REAL    NOT NULL,
  risk_pips       REAL    NOT NULL,            -- |entry - stop_loss| in pips (0 if skipped)
  rationale_json  TEXT    NOT NULL,            -- Synthesis.rationale[] as JSON
  synthesis_json  TEXT    NOT NULL,            -- full Synthesis object for replay
  UNIQUE (pair, created_at)
);
CREATE INDEX IF NOT EXISTS idx_snap_pair_date ON positioning_snapshots(pair, created_at);

CREATE TABLE IF NOT EXISTS positioning_outcomes (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id        INTEGER NOT NULL REFERENCES positioning_snapshots(id),
  resolved_at        TEXT    NOT NULL,
  first_level_hit    TEXT    NOT NULL,         -- 'tp1' | 'tp2' | 'tp3' | 'sl' | 'none'
  bars_to_resolution INTEGER NOT NULL,
  mfe_pips           REAL    NOT NULL,
  mae_pips           REAL    NOT NULL,
  r_multiple         REAL    NOT NULL,
  intraday_tf        TEXT    NOT NULL,         -- '15M' or '1H'
  notes              TEXT,
  UNIQUE (snapshot_id)
);
CREATE INDEX IF NOT EXISTS idx_outcome_snap ON positioning_outcomes(snapshot_id);
