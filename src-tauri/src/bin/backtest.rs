// Headless TradeMirror backtest runner.
//
// Runs the strategy-validation harness once against the shared SQLite DB and
// exits. No GUI / webview is started. Console subsystem so stdout is captured.
//
//   cargo run --bin backtest

fn main() {
    trademirror_lib::run_backtest_cli();
}
