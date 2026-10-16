import pytest
from processing import classify, STATUS_OK, STATUS_WARNING, STATUS_ALERT

def test_classify_optimal_temperature():
    """Verify normal temperatures around setpoint produce OK status."""
    status, excess, reason = classify(cargo_temp_c=4.1, setpoint_c=4.0, door_open=False)
    assert status == STATUS_OK
    assert excess == 0.1
    assert "Normal" in reason

    # Cold tolerance
    status, excess, reason = classify(cargo_temp_c=3.5, setpoint_c=4.0, door_open=False)
    assert status == STATUS_OK
    assert excess == -0.5

def test_classify_warning_threshold():
    """Verify temperature excess >= 2.0C triggers WARNING when door is closed."""
    status, excess, reason = classify(cargo_temp_c=6.0, setpoint_c=4.0, door_open=False)
    assert status == STATUS_WARNING
    assert excess == 2.0
    assert "warning" in reason.lower()

    status, excess, reason = classify(cargo_temp_c=7.9, setpoint_c=4.0, door_open=False)
    assert status == STATUS_WARNING
    assert excess == 3.9

def test_classify_alert_severe_excursion():
    """Verify temperature excess >= 4.0C triggers ALERT regardless of door state."""
    status, excess, reason = classify(cargo_temp_c=8.0, setpoint_c=4.0, door_open=False)
    assert status == STATUS_ALERT
    assert excess == 4.0

    status, excess, reason = classify(cargo_temp_c=8.5, setpoint_c=4.0, door_open=True)
    assert status == STATUS_ALERT
    assert excess == 4.5

def test_classify_alert_door_open_with_moderate_excursion():
    """Verify door open with excess >= 2.0C triggers ALERT immediately."""
    status, excess, reason = classify(cargo_temp_c=6.1, setpoint_c=4.0, door_open=True)
    assert status == STATUS_ALERT
    assert excess == 2.1
    assert "Door open" in reason

def test_classify_door_open_with_normal_temp():
    """Verify door open with normal temperature (< 2.0C excess) remains OK."""
    status, excess, reason = classify(cargo_temp_c=4.8, setpoint_c=4.0, door_open=True)
    assert status == STATUS_OK
    assert excess == 0.8
