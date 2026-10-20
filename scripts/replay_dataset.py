#!/usr/bin/env python3
"""
ColdChain Fleet: High-Speed Dataset Replayer for Cloud Pub/Sub Pipeline Testing
Streams records from shipment-sensor-dataset.csv directly into Google Cloud Pub/Sub.

Usage:
  # Stream at 250 msg/s:
  python3 scripts/replay_dataset.py --rate 250

  # Unthrottled maximum burst test:
  python3 scripts/replay_dataset.py --rate 0

  # Send first 5,000 records:
  python3 scripts/replay_dataset.py --limit 5000
"""

import os
import sys
import csv
import time
import json
import argparse
import logging
from collections import defaultdict
from datetime import datetime, timezone
from google.cloud import pubsub_v1

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger("dataset-replayer")

DATASET_PATHS = [
    os.environ.get("DATASET_CSV_PATH", ""),
    "/app/dataset.csv",
    "./data/shipment-sensor-dataset.csv",
    "../data/shipment-sensor-dataset.csv",
    "./shipment-sensor-dataset.csv",
    "../shipment-sensor-dataset.csv"
]

def find_dataset():
    for p in DATASET_PATHS:
        if p and os.path.exists(p):
            return p
    return None

def main():
    parser = argparse.ArgumentParser(description="Replay shipment-sensor-dataset.csv into Cloud Pub/Sub at high speed")
    parser.add_argument("--file", "-f", default=None, help="Path to dataset CSV")
    parser.add_argument("--rate", "-r", type=float, default=250.0, help="Target messages/second (0 for unthrottled burst)")
    parser.add_argument("--limit", "-l", type=int, default=0, help="Limit number of rows (0 for all)")
    parser.add_argument("--project", "-p", default=None, help="GCP Project ID")
    parser.add_argument("--topic", "-t", default="telemetry-topic", help="Pub/Sub topic name")
    parser.add_argument("--keep-original-ts", action="store_true", help="Keep historical timestamps")
    args = parser.parse_args()

    csv_path = args.file or find_dataset()
    if not csv_path:
        logger.error("Could not find shipment-sensor-dataset.csv. Please specify with --file.")
        sys.exit(1)

    project_id = args.project or os.environ.get("GCP_PROJECT_ID", "coldchain-local")
    publisher = pubsub_v1.PublisherClient()
    topic_path = publisher.topic_path(project_id, args.topic)

    logger.info("Initializing Pub/Sub Replayer -> Project: %s, Topic: %s", project_id, topic_path)
    logger.info("Reading dataset from: %s", csv_path)

    rows = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)

    total_available = len(rows)
    to_send = rows[:args.limit] if args.limit > 0 else rows
    total_to_send = len(to_send)
    logger.info("Loaded %d rows from CSV. Preparing to stream %d records (Rate: %s msg/s)...",
                total_available, total_to_send, f"{args.rate}" if args.rate > 0 else "MAX BURST")

    counters = {'delivered': 0, 'errors': 0}
    start_time = time.time()
    last_report_time = start_time
    last_report_count = 0
    delay_per_msg = (1.0 / args.rate) if args.rate > 0 else 0.0

    for idx, row in enumerate(to_send, start=1):
        truck_id = row['truck_id']
        ts = row.get('timestamp') if args.keep_original_ts else datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

        try:
            cargo_temp = float(row.get('reefer_temp_c', 4.0))
            setpoint = float(row.get('setpoint_temp_c', 4.0))
            lat = round(float(row.get('latitude', 19.0760)), 6)
            lon = round(float(row.get('longitude', 72.8777)), 6)
            door = str(row.get('door_open', 'False')).lower() in ('true', '1')
            vib = float(row.get('vibration_index', 1.2))
            speed = round(min(95.0, max(30.0, vib * 48.0)), 1)
            fuel = round(max(15.0, 95.0 - (idx % 1600) * 0.05), 1)

            payload = json.dumps({
                "truck_id": truck_id,
                "ts": ts,
                "lat": lat,
                "lon": lon,
                "speed_kmph": speed,
                "fuel_pct": fuel,
                "cargo_temp_c": round(cargo_temp, 2),
                "setpoint_c": round(setpoint, 2),
                "door_open": door
            })

            publisher.publish(topic_path, data=payload.encode('utf-8'), truck_id=truck_id)
            counters['delivered'] += 1
        except Exception as e:
            counters['errors'] += 1
            logger.warning("Error publishing row %d: %s", idx, e)

        curr_time = time.time()
        if idx % 1000 == 0 or idx == total_to_send or (curr_time - last_report_time) >= 2.0:
            elapsed_interval = curr_time - last_report_time
            rate_interval = (idx - last_report_count) / max(0.001, elapsed_interval)
            pct = (idx / total_to_send) * 100
            logger.info("Ingesting: %6d / %6d (%5.1f%%) | Rate: %6.1f msg/s",
                        idx, total_to_send, pct, rate_interval)
            last_report_time = curr_time
            last_report_count = idx

        if delay_per_msg > 0:
            expected_elapsed = idx * delay_per_msg
            actual_elapsed = time.time() - start_time
            sleep_time = expected_elapsed - actual_elapsed
            if sleep_time > 0.0005:
                time.sleep(sleep_time)

    total_time = time.time() - start_time
    avg_rate = counters['delivered'] / max(0.001, total_time)
    logger.info("==================================================================")
    logger.info("REPLAY COMPLETED TO GOOGLE CLOUD PUB/SUB")
    logger.info("Total Delivered: %d | Errors: %d | Time: %.2fs | Avg Rate: %.1f msg/s",
                counters['delivered'], counters['errors'], total_time, avg_rate)
    logger.info("==================================================================")

if __name__ == "__main__":
    main()
