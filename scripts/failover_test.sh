#!/usr/bin/env bash
set -e

echo "=================================================================="
echo "      ColdChain Fleet: Kafka High-Availability Failover Test       "
echo "=================================================================="

echo ""
echo ">>> [1/6] Inspecting initial Kafka cluster topic status..."
docker compose exec kafka-2 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server kafka-2:19094 \
  --topic truck-telemetry \
  --describe

echo ""
echo ">>> [2/6] Querying current dashboard telemetry timestamp..."
INITIAL_TS=$(curl -s http://localhost:8000/api/trucks | grep -o '"last_ts":"[^"]*"' | head -n 1 || echo "none")
echo "Initial Sample Timestamp: $INITIAL_TS"

echo ""
echo ">>> [3/6] Simulating catastrophic failure: Stopping broker 'kafka-1'..."
docker compose stop kafka-1
echo "Broker 'kafka-1' is STOPPED."

echo ""
echo ">>> [4/6] Inspecting ISR and partition leader failover to 'kafka-2'..."
sleep 3
docker compose exec kafka-2 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server kafka-2:19094 \
  --topic truck-telemetry \
  --describe

echo ""
echo ">>> [5/6] Waiting 30 seconds to verify pipeline continues flowing through surviving broker..."
for i in {1..6}; do
  echo "  ...streaming data through kafka-2 ($((i*5))s / 30s)"
  sleep 5
done

LATER_TS=$(curl -s http://localhost:8000/api/trucks | grep -o '"last_ts":"[^"]*"' | head -n 1 || echo "none")
echo "Later Sample Timestamp: $LATER_TS"

if [ "$INITIAL_TS" != "$LATER_TS" ] && [ -n "$LATER_TS" ]; then
  echo "✅ SUCCESS: Telemetry stream kept advancing during broker outage!"
else
  echo "⚠️ WARNING: Timestamps did not advance as expected. Check logs."
fi

echo ""
echo ">>> [6/6] Restarting 'kafka-1' and verifying cluster re-sync..."
docker compose start kafka-1
echo "Waiting for kafka-1 to rejoin ISR..."
sleep 10

docker compose exec kafka-2 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server kafka-2:19094 \
  --topic truck-telemetry \
  --describe

echo ""
echo "=================================================================="
echo "           ✅ Kafka Broker Failover Test Completed!               "
echo "=================================================================="
