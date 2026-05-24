// Headless TradeMirror positioning runner.
//
// Invoked by Windows Task Scheduler (hourly). Runs the snapshot + outcome
// resolution engine once against the shared SQLite DB, then exits. No GUI /
// webview is started, so it works whether or not the desktop app is open.
//
// Console subsystem (no windows_subsystem attribute) so Task Scheduler can
// capture stdout/stderr and no window flashes on screen.

fn main() {
    trademirror_lib::run_positioning_cron();
}
