#!/usr/bin/env python3
"""
ColdChain Fleet: High-Speed Cloud Pub/Sub Telemetry Blaster
Streams high-velocity telemetry (up to 1,000+ msgs/sec) directly into Google Cloud Pub/Sub.

Usage:
  python3 scripts/blast_telemetry.py --rate 1000 --duration 10
  python3 scripts/blast_telemetry.py --rate 1000 # runs continuously until Ctrl+C
"""

import os
import sys
import time
import json
import random
import argparse
import logging
from datetime import datetime, timezone

try:
    from google.cloud import pubsub_v1
except ImportError:
    pubsub_v1 = None

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger("pubsub-blaster")

TRUCK_ROUTES = {
    "TRK-001": {"sp": 4.0, "route": "Goa → Mumbai", "waypoints": [(15.4909, 73.8278), (15.8647, 73.8234), (16.1558, 73.7124), (16.9902, 73.3120), (17.5450, 73.4867), (18.2324, 73.4456), (18.7521, 73.1022), (19.0760, 72.8777)]},
    "TRK-002": {"sp": 4.0, "route": "Delhi → Nagpur", "waypoints": [(28.6139, 77.2090), (27.4924, 77.6737), (27.1767, 78.0081), (26.2183, 78.1828), (25.4484, 78.5685), (23.8388, 78.7378), (21.8974, 77.9068), (21.1458, 79.0882)]},
    "TRK-003": {"sp": -18.0, "route": "Kochi → Pondicherry", "waypoints": [(9.9312, 76.2673), (10.5276, 76.2144), (10.7867, 76.6548), (11.0168, 76.9558), (11.3410, 77.7172), (11.6643, 78.1460), (11.9416, 79.8083)]},
    "TRK-004": {"sp": 4.0, "route": "Pune → Nashik", "waypoints": [(18.5204, 73.8567), (18.7180, 73.8820), (19.0144, 73.9450), (19.2312, 73.9780), (19.5312, 74.0210), (19.7890, 73.9120), (19.9975, 73.7898)]},
    "TRK-005": {"sp": 2.0, "route": "Noida → Indore", "waypoints": [(28.5355, 77.3910), (27.1767, 78.0081), (26.2183, 78.1828), (25.4244, 77.6593), (24.6465, 77.3164), (23.7167, 76.9167), (23.1765, 75.7885), (22.7196, 75.8577)]},
    "TRK-006": {"sp": 4.0, "route": "Bengaluru → Chennai", "waypoints": [(12.9716, 77.5946), (12.7409, 77.8253), (12.5186, 78.2137), (12.8996, 79.0967), (13.0827, 80.2707)]},
    "TRK-007": {"sp": 3.0, "route": "Ahmedabad → Surat", "waypoints": [(23.0225, 72.5714), (22.6916, 72.8634), (22.3072, 73.1812), (21.7051, 72.9959), (21.1702, 72.8311)]},
    "TRK-008": {"sp": -20.0, "route": "Kolkata → Bhubaneswar", "waypoints": [(22.5726, 88.3639), (22.4257, 87.3199), (21.9322, 86.7444), (20.9467, 86.1432), (20.2961, 85.8245)]},
    "TRK-009": {"sp": 5.0, "route": "Chandigarh → Amritsar", "waypoints": [(30.7333, 76.7794), (30.9010, 75.8573), (31.3260, 75.5762), (31.6340, 74.8723)]},
    "TRK-010": {"sp": 4.0, "route": "Hyderabad → Vijayawada", "waypoints": [(17.3850, 78.4867), (17.0544, 79.2671), (16.9891, 80.0031), (16.7850, 80.8450), (16.5062, 80.6480)]},
    "TRK-011": {"sp": 4.0, "route": "Jaipur → Agra", "waypoints": [(26.9124, 75.7873), (26.9880, 76.3540), (27.0560, 76.9980), (27.1767, 78.0081)]},
    "TRK-012": {"sp": 2.0, "route": "Lucknow → Varanasi", "waypoints": [(26.8467, 80.9462), (26.2637, 82.0726), (26.1445, 82.5712), (25.3176, 82.9739)]},
    "TRK-013": {"sp": -18.0, "route": "Guwahati → Shillong", "waypoints": [(26.1445, 91.7362), (25.9080, 91.8670), (25.6890, 91.9050), (25.5788, 91.8933)]},
    "TRK-014": {"sp": 4.0, "route": "Bhopal → Jabalpur", "waypoints": [(23.2599, 77.4126), (23.0850, 78.2120), (23.1230, 79.1450), (23.1815, 79.9864)]},
    "TRK-015": {"sp": -22.0, "route": "Mangaluru → Udupi", "waypoints": [(12.9141, 74.8560), (13.0980, 74.7920), (13.2240, 74.7650), (13.3409, 74.7421)]},
    "TRK-016": {"sp": 4.0, "route": "Pune → Mumbai", "waypoints": [(18.5204, 73.8567), (18.7521, 73.4022), (18.9890, 73.1120), (19.0760, 72.8777)]}
}

