# 🏛️ ColdChain Fleet Architecture & End-to-End Data Flow

This document details the architectural design, event flow, decoupling mechanisms, and real-time observability metrics of the **ColdChain Fleet** MLOps and streaming data engineering platform.

---

## 1. High-Level System Architecture

```mermaid
flowchart TD
    subgraph INGESTION["① Ingestion Layer"]
        TG["📡 telemetry-generator\n15 Trucks · TRK-001→TRK-015\nNormal 5s · Stress 0.1s · Replay 250/s"]
        SIM["🎛️ Telemetry Test Studio\nManual Inject · Batch Simulate\n/api/telemetry/inject\n/api/telemetry/simulate-batch"]
        CSV["📄 Dataset Replayer\n24,000 historical records\nscripts/replay_dataset.py"]
    end

    subgraph BROKER["② Apache Kafka 4.0 (KRaft — No ZooKeeper)"]
        B1["Broker 1\nkafka-1:19092\nLeaders: 27 partitions"]
        B2["Broker 2\nkafka-2:19094\nLeaders: 27 partitions\n★ Active Raft Controller"]
        QUORUM["Raft Voter\nkafka-quorum:9093\nMetadata Quorum Only"]
        TOPIC["Topic: truck-telemetry\n3 Partitions · RF=2 · acks=all\n~437 bytes/msg avg"]
        DLQ["Topic: truck-telemetry-dlq\nDead Letter Queue\n(corrupt payloads after 5 retries)"]
    end

    subgraph CONSUMERS["③ Consumer Groups"]
        PB["🌉 pubsub-bridge\nGroup: pubsub-bridge\nSync commit after GCP ack\n~150–250 msg/s steady state"]
        ARC["🗄️ archiver\nGroup: archiver\nBatch 1,000 recs or 30s\n→ .jsonl.gz on disk"]
    end

    subgraph INTERMEDIATE["④ Event Distribution & Raw Storage"]
        PS["☁️ GCP Pub/Sub Emulator :8085\nTopic: telemetry-topic\nSub: telemetry-sub"]
        STORAGE["💾 Local Archive (GCS Mirror)\ndata/archive/YYYY/MM/DD/\n{partition}-{offset}.jsonl.gz"]
    end

    subgraph PROCESSING["⑤ Stream Processing & Classification"]
        PROC["⚙️ processor\nStreaming Pull from Pub/Sub\nclassify() → OK / WARNING / ALERT"]
        GUARD["🛡️ Idempotent Timestamp Guard\nshould_update_live_status()\nDrops out-of-order & duplicate events"]
        DLQ_ROUTE["⚠️ DLQ Router\nRoutes poison-pill records\nafter 5 retries"]
    end

    subgraph SERVING["⑥ Persistence, Detection & Serving"]
        DB["🔥 Firestore Emulator :8086\nlive_status — current truck states\nalerts — excursion incidents"]
        SIL["⏱️ silence-detector\nPolls every 30s\nMarks NO_SIGNAL if > 120s silent"]
        DASH["📊 dashboard-api (FastAPI :8000)\n/api/trucks · /api/alerts\n/api/metrics · /api/telemetry/*\n/health · Static Frontend"]
        UI["🖥️ Fleet Operations Dashboard\nLeaflet Map · KPI Cards\nCrisis Simulator · Alert Feed\n📡 Live Throughput Widget"]
    end

    subgraph OBSERVABILITY["⑦ Observability"]
        KUI["🌐 Kafka UI (Kafbat) :8082\nTopic browser · Consumer lag\nBroker health · Offset tracking"]
        METRICS["📈 /api/metrics endpoint\nmsgs/sec · KB/sec · mode\nIDLE / NORMAL / STRESS\n5s sliding window"]
    end

    %% Ingestion → Kafka
    TG -->|"JSON · 187 bytes/msg"| TOPIC
    SIM -->|"Manual POST"| TOPIC
    CSV -->|"Batch stream"| TOPIC

    %% Kafka internal
    B1 <-->|"Replication RF=2"| B2
    B1 -.->|"Raft metadata"| QUORUM
    B2 -.->|"Raft metadata"| QUORUM
    TOPIC -.->|"After 5 retries"| DLQ

    %% Kafka → Consumers
    TOPIC -->|"Consumer group: pubsub-bridge"| PB
    TOPIC -->|"Consumer group: archiver"| ARC

    %% Consumers → Destinations
    PB -->|"Sync publish + ack"| PS
    ARC -->|"Gzip batch write"| STORAGE

    %% Pub/Sub → Processor
    PS -->|"Streaming pull"| PROC
    PROC --> GUARD
    GUARD -->|"Upsert valid state"| DB
    PROC -.->|"Corrupt payload"| DLQ_ROUTE
    DLQ_ROUTE --> DLQ

    %% Silence + Serving
    SIL -->|"Poll + mark NO_SIGNAL"| DB
    DB -->|"Read live_status & alerts"| DASH
    DASH -->|"JSON REST APIs"| UI
    DASH -->|"Throughput metrics"| METRICS
    UI -.->|"Inject via Simulator"| SIM
    KUI -.->|"Monitor"| TOPIC
```

