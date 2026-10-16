"""
Pure business logic module for cold chain telemetry processing.
Contains NO I/O or external dependencies so it can easily be wrapped as a Cloud Function or unit tested.
"""

from datetime import datetime
from typing import Tuple, Optional

STATUS_OK = "OK"
STATUS_WARNING = "WARNING"
STATUS_ALERT = "ALERT"
STATUS_NO_SIGNAL = "NO_SIGNAL"

def classify(cargo_temp_c: float, setpoint_c: float, door_open: bool) -> Tuple[str, float, str]:
    """
    Classify telemetry status based on temperature excess and door state.
    
    Rules:
      - ALERT if excess >= 4, or (door_open and excess >= 2)
      - WARNING if excess >= 2
      - otherwise OK
    """
    excess = round(cargo_temp_c - setpoint_c, 2)
    
    if excess >= 4.0:
        return STATUS_ALERT, excess, f"Critical temperature excursion: +{excess:.1f}°C above setpoint"
    elif door_open and excess >= 2.0:
        return STATUS_ALERT, excess, f"Door open with critical excursion: +{excess:.1f}°C above setpoint"
    elif excess >= 2.0:
        return STATUS_WARNING, excess, f"Temperature warning: +{excess:.1f}°C above setpoint"
    else:
        return STATUS_OK, excess, "Normal temperature range"

def parse_iso_timestamp(ts_str: str) -> datetime:
    """Parse ISO-8601 UTC timestamp string."""
    if ts_str.endswith('Z'):
        ts_str = ts_str[:-1] + '+00:00'
    return datetime.fromisoformat(ts_str)

def should_update_live_status(incoming_ts: str, existing_ts: Optional[str]) -> bool:
    """
    Idempotent timestamp guard:
    Only accept incoming telemetry if its timestamp is strictly newer than stored timestamp.
    Handles duplicate and out-of-order messages safely.
    """
    if not existing_ts:
        return True
    try:
        incoming_dt = parse_iso_timestamp(incoming_ts)
        existing_dt = parse_iso_timestamp(existing_ts)
        return incoming_dt > existing_dt
    except Exception:
        # Fallback to string comparison if ISO format is standard
        return incoming_ts > existing_ts

def should_generate_alert(previous_status: Optional[str], current_status: str) -> bool:
    """
    Alert transition rule:
    Only generate a new alert record when status transitions INTO 'ALERT' state.
    """
    return current_status == STATUS_ALERT and previous_status != STATUS_ALERT
