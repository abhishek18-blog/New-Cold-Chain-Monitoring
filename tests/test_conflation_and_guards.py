import sys
import os
import time
from unittest.mock import MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "processor")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "alert-notifier")))

from models import TelemetryMessage
from main import (
    process_message,
    flush_conflation_buffer,
    reset_processor_state,
    _conflation_buffer,
    _truck_latest_ts,
    _alert_cooldowns
)
from notifier import WebhookRateLimiter, should_send_notification

def setup_function():
    reset_processor_state()

def test_in_ram_timestamp_guard():
    """Verify that stale or duplicate timestamps are dropped in RAM without Firestore calls."""
    db = MagicMock()
    
    msg1 = TelemetryMessage(
        truck_id="TRK-001",
        ts="2026-10-21T12:00:00Z",
        lat=15.49,
        lon=73.82,
        speed_kmph=65.0,
        fuel_pct=90.0,
        cargo_temp_c=4.0,
        setpoint_c=4.0,
        door_open=False
    )
    # First message accepted
    assert process_message(db, msg1) is True
    assert _truck_latest_ts["TRK-001"] == "2026-10-21T12:00:00Z"

    # Stale/duplicate message rejected in RAM
    msg_stale = TelemetryMessage(
        truck_id="TRK-001",
        ts="2026-10-21T11:59:59Z",
        lat=15.48,
        lon=73.81,
        speed_kmph=64.0,
        fuel_pct=90.0,
        cargo_temp_c=4.0,
        setpoint_c=4.0,
        door_open=False
    )
    assert process_message(db, msg_stale) is False

def test_conflation_buffer_absorbs_high_velocity():
    """Verify that multiple rapid messages for the same truck conflate to the latest state."""
    db = MagicMock()

    # Send 10 rapid messages for TRK-002
    for i in range(10):
        msg = TelemetryMessage(
            truck_id="TRK-002",
            ts=f"2026-10-21T12:00:{i:02d}Z",
            lat=28.0 + (i * 0.01),
            lon=77.0,
            speed_kmph=60.0 + i,
            fuel_pct=85.0,
            cargo_temp_c=4.0,
            setpoint_c=4.0,
            door_open=False
        )
        assert process_message(db, msg) is True

    # Buffer should have conflated all 10 messages into exactly 1 latest record for TRK-002
    assert len(_conflation_buffer) == 1
    assert _conflation_buffer["TRK-002"]["speed_kmph"] == 69.0
    assert _conflation_buffer["TRK-002"]["last_ts"] == "2026-10-21T12:00:09Z"

    # Flush conflation buffer
    batch_mock = MagicMock()
    db.batch.return_value = batch_mock
    flush_conflation_buffer(db)

    # After flush, buffer is empty and batch commit called
    assert len(_conflation_buffer) == 0
    assert batch_mock.commit.called

def test_alert_60s_cooldown_in_processor():
    """Verify that excursion alerts are throttled by 60s cooldown per truck."""
    db = MagicMock()

    # Initial excursion -> Triggers alert
    msg_alert = TelemetryMessage(
        truck_id="TRK-005",
        ts="2026-10-21T12:00:00Z",
        lat=28.0,
        lon=77.0,
        speed_kmph=60.0,
        fuel_pct=85.0,
        cargo_temp_c=12.0, # +8C excess above setpoint
        setpoint_c=4.0,
        door_open=False
    )
    assert process_message(db, msg_alert) is True
    assert "TRK-005" in _alert_cooldowns

    # Subsequent alert 10 seconds later should be suppressed by 60s cooldown
    msg_alert2 = TelemetryMessage(
        truck_id="TRK-005",
        ts="2026-10-21T12:00:10Z",
        lat=28.01,
        lon=77.01,
        speed_kmph=61.0,
        fuel_pct=84.9,
        cargo_temp_c=12.5,
        setpoint_c=4.0,
        door_open=False
    )
    initial_alert_time = _alert_cooldowns["TRK-005"]
    assert process_message(db, msg_alert2) is True
    # Cooldown timestamp did not update (alert was suppressed)
    assert _alert_cooldowns["TRK-005"] == initial_alert_time

def test_discord_webhook_rate_limiter():
    """Verify that RateLimiter limits execution to max 2 req/s."""
    limiter = WebhookRateLimiter(max_per_second=2.0)
    t0 = time.time()
    limiter.acquire()
    limiter.acquire()
    elapsed = time.time() - t0
    # 2 calls with 2 req/s (0.5s interval) should take at least ~0.40s
    assert elapsed >= 0.40

def test_dashboard_api_aliases():
    """Verify /api/simulate, /api/history, /api/live-hud, and HTML redirects."""
    import importlib.util
    from fastapi.testclient import TestClient

    dashboard_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard", "main.py"))
    spec = importlib.util.spec_from_file_location("dashboard_app_module", dashboard_path)
    dashboard_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(dashboard_mod)
    app = dashboard_mod.app

    client = TestClient(app)

    # 1. /api/history alias
    res_hist = client.get("/api/history")
    assert res_hist.status_code == 200
    assert "summary" in res_hist.json() and "chart_data" in res_hist.json()

    # 2. /api/simulate alias
    res_sim = client.post("/api/simulate", json={"truck_ids": ["TRK-001"], "scenario": "COMPRESSOR_FAILURE"})
    assert res_sim.status_code == 200
    assert res_sim.json().get("count") == 1
    assert "results" in res_sim.json()

    # 3. /api/live-hud endpoint
    res_hud = client.get("/api/live-hud")
    assert res_hud.status_code == 200
    assert "current_msg_rate" in res_hud.json()

    # 4. Redirect aliases
    res_dash = client.get("/dashboard.html", follow_redirects=False)
    assert res_dash.status_code in (307, 308, 302, 301)
    assert res_dash.headers.get("location") == "/index.html"

    res_hpage = client.get("/historical.html", follow_redirects=False)
    assert res_hpage.status_code in (307, 308, 302, 301)
    assert res_hpage.headers.get("location") == "/analytics.html"

