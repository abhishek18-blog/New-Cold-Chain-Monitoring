# 🔄 ColdChain Fleet Architecture & End-to-End Data Flow

This document outlines the end-to-end data flow, messaging architecture, streaming lifecycle, and component interactions in the **ColdChain Fleet** platform, including real-time driver & fleet alerting.

---

## 1. End-to-End System Architecture Diagram

```mermaid
flowchart TD
    %% Styling
    classDef edgeStyle fill:#e1f5fe,stroke:#0288d1,stroke-width:2px,color:#01579b;
    classDef kafkaStyle fill:#fff3e0,stroke:#f57c00,stroke-width:2px,color:#e65100;
    classDef cloudStyle fill:#ede7f6,stroke:#7e57c2,stroke-width:2px,color:#4a148c;
    classDef processStyle fill:#e8f5e9,stroke:#43a047,stroke-width:2px,color:#1b5e20;
    classDef alertStyle fill:#ffebee,stroke:#c62828,stroke-width:2px,color:#b71c1c;
    classDef serveStyle fill:#fce4ec,stroke:#d81b60,stroke-width:2px,color:#880e4f;

    %% 1. Ingestion Layer
    subgraph INGESTION["1️⃣ INGESTION LAYER (Edge / Test Sources)"]
        TG["📡 Telemetry Generator<br/>(15 Trucks: TRK-001 → TRK-015)"]:::edgeStyle
        CSV["📄 Dataset Replayer<br/>(Historical CSV Replay)"]:::edgeStyle
        SIM["🎛️ Simulator / Test Studio<br/>(Crisis & Stress Injections)"]:::edgeStyle
    end

    %% 2. Kafka Layer
    subgraph KAFKA["2️⃣ APACHE KAFKA CLUSTER (KRaft / Multi-Broker)"]
        TOPIC["⚡ Topic: truck-telemetry<br/>(3 Partitions · Replication Factor=2)"]:::kafkaStyle
        K_DLQ["⚠️ Topic: truck-telemetry-dlq<br/>(Dead-Letter Queue)"]:::kafkaStyle
    end

    %% 3. Consumers Layer
    subgraph CONSUMERS["3️⃣ INDEPENDENT CONSUMER GROUPS"]
        PB["🌉 Pub/Sub Bridge<br/>(Consumer Group: pubsub-bridge)"]:::kafkaStyle
        ARC["🗄️ Parquet/Gzip Archiver<br/>(Consumer Group: archiver)"]:::kafkaStyle
    end

    %% 4. Storage & Cloud PubSub Layer
    subgraph CLOUD["4️⃣ CLOUD & ARCHIVE STORAGE"]
        PS_TOPIC["☁️ GCP Pub/Sub: telemetry-topic<br/>(Subscription: telemetry-sub)"]:::cloudStyle
        PS_DLQ["☁️ GCP Pub/Sub: telemetry-dlq-topic<br/>(Poison-pill > 5 retries)"]:::cloudStyle
        PS_ALERTS["📢 GCP Pub/Sub: alerts-topic<br/>(Subscription: alerts-sub)"]:::cloudStyle
        DISK_ARCHIVE["💾 Data Archive (Local / Cloud Storage)<br/>(/data/archive/YYYY/MM/DD/*.jsonl.gz)"]:::cloudStyle
    end

    %% 5. Stream Processing & State
    subgraph PROCESSING["5️⃣ REAL-TIME STREAM PROCESSING"]
        PROC["⚙️ Stream Processor<br/>• Schema Validation<br/>• Temp/Humidity Excursion Classification<br/>• Out-of-Order Timestamp Guard"]:::processStyle
    end

    %% 6. Alerting & Notification Layer
    subgraph ALERTING["6️⃣ DRIVER & OPS ALERTING"]
        NOTIF["🔔 alert-notifier Microservice<br/>• Driver Registry Lookup<br/>• 5-min Anti-Spam Debouncer"]:::alertStyle
        DRIVER_SMS["📱 Driver SMS / WhatsApp Gateway<br/>('⚠️ TRK-001: Temp +5.5°C Door Open!')"]:::alertStyle
        IN_CAB["🔊 In-Cab Telematics Downlink<br/>(Audio Buzzer & LED Warning)"]:::alertStyle
        OPS_NOTIF["📢 Fleet Ops Emergency Channel"]:::alertStyle
    end

    %% 7. Database & Serving Layer
    subgraph SERVING["7️⃣ DATABASE, DETECTION & SERVING"]
        FS_LIVE["🔥 Firestore: live_status<br/>(Latest Real-Time State of 15 Trucks)"]:::serveStyle
        FS_ALERTS["🚨 Firestore: alerts<br/>(Logged Excursion Incidents)"]:::serveStyle
        SIL["⏱️ Silence Detector<br/>(Runs every 30s · Flags NO_SIGNAL if >120s)"]:::serveStyle
        API["⚡ FastAPI Backend (:8000)<br/>(/api/trucks, /api/alerts, /api/metrics)"]:::serveStyle
        UI["🖥️ Fleet Operations Dashboard<br/>(Live Map, Real-time KPIs, Alert Center)"]:::serveStyle
    end

    %% Connections
    TG -->|JSON Payload| TOPIC
    CSV -->|Batch Stream| TOPIC
    SIM -->|REST Injection| TOPIC

    TOPIC -->|Stream Events| PB
    TOPIC -->|Batch 1,000 recs / 30s| ARC
    TOPIC -.->|Failed Deserialization| K_DLQ

    ARC -->|Flush Compressed Files| DISK_ARCHIVE
    PB -->|Publish + Ack| PS_TOPIC

    PS_TOPIC -->|Streaming Pull| PROC
    PROC -.->|Failed after 5 attempts| PS_DLQ

    PROC -->|Update Truck State| FS_LIVE
    PROC -->|Record Excursion| FS_ALERTS
    PROC -->|Publish on ALERT| PS_ALERTS

    PS_ALERTS -->|Streaming Pull| NOTIF
    NOTIF -->|1. SMS / WhatsApp| DRIVER_SMS
    NOTIF -->|2. In-Cab Alarm| IN_CAB
    NOTIF -->|3. Slack/Webhook| OPS_NOTIF

    SIL -->|Audit Last Ping & Flag Silent| FS_LIVE

    FS_LIVE -->|Read States| API
    FS_ALERTS -->|Read Alerts| API
    API -->|REST & WebSockets| UI
```

