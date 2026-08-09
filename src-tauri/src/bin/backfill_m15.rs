// Headless TradeMirror M15 backfill.
//
// Pulls ~3 years of EURUSD M15 history from OANDA into the shared SQLite DB,
// then exits. Run once before backtesting on M15.
//
//   cargo run --bin backfill_m15

fn main() {
    trademirror_lib::backfill_m15_cli();
}
