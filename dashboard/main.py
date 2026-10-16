import os
import json
import time
import logging
from datetime import datetime, timezone
from typing import Optional
from collections import deque
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google.cloud import firestore
from confluent_kafka import Producer

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","service":"dashboard-api","msg":"%(message)s"}'
)
logger = logging.getLogger("dashboard-api")

project_id = os.environ.get("GCP_PROJECT_ID", "coldchain-local")
kafka_servers = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "kafka-1:19092,kafka-2:19094")
kafka_topic = os.environ.get("KAFKA_TOPIC_TELEMETRY", "truck-telemetry")

app = FastAPI(
    title="Cold Chain Fleet Monitoring Dashboard & Simulator API",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# FIX C1: Restrict CORS from open wildcard (*) to explicit allowed origins.
# In production replace these with the real frontend domain(s).
_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:8000,http://127.0.0.1:8000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

# Kafka Producer for manual injection
kafka_producer = None
try:
    kafka_producer = Producer({
        'bootstrap.servers': kafka_servers,
        'client.id': 'dashboard-simulator-producer',
        'acks': 'all'
    })
    logger.info("Connected Kafka producer to %s for telemetry simulation", kafka_servers)
except Exception as e:
    logger.warning("Could not initialize Kafka producer in dashboard: %s", e)

# In-memory history buffer of pipeline injection logs (persists across page reloads)
injected_logs_history = deque(maxlen=200)

# ── Live Kafka cluster throughput tracking ────────────────────────────────────
# Samples of (timestamp, total_partition_offset) from Kafka to measure actual ingestion rate
_kafka_offset_samples: deque = deque(maxlen=10)
_api_start_time: float = time.time() # wall-clock startup time

def _kafka_offset_sampler_loop():
    """Background daemon thread: samples total Kafka partition offsets every 1.5s for true cluster throughput."""
    consumer = None
    while True:
        try:
            if consumer is None:
                from confluent_kafka import Consumer, TopicPartition
                consumer = Consumer({
                    'bootstrap.servers': kafka_servers,
                    'group.id': 'dashboard-metrics-sampler',
                    'enable.auto.commit': False,
                    'auto.offset.reset': 'latest'
                })
            meta = consumer.list_topics(kafka_topic, timeout=3.0)
            if kafka_topic in meta.topics:
                partitions = [TopicPartition(kafka_topic, p) for p in meta.topics[kafka_topic].partitions]
                total_offset = 0
                for tp in partitions:
                    _, hi = consumer.get_watermark_offsets(tp, timeout=2.0)
                    total_offset += max(0, hi)
                _kafka_offset_samples.append((time.time(), total_offset))
        except Exception as e:
            logger.debug("Offset sampler poll error: %s", e)
            consumer = None
        time.sleep(1.5)

import threading
_sampler_thread = threading.Thread(target=_kafka_offset_sampler_loop, daemon=True)
_sampler_thread.start()

# FIX C2: Create a single module-level Firestore client (singleton).
# Previously get_db() instantiated a brand-new client on every API request,
# exhausting gRPC connections under load. One shared client is the correct pattern.
try:
    _db = firestore.Client(project=project_id)
    logger.info("Firestore singleton client created for project: %s", project_id)
except Exception as e:
    logger.error("Failed to create Firestore singleton client: %s", e)
    _db = None

def get_db():
    """Return the module-level Firestore singleton. Raises 503 if unavailable."""
    if _db is None:
        raise HTTPException(status_code=503, detail="Firestore client is unavailable")
    return _db

class TelemetryInjectRequest(BaseModel):
    truck_id: str = Field(..., example="TRK-001")
    cargo_temp_c: float = Field(..., example=8.5)
    setpoint_c: float = Field(default=4.0, example=4.0)
    door_open: bool = Field(default=False, example=True)
    lat: float = Field(default=18.5204, example=18.5204)
    lon: float = Field(default=73.8567, example=73.8567)
    speed_kmph: float = Field(default=55.0, ge=0.0, example=60.0)
    fuel_pct: float = Field(default=85.0, ge=0.0, le=100.0, example=85.0)
    ts: Optional[str] = None

class ScenarioRequest(BaseModel):
    truck_id: str = Field(..., example="TRK-001")
    scenario: str = Field(..., example="COMPRESSOR_FAILURE")

@app.get("/health")
def health_check():
    # FIX M4: Expose both kafka_connected and firestore_connected so the
    # dynamic Pipeline Health card in the UI can show real per-service states.
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "project": project_id,
        "kafka_connected": kafka_producer is not None,
        "firestore_connected": _db is not None,
    }

