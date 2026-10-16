import os
import time
import signal
import logging
from datetime import datetime, timezone
from google.cloud import firestore

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","service":"silence-detector","msg":"%(message)s"}'
)
logger = logging.getLogger("silence-detector")

running = True

def handle_shutdown(signum, frame):
    global running
    logger.info("Received signal %s. Shutting down silence detector...", signum)
    running = False

signal.signal(signal.SIGTERM, handle_shutdown)
signal.signal(signal.SIGINT, handle_shutdown)

def parse_iso(ts_str: str) -> datetime:
    if ts_str.endswith('Z'):
        ts_str = ts_str[:-1] + '+00:00'
    return datetime.fromisoformat(ts_str)


# FIX C4: Define the transactional handler ONCE at module level, not inside the
# per-truck for-loop. Re-defining a decorated function on every loop iteration
# causes subtle closure / variable-capture bugs and wastes memory.
@firestore.transactional
def _mark_no_signal_txn(txn, doc_ref, alerts_ref, truck_id, elapsed_sec, now):
    """Atomically set a truck's status to NO_SIGNAL and write an alert record."""
    snap = doc_ref.get(transaction=txn)
    if not snap.exists:
        return
    cur_data = snap.to_dict()
    if cur_data.get("status") != "NO_SIGNAL":
        txn.update(doc_ref, {
            "status": "NO_SIGNAL",
            "status_reason": f"No telemetry received for {int(elapsed_sec)} seconds",
            "updated_at": now.isoformat()
        })

        alert_doc = alerts_ref.document()
        txn.set(alert_doc, {
            "truck_id": truck_id,
            "ts": now.strftime('%Y-%m-%dT%H:%M:%SZ'),
            "status": "NO_SIGNAL",
            "cargo_temp_c": cur_data.get("cargo_temp_c", 0.0),
            "setpoint_c": cur_data.get("setpoint_c", 0.0),
            "excess_temp_c": 0.0,
            "door_open": cur_data.get("door_open", False),
            "reason": f"Telemetry signal lost (silent for {int(elapsed_sec)}s)",
            "created_at": now.isoformat()
        })

def check_silence(db, silence_timeout_sec: float):
    now = datetime.now(timezone.utc)
    trucks_ref = db.collection("live_status")
    alerts_ref = db.collection("alerts")

    docs = trucks_ref.stream()
    for doc in docs:
        data = doc.to_dict()
        truck_id = data.get("truck_id", doc.id)
        last_ts_str = data.get("last_ts")
        current_status = data.get("status")

        if not last_ts_str:
            continue

        try:
            last_dt = parse_iso(last_ts_str)
            elapsed_sec = (now - last_dt).total_seconds()

            if elapsed_sec > silence_timeout_sec and current_status != "NO_SIGNAL":
                logger.warning("Truck %s is silent for %.1fs (> %ss threshold). Marking NO_SIGNAL.",
                               truck_id, elapsed_sec, silence_timeout_sec)

                # FIX C4: Call the module-level transactional handler instead of
                # a re-defined closure. Passes all required data as explicit args.
                transaction = db.transaction()
                _mark_no_signal_txn(
                    transaction, doc.reference, alerts_ref,
                    truck_id, elapsed_sec, now
                )

        except Exception as e:
            logger.error("Error evaluating silence for truck %s: %s", truck_id, e)

def main():
    project_id = os.environ.get("GCP_PROJECT_ID", "coldchain-local")
    check_interval = float(os.environ.get("SILENCE_CHECK_INTERVAL_SEC", "30.0"))
    silence_timeout = float(os.environ.get("SILENCE_TIMEOUT_SEC", "120.0"))

    logger.info("Starting silence detector (Check Interval: %ss, Timeout: %ss, Project: %s)",
                check_interval, silence_timeout, project_id)

    db = firestore.Client(project=project_id)

    run_once = os.environ.get("RUN_ONCE", "false").lower() in ("true", "1", "yes")
    if run_once:
        logger.info("Executing single silence check...")
        check_silence(db, silence_timeout)
        logger.info("Single silence check complete.")
        return

    while running:
        check_silence(db, silence_timeout)
        for _ in range(int(check_interval)):
            if not running:
                break
            time.sleep(1.0)

    logger.info("Silence detector stopped cleanly.")

if __name__ == "__main__":
    main()