---

## 2. Component & Layer Breakdown

### 1️⃣ Ingestion Layer
- **[telemetry-generator/generator.py](file:///home/user/Desktop/cold-chain-cloud/telemetry-generator/generator.py)**: Simulates 15 commercial refrigerated trucks traveling realistic highway routes across India. Emits temperature, humidity, GPS location, speed, fuel percentage, door status, and vibration levels.
- **[scripts/replay_dataset.py](file:///home/user/Desktop/cold-chain-cloud/scripts/replay_dataset.py)**: Streams historical CSV sensor datasets to Kafka at configurable rates (e.g., 250 msgs/sec) for benchmark testing.
- **Simulator & Test Studio**: Web-based injection interface in the dashboard for manual edge cases, cooling failures, and stress testing.

### 2️⃣ Message Ingestion & Buffer (Apache Kafka)
- **Topic `truck-telemetry`**: 3 partitions with a replication factor of 2. Acts as a decoupled buffer absorbing high write throughput.
- **Topic `truck-telemetry-dlq`**: Dead-letter queue for corrupt, unparseable, or schema-violating incoming payloads.

### 3️⃣ Decoupled Consumer Groups
- **[pubsub-bridge/bridge.py](file:///home/user/Desktop/cold-chain-cloud/pubsub-bridge/bridge.py)** (Consumer Group: `pubsub-bridge`): Continuously pulls messages from Kafka and securely publishes them to GCP Pub/Sub, committing Kafka offsets only upon successful cloud receipt.
- **[archiver/archiver.py](file:///home/user/Desktop/cold-chain-cloud/archiver/archiver.py)** (Consumer Group: `archiver`): Collects raw telemetry and batches 1,000 records or flushes every 30 seconds into gzip-compressed JSONL files for cold storage analytics without impacting the real-time processing path.

### 4️⃣ Cloud Ingestion (Google Cloud Pub/Sub)
- **Topic `telemetry-topic` & Subscription `telemetry-sub`**: Cloud messaging backbone for decoupled stream subscribers with an acknowledgment deadline of 20 seconds.
- **Topic `alerts-topic` & Subscription `alerts-sub`**: Dedicated event stream for incident excursions and driver dispatch events.
- **Dead-Letter Policy (`telemetry-dlq-topic`)**: Automatically routes messages that fail processing after 5 delivery attempts.

### 5️⃣ Stream Processing & Classification
- **[processor/processing.py](file:///home/user/Desktop/cold-chain-cloud/processor/processing.py)**:
  - **Schema Validation**: Validates payload structure and data types.
  - **Excursion Logic**: Evaluates temperature and humidity against safe cargo thresholds (`OK`, `WARNING`, `CRITICAL`).
  - **Timestamp Guard (`should_update_live_status`)**: Ensures only newer timestamps update the live truck state, preventing out-of-order or duplicate telemetry overwrites.
  - **Alert Publisher**: Publishes alert events to `alerts-topic` for decoupled multi-channel dispatch.

### 6️⃣ Driver & Fleet Alerting Service
- **[alert-notifier/notifier.py](file:///home/user/Desktop/cold-chain-cloud/alert-notifier/notifier.py)**:
  - Consumes from `alerts-sub`.
  - **Driver Directory Lookup**: Identifies driver name, contact phone, assigned route, and cargo sensitivity for the specific truck.
  - **Anti-Spam Debouncer**: Enforces a 5-minute cooldown per truck to avoid spamming the driver during a prolonged excursion.
  - **Multi-Channel Dispatch**: Simulates Driver SMS/WhatsApp dispatch, In-cab telematics buzzer downlink, and Fleet Ops channel notification.

### 7️⃣ State Storage, Detection & Serving
- **Firestore `live_status` Collection**: Retains the single latest state of each truck (location, health, status).
- **Firestore `alerts` Collection**: Time-series audit log capturing excursion events and resolution timestamps.
- **[silence-detector](file:///home/user/Desktop/cold-chain-cloud/silence-detector)**: Periodically audits the `live_status` collection every 30 seconds. Flags trucks as `NO_SIGNAL` if their last telemetry report exceeds 120 seconds.
- **FastAPI Backend (:8000)** & **Web Dashboard**: Exposes REST endpoints (`/api/trucks`, `/api/alerts`, `/api/metrics`) and renders an interactive operations map, live KPI cards, and an incident feed.

---

## 3. Detailed Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant GEN as 📡 Telemetry Generator
    participant KAFKA as ⚡ Kafka (truck-telemetry)
    participant ARC as 🗄️ Archiver
    participant BRIDGE as 🌉 Pub/Sub Bridge
    participant PUBSUB as ☁️ GCP Pub/Sub (telemetry-sub)
    participant PROC as ⚙️ Stream Processor
    participant DB as 🔥 Firestore (live_status & alerts)
    participant ALERTS_TOPIC as 📢 Pub/Sub (alerts-topic)
    participant NOTIF as 🔔 alert-notifier
    participant DRIVER as 📱 Highway Driver (SMS & In-Cab Buzzer)
    participant SIL as ⏱️ Silence Detector
    participant API as 📊 FastAPI & Dashboard

    GEN->>KAFKA: Publish telemetry JSON (partitioned by truck_id)
    
    par Dual Consumer Fan-Out
        KAFKA->>ARC: Consume batch (1,000 recs or 30s)
        ARC->>ARC: Write & compress to .jsonl.gz storage
    and
        KAFKA->>BRIDGE: Consume telemetry event
        BRIDGE->>PUBSUB: Publish to telemetry-topic
        PUBSUB-->>BRIDGE: Ack received
        BRIDGE->>KAFKA: Commit Kafka offset
    end

    PUBSUB->>PROC: Streaming pull telemetry message
    PROC->>PROC: Validate schema & check threshold excursions
    PROC->>DB: Upsert live_status (with timestamp guard)
    
    opt Excursion Transition Detected (ALERT)
        PROC->>DB: Log incident in alerts collection
        PROC->>ALERTS_TOPIC: Publish alert event to alerts-topic
    end
    PROC-->>PUBSUB: Ack telemetry message

    ALERTS_TOPIC->>NOTIF: Pull alert event from alerts-sub
    NOTIF->>NOTIF: Check 5-min anti-spam cooldown & lookup driver phone
    opt Cooldown OK
        NOTIF->>DRIVER: Dispatch SMS & Trigger In-Cab Buzzer Downlink
    end
    NOTIF-->>ALERTS_TOPIC: Ack alert event

    loop Every 30s
        SIL->>DB: Check last_updated timestamps
        opt last_updated > 120s ago
            SIL->>DB: Update status to NO_SIGNAL
        end
    end

    loop UI Polling / Updates
        API->>DB: Fetch latest live_status and active alerts
        API-->>API: Stream to Web Dashboard (Map & KPIs)
    end
```
