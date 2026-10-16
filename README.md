# ❄️ ColdChain Fleet: Real-Time Cold Chain Fleet Management System

A high-performance, local-first microservice platform for real-time cold chain truck telemetry streaming, intelligent thermal excursion classification, driver incident alerting, and raw event data archival.

---

## 🏗️ System Architecture

```
[Telemetry Generator] (5 Trucks: TRK-001..005)
       │ (JSON pings every 5s / acks=all / idempotence)
       ▼
 ┌────────────────────────────────────────────────────────┐
 │           Apache Kafka Cluster (KRaft Mode)            │
 │   kafka-1:19092 ── (RF: 2) ── kafka-2:19094            │
 │             ▲                   ▲                      │
 │             └── kafka-quorum:9093 (Voter 3)            │
 └───────────────────────┬────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
┌──────────────────┐            ┌──────────────────┐
│  pubsub-bridge   │            │     archiver     │
│ (Manual Offsets) │            │ (Batched Gzip)   │
└───────┬──────────┘            └────────┬─────────┘
        │                                │
        ▼                                ▼
┌───────────────────────┐       ┌──────────────────────────────┐
│  Google Cloud Pub/Sub │       │ Local Volume / GCS Mirror    │
│  Emulator (:8085)     │       │ /archive/truck-data/YYYY/MM/ │
└───────┬───────────────┘       └──────────────────────────────┘
        │
        ▼
┌───────────────────────┐
│   stream-processor    │ ◄── Pure processing.py
│ (Classify OK/WARN/ERR)│
└───────┬───────────────┘
        │
        ▼ (Transactional Idempotent Upsert)
┌───────────────────────┐
│ Cloud Firestore       │ ◄── silence-detector (Every 30s checks >120s lag)
│ Emulator (:8086)      │
└───────┬───────────────┘
        │
        ▼
┌───────────────────────┐
│     dashboard-api     │
│  FastAPI + Leaflet UI │ ────► http://localhost:8000
└───────────────────────┘
```

---

## ☁️ Local to GCP Production Mapping

Moving from local Docker Compose to Google Cloud Platform requires **zero code changes**—only environment variables and managed infrastructure swap:

| Component | Local Implementation | GCP Production Target | Migration Configuration |
| :--- | :--- | :--- | :--- |
| **Event Backbone** | Apache Kafka 4.0 Containers (KRaft) | Google Compute Engine (VPC-isolated) / Managed Kafka | Update `KAFKA_BOOTSTRAP_SERVERS` |
| **Pub/Sub Connector** | `pubsub-bridge` Python Container | Kafka Connect Pub/Sub Sink Connector | Deploy sink connector JSON config |
| **Event Broker** | Google Pub/Sub Emulator | Google Cloud Pub/Sub (`telemetry-topic`) | Remove `PUBSUB_EMULATOR_HOST` |
| **Stream Processing** | `processor` Container | Cloud Run Functions (gen2) / Eventarc | Wrap `processing.py` entrypoint |
| **Live State Database**| Cloud Firestore Emulator | Cloud Firestore (Native Mode) | Remove `FIRESTORE_EMULATOR_HOST` |
| **Telemetry Archiver** | `archiver` Container (GZ JSONL) | Cloud Storage (GCS) + Lifecycle Rules | Swap volume with GCS sink connector |
| **Silence Detection** | `silence-detector` Container | Cloud Scheduler + Cloud Run Job | Trigger once per minute via cron |
| **Serving & UI** | `dashboard-api` (FastAPI / Uvicorn) | Google Cloud Run | Deploy container to Cloud Run |
| **Kafka Observability**| `kafka-ui` (:8080) | Cloud Monitoring & Cloud Logging | Native GCP Ops Agent Metrics |

---

## 🚀 Quick Start (Local Machine)

### 1. Prerequisites
- **Docker** and **Docker Compose v2+** installed.
- **Python 3.12+** and `pytest` (for local unit tests).

### 2. Start the Cluster
Run a single command:
```bash
make up
# or: docker compose up --build -d
```

### 3. Application Frontends & URLs
* **🗺️ Frontend 1: Fleet Operations Dashboard** &rarr; **[http://localhost:8000/index.html](http://localhost:8000/index.html)**
  * Real-time Leaflet map tracking all 5 trucks across India.
  * Live status table (cargo temp, setpoint, excess, door state, speed, fuel, last seen).
  * Color-coded statuses: 🟢 `OK`, 🟡 `WARNING`, 🔴 `ALERT`, ⚪ `NO_SIGNAL`.
  * Driver & Incident alert feed.

* **🎛️ Frontend 2: Telemetry Test Studio & Simulator** &rarr; **[http://localhost:8000/simulator.html](http://localhost:8000/simulator.html)**
  * **Interactive Signal Manipulation**: Sliders for Cargo Temperature, Setpoint, Speed, Door State (Open/Closed), and GPS Coordinates.
  * **One-Click Anomaly Test Scenarios**: Trigger Compressor Failure (+9.5°C), Door Left Ajar (+6.8°C), Freeze Hazard (-1.5°C), or Normal Recovery (4.0°C).
  * **Continuous Custom Stream**: Auto-stream manipulated telemetry at 1s intervals.
  * **Live Ingestion Terminal**: Real-time log showing payload delivery to Kafka and offset commits.

* **📊 Kafka UI Cluster Management:** [http://localhost:8082](http://localhost:8082)
* **📖 FastAPI Interactive Swagger Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 🧪 Automated Testing & Chaos Engineering

### 1. Run Unit Tests (Classification & Timestamp Guard)
```bash
make test
```
Validates:
- Classification rules (OK, WARNING $\ge 2.0^\circ\text{C}$, ALERT $\ge 4.0^\circ\text{C}$, Door-open excursions).
- Idempotent Firestore timestamp guards against duplicate and out-of-order messages.
- Alert transition state machine logic.

### 2. Run Kafka Broker Failover Test (Zero Data Loss)
```bash
make failover
# or: ./scripts/failover_test.sh
```
What this script demonstrates:
1. Describes topic partitions and Initial In-Sync Replicas (ISR) across `kafka-1` and `kafka-2`.
2. Records the live telemetry stream timestamp from the dashboard.
3. Kills `kafka-1` container mid-stream.
4. Confirms partition leader failover to `kafka-2`.
5. Verifies telemetry timestamps continue advancing continuously during the broker outage.
6. Restarts `kafka-1` and validates ISR cluster re-synchronization.

---

## 📁 Archived Data
Raw telemetry is continuously persisted to `./data/archive/truck-data/YYYY/MM/DD/<partition>-<offset>.jsonl.gz`.

To inspect compressed data on your local host:
```bash
zcat ./data/archive/truck-data/*/*/*/*.jsonl.gz | head -n 5
```

---

## 🛑 Teardown & Reset
```bash
make down   # Stops containers
make reset  # Removes containers, volumes, and archive logs
```