def interpolate(waypoints, progress):
    n = len(waypoints) - 1
    if n <= 0: return waypoints[0]
    scaled = (progress % 1.0) * n
    idx = min(int(scaled), n - 1)
    seg_fraction = scaled - idx
    p1 = waypoints[idx]
    p2 = waypoints[idx + 1]
    lat = p1[0] + seg_fraction * (p2[0] - p1[0])
    lon = p1[1] + seg_fraction * (p2[1] - p1[1])
    return lat, lon

def main():
    parser = argparse.ArgumentParser(description="Blast synthetic cold-chain telemetry into Pub/Sub at high throughput")
    parser.add_argument("--rate", type=int, default=1000, help="Target messages/second (default: 1000)")
    parser.add_argument("--duration", type=int, default=0, help="Duration in seconds (0 = continuous)")
    parser.add_argument("--project", default=None, help="GCP project ID")
    parser.add_argument("--topic", default="telemetry-topic", help="Pub/Sub topic name")
    parser.add_argument("--dry-run", action="store_true", help="Run throughput benchmark locally in dry-run mode")
    args = parser.parse_args()

    project_id = args.project or os.environ.get("GCP_PROJECT_ID", "coldchain-local")
    if args.dry_run or pubsub_v1 is None:
        class MockPublisher:
            def publish(self, topic, data=b"", **attrs):
                pass
            def topic_path(self, proj, top):
                return f"projects/{proj}/topics/{top} [local benchmark]"
        publisher = MockPublisher()
        topic_path = publisher.topic_path(project_id, args.topic)
        logger.info("⚡ BENCHMARK MODE: Profiling telemetry generator throughput to %s", topic_path)
    else:
        publisher = pubsub_v1.PublisherClient()
        topic_path = publisher.topic_path(project_id, args.topic)

    logger.info("Initializing Pub/Sub Blaster -> Project: %s, Topic: %s", project_id, topic_path)
    logger.info("Target Rate: %d msg/s | Duration: %s", args.rate, f"{args.duration}s" if args.duration > 0 else "Continuous (Ctrl+C to stop)")

    truck_ids = list(TRUCK_ROUTES.keys())
    progress_map = {tid: (i * 0.065) % 1.0 for i, tid in enumerate(truck_ids)}

    batch_size = max(10, args.rate // 40)
    sleep_interval = 1.0 / (args.rate / batch_size)

    total_sent = 0
    start_time = time.time()
    last_report = start_time
    sent_in_window = 0

    try:
        while True:
            t0 = time.time()
            if args.duration > 0 and (t0 - start_time) >= args.duration:
                break

            now_iso = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

            for _ in range(batch_size):
                tid = random.choice(truck_ids)
                prof = TRUCK_ROUTES[tid]
                sp = prof["sp"]

                progress_map[tid] = (progress_map[tid] + 0.0008) % 1.0
                lat, lon = interpolate(prof["waypoints"], progress_map[tid])

                cargo_temp = round(sp + random.uniform(-0.4, 0.8), 2)
                speed = round(random.uniform(55.0, 75.0), 1)
                fuel = round(random.uniform(65.0, 95.0), 1)

                payload = {
                    "truck_id": tid,
                    "ts": now_iso,
                    "lat": round(lat, 6),
                    "lon": round(lon, 6),
                    "speed_kmph": speed,
                    "fuel_pct": fuel,
                    "cargo_temp_c": cargo_temp,
                    "setpoint_c": sp,
                    "door_open": False
                }

                publisher.publish(topic_path, data=json.dumps(payload).encode('utf-8'), truck_id=tid)
                sent_in_window += 1
                total_sent += 1

            elapsed = time.time() - t0
            to_sleep = max(0.0, sleep_interval - elapsed)
            if to_sleep > 0:
                time.sleep(to_sleep)

            now = time.time()
            if now - last_report >= 1.0:
                dt = now - last_report
                rate = sent_in_window / dt
                logger.info("⚡ Ingestion rate: %.1f msg/s | Total produced: %d msgs", rate, total_sent)
                last_report = now
                sent_in_window = 0

    except KeyboardInterrupt:
        logger.info("Interrupted by user.")
    finally:
        total_time = max(0.1, time.time() - start_time)
        logger.info("Blast finished: %d messages published to Pub/Sub in %.1fs (avg %.1f msg/s)",
                    total_sent, total_time, total_sent / total_time)

if __name__ == "__main__":
    main()
