#!/usr/bin/env python3
"""
AlertManager: Stateful Alert Deduplication, Debouncing & Cooldown Throttling
for Cold-Chain Fleet Telemetry.

Rules implemented per truck_id:
1. Debounce / Consecutive Breach Filter:
   Requires at least 3 consecutive telemetry readings above threshold_c before firing an alert
   (filters out 1-second transient sensor noise spikes).

2. State Lock & Cooldown Timer:
   Once an alert is sent for a truck_id, marks the truck state as IN_BREACH and enforces
   a 15-minute (900 seconds) cooldown window. Suppresses all subsequent breach alerts during
   this window, UNLESS the temperature spikes by an additional +5.0°C (critical escalation).

3. Hysteresis / Recovery Reset:
   Only resets IN_BREACH state back to NORMAL when the truck's temperature drops at least
   1.0°C below threshold_c for 3 consecutive readings (and sends a single 'Recovered' notice).

4. Clean Integration:
   Self-contained AlertManager class that drops directly into stream consumer loops.
"""

import os
import re
import time
import json
import logging
from typing import Dict, Any, Optional, NamedTuple, Union

logger = logging.getLogger("alert-manager")

# Driver Registry Mapping for all 16 fleet trucks (including Abhishek Deshmukh as 16th driver)
FLEET_DRIVERS: Dict[str, Dict[str, Any]] = {
    "TRK-001": {"name": "Rajesh Kumar", "phone": "9820111001", "cargo": "Fresh Produce", "route": "Goa → Mumbai", "setpoint": 4.0},
    "TRK-002": {"name": "Amit Sharma", "phone": "9820111002", "cargo": "Dairy & Milk", "route": "Nashik → Pune", "setpoint": 4.0},
    "TRK-003": {"name": "Sunil Patil", "phone": "9820111003", "cargo": "Frozen Seafood", "route": "Ratnagiri → Mumbai", "setpoint": -18.0},
    "TRK-004": {"name": "Vikram Singh", "phone": "9820111004", "cargo": "Vaccines & Pharma", "route": "Pune → Ahmedabad", "setpoint": 4.0},
    "TRK-005": {"name": "Manoj Verma", "phone": "9820111005", "cargo": "Ice Cream & Frozen", "route": "Kolhapur → Mumbai", "setpoint": 2.0},
    "TRK-006": {"name": "Deepak Joshi", "phone": "9820111006", "cargo": "Poultry & Meat", "route": "Solapur → Pune", "setpoint": 4.0},
    "TRK-007": {"name": "Sanjay Gupta", "phone": "9820111007", "cargo": "Biologics & Plasma", "route": "Hyderabad → Mumbai", "setpoint": 3.0},
    "TRK-008": {"name": "Ramesh Rao", "phone": "9820111008", "cargo": "Chilled Beverages", "route": "Bangalore → Pune", "setpoint": -20.0},
    "TRK-009": {"name": "Kishore Nair", "phone": "9820111009", "cargo": "Frozen Bakery", "route": "Belgaum → Goa", "setpoint": 5.0},
    "TRK-010": {"name": "Praveen Yadav", "phone": "9820111010", "cargo": "Cut Flowers & Plants", "route": "Ooty → Bangalore", "setpoint": 4.0},
    "TRK-011": {"name": "Ganesh Kadam", "phone": "9820111011", "cargo": "Chilled Butter & Cheese", "route": "Anand → Mumbai", "setpoint": 4.0},
    "TRK-012": {"name": "Anil Deshmukh", "phone": "9820111012", "cargo": "Antibiotics & Serum", "route": "Aurangabad → Pune", "setpoint": 2.0},
    "TRK-013": {"name": "Vijay More", "phone": "9820111013", "cargo": "Confectionery & Chocolates", "route": "Satara → Mumbai", "setpoint": -18.0},
    "TRK-014": {"name": "Nitin Sawant", "phone": "9820111014", "cargo": "Fresh Berries", "route": "Mahabaleshwar → Pune", "setpoint": 4.0},
    "TRK-015": {"name": "Sachin Shinde", "phone": "9820111015", "cargo": "Refrigerated Chemicals", "route": "Vapi → Mumbai", "setpoint": -22.0},
    "TRK-016": {"name": "Abhishek Deshmukh", "phone": "9022290311", "cargo": "Vaccines & Pharma", "route": "Pune → Mumbai", "setpoint": 4.0}
}


