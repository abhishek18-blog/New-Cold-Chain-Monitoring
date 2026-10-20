# ❄️ ColdChain Fleet: Pure Serverless Google Cloud IoT Telemetry & Driver Alerting Platform

[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/downloads/)
[![Google Cloud](https://img.shields.io/badge/GCP-Pub%2FSub%20%7C%20Firestore%20%7C%20BigQuery%20%7C%20Cloud%20Run-4285F4.svg)](https://cloud.google.com/)
[![Terraform](https://img.shields.io/badge/IaC-Terraform-7B42BC.svg)](https://www.terraform.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A high-performance, 100% cloud-native, serverless IoT telemetry and cold chain fleet monitoring platform built on **Google Cloud Platform (GCP)**. It continuously monitors 16 refrigerated cargo trucks across India, detects temperature excursions and equipment anomalies in real time, pushes diagnostic alerts to drivers via Discord webhooks, and archives compliance data in BigQuery and Cloud Storage.

---

## 🏗️ System Architecture

```
[16 Refrigerated Trucks / Simulator / Edge Devices]
                 │
                 ▼ (Dual-Speed JSON Streaming: 1.0s normal + instant excursion burst)
 ┌─────────────────────────────────────────────────────────────────┐
 │ ⚡ GOOGLE CLOUD PUB/SUB INGESTION ENGINE                        │
 │   • telemetry-topic  ──► Direct BigQuery Streaming Sink         │
 │   • telemetry-topic  ──► telemetry-sub (Processor Worker)       │
 │   • alerts-topic     ──► alerts-sub (Alert Notification Worker) │
 │   • telemetry-dlq-topic (Quarantine for Malformed Payloads)     │
 └────────┬──────────────────────┬─────────────────────────────────┘
          │                      │
          │ Direct Zero-Code     │ Streaming Pull
          │ Streaming Pipe       │
          ▼                      ▼
 ┌─────────────────────────┐  ┌───────────────────────────────────┐
 │ 📊 GOOGLE BIGQUERY      │  │ 🚀 Microservice: Processor         │
 │   coldchain_analytics   │  │   (Cloud Run - Auto-scale 1-10)   │
 │   .telemetry_stream     │  │   • Ingress Backlog & Out-of-Order │
 │   • Day-Partitioned (ts)│  │     Timestamp Verification Guard   │
 │   • 30-Day Table TTL    │  │   • Excursion & Door Anomaly Logic │
 └────────┬────────────────┘  │   • Isolated Routing:             │
          │                   │     trucks/truck_{id}              │
          │ Nightly Archival  └──────────────┬────────────────────┘
          ▼                                  │
 ┌─────────────────────────┐  ┌──────────────┴────────────────────┐
 │ 🗄️ GOOGLE CLOUD STORAGE │  ▼                                   ▼
 │   ${project}-coldchain- │ ┌──────────────────────┐ ┌──────────────────────┐
 │   archive-prod          │ │ 🔥 CLOUD FIRESTORE   │ │ 📢 Microservice:     │
 │   (GZIP JSONL Archive)  │ │   • trucks/truck_{id}│ │     Alert Notifier   │
 └─────────────────────────┘ │   • live_status      │ │   (Cloud Run)        │
                             │   • alerts (unique ID│ │   • Driver Incident  │
                             └──────────┬───────────┘ │     Discord Push     │
                                        │             │   • Diagnostic Cards │
                                        │ onSnapshot()└──────────────────────┘
                                        ▼ (Direct WebSocket Stream)
                             ┌────────────────────────────────────────┐
                             │ 🌐 Operations Dashboard UI (Port 8000) │
                             │   • Leaflet Multi-Truck Real-time Map  │
                             │   • Historical Analytics & Trends      │
                             │   • Telemetry Test Studio & Simulator  │
                             └────────────────────────────────────────┘
```

---

## 🌟 Key Features & Architectural Enhancements

1. **100% Serverless & Cloud-Native (Zero Kafka / Zero ZooKeeper)**:
   - Eliminated heavy VM clusters and legacy bridge services. Ingestion connects directly to **Google Cloud Pub/Sub**.
   - Zero idle cost: scales to zero when trucks are parked.

2. **Direct BigQuery Zero-Code Streaming**:
   - Pub/Sub subscription `telemetry-bigquery-sub` ingests raw JSON payloads straight into `coldchain_analytics.telemetry_stream` without writing custom consumer code.
   - Raw native JSON format is preserved across all storage tiers for seamless schema evolution.

3. **Dual-Speed Simulation Cadence & Edge Dropout Buffer**:
   - **Normal Cadence (1.0s interval)**: Emits standard GPS, speed, fuel, and stable temperature readings every second, protecting Firestore's 1-write/sec/document quota.
   - **Burst / Event Mode**: Immediately bypasses sleep timers to transmit critical anomalies (door open, temperature spikes) with zero latency.
   - **Network Dropout Simulation**: Caches telemetry to an in-memory queue during connectivity loss and flushes upon reconnection with metadata flag `is_backlog: "true"`.

4. **Processor Ingress Protection & Isolated Document Routing**:
   - **Backlog Ingress Guard**: Backlog messages (`is_backlog == true`) stream to BigQuery for analytics and compliance, but bypass Firestore live status writes so the map view never jumps backwards.
   - **Timestamp Guard**: Rejects out-of-order or duplicate packets if `incoming_ts <= existing_last_ts`.
   - **Isolated Routing**: Every truck updates its own document `trucks/truck_{id}`.
   - **Unique Alert IDs**: Every alert generates a cryptographically unique document ID (`alert_{truck_id}_{timestamp}_{uuid}`).

5. **Direct Serverless Real-Time Operations Dashboard**:
   - Operations Dashboard connects directly to Cloud Firestore via the native Web SDK listener (`onSnapshot()`), eliminating client HTTP REST polling loops.

6. **Driver Real-Time Push Alerts (Discord Webhook)**:
   - Instant rich mobile push notifications delivered to drivers (including Driver 16) with actionable diagnostic cards (Door Ajar, Compressor Failure, Spoilage Freeze Hazard).

7. **Storage Lifecycle & Cold Archiving**:
   - BigQuery 30-day partition expiration policy minimizes query scan costs.
   - Automated archival script (`scripts/archive_bigquery_to_gcs.py`) exports cold partitions to GCS Archive storage as compressed `.jsonl.gz` files.

---

## 🚚 Fleet Roster & Monitored Corridors

The system continuously tracks 16 refrigerated vehicles across major Indian highway corridors:

| Truck ID | Route Corridor | Product Category | Setpoint | Driver Name | Contact / Alert Channel |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TRK-001** | Goa → Mumbai (NH 66) | Chilled Dairy | +4.0°C | Rajesh Sharma | +91 9820112345 · Discord |
| **TRK-002** | Delhi → Nagpur (NH 44) | Chilled Beverages | +4.0°C | Vikram Singh | +91 9811223344 · Discord |
| **TRK-003** | Kochi → Pondicherry (NH 544) | Frozen Seafood | -18.0°C | Anoop Nair | +91 9447123456 · Discord |
| **TRK-004** | Pune → Nashik (NH 60) | Fresh Produce | +4.0°C | Santosh Jadhav | +91 9822334455 · Discord |
| **TRK-005** | Noida → Indore (NH 48) | Vaccines / Biologics | +2.0°C | Amit Verma | +91 9910223344 · Discord |
| **TRK-006** | Bengaluru → Chennai (NH 48) | Chilled Meat | +4.0°C | Karthik Raja | +91 9840123456 · Discord |
| **TRK-007** | Ahmedabad → Surat (NE 1) | Dairy & Cheese | +3.0°C | Jignesh Patel | +91 9825123456 · Discord |
| **TRK-008** | Kolkata → Bhubaneswar (NH 16) | Frozen Poultry | -20.0°C | Subhash Bose | +91 9830123456 · Discord |
| **TRK-009** | Chandigarh → Amritsar (NH 3) | Ice Cream | +5.0°C | Harpreet Singh | +91 9814123456 · Discord |
| **TRK-010** | Hyderabad → Vijayawada (NH 65) | Chilled Vaccines | +4.0°C | Venkat Reddy | +91 9849123456 · Discord |
| **TRK-011** | Jaipur → Agra (NH 21) | Fresh Fruit | +4.0°C | Suresh Meena | +91 9414123456 · Discord |
| **TRK-012** | Lucknow → Varanasi (NH 731) | Pharma Insulin | +2.0°C | Pradeep Yadav | +91 9415123456 · Discord |
| **TRK-013** | Guwahati → Shillong (NH 6) | Frozen Plasma | -18.0°C | Biren Kalita | +91 9435123456 · Discord |
| **TRK-014** | Bhopal → Jabalpur (NH 45) | Dairy Products | +4.0°C | Ramesh Tiwari | +91 9425123456 · Discord |
| **TRK-015** | Mangaluru → Udupi (NH 66) | Deep Freeze Seafood | -22.0°C | Ganesh Poojary | +91 9448123456 · Discord |
| **TRK-016** | Pune → Mumbai (Expressway) | Critical Vaccines | +4.0°C | Abhishek Deshmukh | +91 9022290311 · Discord |

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Docker** and **Docker Compose v2+**
- **Python 3.12+** and `pip`

### 2. Start Local Microservices & GCP Emulators
Run a single command:
```bash
make up
```
This builds and launches:
- `pubsub-emulator` (Google Cloud Pub/Sub on port 8085)
- `firestore-emulator` (Google Cloud Firestore on port 8086)
- `processor` (Stream Processor with Ingress Guards)
- `alert-notifier` (Discord Webhook Notifier)
- `silence-detector` (Unresponsive Truck Monitor)
- `telemetry-generator` (Dual-Speed Telemetry Generator)
- `dashboard-api` (FastAPI + React Production Frontends on port 8000)

### 3. Access Frontends
- **🗺️ Operations Dashboard:** [http://localhost:8000/index.html](http://localhost:8000/index.html)
- **🎛️ Telemetry Test Studio:** [http://localhost:8000/simulator.html](http://localhost:8000/simulator.html)
- **📈 Historical Analytics:** [http://localhost:8000/analytics.html](http://localhost:8000/analytics.html)
- **📖 API Documentation (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)

---

## ☁️ Google Cloud (GCP) Turnkey Deployment

Deploy the entire production infrastructure to Google Cloud with **a single command** using Terraform and Google Cloud Build:

### Step 1: Authenticate with Google Cloud CLI
```bash
gcloud auth login
gcloud config set project <YOUR_GCP_PROJECT_ID>
```

### Step 2: Run Turnkey Deployment
```bash
./terraform/deploy.sh
# Or specify project and region:
./terraform/deploy.sh <YOUR_GCP_PROJECT_ID> asia-south1
```

The script automatically:
1. Enables required GCP APIs (Cloud Run, Pub/Sub, Firestore, BigQuery, Artifact Registry, Cloud Build, Cloud Scheduler).
2. Creates the Artifact Registry Docker repository.
3. Builds and pushes all microservices via Cloud Build.
4. Provisions BigQuery datasets, partitioned tables, GCS archive buckets, Firestore databases, and Pub/Sub subscriptions.
5. Deploys 3 auto-scaling Cloud Run services and 2 Cloud Run jobs.
6. Outputs the live public HTTPS Dashboard URL.

---

## 🧪 Testing & Validation

### 1. Run Complete Test Suite
```bash
make test
# or: pytest tests/ -v
```
Validates all 23 unit tests covering:
- Thermal excursion classification (`OK`, `WARNING`, `ALERT`).
- Debounce rules, hysteresis recovery, and alert cooldown timers.
- Ingress timestamp guards against out-of-order and duplicate telemetry.
- Alert generation transition state machines.
- Driver 16 contact registry and Discord failure diagnostic formatting.

### 2. High-Speed Telemetry Ingestion Benchmark (1,000 msg/s)
Test the generator's 1,000+ msg/sec streaming capacity:
```bash
# Dry-run throughput benchmark (5 seconds):
python3 scripts/blast_telemetry.py --rate 1000 --duration 5 --dry-run

# Live stream into Pub/Sub:
python3 scripts/blast_telemetry.py --rate 1000 --duration 10
```

### 3. Test Driver 16 Real-Time Anomaly Alert
```bash
python3 scripts/test_driver_alert.py
```
Triggers an immediate thermal excursion for Driver 16 (Abhishek Deshmukh) and verifies instant Discord mobile push delivery.

---

## 🛑 Teardown & Cleanup

- **Local Docker Compose:**
  ```bash
  make down   # Stop containers
  make clean  # Purge caches and temporary files
  ```

- **Google Cloud Platform (GCP):**
  ```bash
  make tf-destroy
  # or: cd terraform && terraform destroy -auto-approve
  ```

---

## 📄 License
This project is licensed under the MIT License.
