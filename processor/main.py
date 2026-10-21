import os
import time
import json
import signal
import uuid
import logging
import threading
from datetime import datetime, timezone
try:
    from google.cloud import pubsub_v1
except ImportError:
    pubsub_v1 = None

try:
    from google.cloud import firestore
except ImportError:
    firestore = None
from pydantic import ValidationError

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

def send_to_dlq(publisher, dlq_topic_path, raw_data, err_reason):
    if publisher and dlq_topic_path:
        try:
            dlq_payload = json.dumps({
                "raw": raw_data.decode('utf-8', errors='replace'),
                "error": str(err_reason),
                "failed_at": datetime.now(timezone.utc).isoformat()
            })
            publisher.publish(dlq_topic_path, data=dlq_payload.encode('utf-8'))
        except Exception as e:
            logger.error("Failed to route invalid message to Pub/Sub DLQ: %s", e)

# High-Throughput (1,000 msg/s) In-RAM State Tracking & Conflation Architecture
# Guarantees:
# 1. Inspects all 1,000 msg/s in RAM with zero network round-trip overhead.
# 2. Out-of-order timestamp guard evaluated purely in RAM.
# 3. 60s Alert Cooldown Guard per truck (deduped alerts).
# 4. 1.0s Conflation Buffer throttles Firestore writes to max 1 write/s per truck (max 16 writes/s total).
# 5. Live HUD document (`live_metrics/hud`) published with aggregate throughput metrics.

_truck_latest_ts: dict = {}
_truck_prev_status: dict = {}
_alert_cooldowns: dict = {}

_conflation_buffer: dict = {}
_conflation_lock = threading.Lock()

_total_msgs_processed: int = 0
_total_alerts_count: int = 0
_window_msgs_count: int = 0
_last_window_time: float = time.time()
_current_throughput_rate: float = 0.0

def reset_processor_state():
    """Reset in-memory state tracking (useful for unit testing)."""
    global _total_msgs_processed, _total_alerts_count, _window_msgs_count, _current_throughput_rate
    with _conflation_lock:
        _truck_latest_ts.clear()
        _truck_prev_status.clear()
        _alert_cooldowns.clear()
        _conflation_buffer.clear()
        _total_msgs_processed = 0
        _total_alerts_count = 0
        _window_msgs_count = 0
        _current_throughput_rate = 0.0

def flush_conflation_buffer(db):
    """
    Atomically flushes the in-memory conflated truck records to Firestore in a single batch.
    Ensures max 1 write/s per truck (16 writes/s total) regardless of incoming Pub/Sub volume.
    Also updates `live_metrics/hud` with live throughput rates.
    """
    global _window_msgs_count, _last_window_time, _current_throughput_rate
    now = time.time()

    with _conflation_lock:
        if not _conflation_buffer:
            elapsed = max(now - _last_window_time, 0.5)
            _current_throughput_rate = round(_window_msgs_count / elapsed, 1)
            _window_msgs_count = 0
            _last_window_time = now
            return
        records_to_flush = dict(_conflation_buffer)
        _conflation_buffer.clear()
        elapsed = max(now - _last_window_time, 0.5)
        _current_throughput_rate = round(_window_msgs_count / elapsed, 1)
        _window_msgs_count = 0
        _last_window_time = now

    try:
        batch = db.batch()
        for truck_id, record in records_to_flush.items():
            iso_ref = db.collection("trucks").document(f"truck_{truck_id}")
            live_ref = db.collection("live_status").document(truck_id)
            batch.set(iso_ref, record)
            batch.set(live_ref, record)

        # Update live_metrics/hud document
        hud_ref = db.collection("live_metrics").document("hud")
        hud_data = {
            "current_msg_rate": _current_throughput_rate,
            "total_messages_processed": _total_msgs_processed,
            "total_alerts_generated": _total_alerts_count,
            "active_trucks": len(records_to_flush),
            "flushed_at": datetime.now(timezone.utc).isoformat()
        }
        batch.set(hud_ref, hud_data)

        batch.commit()
        logger.debug("Flushed conflation buffer (%d trucks, %.1f msg/s)", len(records_to_flush), _current_throughput_rate)
    except Exception as e:
        logger.error("Failed to commit conflated batch to Firestore: %s", e)