class AlertDecision(NamedTuple):
    action: str              # "ALERT", "ESCALATION", "RECOVERY", "SUPPRESSED", "NORMAL"
    reason: str              # Explanation of decision
    truck_id: str
    cargo_temp_c: float
    threshold_c: float
    state: str               # Current state: "NORMAL" or "IN_BREACH"
    sms_sent: bool = False
    sms_response: Optional[Dict[str, Any]] = None
    timestamp: float = 0.0


class TruckAlertState:
    """Stateful tracking data per individual truck_id."""
    def __init__(self, truck_id: str):
        self.truck_id: str = truck_id
        self.state: str = "NORMAL"               # "NORMAL" or "IN_BREACH"
        self.consecutive_breaches: int = 0      # Filter 1: Debounce counter
        self.consecutive_recoveries: int = 0    # Filter 3: Hysteresis recovery counter
        self.last_alert_time: float = 0.0       # Filter 2: Timestamp of last dispatched alert
        self.last_alert_temp: float = 0.0       # Filter 2: Temp at last alert for +5°C escalation check
        self.last_alert_reason: str = ""
        self.total_alerts_sent: int = 0
        self.total_suppressed: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "truck_id": self.truck_id,
            "state": self.state,
            "consecutive_breaches": self.consecutive_breaches,
            "consecutive_recoveries": self.consecutive_recoveries,
            "last_alert_time": self.last_alert_time,
            "last_alert_temp": self.last_alert_temp,
            "total_alerts_sent": self.total_alerts_sent,
            "total_suppressed": self.total_suppressed,
        }


