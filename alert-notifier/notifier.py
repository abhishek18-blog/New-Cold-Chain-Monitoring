import os
import sys
import time
import json
import signal
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
try:
    from google.cloud import pubsub_v1
except ImportError:
    pubsub_v1 = None

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","service":"alert-notifier","msg":"%(message)s"}'
)
logger = logging.getLogger("notifier")

running = True

# Driver Registry Mapping for the 15 fleet trucks
FLEET_DRIVERS: Dict[str, Dict[str, str]] = {
    "TRK-001": {"name": "Rajesh Kumar", "phone": "+91-98201-11001", "cargo": "Fresh Produce", "route": "Goa → Mumbai"},
    "TRK-002": {"name": "Amit Sharma", "phone": "+91-98201-11002", "cargo": "Dairy & Milk", "route": "Nashik → Pune"},
    "TRK-003": {"name": "Sunil Patil", "phone": "+91-98201-11003", "cargo": "Frozen Seafood", "route": "Ratnagiri → Mumbai"},
    "TRK-004": {"name": "Vikram Singh", "phone": "+91-98201-11004", "cargo": "Vaccines & Pharma", "route": "Pune → Ahmedabad"},
    "TRK-005": {"name": "Manoj Verma", "phone": "+91-98201-11005", "cargo": "Ice Cream & Frozen", "route": "Kolhapur → Mumbai"},
    "TRK-006": {"name": "Deepak Joshi", "phone": "+91-98201-11006", "cargo": "Poultry & Meat", "route": "Solapur → Pune"},
    "TRK-007": {"name": "Sanjay Gupta", "phone": "+91-98201-11007", "cargo": "Biologics & Plasma", "route": "Hyderabad → Mumbai"},
    "TRK-008": {"name": "Ramesh Rao", "phone": "+91-98201-11008", "cargo": "Chilled Beverages", "route": "Bangalore → Pune"},
    "TRK-009": {"name": "Kishore Nair", "phone": "+91-98201-11009", "cargo": "Frozen Bakery", "route": "Belgaum → Goa"},
    "TRK-010": {"name": "Praveen Yadav", "phone": "+91-98201-11010", "cargo": "Cut Flowers & Plants", "route": "Ooty → Bangalore"},
    "TRK-011": {"name": "Ganesh Kadam", "phone": "+91-98201-11011", "cargo": "Chilled Butter & Cheese", "route": "Anand → Mumbai"},
    "TRK-012": {"name": "Anil Deshmukh", "phone": "+91-98201-11012", "cargo": "Antibiotics & Serum", "route": "Aurangabad → Pune"},
    "TRK-013": {"name": "Vijay More", "phone": "+91-98201-11013", "cargo": "Confectionery & Chocolates", "route": "Satara → Mumbai"},
    "TRK-014": {"name": "Nitin Sawant", "phone": "+91-98201-11014", "cargo": "Fresh Berries", "route": "Mahabaleshwar → Pune"},
    "TRK-015": {"name": "Sachin Shinde", "phone": "+91-98201-11015", "cargo": "Refrigerated Chemicals", "route": "Vapi → Mumbai"}
}

# In-memory cooldown tracker to prevent notification spamming per truck
# Maps truck_id -> last_notified_epoch_timestamp
_alert_cooldowns: Dict[str, float] = {}

def handle_shutdown(signum, frame):
    global running
    logger.info("Received signal %s. Shutting down alert-notifier gracefully...", signum)
    running = False

signal.signal(signal.SIGTERM, handle_shutdown)
signal.signal(signal.SIGINT, handle_shutdown)

def should_send_notification(truck_id: str, cooldown_seconds: float = 300.0, current_time: Optional[float] = None) -> bool:
    """
    Check if an alert should be sent or suppressed due to cooldown / debouncing.
    Default cooldown: 300 seconds (5 minutes) per truck.
    """
    now = current_time if current_time is not None else time.time()
    last_sent = _alert_cooldowns.get(truck_id, 0.0)
    
    if (now - last_sent) >= cooldown_seconds:
        _alert_cooldowns[truck_id] = now
        return True
    return False

def format_driver_sms(truck_id: str, alert_data: Dict[str, Any], driver_info: Dict[str, str]) -> str:
    """
    Format concise, actionable SMS / WhatsApp alert for the highway driver.
    """
    temp = alert_data.get('cargo_temp_c', 0.0)
    setpoint = alert_data.get('setpoint_c', 0.0)
    excess = alert_data.get('excess_temp_c', round(temp - setpoint, 2))
    door_open = alert_data.get('door_open', False)
    reason = alert_data.get('reason', 'Temperature Excursion')
    speed = alert_data.get('speed_kmph', 0)

    door_status_str = "DOOR IS OPEN ⚠️" if door_open else "Door Closed"

    msg = (
        f"🚨 URGENT COLD-CHAIN ALERT | {truck_id}\n"
        f"Driver: {driver_info['name']} | Route: {driver_info['route']}\n"
        f"Current Temp: {temp:.1f}°C (Setpoint: {setpoint:.1f}°C, Excess: +{excess:.1f}°C)\n"
        f"Status: {door_status_str} | Speed: {speed:.0f} km/h\n"
        f"Issue: {reason}\n"
        f"ACTION REQUIRED: Safely pull over and inspect cooling unit immediately!"
    )
    return msg

