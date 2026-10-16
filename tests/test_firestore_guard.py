import pytest
from processing import should_update_live_status, should_generate_alert, STATUS_OK, STATUS_WARNING, STATUS_ALERT

def test_timestamp_guard_initial_message():
    """First message for a truck should always be accepted."""
    assert should_update_live_status(
        incoming_ts="2026-10-01T13:00:00Z",
        existing_ts=None
    ) is True

def test_timestamp_guard_newer_message():
    """Newer timestamp should be accepted."""
    assert should_update_live_status(
        incoming_ts="2026-10-01T13:00:05Z",
        existing_ts="2026-10-01T13:00:00Z"
    ) is True

def test_timestamp_guard_older_out_of_order_message():
    """Older out-of-order timestamp should be rejected."""
    assert should_update_live_status(
        incoming_ts="2026-10-01T12:59:55Z",
        existing_ts="2026-10-01T13:00:00Z"
    ) is False

def test_timestamp_guard_exact_duplicate_message():
    """Exact duplicate timestamp should be rejected (idempotency)."""
    assert should_update_live_status(
        incoming_ts="2026-10-01T13:00:00Z",
        existing_ts="2026-10-01T13:00:00Z"
    ) is False

def test_alert_generation_transition():
    """Alert record should only be created on transition INTO ALERT state."""
    # Transition from OK to ALERT -> Alert triggered
    assert should_generate_alert(previous_status=STATUS_OK, current_status=STATUS_ALERT) is True

    # Transition from WARNING to ALERT -> Alert triggered
    assert should_generate_alert(previous_status=STATUS_WARNING, current_status=STATUS_ALERT) is True

    # Already in ALERT state -> Do not trigger duplicate alert record
    assert should_generate_alert(previous_status=STATUS_ALERT, current_status=STATUS_ALERT) is False

    # Transition from ALERT to OK -> No alert
    assert should_generate_alert(previous_status=STATUS_ALERT, current_status=STATUS_OK) is False

    # First ping ever starts directly in ALERT -> Alert triggered
    assert should_generate_alert(previous_status=None, current_status=STATUS_ALERT) is True
