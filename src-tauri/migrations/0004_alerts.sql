CREATE TABLE IF NOT EXISTS alerts (
  id        TEXT PRIMARY KEY,
  instrument TEXT NOT NULL,
  name      TEXT NOT NULL,
  price     REAL NOT NULL DEFAULT 0,
  direction TEXT NOT NULL DEFAULT 'above',
  status    TEXT NOT NULL DEFAULT 'watching'
);