---

## 2. Data Flow: Producer → Consumer (Detailed)

```mermaid
sequenceDiagram
    participant GEN as 📡 Generator<br/>(15 trucks)
    participant K as ⚡ Kafka<br/>(truck-telemetry)
    participant PB as 🌉 pubsub-bridge
    participant PS as ☁️ Pub/Sub<br/>Emulator
    participant PROC as ⚙️ Processor
    participant FS as 🔥 Firestore
    participant API as 📊 Dashboard API
    participant UI as 🖥️ Browser

    Note over GEN,K: Every 5s (normal) or 0.1s (stress)
    GEN->>K: produce(truck_id, JSON payload, acks=all)
    K-->>GEN: delivery callback ✓

    Note over K,PB: Consumer Group: pubsub-bridge
    K->>PB: poll() → TruckTelemetry JSON
    PB->>PS: publisher.publish(topic_path, data)
    PS-->>PB: message_id ACK
    PB->>K: commit(async=False) ← offset advance

    Note over PS,FS: Streaming Pull subscription
    PS->>PROC: pull(telemetry-sub)
    PROC->>PROC: classify() → status
    PROC->>PROC: should_update_live_status() guard
    PROC->>FS: upsert live_status[truck_id]
    alt status == ALERT
        PROC->>FS: alerts.add(incident record)
    end
    PROC-->>PS: ack message

    Note over UI,API: Every 2 seconds (browser polling)
    UI->>API: GET /api/trucks
    API->>FS: live_status.stream()
    FS-->>API: 15 truck documents
    API-->>UI: JSON { trucks: [...] }

    UI->>API: GET /api/metrics
    API-->>UI: { msgs_per_sec, kb_per_sec, mode }
```

---

## 3. Throughput Modes & Measured Rates

| Mode | Command | msg/sec | KB/sec | Trigger |
|:---|:---|:---|:---|:---|
| **IDLE** | _(no injection)_ | 0 | 0 | No simulator activity |
| **NORMAL** | `make normal` | ~3 | ~0.7 | Generator at 5s interval |
| **NORMAL (UI burst)** | Click fleet buttons | 3–15 | 1–6 | Batch simulate via dashboard |
| **STRESS** | `make stress` | ~150–246 | ~65–105 | Generator at 0.1s interval |
| **REPLAY** | `make replay` | ~250 | ~106 | CSV dataset blast |

> **Live observation:** The **📡 Live Kafka Throughput** widget on the dashboard right panel shows real-time `msgs/sec`, `KB/sec`, progress bars, and a mode badge (`💤 IDLE` / `✅ NORMAL` / `⚡ STRESS`) updated every 2 seconds via `/api/metrics`.

---

## 4. Kafka Cluster Details

