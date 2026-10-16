import os
import time
import json
import signal
import logging
from datetime import datetime, timezone
from google.cloud import pubsub_v1
from google.cloud import firestore
from pydantic import ValidationError
from confluent_kafka import Producer

from models import TelemetryMessage
from processing import classify, should_update_live_status, should_generate_alert

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","service":"processor","msg":"%(message)s"}'
)
logger = logging.getLogger("processor")

running = True

# FIX C3: Track per-message nack retry counts to prevent infinite nack loops.
# A persistently failing message that always raises an unexpected exception would
# otherwise be nacked forever, stalling the consumer. After MAX_NACK_RETRIES
# failures the raw bytes are routed to the DLQ and the message is acked.
MAX_NACK_RETRIES = 5
_nack_retry_counts: dict = {}

def handle_shutdown(signum, frame):
    global running
    logger.info("Received signal %s. Shutting down processor...", signum)
    running = False

signal.signal(signal.SIGTERM, handle_shutdown)
signal.signal(signal.SIGINT, handle_shutdown)

def send_to_dlq(producer, dlq_topic, raw_data, err_reason):
    if producer and dlq_topic:
        try:
            dlq_payload = json.dumps({
                "raw": raw_data.decode('utf-8', errors='replace'),
                "error": str(err_reason),
                "failed_at": datetime.now(timezone.utc).isoformat()
            })
            producer.produce(dlq_topic, value=dlq_payload.encode('utf-8'))
            producer.poll(0)
        except Exception as e:
            logger.error("Failed to route invalid message to Kafka DLQ: %s", e)

