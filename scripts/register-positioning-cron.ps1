# =============================================================================
# TradeMirror - register the headless AI Positioning runner with Task Scheduler.
#
# Runs positioning_cron.exe every hour (and at logon), catching up any runs that
# were missed while the PC was off. No desktop app needs to be open.
#
# ONE-TIME SETUP:
#   1. Build the runner (fast, no installer needed):
#        cargo build --release --bin positioning_cron --manifest-path src-tauri/Cargo.toml
#   2. Run this script in PowerShell (no admin required for an S4U task):
#        powershell -ExecutionPolicy Bypass -File scripts/register-positioning-cron.ps1
#
# To remove later:
#   Unregister-ScheduledTask -TaskName "TradeMirror Positioning" -Confirm:$false
# =============================================================================

param(
  [string]$ExePath  = "$PSScriptRoot\..\src-tauri\target\release\positioning_cron.exe",
  [string]$TaskName = "TradeMirror Positioning"
)

if (-not (Test-Path $ExePath)) {
  Write-Error "positioning_cron.exe not found at: $ExePath. Build it first: cargo build --release --bin positioning_cron --manifest-path src-tauri/Cargo.toml"
  exit 1
}
$ExePath = (Resolve-Path $ExePath).Path
Write-Host "Runner: $ExePath"

$action = New-ScheduledTaskAction -Execute $ExePath

# Hourly forever (10-year duration ~ indefinite), starting at the next whole hour,
# plus a run at every logon.
$start   = (Get-Date).Date.AddHours((Get-Date).Hour + 1)
$hourly  = New-ScheduledTaskTrigger -Once -At $start `
             -RepetitionInterval (New-TimeSpan -Hours 1) `
             -RepetitionDuration (New-TimeSpan -Days 3650)
$atLogon = New-ScheduledTaskTrigger -AtLogOn

# StartWhenAvailable = run as soon as possible after a missed scheduled start
# (covers the PC-was-off case). Don't stop on idle; cap each run at 10 minutes.
$settings = New-ScheduledTaskSettingsSet `
              -StartWhenAvailable `
              -DontStopOnIdleEnd `
              -MultipleInstances IgnoreNew `
              -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

# Interactive = runs whenever you are logged on (lock/sleep is fine; misses are
# caught up via StartWhenAvailable). No admin required to register.
# For "run even when logged off", re-run this elevated and change -LogonType to S4U.
$principal = New-ScheduledTaskPrincipal `
               -UserId "$env:USERDOMAIN\$env:USERNAME" `
               -LogonType Interactive `
               -RunLevel Limited

try {
  Register-ScheduledTask `
    -TaskName  $TaskName `
    -Action    $action `
    -Trigger   @($hourly, $atLogon) `
    -Settings  $settings `
    -Principal $principal `
    -Force -ErrorAction Stop | Out-Null
} catch {
  Write-Error "Failed to register task: $_"
  exit 1
}

Write-Host "Registered scheduled task: $TaskName - runs hourly + at logon, catches up missed runs."
Write-Host "Run it now with: Start-ScheduledTask -TaskName '$TaskName'"
