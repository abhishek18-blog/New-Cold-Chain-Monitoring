import os
import time
import json
import signal
import random
import logging
import math
from datetime import datetime, timezone
from google.cloud import pubsub_v1
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

# Dense highway route waypoints across India - 16 trucks, diverse cargo & routes
TRUCK_HIGHWAY_ROUTES = {
    "TRK-001": {
        "route": "Goa -> Mumbai (NH 66) | Chilled 4C | Fresh Produce",
        "setpoint_c": 4.0,
        "fuel_pct": 92.0,
        "excursion_prob_override": None,
        "waypoints": [
            (15.4909, 73.8278), (15.5524, 73.8107), (15.6133, 73.8022), (15.6847, 73.7892),
            (15.7312, 73.7634), (15.8647, 73.8234), (15.9832, 73.8015), (16.0451, 73.7748),
            (16.1558, 73.7124), (16.2876, 73.6450), (16.4012, 73.5983), (16.5678, 73.5401),
            (16.7234, 73.4892), (16.8901, 73.4567), (16.9902, 73.3120), (17.1203, 73.3450),
            (17.2834, 73.4012), (17.4102, 73.4456), (17.5450, 73.4867), (17.7123, 73.3980),
            (17.8934, 73.3120), (18.0456, 73.2789), (18.2324, 73.4456), (18.4012, 73.2901),
            (18.5678, 73.2012), (18.7521, 73.1022), (18.9023, 72.9890), (19.0234, 72.9012),
            (19.0760, 72.8777),
        ]
    },
    "TRK-002": {
        "route": "Delhi -> Nagpur (NH 44) | Chilled 4C | Dairy",
        "setpoint_c": 4.0,
        "fuel_pct": 85.5,
        "excursion_prob_override": None,
        "waypoints": [
            (28.6139, 77.2090), (28.4089, 77.3178), (28.2230, 77.4867), (28.0651, 77.5634),
            (27.8923, 77.6401), (27.4924, 77.6737), (27.3012, 77.7123), (27.1767, 78.0081),
            (26.9234, 78.2456), (26.6789, 78.3901), (26.4512, 78.4567), (26.2183, 78.1828),
            (25.9012, 78.3456), (25.6234, 78.5012), (25.4484, 78.5685), (24.9012, 78.7890),
            (24.5234, 78.9012), (23.8388, 78.7378), (23.4012, 78.5234), (22.9234, 78.3012),
            (22.5678, 78.1234), (21.8974, 77.9068), (21.4012, 78.1234), (21.1458, 79.0882),
        ]
    },
    "TRK-003": {
        "route": "Kochi -> Pondicherry (NH 544) | Frozen -18C | Seafood",
        "setpoint_c": -18.0,
        "fuel_pct": 78.0,
        "excursion_prob_override": None,
        "waypoints": [
            (9.9312,  76.2673), (10.0234, 76.3012), (10.1456, 76.3456), (10.2678, 76.2890),
            (10.3901, 76.2345), (10.5276, 76.2144), (10.6123, 76.4012), (10.7456, 76.5789),
            (10.7867, 76.6548), (10.9012, 76.8012), (11.0168, 76.9558), (11.1234, 77.2012),
            (11.2456, 77.4567), (11.3410, 77.7172), (11.4678, 77.9234), (11.5901, 78.0456),
            (11.6643, 78.1460), (11.7789, 78.5234), (11.8901, 78.9012), (11.9416, 79.8083),
        ]
    },
    "TRK-004": {
        "route": "Pune -> Nashik (NH 60) | Chilled 4C | Meat",
        "setpoint_c": 4.0,
        "fuel_pct": 64.0,
        "excursion_prob_override": None,
        "waypoints": [
            (18.5204, 73.8567), (18.5678, 73.8789), (18.6012, 73.8901), (18.6456, 73.8956),
            (18.7180, 73.8820), (18.7789, 73.9012), (18.8234, 73.9234), (18.8901, 73.9456),
            (19.0144, 73.9450), (19.0789, 73.9567), (19.1456, 73.9678), (19.2312, 73.9780),
            (19.3012, 73.9890), (19.3789, 74.0012), (19.4567, 74.0123), (19.5312, 74.0210),
            (19.6234, 73.9890), (19.7012, 73.9567), (19.7890, 73.9120), (19.8789, 73.8456),
            (19.9234, 73.8012), (19.9975, 73.7898),
        ]
    },
    "TRK-005": {
        "route": "Noida -> Indore (NH 46) | Chilled 2C | Dairy",
        "setpoint_c": 2.0,
        "fuel_pct": 89.0,
        "excursion_prob_override": None,
        "waypoints": [
            (28.5355, 77.3910), (28.4234, 77.5012), (28.2901, 77.7234), (28.1456, 77.8456),
            (27.8974, 77.8765), (27.6234, 77.9890), (27.4012, 78.0789), (27.1767, 78.0081),
            (26.8901, 78.2345), (26.5678, 78.3890), (26.2183, 78.1828), (25.8901, 78.0234),
            (25.4234, 77.6789), (24.9012, 77.3456), (24.5678, 77.2890), (24.2012, 77.1456),
            (23.8345, 76.9820), (23.5678, 77.1234), (23.2599, 77.4126), (23.0012, 77.2678),
            (22.8234, 76.8901), (22.7196, 75.8577),
        ]
    },
    "TRK-006": {
        "route": "Chennai -> Bangalore (NH 48) | Chilled 2C | Dairy/Milk",
        "setpoint_c": 2.0,
        "fuel_pct": 92.0,
        "excursion_prob_override": 0.015,
        "waypoints": [
            (13.0827, 80.2707), (12.9456, 80.1234), (12.8012, 79.9890), (12.6789, 79.9012),
            (12.5266, 79.8631), (12.4012, 79.7456), (12.3234, 79.3890), (12.2012, 79.1234),
            (12.1393, 78.8799), (12.1012, 78.2890), (12.2089, 77.9890), (12.7409, 77.8253),
            (12.8234, 77.7456), (12.8901, 77.7012), (12.9345, 77.6456), (12.9716, 77.5946),
        ]
    },
    "TRK-007": {
        "route": "Hyderabad -> Vijayawada (NH 65) | Frozen -20C | Ice Cream",
        "setpoint_c": -20.0,
        "fuel_pct": 85.5,
        "excursion_prob_override": 0.012,
        "waypoints": [
            (17.3850, 78.4867), (17.3234, 78.6012), (17.2456, 78.7890), (17.1678, 78.9456),
            (17.0575, 79.2679), (16.9890, 79.4012), (16.8726, 79.5736), (16.7890, 79.7234),
            (16.7012, 79.8901), (16.5678, 80.1234), (16.4456, 80.2890), (16.3067, 80.4365),
            (16.3890, 80.5012), (16.4567, 80.5789), (16.5062, 80.6480),
        ]
    },
    "TRK-008": {
        "route": "Kolkata -> Patna (NH 19) | Chilled 4C | Fresh Produce",
        "setpoint_c": 4.0,
        "fuel_pct": 78.0,
        "excursion_prob_override": 0.018,
        "waypoints": [
            (22.5726, 88.3639), (22.6890, 88.2345), (22.7678, 88.0789), (22.8456, 87.8901),
            (22.9234, 87.7012), (23.1234, 87.5234), (23.2345, 87.4012), (23.4827, 87.3219),
            (23.5678, 87.1890), (23.6839, 86.9524), (23.7456, 86.7890), (23.7957, 86.4304),
            (24.0234, 85.9890), (24.2678, 85.6234), (24.5012, 85.3456), (24.7890, 85.1012),
            (25.0234, 85.0456), (25.2678, 85.0890), (25.5941, 85.1376),
        ]
    },
    "TRK-009": {
        "route": "Jaipur -> Ahmedabad (NH 48) | Pharma 8C | Vaccines",
        "setpoint_c": 8.0,
        "fuel_pct": 64.0,
        "excursion_prob_override": 0.008,
        "waypoints": [
            (26.9124, 75.7873), (26.7890, 75.6789), (26.5678, 75.5012), (26.4499, 74.6399),
            (26.4012, 74.6890), (26.5942, 74.8615), (26.2890, 74.7456), (25.9234, 74.6234),
            (25.6789, 74.5012), (25.3456, 74.3234), (25.0234, 73.8901), (24.5678, 73.7012),
            (24.2012, 73.5234), (23.8456, 73.3012), (23.5678, 73.1234), (23.2345, 72.9890),
            (23.0225, 72.5714),
        ]
    },
    "TRK-010": {
        "route": "Lucknow -> Varanasi (NH 56) | Chilled 4C | Processed Meat",
        "setpoint_c": 4.0,
        "fuel_pct": 89.0,
        "excursion_prob_override": 0.020,
        "waypoints": [
            (26.8467, 80.9462), (26.7890, 81.0789), (26.7234, 81.2345), (26.6456, 81.5012),
            (26.5234, 81.7890), (26.4012, 82.0012), (26.2637, 82.0726), (26.1890, 82.2012),
            (26.1445, 82.5712), (26.0234, 82.7890), (25.9012, 82.9234), (25.7890, 82.9890),
            (25.5678, 83.0234), (25.4234, 83.0456), (25.3176, 82.9739),
        ]
    },
    "TRK-011": {
        "route": "Surat -> Vadodara (NH 48) | Frozen -18C | Export Prawns",
        "setpoint_c": -18.0,
        "fuel_pct": 73.0,
        "excursion_prob_override": 0.014,
        "waypoints": [
            (21.1702, 72.8311), (21.2345, 72.8567), (21.3012, 72.8890), (21.3789, 72.9012),
            (21.4567, 72.9123), (21.5234, 72.9234), (21.6012, 72.9123), (21.6825, 72.9210),
            (21.7234, 72.9567), (21.6269, 72.9900), (21.7051, 72.9959), (21.7890, 73.0234),
            (21.8789, 73.0567), (21.9678, 73.0890), (22.0567, 73.1123), (22.1456, 73.1234),
            (22.2345, 73.1567), (22.3072, 73.1812),
        ]
    },
    "TRK-012": {
        "route": "Chandigarh -> Amritsar (NH 44) | Chilled 2C | Pasteurised Milk",
        "setpoint_c": 2.0,
        "fuel_pct": 81.0,
        "excursion_prob_override": 0.010,
        "waypoints": [
            (30.7333, 76.7794), (30.7890, 76.6234), (30.8456, 76.4567), (30.8890, 76.3012),
            (30.9012, 75.8573), (30.9456, 75.7234), (31.0234, 75.6012), (31.1012, 75.5234),
            (31.3260, 75.5762), (31.4012, 75.3890), (31.4789, 75.2345), (31.5456, 75.1012),
            (31.6340, 74.8723),
        ]
    },
    "TRK-013": {
        "route": "Bhubaneswar -> Visakhapatnam (NH 16) | Chilled 4C | Fresh Fish",
        "setpoint_c": 4.0,
        "fuel_pct": 67.0,
        "excursion_prob_override": 0.022,
        "waypoints": [
            (20.2961, 85.8245), (20.1890, 85.7234), (20.0234, 85.5012), (19.8901, 85.3456),
            (19.7234, 85.1234), (19.5567, 85.0012), (19.3150, 84.7941), (19.1234, 84.5234),
            (18.9890, 84.3012), (18.8456, 84.0234), (18.6789, 83.9012), (18.5123, 83.8456),
            (18.2949, 83.8938), (18.1234, 83.7234), (17.9456, 83.6012), (17.8012, 83.5234),
            (17.6868, 83.2185),
        ]
    },
    "TRK-014": {
        "route": "Coimbatore -> Chennai (NH 48) | Pharma 5C | Insulin/Biologics",
        "setpoint_c": 5.0,
        "fuel_pct": 94.0,
        "excursion_prob_override": 0.006,
        "waypoints": [
            (11.0168, 76.9558), (11.0890, 77.1234), (11.1678, 77.3012), (11.2456, 77.4890),
            (11.3234, 77.7234), (11.4012, 77.9012), (11.5456, 78.0234), (11.6643, 78.1460),
            (11.7890, 78.3012), (11.8901, 78.5234), (12.0012, 78.7456), (12.1393, 78.9799),
            (12.2678, 79.0234), (12.3890, 79.1890), (12.5012, 79.3456), (12.9165, 79.1325),
            (12.7234, 79.7890), (12.8456, 79.9234), (12.9678, 80.0890), (13.0827, 80.2707),
        ]
    },
    "TRK-015": {
        "route": "Mangalore -> Goa (NH 66) | Frozen -20C | Tuna Export",
        "setpoint_c": -20.0,
        "fuel_pct": 76.0,
        "excursion_prob_override": 0.013,
        "waypoints": [
            (12.9141, 74.8560), (13.0012, 74.8234), (13.0890, 74.7890), (13.1789, 74.7456),
            (13.2678, 74.7234), (13.3409, 74.7421), (13.4234, 74.7012), (13.5678, 74.6234),
            (13.7012, 74.5456), (13.8456, 74.4890), (14.0012, 74.4234), (14.1239, 74.3740),
            (14.2789, 74.3012), (14.4234, 74.2234), (14.5678, 74.1890), (14.6890, 74.1456),
            (14.8003, 74.1241), (14.9234, 74.0890), (15.0456, 74.0234), (15.2012, 73.9456),
            (15.3456, 73.9012), (15.4234, 73.8678), (15.4909, 73.8278),
        ]
    },
    "TRK-016": {
        "route": "Pune -> Mumbai (Expressway) | Chilled 4C | Vaccines & Pharma",
        "setpoint_c": 4.0,
        "fuel_pct": 88.0,
        "excursion_prob_override": 0.015,
        "waypoints": [
            (18.5204, 73.8567), (18.5678, 73.7890), (18.6012, 73.7234), (18.6456, 73.6456),
            (18.6901, 73.5678), (18.7234, 73.5012), (18.7521, 73.4022), (18.7890, 73.3456),
            (18.8234, 73.2890), (18.8678, 73.2234), (18.9012, 73.1789), (18.9456, 73.1456),
            (18.9890, 73.1120), (19.0123, 73.0678), (19.0345, 73.0234), (19.0567, 72.9789),
            (19.0760, 72.8777),
        ]
    }
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
    project_id = os.environ.get("GCP_PROJECT_ID", "coldchain-local")
    topic_id = os.environ.get("PUBSUB_TOPIC", "telemetry-topic")
    ping_interval = float(os.environ.get("PING_INTERVAL_SEC", "1.0"))  # Realistic 1-second interval (protects Firestore 1-write/sec limit)
    excursion_prob = float(os.environ.get("EXCURSION_PROBABILITY", "0.015"))
    stress_mode = os.environ.get("STRESS_MODE", "false").lower() in ("true", "1", "yes")
    simulate_dropout = os.environ.get("SIMULATE_DROPOUT", "false").lower() in ("true", "1", "yes")

    if stress_mode:
        ping_interval = float(os.environ.get("STRESS_INTERVAL_SEC", "0.1"))
        logger.info("⚡ STRESS_MODE active! High-speed telemetry: %.2fs interval across %d trucks",
                    ping_interval, len(TRUCK_HIGHWAY_ROUTES))
    else:
        logger.info("Starting telemetry generator. Project: %s, Topic: %s, Normal Cadence: %.1fs",
                    project_id, topic_id, ping_interval)

    publisher = pubsub_v1.PublisherClient()
    topic_path = publisher.topic_path(project_id, topic_id)

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
            "excursion_ticks_remaining": 0,
            "is_offline": False
        }
        stagger = (stagger + 0.18) % 1.0

    # In-memory buffer for local caching during network dropouts
    _offline_buffer = []
    cycle_counter = 0

    while running:
        loop_start = time.time()
        cycle_counter += 1
        has_critical_anomaly = False

        # Scale progress increment so physical speed (~65 km/h) remains consistent
        progress_step = 0.003 * (ping_interval / 5.0) if ping_interval < 5.0 else 0.003

        # Simulate periodic network dropout (e.g. mountain pass tunnel every 60 cycles for 5 cycles) if enabled
        network_dropped = False
        if simulate_dropout:
            network_dropped = (cycle_counter % 60) < 5
            if network_dropped:
                logger.warning("📶 [NETWORK DROPOUT ACTIVE] Simulating tunnel / cell tower outage. Caching to local buffer...")

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
                    has_critical_anomaly = True
                    logger.info("🚨 Injecting excursion for %s (%d ticks remaining, door_open=%s) [BURST MODE]",
                                truck_id, st["excursion_ticks_remaining"], st["door_open"])
                else:
                    st["door_open"] = False
            
            if st["excursion_ticks_remaining"] > 0:
                st["excursion_ticks_remaining"] -= 1
                st["cargo_temp_c"] += random.uniform(0.18, 0.35)
                has_critical_anomaly = True
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

            if network_dropped:
                # Network dropout: cache to in-memory local buffer
                _offline_buffer.append((truck_id, payload_json))
            else:
                # If network was restored and buffer has backlog, flush it with is_backlog="true"
                if _offline_buffer:
                    logger.info("🔄 Network restored! Flushing %d cached backlog messages to Pub/Sub with is_backlog: true...", len(_offline_buffer))
                    while _offline_buffer:
                        b_truck_id, b_payload = _offline_buffer.pop(0)
                        try:
                            publisher.publish(
                                topic_path,
                                data=b_payload.encode('utf-8'),
                                truck_id=b_truck_id,
                                is_backlog="true"
                            )
                        except Exception as e:
                            logger.error("Failed flushing backlog message for %s: %s", b_truck_id, e)

                # Send live event with is_backlog="false"
                try:
                    publisher.publish(
                        topic_path,
                        data=payload_json.encode('utf-8'),
                        truck_id=truck_id,
                        is_backlog="false"
                    )
                except Exception as e:
                    logger.error("Pub/Sub publish failed for %s: %s", truck_id, e)

        # Dual-Speed Cadence:
        # In Normal Mode: wait for 1-second interval to protect Firestore 1-write/sec limit
        # In Burst/Event Mode (anomaly detected): bypass sleep timer to transmit alert immediately
        if not has_critical_anomaly and not stress_mode:
            elapsed = time.time() - loop_start
            sleep_dur = ping_interval - elapsed
            if sleep_dur > 0:
                time.sleep(sleep_dur)
        else:
            # Burst mode: minimal yield to avoid starving CPU while transmitting immediately
            time.sleep(0.01)

    logger.info("Generator stopped cleanly.")

if __name__ == "__main__":
    main()
