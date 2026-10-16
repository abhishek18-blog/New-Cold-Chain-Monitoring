import pytest
import time
from notifier import (
    FLEET_DRIVERS,
    should_send_notification,
    format_driver_sms,
    process_alert_event,
    _alert_cooldowns
)

def setup_function():
    """Clear cooldowns before each test."""
    _alert_cooldowns.clear()

def test_driver_registry_lookup():
    """Test that all 15 trucks have driver name, phone, and route mapped."""
    for i in range(1, 16):
        truck_id = f"TRK-{i:03d}"
        assert truck_id in FLEET_DRIVERS
        driver = FLEET_DRIVERS[truck_id]
        assert "name" in driver and len(driver["name"]) > 0
        assert "phone" in driver and driver["phone"].startswith("+91-")
        assert "route" in driver

def test_should_send_notification_cooldown():
    """Test rate-limiting / anti-spam cooldown per truck."""
    truck_id = "TRK-001"
    cooldown = 10.0 # 10 seconds for test
    
    # 1. First alert should always send
    t0 = 1000.0
    assert should_send_notification(truck_id, cooldown_seconds=cooldown, current_time=t0) is True
    
    # 2. Alert 5 seconds later should be suppressed (within 10s cooldown)
    t1 = 1005.0
    assert should_send_notification(truck_id, cooldown_seconds=cooldown, current_time=t1) is False
    
    # 3. Alert for a different truck at the same time should send
    assert should_send_notification("TRK-002", cooldown_seconds=cooldown, current_time=t1) is True
    
    # 4. Alert after cooldown expired (11 seconds later) should send
    t2 = 1011.0
    assert should_send_notification(truck_id, cooldown_seconds=cooldown, current_time=t2) is True

def test_format_driver_sms():
    """Test SMS message formatting for clarity and emergency action."""
    driver_info = {
        "name": "Rajesh Kumar",
        "phone": "+91-98201-11001",
        "cargo": "Fresh Produce",
        "route": "Goa → Mumbai"
    }
    alert_data = {
        "truck_id": "TRK-001",
        "cargo_temp_c": 9.5,
        "setpoint_c": 4.0,
        "excess_temp_c": 5.5,
        "door_open": True,
        "speed_kmph": 65,
        "reason": "Door open with critical excursion: +5.5°C above setpoint"
    }
    
    sms = format_driver_sms("TRK-001", alert_data, driver_info)
    
    assert "TRK-001" in sms
    assert "Rajesh Kumar" in sms
    assert "9.5°C" in sms
    assert "DOOR IS OPEN" in sms
    assert "Safely pull over" in sms

def test_process_alert_event_dispatched_and_cooldown():
    """Test end-to-end alert processing and cooldown suppression."""
    alert_event = {
        "truck_id": "TRK-003",
        "cargo_temp_c": -12.0,
        "setpoint_c": -18.0,
        "excess_temp_c": 6.0,
        "door_open": False,
        "speed_kmph": 72,
        "reason": "Critical temperature excursion: +6.0°C above setpoint"
    }
    
    # First time: dispatched
    assert process_alert_event(alert_event, cooldown_seconds=300.0) is True
    
    # Immediate repeat: suppressed by cooldown
    assert process_alert_event(alert_event, cooldown_seconds=300.0) is False
