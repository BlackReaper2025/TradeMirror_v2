import json
from pathlib import Path

ALERT_LOG_FILE = Path("alert_log.json")


def clear_alert_log():
    with ALERT_LOG_FILE.open("w", encoding="utf-8") as file:
        json.dump([], file, indent=2)

    print("Cleared alert_log.json.")


clear_alert_log()