```mermaid
graph LR
    subgraph KRAFT["KRaft Quorum (No ZooKeeper)"]
        Q["Voter: kafka-quorum:9093\nRaft metadata only"]
    end

    subgraph CLUSTER["Kafka Cluster"]
        B1["kafka-1:19092\n★ ISR Leader\n27 partition leaders\n~12 MB on disk"]
        B2["kafka-2:19094\n★ Active Raft Controller\n27 partition leaders\n~12 MB on disk"]
        B1 <-->|"Replication RF=2\nISR: 108/108 (100%)"| B2
    end

    subgraph TOPICS["Topics"]
        T1["truck-telemetry\nP0 (Leader: B2) · Replicas: B2,B1\nP1 (Leader: B1) · Replicas: B1,B2\nP2 (Leader: B2) · Replicas: B2,B1"]
        T2["truck-telemetry-dlq\n1 Partition · RF=1"]
        T3["__consumer_offsets\n50 Partitions (internal)"]
    end

    Q -.->|"Raft votes"| B1
    Q -.->|"Raft votes"| B2
    B1 --- T1
    B2 --- T1
    B1 --- T2
    B1 --- T3
```

### Kafka Health Benchmarks

| Metric | Current Value | Meaning |
|:---|:---|:---|
| **Total Messages** | 9,937+ (and growing) | Confirmed pipeline ingestion at scale |
| **Kafka Log Size** | ~4.14 MB (×2 replicated = ~8 MB) | Avg 437 bytes/msg including headers |
| **Partitions** | 3 (P0, P1, P2) | Parallel consumption by truck_id hash |
| **Replication Factor** | 2 | Zero data loss if one broker crashes |
| **Under-Replicated Partitions** | **0** | Clean HA state |
| **DLQ Messages** | **0** | All payloads pass Pydantic schema validation |
| **Consumer Groups** | `pubsub-bridge`, `archiver` | Two independent downstream consumers |

---

## 5. Frontend Architecture

```mermaid
flowchart LR
    subgraph BROWSER["Browser (localhost:8000)"]
        IDX["🗺️ index.html\nFleet Operations Dashboard"]
        SIM_UI["🎛️ simulator.html\nTelemetry Test Studio"]

        subgraph APP["app.js — 2s poll loop"]
            FT["fetchTrucks()\n→ /api/trucks"]
            FA["fetchAlerts()\n→ /api/alerts"]
            FH["fetchHealth()\n→ /health"]
            FM["fetchMetrics()\n→ /api/metrics"]
        end

        subgraph SIM_JS["simulator.js — event-driven"]
            POLL["pollServerLogs()\n→ /api/telemetry/logs\nevery 2s"]
            FLEET["sendFleetSimulationTick()\n→ /api/telemetry/simulate-batch\nRotating: Heatwave→Door→Chaos→Restore"]
            PING["sendTelemetryPayload()\n→ /api/telemetry/inject"]
        end

        subgraph WIDGETS["Live Widgets"]
            MAP["Leaflet Map\n15 truck markers\nGPS breadcrumb trails\nHighway polylines"]
            TABLE["Fleet Status Table\n15 rows · 2s refresh"]
            ALERT_FEED["Alert & Incident Feed\nFirestore alerts collection"]
            HEALTH["Pipeline Health Pills\nKafka · Pub/Sub · Firestore"]
            THROUGHPUT["📡 Throughput Meter\nmsgs/sec bar · KB/sec bar\nIDLE/NORMAL/STRESS badge"]
            TERMINAL["📟 Pipeline Ingestion Log\nlocalStorage + server ring buffer\n200-entry deque"]
        end
    end

    IDX --> APP
    SIM_UI --> SIM_JS
    FT --> MAP
    FT --> TABLE
    FA --> ALERT_FEED
    FH --> HEALTH
    FM --> THROUGHPUT
    POLL --> TERMINAL
    FLEET --> TERMINAL
    PING --> TERMINAL
```

---

## 6. Microservice Component Responsibilities