def dispatch_driver_sms(driver_phone: str, message_text: str):
    """
    Dispatch SMS via SMS Gateway (Twilio / AWS SNS / Meta WhatsApp).
    In local container environment, logs the exact dispatch payload.
    """
    logger.info("📱 [SMS GATEWAY DISPATCH] To: %s | Message:\n%s", driver_phone, message_text)

def dispatch_in_cab_telematics_downlink(truck_id: str, alert_data: Dict[str, Any]):
    """
    Send high-priority downlink command to the vehicle's onboard telematics unit (OBD-II / IoT box)
    to trigger the in-cab audio buzzer and flash the LED warning console.
    """
    command = {
        "command": "TRIGGER_CABIN_ALARM",
        "truck_id": truck_id,
        "alarm_level": "CRITICAL_AUDIO_BUZZER",
        "display_text": f"TEMP EXCURSION +{alert_data.get('excess_temp_c', 0)}C",
        "dispatched_at": datetime.now(timezone.utc).isoformat()
    }
    logger.info("🔊 [IN-CAB IOT DOWNLINK] Sent to %s: %s", truck_id, json.dumps(command))

def dispatch_fleet_ops_alert(truck_id: str, alert_data: Dict[str, Any], driver_info: Dict[str, str]):
    """
    Forward alert to Fleet Operations Slack / Teams webhook and incident response queue.
    """
    ops_payload = {
        "channel": "#coldchain-emergency-ops",
        "severity": "P1_CRITICAL",
        "truck_id": truck_id,
        "driver": driver_info['name'],
        "phone": driver_info['phone'],
        "cargo": driver_info['cargo'],
        "temp_excess": alert_data.get('excess_temp_c', 0),
        "reason": alert_data.get('reason', '')
    }
    logger.info("📢 [FLEET OPS NOTIFIED] %s", json.dumps(ops_payload))

def process_alert_event(alert_dict: Dict[str, Any], cooldown_seconds: float = 300.0) -> bool:
    """
    Process incoming alert event from alerts-topic:
    1. Look up driver metadata
    2. Check rate-limit cooldown
    3. Dispatch multi-channel alerts (Driver SMS, In-Cab Buzzer, Ops Channel)
    """
    truck_id = alert_dict.get("truck_id", "UNKNOWN")
    driver_info = FLEET_DRIVERS.get(truck_id, {
        "name": "Fleet Driver",
        "phone": "+91-98000-00000",
        "cargo": "Cold Cargo",
        "route": "Transit Route"
    })

    if not should_send_notification(truck_id, cooldown_seconds):
        logger.info("⏳ Cooldown active for %s. Suppressing duplicate notification.", truck_id)
        return False

    sms_body = format_driver_sms(truck_id, alert_dict, driver_info)
    
    # 1. Driver SMS / WhatsApp
    dispatch_driver_sms(driver_info["phone"], sms_body)
    
    # 2. In-Cab Telematics Downlink (Audio Buzzer)
    dispatch_in_cab_telematics_downlink(truck_id, alert_dict)
    
    # 3. Fleet Operations Emergency Queue
    dispatch_fleet_ops_alert(truck_id, alert_dict, driver_info)

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
    alerts_sub_id = os.environ.get("PUBSUB_ALERTS_SUB", "alerts-sub")
    cooldown_seconds = float(os.environ.get("ALERT_COOLDOWN_SEC", "300"))

    logger.info("Starting alert-notifier service listening on %s (Cooldown: %ds)...", alerts_sub_id, cooldown_seconds)

    subscriber = pubsub_v1.SubscriberClient()
    sub_path = subscriber.subscription_path(project_id, alerts_sub_id)

    def callback(message: pubsub_v1.subscriber.message.Message):
        try:
            raw_bytes = message.data
            alert_dict = json.loads(raw_bytes.decode('utf-8'))
            logger.info("Received incoming alert for %s from alerts-sub", alert_dict.get('truck_id'))
            process_alert_event(alert_dict, cooldown_seconds)
            message.ack()
        except Exception as e:
            logger.error("Error processing alert message in alert-notifier: %s", e)
            message.ack()

    streaming_pull_future = subscriber.subscribe(sub_path, callback=callback)
    logger.info("Alert notifier actively subscribed to %s...", sub_path)

    try:
        while running:
            time.sleep(0.5)
    except Exception as e:
        logger.error("Exception in alert-notifier loop: %s", e)
    finally:
        streaming_pull_future.cancel()
        streaming_pull_future.result()
        subscriber.close()

    logger.info("Alert notifier stopped cleanly.")

if __name__ == "__main__":
    main()