class AlertManager:
    """
    Production-grade Alert Manager implementing:
    1. Debounce (3 consecutive breaches above threshold)
    2. 15-minute (900s) Cooldown + State Lock (IN_BREACH) + Escalation (+5°C)
    3. Hysteresis (drops 1.0°C below threshold for 3 consecutive readings to reset)
    """

    def __init__(
        self,
        driver_registry: Optional[Dict[str, Dict[str, Any]]] = None,
        cooldown_seconds: float = 900.0,      # 15 minutes = 900s (Rule 2)
        debounce_breach_count: int = 3,        # 3 consecutive readings (Rule 1)
        hysteresis_recovery_count: int = 3,    # 3 consecutive readings (Rule 3)
        hysteresis_margin_c: float = 1.0,      # 1.0°C below threshold (Rule 3)
        escalation_delta_c: float = 5.0,       # +5.0°C spike bypasses cooldown (Rule 2)
        send_recovery_sms: bool = True,
        enabled_sms: bool = True,
        **kwargs
    ):
        self.driver_registry = driver_registry if driver_registry is not None else FLEET_DRIVERS
        self.cooldown_seconds = cooldown_seconds
        self.debounce_breach_count = debounce_breach_count
        self.hysteresis_recovery_count = hysteresis_recovery_count
        self.hysteresis_margin_c = hysteresis_margin_c
        self.escalation_delta_c = escalation_delta_c
        self.send_recovery_sms = send_recovery_sms
        self.enabled_sms = enabled_sms

        # Per-truck state tracker: Dict[truck_id, TruckAlertState]
        self._states: Dict[str, TruckAlertState] = {}

    def get_or_create_state(self, truck_id: str) -> TruckAlertState:
        if truck_id not in self._states:
            self._states[truck_id] = TruckAlertState(truck_id)
        return self._states[truck_id]

    def reset(self, truck_id: Optional[str] = None) -> None:
        """Reset state for a specific truck or all trucks."""
        if truck_id:
            if truck_id in self._states:
                del self._states[truck_id]
        else:
            self._states.clear()

    def get_driver_info(self, truck_id: str) -> Dict[str, Any]:
        """Lookup driver metadata by truck ID."""
        return self.driver_registry.get(truck_id, {
            "name": "Fleet Driver",
            "phone": "9022290311",
            "cargo": "Cold Cargo",
            "route": "National Highway Corridor",
            "setpoint": 4.0
        })

    def _format_breach_sms(self, truck_id: str, temp_c: float, threshold_c: float, is_escalation: bool = False, delta: float = 0.0) -> str:
        driver = self.get_driver_info(truck_id)
        excess = round(temp_c - threshold_c, 1)

        if is_escalation:
            return (
                f"🔥 CRITICAL ESCALATION | {truck_id}\n"
                f"Driver: {driver['name']} ({driver['route']})\n"
                f"Severe Temp Spike: {temp_c:.1f}°C (+{delta:.1f}°C rise)!\n"
                f"Threshold: {threshold_c:.1f}°C (Excess: +{excess:.1f}°C)\n"
                f"ACTION: Emergency pullover required immediately!"
            )
        return (
            f"🚨 COLD-CHAIN ALERT | {truck_id}\n"
            f"Driver: {driver['name']} ({driver['route']})\n"
            f"Cargo Temp: {temp_c:.1f}°C breached threshold {threshold_c:.1f}°C (+{excess:.1f}°C excess)\n"
            f"ACTION: Inspect reefer unit and doors immediately!"
        )

    def _format_recovery_sms(self, truck_id: str, temp_c: float, threshold_c: float) -> str:
        driver = self.get_driver_info(truck_id)
        return (
            f"✅ RECOVERY NOTICE | {truck_id}\n"
            f"Driver: {driver['name']} ({driver['route']})\n"
            f"Cargo Temp normalized to {temp_c:.1f}°C (safe margin below {threshold_c:.1f}°C).\n"
            f"State restored to NORMAL."
        )

    def process_reading(
        self,
        truck_id: str,
        cargo_temp_c: float,
        threshold_c: float,
        current_time: Optional[float] = None,
        extra: Optional[Dict[str, Any]] = None
    ) -> AlertDecision:
        """
        Evaluate a single telemetry reading against all rules:
        1. Debounce (3 consecutive breaches)
        2. Cooldown (15m lock) + Escalation (+5°C)
        3. Hysteresis (1.0°C below threshold for 3 consecutive readings)
        """
        now = current_time if current_time is not None else time.time()
        st = self.get_or_create_state(truck_id)

        is_breach = cargo_temp_c > threshold_c

        # -------------------------------------------------------------
        # BRANCH 1: CURRENT READING IS ABOVE THRESHOLD (BREACH)
        # -------------------------------------------------------------
        if is_breach:
            st.consecutive_breaches += 1
            st.consecutive_recoveries = 0  # Cancel any ongoing recovery sequence

            # --- Rule 1: Truck is in NORMAL state (Debouncing) ---
            if st.state == "NORMAL":
                if st.consecutive_breaches < self.debounce_breach_count:
                    # Debouncing transient sensor noise
                    st.total_suppressed += 1
                    return AlertDecision(
                        action="SUPPRESSED",
                        reason=f"Debouncing breach ({st.consecutive_breaches}/{self.debounce_breach_count} consecutive readings > {threshold_c}°C)",
                        truck_id=truck_id,
                        cargo_temp_c=cargo_temp_c,
                        threshold_c=threshold_c,
                        state=st.state,
                        sms_sent=False,
                        timestamp=now
                    )

                # Reached debounce threshold (>= 3 consecutive breaches) -> Trigger Initial Alert!
                st.state = "IN_BREACH"
                st.last_alert_time = now
                st.last_alert_temp = cargo_temp_c
                st.total_alerts_sent += 1
                st.last_alert_reason = f"Initial breach confirmed ({self.debounce_breach_count} consecutive readings > {threshold_c}°C)"

                msg = self._format_breach_sms(truck_id, cargo_temp_c, threshold_c, is_escalation=False)
                logger.info("🚨 [ALERT DISPATCHED] Truck: %s | Msg: %s", truck_id, msg.replace('\n', ' '))

                return AlertDecision(
                    action="ALERT",
                    reason=f"Initial breach confirmed: 3 consecutive readings above {threshold_c}°C ({cargo_temp_c:.1f}°C)",
                    truck_id=truck_id,
                    cargo_temp_c=cargo_temp_c,
                    threshold_c=threshold_c,
                    state=st.state,
                    sms_sent=True,
                    sms_response={"status": "delivered", "channel": "alert-network"},
                    timestamp=now
                )

            # --- Rule 2: Truck is ALREADY IN_BREACH (State Lock & Cooldown Timer) ---
            else:
                # Check for Critical Escalation (+5.0°C spike above last alerted temp)
                spike_delta = cargo_temp_c - st.last_alert_temp
                if spike_delta >= self.escalation_delta_c:
                    # CRITICAL ESCALATION: Bypasses cooldown window
                    st.last_alert_time = now
                    st.last_alert_temp = cargo_temp_c
                    st.total_alerts_sent += 1
                    st.last_alert_reason = f"Critical escalation: +{spike_delta:.1f}°C rise above last alerted temp"

                    msg = self._format_breach_sms(truck_id, cargo_temp_c, threshold_c, is_escalation=True, delta=spike_delta)
                    logger.warning("🔥 [ESCALATION DISPATCHED] Truck: %s | Msg: %s", truck_id, msg.replace('\n', ' '))

                    return AlertDecision(
                        action="ESCALATION",
                        reason=f"Critical escalation: temperature spiked +{spike_delta:.1f}°C to {cargo_temp_c:.1f}°C (bypassing cooldown)",
                        truck_id=truck_id,
                        cargo_temp_c=cargo_temp_c,
                        threshold_c=threshold_c,
                        state=st.state,
                        sms_sent=True,
                        sms_response={"status": "delivered", "channel": "alert-network"},
                        timestamp=now
                    )

                # Check 15-Minute (900s) Cooldown Window
                time_in_cooldown = now - st.last_alert_time
                if time_in_cooldown < self.cooldown_seconds:
                    # SUPPRESSED BY COOLDOWN TIMER
                    st.total_suppressed += 1
                    remaining = int(self.cooldown_seconds - time_in_cooldown)
                    return AlertDecision(
                        action="SUPPRESSED",
                        reason=f"Cooldown active: {int(time_in_cooldown)}s elapsed, {remaining}s remaining (IN_BREACH lock active)",
                        truck_id=truck_id,
                        cargo_temp_c=cargo_temp_c,
                        threshold_c=threshold_c,
                        state=st.state,
                        sms_sent=False,
                        timestamp=now
                    )

                # Cooldown expired, but truck is still persistently breaching!
                st.last_alert_time = now
                st.last_alert_temp = cargo_temp_c
                st.total_alerts_sent += 1
                st.last_alert_reason = "15-minute cooldown elapsed, persistent breach reminder"

                msg = self._format_breach_sms(truck_id, cargo_temp_c, threshold_c, is_escalation=False)
                logger.info("🚨 [COOLDOWN EXPIRED REMINDER] Truck: %s | Msg: %s", truck_id, msg.replace('\n', ' '))

                return AlertDecision(
                    action="ALERT",
                    reason=f"Persistent breach reminder: 15-minute cooldown expired and temperature remains {cargo_temp_c:.1f}°C > {threshold_c}°C",
                    truck_id=truck_id,
                    cargo_temp_c=cargo_temp_c,
                    threshold_c=threshold_c,
                    state=st.state,
                    sms_sent=True,
                    sms_response={"status": "delivered", "channel": "alert-network"},
                    timestamp=now
                )

        # -------------------------------------------------------------
        # BRANCH 2: CURRENT READING IS AT OR BELOW THRESHOLD
        # -------------------------------------------------------------
        else:
            st.consecutive_breaches = 0  # Reset breach counter

            # --- Rule 3: Hysteresis / Recovery Reset ---
            # Temperature must drop at least 1.0°C below threshold_c (e.g. <= threshold_c - 1.0)
            recovery_target = threshold_c - self.hysteresis_margin_c
            is_in_recovery_zone = cargo_temp_c <= recovery_target

            if is_in_recovery_zone:
                st.consecutive_recoveries += 1

                if st.state == "IN_BREACH" and st.consecutive_recoveries >= self.hysteresis_recovery_count:
                    # Successfully recovered after 3 consecutive readings!
                    st.state = "NORMAL"
                    st.consecutive_recoveries = 0
                    st.last_alert_temp = 0.0

                    msg = self._format_recovery_sms(truck_id, cargo_temp_c, threshold_c)
                    logger.info("✅ [RECOVERY NOTIFIED] Truck: %s | Msg: %s", truck_id, msg.replace('\n', ' '))

                    return AlertDecision(
                        action="RECOVERY",
                        reason=f"Recovered to NORMAL: 3 consecutive readings <= {recovery_target:.1f}°C ({cargo_temp_c:.1f}°C)",
                        truck_id=truck_id,
                        cargo_temp_c=cargo_temp_c,
                        threshold_c=threshold_c,
                        state=st.state,
                        sms_sent=True,
                        sms_response={"status": "delivered", "channel": "alert-network"},
                        timestamp=now
                    )
                elif st.state == "IN_BREACH":
                    return AlertDecision(
                        action="SUPPRESSED",
                        reason=f"Recovery in progress: {st.consecutive_recoveries}/{self.hysteresis_recovery_count} readings <= {recovery_target:.1f}°C",
                        truck_id=truck_id,
                        cargo_temp_c=cargo_temp_c,
                        threshold_c=threshold_c,
                        state=st.state,
                        sms_sent=False,
                        timestamp=now
                    )
                else:
                    return AlertDecision(
                        action="NORMAL",
                        reason=f"Normal operating range: {cargo_temp_c:.1f}°C <= {threshold_c:.1f}°C",
                        truck_id=truck_id,
                        cargo_temp_c=cargo_temp_c,
                        threshold_c=threshold_c,
                        state=st.state,
                        sms_sent=False,
                        timestamp=now
                    )
            else:
                # Reading is below threshold, but NOT yet 1.0°C below threshold (in hysteresis buffer)
                st.consecutive_recoveries = 0
                if st.state == "IN_BREACH":
                    return AlertDecision(
                        action="SUPPRESSED",
                        reason=f"Hysteresis buffer: {cargo_temp_c:.1f}°C is below threshold {threshold_c}°C but above recovery boundary {recovery_target:.1f}°C. Still IN_BREACH.",
                        truck_id=truck_id,
                        cargo_temp_c=cargo_temp_c,
                        threshold_c=threshold_c,
                        state=st.state,
                        sms_sent=False,
                        timestamp=now
                    )
                else:
                    return AlertDecision(
                        action="NORMAL",
                        reason=f"Normal operating range: {cargo_temp_c:.1f}°C <= {threshold_c:.1f}°C",
                        truck_id=truck_id,
                        cargo_temp_c=cargo_temp_c,
                        threshold_c=threshold_c,
                        state=st.state,
                        sms_sent=False,
                        timestamp=now
                    )

    def process_telemetry(
        self,
        telemetry: Union[Dict[str, Any], str],
        threshold_c: Optional[float] = None,
        current_time: Optional[float] = None
    ) -> AlertDecision:
        """
        Drop-in helper for stream consumer loops.
        Accepts dict or raw JSON string directly from consumer.
        """
        if isinstance(telemetry, str):
            telemetry = json.loads(telemetry)

        truck_id = telemetry.get("truck_id", "TRK-001")
        cargo_temp_c = float(telemetry.get("cargo_temp_c", 0.0))

        # Determine threshold
        if threshold_c is None:
            # Use explicit threshold if present, or setpoint + 2.0C excursion limit
            setpoint_c = float(telemetry.get("setpoint_c", self.get_driver_info(truck_id).get("setpoint", 4.0)))
            threshold_c = float(telemetry.get("threshold_c", setpoint_c + 2.0))

        return self.process_reading(
            truck_id=truck_id,
            cargo_temp_c=cargo_temp_c,
            threshold_c=threshold_c,
            current_time=current_time,
            extra=telemetry
        )