| Service | Technology | Role & Resilience Pattern |
|:---|:---|:---|
| **`telemetry-generator`** | Python 3.12, Confluent-Kafka | Interpolates GPS positions along 15 real Indian highway routes. Supports `NORMAL` (5s), `STRESS` (0.1s), and env-controlled excursion probability. |
| **`kafka-1` / `kafka-2`** | Apache Kafka 4.0 (KRaft) | Distributed event log. RF=2 with 3 partitions. Raft quorum via `kafka-quorum`. No ZooKeeper. |
| **`kafka-quorum`** | Apache Kafka 4.0 (Raft Voter) | Dedicated metadata-only voter for KRaft leader election. Not a data broker. |
| **`pubsub-bridge`** | Python, Confluent-Kafka, Pub/Sub SDK | Reads Kafka, publishes to Pub/Sub. Commits offset **only after** Pub/Sub ACK — at-least-once guarantee. |
| **`processor`** | Python, Pub/Sub SDK, Firestore SDK | Classifies telemetry (OK/WARNING/ALERT), applies idempotent timestamp guard, upserts Firestore, routes DLQ on 5 retries. |
| **`archiver`** | Python, Confluent-Kafka, gzip | Raw data lake writer. Buffers 1,000 records or 30s, then flushes to `YYYY/MM/DD/{partition}-{offset}.jsonl.gz`. |
| **`silence-detector`** | Python, Firestore SDK | Heartbeat monitor. Polls `live_status` every 30s. Marks trucks `NO_SIGNAL` if last ping > 120s. |
| **`dashboard-api`** | FastAPI, Uvicorn | REST API hub. Serves `/api/trucks`, `/api/alerts`, `/api/metrics`, `/api/telemetry/*`, `/health`. Singleton Firestore client. In-memory 200-entry log deque. |
| **`kafka-ui`** | Kafbat (React) | Visual Kafka monitor at `:8082`. Shows topic offsets, consumer lag, broker health, partition leaders. |
| **Web Frontend** | HTML5, Vanilla CSS/JS, Leaflet | Two-page SPA: Fleet Dashboard + Telemetry Test Studio. localStorage log persistence, 2s server log polling, live throughput widget. |

---

## 7. Production GCP Migration Map

```
[Local Docker Service]              ──▶  [Google Cloud Managed Service]
────────────────────────────────────────────────────────────────────────────
telemetry-generator                 ──▶  IoT Core / Pub/Sub direct publish / Datastream
kafka-1 / kafka-2 (KRaft)           ──▶  Google Cloud Managed Kafka (Confluent) / GKE Kafka
kafka-quorum                        ──▶  (embedded in managed Kafka — no separate node)
pubsub-bridge                       ──▶  Kafka Connect Pub/Sub Sink Connector
Pub/Sub Emulator (:8085)            ──▶  Google Cloud Pub/Sub (telemetry-topic, telemetry-sub)
processor                           ──▶  Cloud Run (gen2, Eventarc Pub/Sub trigger)
Firestore Emulator (:8086)          ──▶  Cloud Firestore (Native mode, serverless)
archiver                            ──▶  Cloud Storage (GCS) + lifecycle Coldline/Archive rules
silence-detector                    ──▶  Cloud Scheduler (cron 1m) + Cloud Run Job
dashboard-api                       ──▶  Cloud Run (containerised FastAPI service)
kafka-ui (Kafbat)                   ──▶  Cloud Monitoring + Cloud Logging (Ops Agent)
Web Frontend                        ──▶  Firebase Hosting / Cloud CDN
/api/metrics endpoint               ──▶  Cloud Monitoring custom metrics + Grafana dashboard
```

---

## 8. Key Engineering Decisions

| Decision | Alternative Considered | Why This Choice |
|:---|:---|:---|
| **KRaft (no ZooKeeper)** | ZooKeeper-mode Kafka | Kafka 4.0 makes KRaft the only option; eliminates extra service dependency |
| **RF=2 across 2 brokers** | RF=1 (single copy) | Broker failover with zero data loss; tested with `make failover` |
| **Sync Pub/Sub commit** | Async batch commit | At-least-once delivery guarantee; Kafka absorbs lag spikes |
| **Firestore singleton client** | Per-request client | Prevents gRPC connection pool exhaustion under load |
| **localStorage + server deque** | Server-side only logs | Logs persist across browser page reloads; server ring buffer survives JS crashes |
| **5s sliding window for /api/metrics** | Cumulative average | Reflects *current* injection rate not lifetime average; resets correctly after Clear |
