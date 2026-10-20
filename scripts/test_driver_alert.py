#!/usr/bin/env python3
"""
Diagnostic CLI: Test Driver 16 (Abhishek Deshmukh) Real-Time Alerts via Discord Webhook

Scenarios available to test:
  1. DOOR_OPEN: Cargo compartment door left unlatched / open in transit (+ thermal breach)
  2. COMPRESSOR_FAIL: Refrigerator compressor failure / severe under-cooling (+5.5°C)
  3. FREEZE_RISK: Refrigerator over-cooling / freeze spoilage (-6.0°C below setpoint)
  4. ALL: Fires each scenario sequentially

Usage:
  python3 scripts/test_driver_alert.py --scenario DOOR_OPEN
  python3 scripts/test_driver_alert.py --scenario COMPRESSOR_FAIL
  python3 scripts/test_driver_alert.py --scenario FREEZE_RISK
  python3 scripts/test_driver_alert.py --scenario ALL
"""

import os
import sys
import argparse
import time

# Add alert-notifier to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "alert-notifier")))

from notifier import FLEET_DRIVERS, dispatch_discord_alert, DISCORD_WEBHOOK_URL

# Driver 16 Info
DRIVER_16 = FLEET_DRIVERS.get("TRK-016", {
    "name": "Abhishek Deshmukh",
    "phone": "+91-90222-90311",
    "cargo": "Vaccines & Pharma",
    "route": "Pune → Mumbai (Expressway)"
})

SCENARIOS = {
    "DOOR_OPEN": {
        "truck_id": "TRK-016",
        "cargo_temp_c": 8.5,
        "setpoint_c": 4.0,
        "excess_temp_c": 4.5,
        "door_open": True,
        "speed_kmph": 64.0,
        "lat": 18.7521,
        "lon": 73.4022,
        "reason": "Cargo compartment door open with rapid thermal loss"
    },
    "COMPRESSOR_FAIL": {
        "truck_id": "TRK-016",
        "cargo_temp_c": 9.8,
        "setpoint_c": 4.0,
        "excess_temp_c": 5.8,
        "door_open": False,
        "speed_kmph": 72.0,
        "lat": 18.8920,
        "lon": 73.2500,
        "reason": "Reefer compressor trip: Severe under-cooling"
    },
    "FREEZE_RISK": {
        "truck_id": "TRK-016",
        "cargo_temp_c": -1.8,
        "setpoint_c": 4.0,
        "excess_temp_c": -5.8,
        "door_open": False,
        "speed_kmph": 58.0,
        "lat": 18.6500,
        "lon": 73.6500,
        "reason": "Thermostat stuck: Severe over-cooling / freeze spoilage risk"
    }
}

def run_test(scenario_name: str, webhook_url: str):
    data = SCENARIOS.get(scenario_name)
    if not data:
        print(f"Unknown scenario: {scenario_name}. Choose from: {list(SCENARIOS.keys())}")
        return False

    print(f"\n📡 Dispatched [{scenario_name}] alert to Driver {DRIVER_16['name']} via Discord Webhook...")
    res = dispatch_discord_alert(
        truck_id=data["truck_id"],
        alert_data=data,
        driver_info=DRIVER_16,
        webhook_url=webhook_url
    )
    if res.get("success"):
        print(f"✅ [SUCCESS] Alert sent to Discord app! Check your Discord channel/phone for notification.")
        return True
    else:
        print(f"❌ [FAILED]: {res.get('error')}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Test Driver 16 Discord Alerts")
    parser.add_argument("--scenario", default="DOOR_OPEN", choices=["DOOR_OPEN", "COMPRESSOR_FAIL", "FREEZE_RISK", "ALL"],
                        help="Scenario to simulate")
    parser.add_argument("--webhook", default=DISCORD_WEBHOOK_URL, help="Discord Webhook URL")
    args = parser.parse_args()

    print("=" * 68)
    print("   🚚 ColdChain Fleet: Driver 16 (Abhishek) Alert Simulator   ")
    print("=" * 68)
    print(f"Target Driver:  {DRIVER_16['name']} ({DRIVER_16['phone']})")
    print(f"Target Vehicle: TRK-016 ({DRIVER_16['cargo']} | {DRIVER_16['route']})")
    print(f"Discord Webhook: {args.webhook[:50]}...")
    print("=" * 68)

    if args.scenario == "ALL":
        for sc in ["DOOR_OPEN", "COMPRESSOR_FAIL", "FREEZE_RISK"]:
            run_test(sc, args.webhook)
            time.sleep(2)
    else:
        run_test(args.scenario, args.webhook)

if __name__ == "__main__":
    main()