@app.get("/api/metrics")
def get_pipeline_metrics():
    """Return live Kafka throughput metrics measured directly from Kafka topic offsets."""
    now = time.time()
    uptime_sec = int(now - _api_start_time)
    
    msgs_per_sec = 0.0
    total_msgs = 0
    window_sec = 0.0

    samples = list(_kafka_offset_samples)
    if len(samples) >= 2:
        t_first, off_first = samples[0]
        t_last, off_last = samples[-1]
        dt = t_last - t_first
        delta_msgs = off_last - off_first
        if dt > 0.5:
            msgs_per_sec = round(max(0.0, delta_msgs / dt), 1)
            window_sec = round(dt, 1)
        total_msgs = off_last
    elif len(samples) == 1:
        total_msgs = samples[-1][1]

    bytes_per_sec = int(msgs_per_sec * 437)  # 437 bytes avg per Kafka telemetry message
    kb_per_sec = round(bytes_per_sec / 1024, 2)

    # Detect operational mode
    if msgs_per_sec >= 20.0:
        mode = "STRESS"
    elif msgs_per_sec > 0.0:
        mode = "NORMAL"
    else:
        mode = "IDLE"

    return {
        "msgs_per_sec": msgs_per_sec,
        "kb_per_sec": kb_per_sec,
        "bytes_per_sec": bytes_per_sec,
        "total_msgs_produced": total_msgs,
        "mode": mode,
        "uptime_sec": uptime_sec,
        "window_sec": window_sec,
    }

