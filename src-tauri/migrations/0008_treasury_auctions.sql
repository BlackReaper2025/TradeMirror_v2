CREATE TABLE IF NOT EXISTS treasury_auctions (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  cusip                    TEXT    NOT NULL UNIQUE,
  security_term            TEXT    NOT NULL,
  auction_date             TEXT    NOT NULL,
  issue_date               TEXT    NOT NULL,
  high_yield               TEXT    NOT NULL DEFAULT '',
  bid_to_cover_ratio       TEXT    NOT NULL DEFAULT '',
  indirect_bidder_accepted TEXT    NOT NULL DEFAULT '',
  direct_bidder_accepted   TEXT    NOT NULL DEFAULT '',
  primary_dealer_accepted  TEXT    NOT NULL DEFAULT '',
  total_accepted           TEXT    NOT NULL DEFAULT '',
  offering_amount          TEXT    NOT NULL DEFAULT ''
);
