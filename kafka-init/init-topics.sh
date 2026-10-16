#!/bin/bash
set -e

BOOTSTRAP_SERVERS=${KAFKA_BOOTSTRAP_SERVERS:-"kafka-1:19092,kafka-2:19094"}

echo "[kafka-init] Waiting for Kafka cluster to become available at ${BOOTSTRAP_SERVERS}..."

MAX_RETRIES=30
RETRY_COUNT=0

until /opt/kafka/bin/kafka-topics.sh --bootstrap-server "${BOOTSTRAP_SERVERS}" --list > /dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT+1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "[kafka-init] Timed out waiting for Kafka cluster."
        exit 1
    fi
    echo "[kafka-init] Kafka not ready yet... retry ${RETRY_COUNT}/${MAX_RETRIES}"
    sleep 2
done

echo "[kafka-init] Kafka cluster is healthy! Creating topics..."

# Create truck-telemetry (3 partitions, RF 2)
/opt/kafka/bin/kafka-topics.sh --bootstrap-server "${BOOTSTRAP_SERVERS}" \
    --create --if-not-exists \
    --topic truck-telemetry \
    --partitions 3 \
    --replication-factor 2

# Create truck-telemetry-dlq (1 partition, RF 2)
/opt/kafka/bin/kafka-topics.sh --bootstrap-server "${BOOTSTRAP_SERVERS}" \
    --create --if-not-exists \
    --topic truck-telemetry-dlq \
    --partitions 1 \
    --replication-factor 2

echo "[kafka-init] Current topics on cluster:"
/opt/kafka/bin/kafka-topics.sh --bootstrap-server "${BOOTSTRAP_SERVERS}" --describe

echo "[kafka-init] Topics created successfully!"
