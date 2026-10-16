import os
import time
import json
import signal
import random
import logging
import math
from datetime import datetime, timezone
from confluent_kafka import Producer
from models import TruckTelemetry

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","service":"telemetry-generator","msg":"%(message)s"}'
)
logger = logging.getLogger("generator")

running = True

def handle_shutdown(signum, frame):
    global running
    logger.info("Received signal %s. Shutting down generator gracefully...", signum)
    running = False

signal.signal(signal.SIGTERM, handle_shutdown)
signal.signal(signal.SIGINT, handle_shutdown)

def delivery_report(err, msg):
    if err is not None:
        logger.error("Message delivery failed: %s", err)

# Dense highway route waypoints across India — 15 trucks, diverse cargo & routes
TRUCK_HIGHWAY_ROUTES = {
    # ── Original 5 trucks ────────────────────────────────────────────────────
    "TRK-001": {
        "route": "Goa → Mumbai (NH 66) | Chilled 4°C | Fresh Produce",
        "setpoint_c": 4.0,
        "fuel_pct": 92.0,
        "excursion_prob_override": None,   # uses global env var
        "waypoints": [
            (15.4909, 73.8278), # Panaji, Goa
            (15.8647, 73.8234), # Sawantwadi
            (16.1558, 73.7124), # Kankavli
            (16.9902, 73.3120), # Ratnagiri
            (17.5450, 73.4867), # Chiplun
            (18.2324, 73.4456), # Mahad
            (18.7521, 73.1022), # Panvel
            (19.0760, 72.8777)  # Mumbai
        ]
    },
    "TRK-002": {
        "route": "Delhi → Nagpur (NH 44) | Chilled 4°C | Dairy",
        "setpoint_c": 4.0,
        "fuel_pct": 85.5,
        "excursion_prob_override": None,
        "waypoints": [
            (28.6139, 77.2090), # Delhi
            (27.4924, 77.6737), # Mathura
            (27.1767, 78.0081), # Agra
            (26.2183, 78.1828), # Gwalior
            (25.4484, 78.5685), # Jhansi
            (23.8388, 78.7378), # Sagar
            (21.8974, 77.9068), # Betul
            (21.1458, 79.0882)  # Nagpur
        ]
    },
    "TRK-003": {
        "route": "Kochi → Pondicherry (NH 544 & NH 381) | Frozen -18°C | Seafood",
        "setpoint_c": -18.0,
        "fuel_pct": 78.0,
        "excursion_prob_override": None,
        "waypoints": [
            (9.9312,  76.2673), # Kochi
            (10.5276, 76.2144), # Thrissur
            (10.7867, 76.6548), # Palakkad
            (11.0168, 76.9558), # Coimbatore
            (11.3410, 77.7172), # Erode
            (11.6643, 78.1460), # Salem
            (11.9416, 79.8083)  # Pondicherry
        ]
    },
    "TRK-004": {
        "route": "Pune → Nashik (NH 60) | Chilled 4°C | Meat",
        "setpoint_c": 4.0,
        "fuel_pct": 64.0,
        "excursion_prob_override": None,
        "waypoints": [
            (18.5204, 73.8567), # Pune
            (18.7180, 73.8820), # Chakan
            (19.0144, 73.9450), # Manchar
            (19.2312, 73.9780), # Narayangaon
            (19.5312, 74.0210), # Sangamner
            (19.7890, 73.9120), # Sinnar
            (19.9975, 73.7898)  # Nashik
        ]
    },
    "TRK-005": {
        "route": "Noida → Indore (NH 46 & Yamuna Expwy) | Chilled 2°C | Dairy",
        "setpoint_c": 2.0,
        "fuel_pct": 89.0,
        "excursion_prob_override": None,
        "waypoints": [
            (28.5355, 77.3910), # Noida
            (27.8974, 77.8765), # Aligarh
            (27.1767, 78.0081), # Agra
            (26.2183, 78.1828), # Gwalior
            (24.6324, 77.3120), # Guna
            (23.8345, 76.9820), # Biaora
            (23.2599, 77.4126), # Bhopal bypass
            (22.7196, 75.8577)  # Indore
        ]
    },

    # ── 10 new trucks ─────────────────────────────────────────────────────────
    "TRK-006": {
        "route": "Chennai → Bangalore (NH 48) | Chilled 2°C | Dairy/Milk",
        "setpoint_c": 2.0,
        "fuel_pct": 92.0,
        "excursion_prob_override": 0.015,
        "waypoints": [
            (13.0827, 80.2707), # Chennai
            (12.5266, 79.8631), # Vellore bypass
            (12.1393, 78.1799), # Krishnagiri
            (12.7409, 77.8253), # Hosur
            (12.9716, 77.5946)  # Bangalore
        ]
    },
    "TRK-007": {
        "route": "Hyderabad → Vijayawada (NH 65) | Frozen -20°C | Ice Cream",
        "setpoint_c": -20.0,
        "fuel_pct": 85.5,
        "excursion_prob_override": 0.012,
        "waypoints": [
            (17.3850, 78.4867), # Hyderabad
            (17.0575, 79.2679), # Nalgonda
            (16.8726, 79.5736), # Miryalaguda
            (16.3067, 80.4365), # Guntur
            (16.5062, 80.6480)  # Vijayawada
        ]
    },
    "TRK-008": {
        "route": "Kolkata → Patna (NH 19) | Chilled 4°C | Fresh Produce",
        "setpoint_c": 4.0,
        "fuel_pct": 78.0,
        "excursion_prob_override": 0.018,
        "waypoints": [
            (22.5726, 88.3639), # Kolkata
            (23.4827, 87.3219), # Durgapur
            (23.6839, 86.9524), # Asansol
            (23.7957, 86.4304), # Dhanbad
            (25.5941, 85.1376)  # Patna
        ]
    },
    "TRK-009": {
        "route": "Jaipur → Ahmedabad (NH 48) | Pharma 8°C | Vaccines",
        "setpoint_c": 8.0,
        "fuel_pct": 64.0,
        "excursion_prob_override": 0.008,  # pharma trucks are strictly maintained
        "waypoints": [
            (26.9124, 75.7873), # Jaipur
            (26.4499, 74.6399), # Ajmer
            (26.5942, 74.8615), # Kishangarh
            (25.7711, 73.3234), # Pali
            (23.0225, 72.5714)  # Ahmedabad
        ]
    },
    "TRK-010": {
        "route": "Lucknow → Varanasi (NH 56) | Chilled 4°C | Processed Meat",
        "setpoint_c": 4.0,
        "fuel_pct": 89.0,
        "excursion_prob_override": 0.020,
        "waypoints": [
            (26.8467, 80.9462), # Lucknow
            (26.2637, 82.0726), # Sultanpur
            (26.1445, 82.5712), # Jaunpur
            (25.3176, 82.9739)  # Varanasi
        ]
    },
    "TRK-011": {
        "route": "Surat → Vadodara (NH 48) | Frozen -18°C | Export Prawns",
        "setpoint_c": -18.0,
        "fuel_pct": 73.0,
        "excursion_prob_override": 0.014,
        "waypoints": [
            (21.1702, 72.8311), # Surat
            (21.6825, 72.9210), # Kim
            (21.6269, 72.9900), # Ankleshwar
            (21.7051, 72.9959), # Bharuch
            (22.3072, 73.1812)  # Vadodara
        ]
    },
    "TRK-012": {
        "route": "Chandigarh → Amritsar (NH 44) | Chilled 2°C | Pasteurised Milk",
        "setpoint_c": 2.0,
        "fuel_pct": 81.0,
        "excursion_prob_override": 0.010,
        "waypoints": [
            (30.7333, 76.7794), # Chandigarh
            (30.9010, 75.8573), # Ludhiana
            (31.3260, 75.5762), # Jalandhar
            (31.6340, 74.8723)  # Amritsar
        ]
    },
    "TRK-013": {
        "route": "Bhubaneswar → Visakhapatnam (NH 16) | Chilled 4°C | Fresh Fish",
        "setpoint_c": 4.0,
        "fuel_pct": 67.0,
        "excursion_prob_override": 0.022,  # coastal road, higher risk
        "waypoints": [
            (20.2961, 85.8245), # Bhubaneswar
            (19.3150, 84.7941), # Berhampur
            (18.2949, 83.8938), # Srikakulam
            (17.6868, 83.2185)  # Visakhapatnam
        ]
    },
    "TRK-014": {
        "route": "Coimbatore → Chennai (NH 48) | Pharma 5°C | Insulin/Biologics",
        "setpoint_c": 5.0,
        "fuel_pct": 94.0,
        "excursion_prob_override": 0.006,  # biologics — ultra-strict cold chain
        "waypoints": [
            (11.0168, 76.9558), # Coimbatore
            (11.6643, 78.1460), # Salem
            (12.1393, 78.1799), # Krishnagiri
            (12.9165, 79.1325), # Vellore
            (13.0827, 80.2707)  # Chennai
        ]
    },
    "TRK-015": {
        "route": "Mangalore → Goa (NH 66) | Frozen -20°C | Tuna Export",
        "setpoint_c": -20.0,
        "fuel_pct": 76.0,
        "excursion_prob_override": 0.013,
        "waypoints": [
            (12.9141, 74.8560), # Mangalore
            (13.3409, 74.7421), # Udupi
            (14.1239, 74.3740), # Bhatkal
            (14.8003, 74.1241), # Karwar
            (15.4909, 73.8278)  # Panaji, Goa
        ]
    },
}

