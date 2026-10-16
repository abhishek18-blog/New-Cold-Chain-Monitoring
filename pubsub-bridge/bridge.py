import os
import signal
import logging
from confluent_kafka import Consumer, KafkaError
from google.cloud import pubsub_v1

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","service":"pubsub-bridge","msg":"%(message)s"}'
)
logger = logging.getLogger("pubsub-bridge")

running = True

def handle_shutdown(signum, frame):
    global running
    logger.info("Received signal %s. Stopping pubsub-bridge...", signum)
    running = False

signal.signal(signal.SIGTERM, handle_shutdown)
signal.signal(signal.SIGINT, handle_shutdown)

def main():
    bootstrap_servers = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "kafka-1:19092,kafka-2:19094")
    kafka_topic = os.environ.get("KAFKA_TOPIC_TELEMETRY", "truck-telemetry")
    group_id = os.environ.get("KAFKA_GROUP_ID", "pubsub-bridge")

    project_id = os.environ.get("GCP_PROJECT_ID", "coldchain-local")
    pubsub_topic_id = os.environ.get("PUBSUB_TOPIC", "telemetry-topic")

    logger.info("Starting pubsub-bridge. Kafka: %s (topic: %s, group: %s) -> Pub/Sub: %s (topic: %s)",
                bootstrap_servers, kafka_topic, group_id, os.environ.get("PUBSUB_EMULATOR_HOST", "GCP"), pubsub_topic_id)

    # Initialize PubSub Publisher with high-throughput batch settings
    publisher = pubsub_v1.PublisherClient(
        batch_settings=pubsub_v1.types.BatchSettings(
            max_messages=500,
            max_bytes=1024 * 1024,
            max_latency=0.02
        )
    )
    topic_path = publisher.topic_path(project_id, pubsub_topic_id)

    # Initialize Kafka Consumer
    conf = {
        'bootstrap.servers': bootstrap_servers,
        'group.id': group_id,
        'auto.offset.reset': 'earliest',
        'enable.auto.commit': False
    }

    consumer = Consumer(conf)
    consumer.subscribe([kafka_topic])

    BATCH_SIZE = 200

    try:
        while running:
            # FIX M2: Consume in batches instead of 1-by-1 synchronous blocking
            msgs = consumer.consume(num_messages=BATCH_SIZE, timeout=0.2)
            if not msgs:
                continue

            futures = []
            for msg in msgs:
                if msg.error():
                    if msg.error().code() == KafkaError._PARTITION_EOF:
                        continue
                    else:
                        logger.error("Kafka error: %s", msg.error())
                        continue

                data = msg.value()
                key_str = msg.key().decode('utf-8') if msg.key() else ""
                future = publisher.publish(topic_path, data=data, truck_id=key_str)
                futures.append(future)

            # Wait for all published batch futures to ensure delivery before offset commit
            for future in futures:
                try:
                    future.result(timeout=10.0)
                except Exception as e:
                    logger.error("Failed to publish message in batch to Pub/Sub: %s", e)

            # Commit offsets for the entire processed batch
            if futures:
                try:
                    consumer.commit(asynchronous=False)
                except Exception as e:
                    logger.error("Failed to commit Kafka offset: %s", e)
    finally:
        logger.info("Closing Kafka consumer...")
        consumer.close()
        logger.info("pubsub-bridge terminated cleanly.")

if __name__ == "__main__":
    main()