def conflation_flusher_loop(db, flush_interval: float = 1.0):
    """Background worker daemon flushing the conflation buffer every 1.0 second."""
    logger.info("Conflation flusher loop active (interval: %.1fs, max 16 writes/s).", flush_interval)
    while running:
        time.sleep(flush_interval)
        try:
            flush_conflation_buffer(db)
        except Exception as e:
            logger.error("Error in conflation flusher loop: %s", e)

def process_message(
    db,
    msg_payload: TelemetryMessage,
    alerts_publisher=None,
    alerts_topic_path=None,
    is_backlog: bool = False,
    cooldown_seconds: float = 60.0
):
    """
    High-throughput stream processing pipeline:
    1. Inspects message in RAM.
    2. Out-of-order timestamp guard evaluated purely in RAM (no blocking Firestore reads).
    3. Excursion & door anomaly detection.
    4. 60s alert cooldown guard per truck.
    5. Conflation buffer absorbs high velocity (buffers in RAM, flushes max 1 write/s/truck).
    """
    global _total_msgs_processed, _total_alerts_count, _window_msgs_count
    truck_id = msg_payload.truck_id

    # 1. Backlog Ingress Guard:
    # If is_backlog is true, data is already captured in BigQuery analytical sink.
    # Bypass updating Firestore live status so real-time map doesn't warp backwards.
    if is_backlog:
        logger.info("📦 [BACKLOG DETECTED] Historical telemetry for %s bypassed live status (preserved in BigQuery).", truck_id)
        return False

    # 2. In-RAM Out-of-Order & Duplicate Timestamp Guard (Zero network latency)
    existing_ts = _truck_latest_ts.get(truck_id)
    if not should_update_live_status(msg_payload.ts, existing_ts):
        logger.warning("Ignoring out-of-order/duplicate telemetry for %s (incoming: %s <= existing: %s)",
                       truck_id, msg_payload.ts, existing_ts)
        return False

    # Accept & advance timestamp in RAM
    _truck_latest_ts[truck_id] = msg_payload.ts

    # 3. Anomaly Classification
    status, excess, reason = classify(
        cargo_temp_c=msg_payload.cargo_temp_c,
        setpoint_c=msg_payload.setpoint_c,
        door_open=msg_payload.door_open
    )

    prev_status = _truck_prev_status.get(truck_id)
    _truck_prev_status[truck_id] = status

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

    # 4. Excursion Alert & 60s Cooldown Guard (Deduped Alert per Incident)
    now = time.time()
    last_alert_time = _alert_cooldowns.get(truck_id, 0.0)

    if should_generate_alert(prev_status, status):
        if (now - last_alert_time) >= cooldown_seconds:
            _alert_cooldowns[truck_id] = now
            _total_alerts_count += 1
            alert_doc_id = f"alert_{truck_id}_{int(now * 1000)}_{uuid.uuid4().hex[:6]}"
            alert_payload = {
                "alert_id": alert_doc_id,
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
            # Immediate write to Firestore audit alerts collection (alerts are critical events)
            try:
                db.collection("alerts").document(alert_doc_id).set(alert_payload)
                logger.info("🚨 Generated ALERT [%s] for %s: %s (Cargo: %.1f°C, Setpoint: %.1f°C, Door: %s)",
                            alert_doc_id, truck_id, reason, msg_payload.cargo_temp_c, msg_payload.setpoint_c, msg_payload.door_open)
            except Exception as ae:
                logger.error("Failed to write alert to Firestore: %s", ae)

            # Publish to alerts-topic for decoupled driver notification service
            if alerts_publisher and alerts_topic_path:
                try:
                    alert_bytes = json.dumps(alert_payload).encode('utf-8')
                    alerts_publisher.publish(alerts_topic_path, data=alert_bytes)
                    logger.info("📢 Dispatched alert to %s for %s", alerts_topic_path, truck_id)
                except Exception as pe:
                    logger.error("Failed to publish alert event to %s: %s", alerts_topic_path, pe)
        else:
            logger.info("⏳ Suppressed duplicate alert for %s (cooldown active: %.1fs remaining)",
                        truck_id, cooldown_seconds - (now - last_alert_time))

    # 5. Conflation Buffer Update (absorbs high velocity in RAM, flushes max 1 write/s/truck)
    with _conflation_lock:
        _conflation_buffer[truck_id] = updated_record
        _total_msgs_processed += 1
        _window_msgs_count += 1

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
    dlq_topic_id = os.environ.get("PUBSUB_DLQ_TOPIC", "telemetry-dlq-topic")

    logger.info("Starting processor service for subscription %s (Project: %s)", sub_id, project_id)

    # Initialize Firestore Client
    db = firestore.Client(project=project_id)

    # Initialize Alerts & DLQ Publisher
    alerts_publisher = pubsub_v1.PublisherClient()
    alerts_topic_path = alerts_publisher.topic_path(project_id, alerts_topic_id)
    dlq_topic_path = alerts_publisher.topic_path(project_id, dlq_topic_id)

    subscriber = pubsub_v1.SubscriberClient()
    sub_path = subscriber.subscription_path(project_id, sub_id)

    def callback(message: pubsub_v1.subscriber.message.Message):
        raw_bytes = message.data
        msg_id = message.message_id  # unique per Pub/Sub message
        is_backlog = (message.attributes.get("is_backlog", "").lower() in ("true", "1", "yes"))
        try:
            raw_dict = json.loads(raw_bytes.decode('utf-8'))
            telemetry_obj = TelemetryMessage(**raw_dict)
            process_message(db, telemetry_obj, alerts_publisher=alerts_publisher, alerts_topic_path=alerts_topic_path, is_backlog=is_backlog)
            # Successful — clean up any retry counter for this message
            _nack_retry_counts.pop(msg_id, None)
            message.ack()
        except ValidationError as ve:
            logger.error("Validation error for telemetry message: %s. Routing to DLQ.", ve)
            send_to_dlq(alerts_publisher, dlq_topic_path, raw_bytes, str(ve))
            _nack_retry_counts.pop(msg_id, None)
            message.ack()
        except json.JSONDecodeError as je:
            logger.error("JSON decode error: %s. Routing to DLQ.", je)
            send_to_dlq(alerts_publisher, dlq_topic_path, raw_bytes, str(je))
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
                send_to_dlq(alerts_publisher, dlq_topic_path, raw_bytes,
                            f"Exceeded {MAX_NACK_RETRIES} retries: {e}")
                _nack_retry_counts.pop(msg_id, None)
                message.ack()
            else:
                logger.error(
                    "Processing exception (retry %d/%d) for message %s: %s",
                    retry_count, MAX_NACK_RETRIES, msg_id, e
                )
                message.nack()

    # Start background conflation flusher thread (1.0s interval, max 16 writes/s)
    import threading
    flusher_thread = threading.Thread(target=conflation_flusher_loop, args=(db, 1.0), daemon=True)
    flusher_thread.start()

    streaming_pull_future = subscriber.subscribe(sub_path, callback=callback)
    logger.info("Subscribed and listening on %s with 1.0s Conflation Buffer active...", sub_path)

    try:
        while running:
            time.sleep(0.5)
    except Exception as e:
        logger.error("Exception in processor loop: %s", e)
    finally:
        streaming_pull_future.cancel()
        streaming_pull_future.result()
        subscriber.close()
        # Flush any remaining conflated records on shutdown
        try:
            flush_conflation_buffer(db)
        except Exception as fe:
            logger.warning("Error during final conflation buffer flush: %s", fe)

    logger.info("Processor stopped cleanly.")

if __name__ == "__main__":
    main()
