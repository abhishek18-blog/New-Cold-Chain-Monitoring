#!/usr/bin/env python3
"""
ColdChain Fleet: High-Speed Dataset Replayer for Kafka Pipeline Testing
Streams records from shipment-sensor-dataset.csv directly into Kafka at configurable throughput.

Usage:
  # Run inside Docker container (recommended):
  docker compose exec telemetry-generator python /app/scripts/replay_dataset.py --rate 250

  # Unthrottled maximum burst test:
  docker compose exec telemetry-generator python /app/scripts/replay_dataset.py --rate 0

  # Send first 5,000 records:
  docker compose exec telemetry-generator python /app/scripts/replay_dataset.py --limit 5000
"""

import os
import sys
import csv
import time
import argparse
import logging
from collections import defaultdict
from datetime import datetime, timezone
from confluent_kafka import Producer

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger("dataset-replayer")

# Default search paths for dataset
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

def delivery_report(err, msg, counters):
    if err is not None:
        counters['errors'] += 1
        logger.error("Message delivery failed: %s", err)
    else:
        counters['delivered'] += 1
        counters['partitions'][msg.partition()] += 1

def main():
    parser = argparse.ArgumentParser(description="Replay shipment-sensor-dataset.csv into Kafka at high speed")
    parser.add_argument("--file", "-f", default=None, help="Path to dataset CSV")
    parser.add_argument("--rate", "-r", type=float, default=250.0, help="Target messages/second (0 for unthrottled burst)")
    parser.add_argument("--limit", "-l", type=int, default=0, help="Limit number of rows (0 for all)")
    parser.add_argument("--bootstrap", "-b", default=None, help="Kafka bootstrap servers")
    parser.add_argument("--topic", "-t", default="truck-telemetry", help="Kafka topic name")
    parser.add_argument("--keep-original-ts", action="store_true", help="Keep historical timestamps (default: generate fresh UTC ISO timestamps)")
    args = parser.parse_args()

    # Locate dataset
    csv_path = args.file or find_dataset()
    if not csv_path:
        logger.error("Could not find shipment-sensor-dataset.csv. Please specify with --file.")
        sys.exit(1)

    # Determine Kafka bootstrap servers
    bootstrap = args.bootstrap or os.environ.get("KAFKA_BOOTSTRAP_SERVERS")
    if not bootstrap:
        # Default based on whether running in container or host
        if os.path.exists("/.dockerenv"):
            bootstrap = "kafka-1:19092,kafka-2:19094"
        else:
            bootstrap = "localhost:9092,localhost:9094"

    logger.info("=" * 68)
    logger.info("   ColdChain Fleet: High-Speed Kafka Pipeline Ingestion Benchmark   ")
    logger.info("=" * 68)
    logger.info("Dataset:          %s", csv_path)
    logger.info("Kafka Brokers:    %s", bootstrap)
    logger.info("Kafka Topic:      %s", args.topic)
    logger.info("Target Rate:      %s msgs/sec", f"{args.rate:.1f}" if args.rate > 0 else "UNTHROTTLED (MAX SPEED)")
    logger.info("Timestamps:       %s", "Original CSV" if args.keep_original_ts else "Fresh UTC ISO (Live-compatible)")
    logger.info("=" * 68)

    # Initialize Producer with high throughput buffer
    conf = {
        'bootstrap.servers': bootstrap,
        'client.id': 'benchmark-dataset-replayer',
        'acks': 'all',
        'enable.idempotence': True,
        'retries': 5,
        'queue.buffering.max.messages': 200000,
        'queue.buffering.max.kbytes': 102400,
        'batch.num.messages': 500,
        'linger.ms': 10
    }

    try:
        producer = Producer(conf)
    except Exception as e:
        logger.error("Failed to connect to Kafka producer: %s", e)
        sys.exit(1)

    counters = {
        'delivered': 0,
        'errors': 0,
        'partitions': defaultdict(int)
    }

    # Read and parse CSV
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    total_available = len(rows)
    to_send = rows[:args.limit] if args.limit > 0 else rows
    total_to_send = len(to_send)

    logger.info("Loaded %d records. Beginning high-speed ingestion...", total_to_send)

    start_time = time.time()
    last_report_time = start_time
    last_report_count = 0
    delay_per_msg = (1.0 / args.rate) if args.rate > 0 else 0.0

    for idx, row in enumerate(to_send, start=1):
        truck_id = row['truck_id']
        
        # Prepare timestamp
        if args.keep_original_ts:
            ts = row.get('timestamp') or datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        else:
            ts = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

        # Clean mapping matching TruckTelemetry / TelemetryMessage schema
        try:
            cargo_temp = float(row.get('reefer_temp_c', 4.0))
            setpoint = float(row.get('setpoint_temp_c', 4.0))
            lat = round(float(row.get('latitude', 19.0760)), 6)
            lon = round(float(row.get('longitude', 72.8777)), 6)
            door = str(row.get('door_open', 'False')).lower() in ('true', '1')
            
            # Speed approximation from vibration index or default 62 km/h
            vib = float(row.get('vibration_index', 1.2))
            speed = round(min(95.0, max(30.0, vib * 48.0)), 1)
            fuel = round(max(15.0, 95.0 - (idx % 1600) * 0.05), 1)

            import json
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

            while True:
                try:
                    producer.produce(
                        topic=args.topic,
                        key=truck_id.encode('utf-8'),
                        value=payload.encode('utf-8'),
                        callback=lambda err, msg: delivery_report(err, msg, counters)
                    )
                    break
                except BufferError:
                    producer.poll(0.2)

        except Exception as e:
            counters['errors'] += 1
            logger.warning("Error serializing row %d: %s", idx, e)

        # Service Kafka delivery callbacks
        if idx % 100 == 0:
            producer.poll(0)

        # Periodic progress report every 1,000 records or 2 seconds
        curr_time = time.time()
        if idx % 1000 == 0 or idx == total_to_send or (curr_time - last_report_time) >= 2.0:
            elapsed_interval = curr_time - last_report_time
            rate_interval = (idx - last_report_count) / max(0.001, elapsed_interval)
            pct = (idx / total_to_send) * 100
            
            p_str = " | ".join(f"P{p}: {c}" for p, c in sorted(counters['partitions'].items()))
            logger.info("Ingesting: %6d / %6d (%5.1f%%) | Rate: %6.1f msg/s | %s",
                        idx, total_to_send, pct, rate_interval, p_str or "Buffering...")
            last_report_time = curr_time
            last_report_count = idx

        # Rate pacing
        if delay_per_msg > 0:
            expected_time = start_time + (idx * delay_per_msg)
            sleep_time = expected_time - time.time()
            if sleep_time > 0:
                time.sleep(sleep_time)

    logger.info("All %d records dispatched to Kafka buffer. Flushing remaining messages...", total_to_send)
    producer.flush(30)
    total_elapsed = time.time() - start_time
    avg_rate = total_to_send / max(0.001, total_elapsed)

    logger.info("=" * 68)
    logger.info("                     BENCHMARK SUMMARY REPORT                       ")
    logger.info("=" * 68)
    logger.info("Total Records Ingested: %d", total_to_send)
    logger.info("Total Time Elapsed:     %.2f seconds", total_elapsed)
    logger.info("Average Ingestion Rate: %.1f messages/second", avg_rate)
    logger.info("Delivered Receipts:     %d", counters['delivered'])
    logger.info("Delivery Errors:        %d", counters['errors'])
    logger.info("Partition Distribution:")
    for part, cnt in sorted(counters['partitions'].items()):
        p_pct = (cnt / max(1, counters['delivered'])) * 100
        logger.info("  Partition %d: %6d msgs (%5.1f%%)", part, cnt, p_pct)
    logger.info("=" * 68)
    logger.info("✅ High-speed replay test completed successfully!")

if __name__ == "__main__":
    main()
