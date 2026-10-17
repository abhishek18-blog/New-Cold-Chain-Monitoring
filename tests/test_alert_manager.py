#!/usr/bin/env python3
"""
Unit tests for AlertManager:
Testing all 4 rules:
1. Debounce / Consecutive Breach Filter (3 consecutive readings above threshold required)
2. State Lock & Cooldown Timer (15-minute / 900s cooldown; 50 consecutive breaches = only 1 alert)
   + Critical Escalation (+5°C rise bypasses cooldown)
3. Hysteresis / Recovery Reset (Drops >= 1.0°C below threshold for 3 consecutive readings)
4. Fast2SMS integration & 16th Driver (Abhishek Deshmukh) registry verification
"""

import sys
import os
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "alert-notifier")))

from alert_manager import AlertManager, AlertDecision, FLEET_DRIVERS, DEFAULT_FAST2SMS_KEY


class TestAlertManager(unittest.TestCase):

    def setUp(self):
        # Create manager with disabled actual SMS network call for deterministic testing
        self.mgr = AlertManager(
            api_key=DEFAULT_FAST2SMS_KEY,
            cooldown_seconds=900.0,       # 15 minutes
            debounce_breach_count=3,
            hysteresis_recovery_count=3,
            hysteresis_margin_c=1.0,
            escalation_delta_c=5.0,
            enabled_sms=False             # Mock dispatch in unit tests
        )

    def test_driver_16_registry(self):
        """Verify Abhishek Deshmukh is properly registered as the 16th driver."""
        self.assertIn("TRK-016", FLEET_DRIVERS)
        driver16 = FLEET_DRIVERS["TRK-016"]
        self.assertEqual(driver16["name"], "Abhishek Deshmukh")
        self.assertEqual(driver16["phone"], "9022290311")
        self.assertEqual(driver16["route"], "Pune → Mumbai")
        self.assertEqual(driver16["setpoint"], 4.0)

    def test_rule_1_debounce_consecutive_breaches(self):
        """
        Rule 1: Require at least 3 consecutive telemetry readings above threshold_c
        before firing an alert (ignore 1-second sensor noise spikes).
        """
        truck_id = "TRK-016"
        threshold = 4.0
        t0 = 1000.0

        # Reading 1: Spike to 6.5°C (> 4.0) -> Suppressed (1/3)
        d1 = self.mgr.process_reading(truck_id, cargo_temp_c=6.5, threshold_c=threshold, current_time=t0)
        self.assertEqual(d1.action, "SUPPRESSED")
        self.assertEqual(d1.state, "NORMAL")
        self.assertIn("Debouncing", d1.reason)

        # Reading 2: Transient drop to normal 3.8°C -> Resets breach counter!
        d2 = self.mgr.process_reading(truck_id, cargo_temp_c=3.8, threshold_c=threshold, current_time=t0 + 1)
        self.assertEqual(d2.action, "NORMAL")
        self.assertEqual(d2.state, "NORMAL")

        # Reading 3: Spike again to 6.8°C -> Suppressed (1/3)
        d3 = self.mgr.process_reading(truck_id, cargo_temp_c=6.8, threshold_c=threshold, current_time=t0 + 2)
        self.assertEqual(d3.action, "SUPPRESSED")

        # Reading 4: 7.1°C -> Suppressed (2/3)
        d4 = self.mgr.process_reading(truck_id, cargo_temp_c=7.1, threshold_c=threshold, current_time=t0 + 3)
        self.assertEqual(d4.action, "SUPPRESSED")

        # Reading 5: 7.0°C (3rd consecutive breach) -> FIRES ALERT!
        d5 = self.mgr.process_reading(truck_id, cargo_temp_c=7.0, threshold_c=threshold, current_time=t0 + 4)
        self.assertEqual(d5.action, "ALERT")
        self.assertEqual(d5.state, "IN_BREACH")
        self.assertIn("Initial breach confirmed", d5.reason)

    def test_rule_2_fifty_breaches_in_a_row_sends_only_one_alert(self):
        """
        Rule 2: If a truck breaches its temperature threshold 50 times in a row,
        it only sends 1 SMS alert instead of 50 due to 15-minute (900s) cooldown.
        """
        truck_id = "TRK-016"
        threshold = 4.0
        start_time = 1000.0

        alerts_fired = 0
        suppressed_count = 0

        # Send 50 consecutive readings with breach temperature 8.5°C at 1-second intervals
        for i in range(50):
            t = start_time + i
            decision = self.mgr.process_reading(
                truck_id,
                cargo_temp_c=8.5,
                threshold_c=threshold,
                current_time=t
            )
            if decision.action in ("ALERT", "ESCALATION"):
                alerts_fired += 1
            elif decision.action == "SUPPRESSED":
                suppressed_count += 1

        # Exactly 1 alert must be fired, and 49 must be suppressed!
        # (Readings 1 and 2 suppressed by debouncing, Reading 3 alerts, Readings 4-50 suppressed by cooldown)
        self.assertEqual(alerts_fired, 1, "Expected exactly 1 alert fired across 50 consecutive breach readings")
        self.assertEqual(suppressed_count, 49, "Expected 49 suppressed readings across 50 consecutive breach readings")
        st = self.mgr.get_or_create_state(truck_id)
        self.assertEqual(st.state, "IN_BREACH")
        self.assertEqual(st.total_alerts_sent, 1)

    def test_rule_2_critical_escalation_bypasses_cooldown(self):
        """
        Rule 2 (Escalation): Suppress during 15-min cooldown UNLESS temperature
        spikes by an additional +5.0°C above last alerted temperature.
        """
        truck_id = "TRK-016"
        threshold = 4.0
        t0 = 2000.0

        # Trigger initial breach at 7.0°C
        self.mgr.process_reading(truck_id, cargo_temp_c=7.0, threshold_c=threshold, current_time=t0)
        self.mgr.process_reading(truck_id, cargo_temp_c=7.0, threshold_c=threshold, current_time=t0 + 1)
        d_initial = self.mgr.process_reading(truck_id, cargo_temp_c=7.0, threshold_c=threshold, current_time=t0 + 2)
        self.assertEqual(d_initial.action, "ALERT")

        # 1 minute later, temperature rises to 10.0°C (+3.0°C rise, < +5.0°C) -> Still in cooldown -> SUPPRESSED
        d_mod = self.mgr.process_reading(truck_id, cargo_temp_c=10.0, threshold_c=threshold, current_time=t0 + 60)
        self.assertEqual(d_mod.action, "SUPPRESSED")
        self.assertIn("Cooldown active", d_mod.reason)

        # 2 minutes later, temperature explodes to 12.5°C (+5.5°C rise above 7.0°C) -> CRITICAL ESCALATION!
        d_esc = self.mgr.process_reading(truck_id, cargo_temp_c=12.5, threshold_c=threshold, current_time=t0 + 120)
        self.assertEqual(d_esc.action, "ESCALATION")
        self.assertIn("Critical escalation", d_esc.reason)

    def test_rule_3_hysteresis_recovery_reset(self):
        """
        Rule 3: Only reset IN_BREACH state back to NORMAL when temperature drops
        at least 1.0°C below threshold_c for 3 consecutive readings.
        """
        truck_id = "TRK-016"
        threshold = 4.0
        t0 = 3000.0

        # Trigger initial breach to set state to IN_BREACH
        for i in range(3):
            self.mgr.process_reading(truck_id, cargo_temp_c=8.0, threshold_c=threshold, current_time=t0 + i)

        st = self.mgr.get_or_create_state(truck_id)
        self.assertEqual(st.state, "IN_BREACH")

        # Reading drops to 3.5°C: Below threshold (4.0), but NOT 1.0°C below (target is <= 3.0°C)
        # Hysteresis buffer keeps it IN_BREACH!
        for i in range(5):
            d_buff = self.mgr.process_reading(truck_id, cargo_temp_c=3.5, threshold_c=threshold, current_time=t0 + 10 + i)
            self.assertEqual(d_buff.action, "SUPPRESSED")
            self.assertEqual(st.state, "IN_BREACH")
            self.assertIn("Hysteresis buffer", d_buff.reason)

        # Now temperature drops safely to 2.8°C (<= 3.0°C)
        # Reading 1: 2.8°C -> Recovery in progress (1/3)
        r1 = self.mgr.process_reading(truck_id, cargo_temp_c=2.8, threshold_c=threshold, current_time=t0 + 20)
        self.assertEqual(r1.action, "SUPPRESSED")
        self.assertEqual(st.state, "IN_BREACH")

        # Reading 2: 2.7°C -> Recovery in progress (2/3)
        r2 = self.mgr.process_reading(truck_id, cargo_temp_c=2.7, threshold_c=threshold, current_time=t0 + 21)
        self.assertEqual(r2.action, "SUPPRESSED")
        self.assertEqual(st.state, "IN_BREACH")

        # Reading 3: 2.6°C -> 3rd consecutive recovery reading -> RECOVERY FIRES & RESETS TO NORMAL!
        r3 = self.mgr.process_reading(truck_id, cargo_temp_c=2.6, threshold_c=threshold, current_time=t0 + 22)
        self.assertEqual(r3.action, "RECOVERY")
        self.assertEqual(st.state, "NORMAL")
        self.assertIn("Recovered to NORMAL", r3.reason)

        # After resetting to NORMAL, a subsequent new 3-breach event triggers a fresh alert
        self.mgr.process_reading(truck_id, cargo_temp_c=8.0, threshold_c=threshold, current_time=t0 + 30)
        self.mgr.process_reading(truck_id, cargo_temp_c=8.0, threshold_c=threshold, current_time=t0 + 31)
        fresh_alert = self.mgr.process_reading(truck_id, cargo_temp_c=8.0, threshold_c=threshold, current_time=t0 + 32)
        self.assertEqual(fresh_alert.action, "ALERT")
        self.assertEqual(st.state, "IN_BREACH")

    def test_rule_4_clean_kafka_consumer_integration(self):
        """
        Rule 4: Drop directly into Kafka consumer loop using process_telemetry.
        """
        # Simulated Kafka JSON payload
        msg_payload = {
            "truck_id": "TRK-016",
            "ts": "2026-10-17T17:00:00Z",
            "cargo_temp_c": 9.5,
            "setpoint_c": 4.0,
            "threshold_c": 6.0,
            "speed_kmph": 65.0,
            "door_open": False
        }

        # 3 readings in consumer loop
        d1 = self.mgr.process_telemetry(msg_payload, current_time=100)
        self.assertEqual(d1.action, "SUPPRESSED")

        d2 = self.mgr.process_telemetry(msg_payload, current_time=101)
        self.assertEqual(d2.action, "SUPPRESSED")

        d3 = self.mgr.process_telemetry(msg_payload, current_time=102)
        self.assertEqual(d3.action, "ALERT")
        self.assertEqual(d3.truck_id, "TRK-016")


if __name__ == "__main__":
    unittest.main()