def interpolate_along_route(waypoints, progress):
    """
    Interpolate (lat, lon) smoothly along multi-segment highway waypoints.
    progress is between 0.0 (start) and 1.0 (end).
    """
    n_segments = len(waypoints) - 1
    if n_segments <= 0:
        return waypoints[0]
        
    scaled_progress = progress * n_segments
    segment_idx = min(int(scaled_progress), n_segments - 1)
    seg_fraction = scaled_progress - segment_idx

    p1 = waypoints[segment_idx]
    p2 = waypoints[segment_idx + 1]

    lat = p1[0] + seg_fraction * (p2[0] - p1[0])
    lon = p1[1] + seg_fraction * (p2[1] - p1[1])
    return lat, lon

def main():
    bootstrap_servers = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "kafka-1:19092,kafka-2:19094")
    topic = os.environ.get("KAFKA_TOPIC_TELEMETRY", "truck-telemetry")
    ping_interval = float(os.environ.get("PING_INTERVAL_SEC", "5.0"))
    excursion_prob = float(os.environ.get("EXCURSION_PROBABILITY", "0.015"))
    stress_mode = os.environ.get("STRESS_MODE", "false").lower() in ("true", "1", "yes")

    if stress_mode:
        ping_interval = float(os.environ.get("STRESS_INTERVAL_SEC", "0.1"))
        logger.info("⚡ STRESS_MODE active! High-speed telemetry: %.2fs interval (~%d msgs/sec across %d trucks)",
                    ping_interval, int(len(TRUCK_HIGHWAY_ROUTES) / max(0.001, ping_interval)), len(TRUCK_HIGHWAY_ROUTES))
    else:
        logger.info("Starting telemetry generator. Bootstrap: %s, Topic: %s, Interval: %ss",
                    bootstrap_servers, topic, ping_interval)

    conf = {
        'bootstrap.servers': bootstrap_servers,
        'client.id': 'telemetry-generator-client',
        'acks': 'all',
        'enable.idempotence': True,
        'retries': 10,
        'retry.backoff.ms': 500,
        'queue.buffering.max.messages': 100000
    }

    producer = Producer(conf)

    # Initialize states with staggered progress along their routes
    states = {}
    stagger = 0.0
    for truck_id, prof in TRUCK_HIGHWAY_ROUTES.items():
        states[truck_id] = {
            "progress": stagger,
            "cargo_temp_c": prof["setpoint_c"] + random.uniform(-0.3, 0.3),
            "fuel_pct": prof["fuel_pct"],
            "speed_kmph": random.uniform(55.0, 75.0),
            "door_open": False,
            "excursion_ticks_remaining": 0
        }
        stagger = (stagger + 0.18) % 1.0

    while running:
        loop_start = time.time()
        # Scale progress increment so physical speed (~65 km/h) remains consistent at high sampling rates
        progress_step = 0.003 * (ping_interval / 5.0) if ping_interval < 5.0 else 0.003

        for truck_id, prof in TRUCK_HIGHWAY_ROUTES.items():
            st = states[truck_id]

            # Advance along highway route
            st["progress"] += progress_step
            if st["progress"] >= 1.0:
                st["progress"] = 0.0  # Cycle back to route start

            current_lat, current_lon = interpolate_along_route(prof["waypoints"], st["progress"])
            current_lat += random.uniform(-0.0001, 0.0001)
            current_lon += random.uniform(-0.0001, 0.0001)

            # Fuel consumption & speed variation
            st["fuel_pct"] = max(5.0, st["fuel_pct"] - 0.01)
            st["speed_kmph"] = max(30.0, min(95.0, st["speed_kmph"] + random.uniform(-2.5, 2.5)))

            # Excursion logic — use per-truck override if defined, else global env var
            truck_excursion_prob = prof.get("excursion_prob_override") or excursion_prob
            if st["excursion_ticks_remaining"] == 0:
                if random.random() < truck_excursion_prob:
                    st["excursion_ticks_remaining"] = random.randint(15, 30)
                    st["door_open"] = random.random() < 0.6
                    logger.info("Injecting excursion for %s (%d ticks remaining, door_open=%s)",
                                truck_id, st["excursion_ticks_remaining"], st["door_open"])
                else:
                    st["door_open"] = False
            
            if st["excursion_ticks_remaining"] > 0:
                st["excursion_ticks_remaining"] -= 1
                st["cargo_temp_c"] += random.uniform(0.18, 0.35)
            else:
                st["door_open"] = False
                setpoint = prof["setpoint_c"]
                if st["cargo_temp_c"] > setpoint + 0.2:
                    st["cargo_temp_c"] -= random.uniform(0.15, 0.25)
                elif st["cargo_temp_c"] < setpoint - 0.2:
                    st["cargo_temp_c"] += random.uniform(0.08, 0.15)
                else:
                    st["cargo_temp_c"] = setpoint + random.uniform(-0.25, 0.25)

            # Build telemetry object
            now_iso = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
            telemetry = TruckTelemetry(
                truck_id=truck_id,
                ts=now_iso,
                lat=round(current_lat, 6),
                lon=round(current_lon, 6),
                speed_kmph=round(st["speed_kmph"], 1),
                fuel_pct=round(st["fuel_pct"], 1),
                cargo_temp_c=round(st["cargo_temp_c"], 2),
                setpoint_c=prof["setpoint_c"],
                door_open=st["door_open"]
            )

            payload_json = telemetry.model_dump_json()

            try:
                producer.produce(
                    topic=topic,
                    key=truck_id.encode('utf-8'),
                    value=payload_json.encode('utf-8'),
                    callback=delivery_report
                )
            except BufferError:
                producer.poll(1.0)
                producer.produce(
                    topic=topic,
                    key=truck_id.encode('utf-8'),
                    value=payload_json.encode('utf-8'),
                    callback=delivery_report
                )

        producer.poll(0)
        
        elapsed = time.time() - loop_start
        sleep_dur = ping_interval - elapsed
        if sleep_dur > 0:
            time.sleep(sleep_dur)

    producer.flush(10)
    logger.info("Generator stopped cleanly.")

if __name__ == "__main__":
    main()
