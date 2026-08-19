CREATE TABLE IF NOT EXISTS economic_events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  title    TEXT    NOT NULL,
  country  TEXT    NOT NULL,
  date     TEXT    NOT NULL,
  impact   TEXT    NOT NULL,
  forecast TEXT    NOT NULL,
  previous TEXT    NOT NULL,
  actual   TEXT    NOT NULL DEFAULT '',

  UNIQUE (title, date)
);