def process_message(db, msg_payload: TelemetryMessage, alerts_publisher=None, alerts_topic_path=None):
    """
    Firestore update with timestamp guard and alert generation.
    Handles optimistic concurrency safely without pessimistic emulator lock timeouts.
    Publishes alert events to alerts-topic for downstream driver/fleet notifications.
    """
    truck_id = msg_payload.truck_id
    doc_ref = db.collection("live_status").document(truck_id)
    alerts_col = db.collection("alerts")

    status, excess, reason = classify(
        cargo_temp_c=msg_payload.cargo_temp_c,
        setpoint_c=msg_payload.setpoint_c,
        door_open=msg_payload.door_open
    )

    try:
        snapshot = doc_ref.get()
        existing_data = snapshot.to_dict() if snapshot.exists else None
    except Exception:
        existing_data = None

    existing_ts = existing_data.get("last_ts") if existing_data else None
    prev_status = existing_data.get("status") if existing_data else None

    if not should_update_live_status(msg_payload.ts, existing_ts):
        logger.warning("Ignoring out-of-order/duplicate telemetry for %s (incoming: %s <= existing: %s)",
                       truck_id, msg_payload.ts, existing_ts)
        return False

    updated_record = {
        "truck_id": truck_id,
        "last_ts": msg_payload.ts,
        "lat": msg_payload.lat,
        "lon": msg_payload.lon,
        "speed_kmph": msg_payload.speed_kmph,
        "fuel_pct": msg_payload.fuel_pct,
        "cargo_temp_c": msg_payload.cargo_temp_c,
        "setpoint_c": msg_payload.setpoint_c,
        "door_open": msg_payload.door_open,
        "status": status,
        "excess_temp_c": excess,
        "status_reason": reason,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    doc_ref.set(updated_record)

    if should_generate_alert(prev_status, status):
        alert_payload = {
            "truck_id": truck_id,
            "ts": msg_payload.ts,
            "status": status,
            "cargo_temp_c": msg_payload.cargo_temp_c,
            "setpoint_c": msg_payload.setpoint_c,
            "excess_temp_c": excess,
            "door_open": msg_payload.door_open,
            "speed_kmph": msg_payload.speed_kmph,
            "lat": msg_payload.lat,
            "lon": msg_payload.lon,
            "reason": reason,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        # 1. Store in Firestore audit collection
        alerts_col.add(alert_payload)
        logger.info("🚨 Generated ALERT for %s: %s (Cargo: %.1f°C, Setpoint: %.1f°C, Door: %s)",
                    truck_id, reason, msg_payload.cargo_temp_c, msg_payload.setpoint_c, msg_payload.door_open)

        # 2. Publish to alerts-topic for decoupled driver notification service
        if alerts_publisher and alerts_topic_path:
            try:
                alert_bytes = json.dumps(alert_payload).encode('utf-8')
                alerts_publisher.publish(alerts_topic_path, data=alert_bytes)
                logger.info("📢 Dispatched alert to %s for %s", alerts_topic_path, truck_id)
            except Exception as pe:
                logger.error("Failed to publish alert event to %s: %s", alerts_topic_path, pe)

    return True

def start_health_server():
    """Lightweight HTTP server on $PORT for Cloud Run container liveness probe."""
    port_str = os.environ.get("PORT")
    if not port_str:
        return
    import threading
    from http.server import HTTPServer, BaseHTTPRequestHandler

    class HealthHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"OK")
        def log_message(self, format, *args):
            pass

    try:
        server = HTTPServer(("0.0.0.0", int(port_str)), HealthHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        logger.info("Health probe server listening on port %s for Cloud Run", port_str)
    except Exception as e:
        logger.warning("Could not start health server on port %s: %s", port_str, e)

def main():
    start_health_server()
    project_id = os.environ.get("GCP_PROJECT_ID", "coldchain-local")
    sub_id = os.environ.get("PUBSUB_SUB", "telemetry-sub")
    alerts_topic_id = os.environ.get("PUBSUB_ALERTS_TOPIC", "alerts-topic")
    dlq_topic = os.environ.get("KAFKA_TOPIC_DLQ", "truck-telemetry-dlq")
    kafka_servers = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "kafka-1:19092,kafka-2:19094")

    logger.info("Starting processor service for subscription %s (Project: %s)", sub_id, project_id)

    # Initialize Firestore Client
    db = firestore.Client(project=project_id)

    # Initialize Alerts Publisher for Driver Notification fan-out
    alerts_publisher = pubsub_v1.PublisherClient()
    alerts_topic_path = alerts_publisher.topic_path(project_id, alerts_topic_id)

    # Optional Kafka producer for DLQ
    try:
        dlq_producer = Producer({'bootstrap.servers': kafka_servers, 'client.id': 'processor-dlq'})
    except Exception:
        dlq_producer = None

    subscriber = pubsub_v1.SubscriberClient()
    sub_path = subscriber.subscription_path(project_id, sub_id)

    def callback(message: pubsub_v1.subscriber.message.Message):
        raw_bytes = message.data
        msg_id = message.message_id  # unique per Pub/Sub message
        try:
            raw_dict = json.loads(raw_bytes.decode('utf-8'))
            telemetry_obj = TelemetryMessage(**raw_dict)
            process_message(db, telemetry_obj, alerts_publisher=alerts_publisher, alerts_topic_path=alerts_topic_path)
            # Successful — clean up any retry counter for this message
            _nack_retry_counts.pop(msg_id, None)
            message.ack()
        except ValidationError as ve:
            logger.error("Validation error for telemetry message: %s. Routing to DLQ.", ve)
            send_to_dlq(dlq_producer, dlq_topic, raw_bytes, str(ve))
            _nack_retry_counts.pop(msg_id, None)
            message.ack()
        except json.JSONDecodeError as je:
            logger.error("JSON decode error: %s. Routing to DLQ.", je)
            send_to_dlq(dlq_producer, dlq_topic, raw_bytes, str(je))
            _nack_retry_counts.pop(msg_id, None)
            message.ack()
        except Exception as e:
            # FIX C3: Count nack retries per message. After MAX_NACK_RETRIES
            # exhausted, route to DLQ and ack to avoid an infinite nack loop.
            retry_count = _nack_retry_counts.get(msg_id, 0) + 1
            _nack_retry_counts[msg_id] = retry_count
            if retry_count >= MAX_NACK_RETRIES:
                logger.error(
                    "Message %s failed %d times (max=%d). Routing to DLQ: %s",
                    msg_id, retry_count, MAX_NACK_RETRIES, e
                )
                send_to_dlq(dlq_producer, dlq_topic, raw_bytes,
                            f"Exceeded {MAX_NACK_RETRIES} retries: {e}")
                _nack_retry_counts.pop(msg_id, None)
                message.ack()
            else:
                logger.error(
                    "Processing exception (retry %d/%d) for message %s: %s",
                    retry_count, MAX_NACK_RETRIES, msg_id, e
                )
                message.nack()

    streaming_pull_future = subscriber.subscribe(sub_path, callback=callback)
    logger.info("Subscribed and listening on %s...", sub_path)

    try:
        while running:
            time.sleep(0.5)
    except Exception as e:
        logger.error("Exception in processor loop: %s", e)
    finally:
        streaming_pull_future.cancel()
        streaming_pull_future.result()
        subscriber.close()

    logger.info("Processor stopped cleanly.")

if __name__ == "__main__":
    main()