@app.get("/api/trucks")
def get_trucks():
    try:
        db = get_db()
        trucks_ref = db.collection("live_status")
        docs = trucks_ref.stream()
        trucks = []
        found_ids = set()
        for doc in docs:
            data = doc.to_dict()
            trucks.append(data)
            if "truck_id" in data:
                found_ids.add(data["truck_id"])
        
        # Ensure all 15 trucks are always present in the fleet
        now_iso = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        for tid, prof in ALL_TRUCK_PROFILES.items():
            if tid not in found_ids:
                default_record = {
                    "truck_id": tid,
                    "last_ts": now_iso,
                    "lat": prof["lat"],
                    "lon": prof["lon"],
                    "speed_kmph": 62.0,
                    "fuel_pct": prof["fuel_pct"],
                    "cargo_temp_c": prof["setpoint_c"],
                    "setpoint_c": prof["setpoint_c"],
                    "excess_temp_c": 0.0,
                    "door_open": False,
                    "status": "OK",
                    "status_reason": "Normal temperature range",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                trucks.append(default_record)
                try:
                    db.collection("live_status").document(tid).set(default_record)
                except Exception:
                    pass

        trucks.sort(key=lambda x: x.get("truck_id", ""))
        return {"trucks": trucks, "count": len(trucks)}
    except Exception as e:
        logger.error("Failed to fetch trucks from Firestore: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/alerts")
def get_alerts(limit: int = 50):
    try:
        db = get_db()
        alerts_ref = db.collection("alerts").order_by("created_at", direction=firestore.Query.DESCENDING).limit(limit)
        docs = alerts_ref.stream()
        alerts = []
        for doc in docs:
            data = doc.to_dict()
            data["id"] = doc.id
            alerts.append(data)
        return {"alerts": alerts, "count": len(alerts)}
    except Exception as e:
        logger.error("Failed to fetch alerts from Firestore: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/telemetry/logs")
def get_telemetry_logs():
    """Fetch recent injected telemetry log history to persist across browser reloads."""
    return {"logs": list(injected_logs_history)}

@app.delete("/api/telemetry/logs")
def clear_telemetry_logs():
    """Clear all stored injected telemetry history."""
    injected_logs_history.clear()
    return {"status": "cleared"}

@app.post("/api/telemetry/inject")
def inject_telemetry(req: TelemetryInjectRequest):
    """
    Directly inject custom manipulated telemetry into the real-time Kafka event stream.
    """
    global kafka_producer
    if not kafka_producer:
        try:
            kafka_producer = Producer({'bootstrap.servers': kafka_servers, 'client.id': 'dashboard-simulator-producer'})
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Kafka producer unavailable: {e}")

    now_iso = req.ts or datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    payload = {
        "truck_id": req.truck_id,
        "ts": now_iso,
        "lat": round(req.lat, 6),
        "lon": round(req.lon, 6),
        "speed_kmph": round(req.speed_kmph, 1),
        "fuel_pct": round(req.fuel_pct, 1),
        "cargo_temp_c": round(req.cargo_temp_c, 2),
        "setpoint_c": round(req.setpoint_c, 2),
        "door_open": req.door_open
    }

    try:
        json_bytes = json.dumps(payload).encode('utf-8')
        kafka_producer.produce(
            topic=kafka_topic,
            key=req.truck_id.encode('utf-8'),
            value=json_bytes
        )
        kafka_producer.flush(timeout=3.0)
        logger.info("Manually injected test telemetry for %s: Temp=%.1f°C, Door=%s",
                    req.truck_id, req.cargo_temp_c, req.door_open)

        # Store in history so logs persist across browser page reloads
        time_str = datetime.now().strftime('%H:%M:%S')
        injected_logs_history.append({
            "time": time_str,
            "type": "success-msg",
            "message": f"Injected {req.truck_id} -> Temp={req.cargo_temp_c:.1f}°C, Door={req.door_open}, Fuel={req.fuel_pct:.0f}%, Speed={req.speed_kmph:.0f}km/h"
        })

        return {
            "status": "injected",
            "message": f"Successfully injected telemetry for {req.truck_id} into Kafka topic '{kafka_topic}'",
            "payload": payload
        }
    except Exception as e:
        logger.error("Failed to inject telemetry to Kafka: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/telemetry/scenario")
def trigger_scenario(req: ScenarioRequest):
    """
    Trigger preset testing scenarios (Compressor Failure, Door Left Open, Freeze Spoilage, Normal).
    """
    truck_id = req.truck_id
    scenario = req.scenario.upper()

    preset_map = {
        "COMPRESSOR_FAILURE": {
            "cargo_temp_c": 9.5,
            "setpoint_c": 4.0,
            "door_open": False,
            "speed_kmph": 62.0,
            "fuel_pct": 74.0
        },
        "DOOR_OPEN_EXCURSION": {
            "cargo_temp_c": 6.8,
            "setpoint_c": 4.0,
            "door_open": True,
            "speed_kmph": 0.0,
            "fuel_pct": 82.0
        },
        "FREEZE_SPOILAGE": {
            "cargo_temp_c": -1.5,
            "setpoint_c": 4.0,
            "door_open": False,
            "speed_kmph": 55.0,
            "fuel_pct": 80.0
        },
        "NORMAL_RESTORE": {
            "cargo_temp_c": 4.0,
            "setpoint_c": 4.0,
            "door_open": False,
            "speed_kmph": 65.0,
            "fuel_pct": 90.0
        }
    }

    if scenario not in preset_map:
        raise HTTPException(status_code=400, detail=f"Unknown scenario '{scenario}'. Allowed: {list(preset_map.keys())}")

    config = preset_map[scenario]
    time_str = datetime.now().strftime('%H:%M:%S')
    injected_logs_history.append({
        "time": time_str,
        "type": "alert-msg",
        "message": f"Scenario [{scenario}] triggered for {truck_id} (Temp={config['cargo_temp_c']}°C, Door={config['door_open']})"
    })

    inject_req = TelemetryInjectRequest(
        truck_id=truck_id,
        cargo_temp_c=config["cargo_temp_c"],
        setpoint_c=config["setpoint_c"],
        door_open=config["door_open"],
        speed_kmph=config["speed_kmph"],
        fuel_pct=config["fuel_pct"]
    )
    return inject_telemetry(inject_req)

ALL_TRUCK_PROFILES = {
    "TRK-001": {"setpoint_c": 4.0, "lat": 15.4909, "lon": 73.8278, "fuel_pct": 92.0},
    "TRK-002": {"setpoint_c": 4.0, "lat": 28.6139, "lon": 77.2090, "fuel_pct": 85.5},
    "TRK-003": {"setpoint_c": -18.0, "lat": 9.9312, "lon": 76.2673, "fuel_pct": 78.0},
    "TRK-004": {"setpoint_c": 4.0, "lat": 18.5204, "lon": 73.8567, "fuel_pct": 64.0},
    "TRK-005": {"setpoint_c": 2.0, "lat": 28.5355, "lon": 77.3910, "fuel_pct": 89.0},
    "TRK-006": {"setpoint_c": 4.0, "lat": 12.9716, "lon": 77.5946, "fuel_pct": 90.0},
    "TRK-007": {"setpoint_c": 3.0, "lat": 23.0225, "lon": 72.5714, "fuel_pct": 82.0},
    "TRK-008": {"setpoint_c": -20.0, "lat": 22.5726, "lon": 88.3639, "fuel_pct": 74.0},
    "TRK-009": {"setpoint_c": 5.0, "lat": 30.7333, "lon": 76.7794, "fuel_pct": 88.0},
    "TRK-010": {"setpoint_c": 4.0, "lat": 17.3850, "lon": 78.4867, "fuel_pct": 95.0},
    "TRK-011": {"setpoint_c": 4.0, "lat": 26.9124, "lon": 75.7873, "fuel_pct": 80.0},
    "TRK-012": {"setpoint_c": 2.0, "lat": 26.8467, "lon": 80.9462, "fuel_pct": 87.0},
    "TRK-013": {"setpoint_c": -18.0, "lat": 26.1445, "lon": 91.7362, "fuel_pct": 76.0},
    "TRK-014": {"setpoint_c": 4.0, "lat": 23.2599, "lon": 77.4126, "fuel_pct": 83.0},
    "TRK-015": {"setpoint_c": -22.0, "lat": 12.9141, "lon": 74.8560, "fuel_pct": 91.0}
}

class BatchSimulateRequest(BaseModel):
    truck_ids: list[str]
    scenario: str = "COMPRESSOR_FAILURE"

@app.post("/api/telemetry/simulate-batch")
def trigger_batch_scenario(req: BatchSimulateRequest):
    """
    Simultaneously simulate anomalies or restorations across multiple selected trucks to produce tension.
    """
    global kafka_producer
    if not kafka_producer:
        try:
            kafka_producer = Producer({'bootstrap.servers': kafka_servers, 'client.id': 'dashboard-simulator-producer'})
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Kafka producer unavailable: {e}")

    results = []
    now_iso = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    time_str = datetime.now().strftime('%H:%M:%S')
    scenario = req.scenario.upper()

    for tid in req.truck_ids:
        prof = ALL_TRUCK_PROFILES.get(tid, {"setpoint_c": 4.0, "lat": 18.5204, "lon": 73.8567, "fuel_pct": 85.0})
        sp = prof["setpoint_c"]

        if scenario == "COMPRESSOR_FAILURE":
            cargo_temp = sp + 8.5
            door = False
            speed = 58.0
        elif scenario == "DOOR_OPEN_EXCURSION":
            cargo_temp = sp + 5.0
            door = True
            speed = 0.0
        elif scenario == "FREEZE_SPOILAGE":
            cargo_temp = -2.5 if sp > 0 else (sp - 8.0)
            door = False
            speed = 52.0
        elif scenario == "NORMAL_RESTORE":
            cargo_temp = sp
            door = False
            speed = 65.0
        else: # CHAOS_CASCADE / RANDOM
            import random
            choice = random.choice(["heat", "door", "extreme"])
            if choice == "heat":
                cargo_temp = sp + random.uniform(5.0, 9.0)
                door = False
                speed = 60.0
            elif choice == "door":
                cargo_temp = sp + random.uniform(3.0, 6.0)
                door = True
                speed = 0.0
            else:
                cargo_temp = sp + 10.0
                door = True
                speed = 45.0

        payload = {
            "truck_id": tid,
            "ts": now_iso,
            "lat": prof["lat"],
            "lon": prof["lon"],
            "speed_kmph": round(speed, 1),
            "fuel_pct": round(prof["fuel_pct"], 1),
            "cargo_temp_c": round(cargo_temp, 2),
            "setpoint_c": round(sp, 2),
            "door_open": door
        }

        excess = round(cargo_temp - sp, 2)
        status = "ALERT" if (excess >= 4.0 or (door and excess >= 2.0)) else ("WARNING" if excess >= 2.0 else "OK")
        reason = "Critical temperature excursion" if status == "ALERT" else ("Temperature warning" if status == "WARNING" else "Normal temperature range")
        if door: reason = "Door breach excursion"

        try:
            json_bytes = json.dumps(payload).encode('utf-8')
            kafka_producer.produce(
                topic=kafka_topic,
                key=tid.encode('utf-8'),
                value=json_bytes
            )
            results.append({"truck_id": tid, "status": "injected", "temp": cargo_temp, "door": door})
        except Exception as e:
            logger.error("Failed batch inject for %s: %s", tid, e)
            results.append({"truck_id": tid, "status": "failed", "error": str(e)})

        # Update Firestore directly for instant UI reflection
        if _db is not None:
            try:
                doc_ref = _db.collection("live_status").document(tid)
                doc_ref.set({
                    "truck_id": tid,
                    "last_ts": now_iso,
                    "lat": prof["lat"],
                    "lon": prof["lon"],
                    "speed_kmph": round(speed, 1),
                    "fuel_pct": round(prof["fuel_pct"], 1),
                    "cargo_temp_c": round(cargo_temp, 2),
                    "setpoint_c": round(sp, 2),
                    "excess_temp_c": excess,
                    "door_open": door,
                    "status": status,
                    "status_reason": reason,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                })
                if status == "ALERT":
                    _db.collection("alerts").add({
                        "truck_id": tid,
                        "ts": now_iso,
                        "status": status,
                        "cargo_temp_c": round(cargo_temp, 2),
                        "setpoint_c": round(sp, 2),
                        "excess_temp_c": excess,
                        "door_open": door,
                        "reason": f"⚡ Batch Simulation: {reason}",
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })
            except Exception as fe:
                logger.warning("Could not sync Firestore directly for %s: %s", tid, fe)

    try:
        kafka_producer.flush(timeout=3.0)
    except Exception:
        pass

    injected_logs_history.append({
        "time": time_str,
        "type": "alert-msg" if scenario != "NORMAL_RESTORE" else "success-msg",
        "message": f"⚡ Batch Tension Simulation [{scenario}] executed across {len(req.truck_ids)} trucks"
    })

    return {
        "scenario": scenario,
        "count": len(results),
        "results": results,
        "message": f"Successfully simulated {scenario} across {len(results)} trucks"
    }

# Mount static web frontend
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("DASHBOARD_PORT", "8000")))
