import json
from pathlib import Path

ALERTS_FILE = Path("alerts.json")


def load_alerts():
    with ALERTS_FILE.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_alerts(alerts):
    with ALERTS_FILE.open("w", encoding="utf-8") as file:
        json.dump(alerts, file, indent=2)


def reset_triggered_alerts():
    alerts = load_alerts()
    reset_count = 0

    for alert in alerts:
        if alert.get("status") == "triggered":
            alert["status"] = "watching"
            alert["triggered_at_utc"] = None
            alert["last_hit_price"] = None
            reset_count += 1

    save_alerts(alerts)
    print(f"Reset {reset_count} triggered alert(s) back to watching.")


reset_triggered_alerts()
