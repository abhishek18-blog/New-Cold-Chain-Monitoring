import os
import gzip
import time
import signal
import logging
from datetime import datetime, timezone
from confluent_kafka import Consumer, KafkaError

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","service":"archiver","msg":"%(message)s"}'
)
logger = logging.getLogger("archiver")

running = True

def handle_shutdown(signum, frame):
    global running
    logger.info("Received signal %s. Shutting down archiver...", signum)
    running = False

signal.signal(signal.SIGTERM, handle_shutdown)
signal.signal(signal.SIGINT, handle_shutdown)

def flush_partition_buffer(base_dir, partition, start_offset, records):
    if not records:
        return
    now = datetime.now(timezone.utc)
    date_path = os.path.join(base_dir, now.strftime("%Y/%m/%d"))
    os.makedirs(date_path, exist_ok=True)

    filename = f"{partition}-{start_offset}.jsonl.gz"
    full_path = os.path.join(date_path, filename)

    logger.info("Flushing %d records for partition %d to %s", len(records), partition, full_path)
    with gzip.open(full_path, "wt", encoding="utf-8") as f:
        for rec in records:
            f.write(rec.strip() + "\n")

def main():
    bootstrap_servers = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "kafka-1:19092,kafka-2:19094")
    kafka_topic = os.environ.get("KAFKA_TOPIC_TELEMETRY", "truck-telemetry")
    group_id = os.environ.get("KAFKA_GROUP_ID", "archiver")
    base_dir = os.environ.get("ARCHIVE_BASE_DIR", "/archive/truck-data")
    flush_records_limit = int(os.environ.get("ARCHIVE_FLUSH_RECORDS", "1000"))
    flush_interval_sec = float(os.environ.get("ARCHIVE_FLUSH_INTERVAL_SEC", "30.0"))

    logger.info("Starting archiver service. Base Dir: %s, Max Records: %d, Interval: %ss",
                base_dir, flush_records_limit, flush_interval_sec)

    conf = {
        'bootstrap.servers': bootstrap_servers,
        'group.id': group_id,
        'auto.offset.reset': 'earliest',
        'enable.auto.commit': False
    }

    consumer = Consumer(conf)
    consumer.subscribe([kafka_topic])

    # Buffers per partition: { partition_id: { "start_offset": int, "records": list, "last_flush_time": float, "last_msg": msg } }
    partition_buffers = {}

    try:
        while running:
            msg = consumer.poll(timeout=1.0)
            now_time = time.time()

            if msg is not None:
                if msg.error():
                    if msg.error().code() != KafkaError._PARTITION_EOF:
                        logger.error("Kafka error in archiver: %s", msg.error())
                else:
                    part = msg.partition()
                    offset = msg.offset()
                    val_str = msg.value().decode('utf-8')

                    if part not in partition_buffers:
                        partition_buffers[part] = {
                            "start_offset": offset,
                            "records": [],
                            "last_flush_time": now_time,
                            "last_msg": msg
                        }

                    buf = partition_buffers[part]
                    if not buf["records"]:
                        buf["start_offset"] = offset

                    buf["records"].append(val_str)
                    buf["last_msg"] = msg

                    if len(buf["records"]) >= flush_records_limit:
                        flush_partition_buffer(base_dir, part, buf["start_offset"], buf["records"])
                        consumer.commit(message=buf["last_msg"], asynchronous=False)
                        buf["records"] = []
                        buf["last_flush_time"] = now_time

            # Periodic time-based flush across all partitions
            for part, buf in list(partition_buffers.items()):
                if buf["records"] and (now_time - buf["last_flush_time"] >= flush_interval_sec):
                    flush_partition_buffer(base_dir, part, buf["start_offset"], buf["records"])
                    consumer.commit(message=buf["last_msg"], asynchronous=False)
                    buf["records"] = []
                    buf["last_flush_time"] = now_time

    finally:
        # Final flush on shutdown
        for part, buf in partition_buffers.items():
            if buf["records"]:
                flush_partition_buffer(base_dir, part, buf["start_offset"], buf["records"])
                try:
                    consumer.commit(message=buf["last_msg"], asynchronous=False)
                except Exception:
                    pass
        consumer.close()
        logger.info("Archiver stopped cleanly.")

if __name__ == "__main__":
    main()
