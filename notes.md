# 📚 ColdChain Fleet: Complete Engineering & Architecture Notes

A comprehensive technical study guide and system manual covering **Producers**, **Consumers**, **Kafka Brokers**, **Downstream Processors**, **Data Structures**, and **Reliability Patterns** in the ColdChain Fleet streaming platform.

---

## 📑 Table of Contents
1. [System Overview & Architecture Philosophy](#1-system-overview--architecture-philosophy)
2. [Producers Deep-Dive](#2-producers-deep-dive)
3. [Consumers Deep-Dive & Consumer Lag](#3-consumers-deep-dive--consumer-lag)
4. [Kafka Cluster, KRaft & Topics](#4-kafka-cluster-kraft--topics)
5. [Downstream Services & Pipeline Components](#5-downstream-services--pipeline-components)
6. [Failure Modes, DLQ & Resilience Patterns](#6-failure-modes-dlq--resilience-patterns)
7. [Glossary & Interview / Viva Cheat Sheet](#7-glossary--interview--viva-cheat-sheet)
8. [Run & Deploy Guide: All Commands](#8-run--deploy-guide-all-commands)
9. [Architectural Gap Analysis & Solutions (1,000 msg/s Conflation & Webhook Rate Limiting)](#9-architectural-gap-analysis--solutions-1000-msgs-conflation--webhook-rate-limiting)

---

## 1. System Overview & Architecture Philosophy

### What is ColdChain Fleet?
ColdChain Fleet is an enterprise event-driven streaming system that tracks cold-chain logistics vehicles (refrigerated trucks transporting perishable food, dairy, vaccines, and pharmaceuticals).

### Core Problem It Solves:
1. **Perishable Cargo Loss:** If a reefer compressor fails or a driver leaves a cargo door open, cargo spoils in minutes. Alerts must fire in sub-seconds.
2. **High-Frequency Ingestion at Scale:** Hundreds of trucks emit GPS, temperature, and door status at high speeds. The ingestion backbone must absorb traffic spikes without dropping messages.
3. **Decoupling Producers from Sinks:** GPS sensors must not wait for databases or cloud services to write. Kafka acts as an immutable buffer.
4. **Auditability & Compliance:** Regulatory agencies (FDA, FSSAI) mandate raw immutable records of temperature history for every shipment.

---

## 2. Producers Deep-Dive

A **Producer** in Apache Kafka is a client application that publishes records (events) to a Kafka topic.

### 2.1 The Producers in This System

| Producer Source | Location | Purpose & Trigger | Message Rate |
| :--- | :--- | :--- | :--- |
| **`telemetry-generator`** | [`telemetry-generator/generator.py`](file:///home/user/Desktop/cold-chain-cloud/telemetry-generator/generator.py) | Simulates continuous highway driving for 15 trucks (TRK-001..015) with physics, fuel decay, and random temperature excursions. | Normal: 5s per tick (3 msg/s)<br/>Stress: 0.1s per tick (~150 msg/s) |
| **`dashboard-api` (Studio)** | [`dashboard/main.py`](file:///home/user/Desktop/cold-chain-cloud/dashboard/main.py) | Interactive operator injection from web UI (`/api/telemetry/inject` & `/api/telemetry/scenario`). | On-demand / manual |
| **`scripts/replay_dataset.py`** | [`scripts/replay_dataset.py`](file:///home/user/Desktop/cold-chain-cloud/scripts/replay_dataset.py) | High-speed benchmark replayer streaming all 24,000 records from `shipment-sensor-dataset.csv`. | 250 msg/s up to unthrottled maximum |
| **`processor` (DLQ Producer)** | [`processor/main.py`](file:///home/user/Desktop/cold-chain-cloud/processor/main.py) | Routes poison-pill/unparseable messages to `truck-telemetry-dlq` after 5 failed retries. | Rare (on poison pills only) |

---

### 2.2 Producer Configuration Settings Explained

In our code, Kafka producers are initialized with `confluent_kafka.Producer(conf)`:

```python
conf = {
    'bootstrap.servers': 'kafka-1:19092,kafka-2:19094',
    'client.id': 'telemetry-generator-client',
    'acks': 'all',
    'enable.idempotence': True,
    'retries': 10,
    'retry.backoff.ms': 500,
    'queue.buffering.max.messages': 100000
}
```

* **`bootstrap.servers`**: Initial list of host/port broker pairs to discover the full cluster metadata. Providing 2 brokers ensures discovery succeeds even if one broker is offline.
* **`acks='all'` (or `-1`)**: The producer will only receive a success acknowledgement once the message is written to **all In-Sync Replicas (ISR)**. Guarantees **zero data loss**.
* **`enable.idempotence=True`**: Prevents duplicate messages on network retries. Kafka assigns an internal Producer ID (PID) and sequence numbers to every message. If a broker fails right before sending an ack and the producer retries, the broker detects the duplicate sequence number and commits it exactly once.
* **`retries=10` & `retry.backoff.ms=500`**: If a transient network glitch or broker leader re-election happens, retry up to 10 times with 500ms intervals before reporting failure.
* **`queue.buffering.max.messages=100000`**: Maximum number of messages allowed in the local client RAM buffer while waiting for Kafka transmission. Prevents out-of-memory crashes during high-speed stress mode.

---

### 2.3 Partitioning & Keying Strategy

Every message produced to Kafka has two parts:
$$\text{Kafka Record} = (\text{Key}, \text{Value}, \text{Timestamp}, \text{Headers})$$

* **Key:** `truck_id.encode('utf-8')` (e.g. `"TRK-001"`, `"TRK-008"`)
* **Value:** JSON string conforming to `TruckTelemetry` model
* **Why Key by `truck_id`?**
  * Kafka hashes the key using `murmur2(key) % num_partitions` to choose the destination partition.
  * **Critical Invariant:** All messages for the same truck will ALWAYS land on the **same partition**.
  * **Guarantee:** Kafka guarantees **strict FIFO (First-In, First-Out) ordering per partition**. Therefore, a truck's temperature readings are never processed out of chronological sequence by a consumer reading that partition.

---

### 2.4 Payload Schema (`TruckTelemetry`)

```json
{
  "truck_id": "TRK-001",
  "ts": "2026-10-02T14:45:00Z",
  "lat": 15.4909,
  "lon": 73.8278,
  "speed_kmph": 64.5,
  "fuel_pct": 89.2,
  "cargo_temp_c": 4.15,
  "setpoint_c": 4.0,
  "door_open": false
}
```

---

## 3. Consumers Deep-Dive & Consumer Lag

A **Consumer** reads records from one or more topics. Consumers organize into **Consumer Groups**.

### 3.1 The Consumers in This System

```
                           ┌──► Consumer Group: archiver (writes .jsonl.gz)
Topic: truck-telemetry ────┤
                           └──► Consumer Group: pubsub-bridge (forwards to GCP Pub/Sub)
```

| Consumer Service | Group ID | Offset Commit Mode | Batch / Poll Strategy | Destination |
| :--- | :--- | :--- | :--- | :--- |
| **`archiver`** | `archiver` | Manual commit (`commit(asynchronous=False)`) | Batch RAM buffer (flushes every 1,000 recs or 30s) | Compressed files in `data/archive/` |
| **`pubsub-bridge`** | `pubsub-bridge` | Manual commit (`commit(asynchronous=False)`) | Per-message sync publish + commit | Google Cloud Pub/Sub (`telemetry-topic`) |
| **`processor`** | `telemetry-sub` (Pub/Sub) | Pub/Sub ack / nack | Streaming pull callback | Cloud Firestore (`live_status`, `alerts`) |

---

### 3.2 Fan-Out Pattern via Consumer Groups

Notice that **both** `archiver` and `pubsub-bridge` read the exact same `truck-telemetry` topic, but they have different `group.id` values:
* **Group `archiver`** tracks its own committed offset pointer.
* **Group `pubsub-bridge`** tracks its own independent committed offset pointer.
* **Result:** Both consumer groups receive **100% of all messages** (Publish/Subscribe fan-out). If the bridge slows down, it has zero impact on the archiver.

---

### 3.3 Consumer Offset Commit Strategies

* **Auto-Commit (`enable.auto.commit=True`):** **Dangerous in production!** Consumer periodically commits offsets in the background regardless of whether the message was successfully processed. If the container crashes after reading from Kafka but before writing to disk, messages are permanently lost.
* **Manual Commit (`enable.auto.commit=False`):** **Used in our project.**
  * In `pubsub-bridge`: We only call `consumer.commit(message=msg)` **after** Pub/Sub responds with a verified `message_id`.
  * In `archiver`: We only call `consumer.commit(offsets=...)` **after** the `.jsonl.gz` file is safely written and synced to disk.
  * **Guarantee:** **At-least-once processing**. No message is ever skipped.

---

### 3.4 Consumer Lag Explained

**Consumer Lag** is the single most important operational metric for Kafka consumers:

$$\text{Consumer Lag} = \text{Latest Offset Written by Producers (High Watermark)} - \text{Current Committed Offset of Consumer}$$

#### Why Did You See 31,343 Lag in `pubsub-bridge`?
During `make stress` (~150 msgs/s) or `make replay` (250 msgs/s):
1. **Producer Rate:** ~150–250 messages/sec.
2. **`pubsub-bridge` Processing Speed:** Each message executes a network round-trip to the Pub/Sub emulator (`future.result()`) and then a network round-trip to Kafka broker for the synchronous commit. At ~3 ms per message, max throughput is ~150–180 msg/s.
3. **The Result:** The producer outpaces the consumer, causing messages to accumulate in Kafka as **lag**.
4. **Why This is Good:** In a synchronous architecture without Kafka (e.g. direct HTTP calls from trucks to databases), the database would crash or return `503 Service Unavailable`. With Kafka, **Kafka acts as a shock absorber**: it holds the messages safely on disk, and `pubsub-bridge` drains them at its steady, safe pace.

---

## 4. Kafka Cluster, KRaft & Topics

### 4.1 KRaft Mode (Kafka without ZooKeeper)
Our cluster uses **Apache Kafka 4.0 in KRaft (Kafka Raft) mode**:
* Previously, Kafka required a separate Apache ZooKeeper cluster to manage metadata and leader elections.
* In KRaft mode, Kafka brokers elect their own Raft leader (called the **Active Controller**).
* In our setup, **`kafka-2`** is elected the active controller, with `kafka-1` and `kafka-quorum` participating in the Raft metadata quorum.

---

### 4.2 Topic Specifications

| Topic Name | Partitions | Replication Factor (RF) | In-Sync Replicas (ISR) | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **`truck-telemetry`** | 3 | 2 | 2 | Primary real-time telemetry streaming topic. |
| **`truck-telemetry-dlq`**| 1 | 2 | 2 | Dead Letter Queue for poison-pill records. |
| **`__consumer_offsets`** | 50 | 2 | 2 | Internal compacted topic storing committed consumer offsets. |

---

### 4.3 High Availability (HA) & Failover Mechanics

* **Replication Factor (RF = 2):** Every partition has 1 Leader copy and 1 Follower replica copy across `kafka-1` and `kafka-2`.
* **Under-Replicated Partitions (URP = 0):** All replicas are fully synchronized with leaders.
* **Failover Scenario (`make failover`):**
  1. If `kafka-1` is abruptly stopped (`docker stop coldchain-kafka-1`):
  2. The Raft controller detects broker failure within seconds.
  3. `kafka-2` immediately promotes all follower replicas to Leaders.
  4. Producers and consumers automatically reconnect to `kafka-2` with **zero downtime and zero lost messages**.
  5. When `kafka-1` restarts, it catches up with the log and rejoins the ISR.

---

## 5. Downstream Services & Pipeline Components

### 5.1 Google Cloud Pub/Sub Bridge (`pubsub-bridge`)
* **Role:** Connects Kafka to Google Cloud Pub/Sub.
* **Why Bridge to Pub/Sub?**
  * Many enterprise architectures run Kafka on-premise or on edge IoT hubs, then bridge events to GCP Pub/Sub to trigger serverless Cloud Functions or BigQuery subscriptions.
* **Manual Offset Commit:** Guarantees no Kafka message is marked done until Pub/Sub confirms receipt.

---

### 5.2 Stream Processor (`processor`)
* **Role:** Core business logic consumer.
* **Classification Rules ([`processor/processing.py`](file:///home/user/Desktop/cold-chain-cloud/processor/processing.py)):**
  * $\Delta T = \text{cargo\_temp\_c} - \text{setpoint\_c}$
  * **`ALERT`**: If $\Delta T \ge 4.0^\circ\text{C}$, OR ($\text{door\_open} = \text{true}$ and $\Delta T \ge 2.0^\circ\text{C}$).
  * **`WARNING`**: If $\Delta T \ge 2.0^\circ\text{C}$.
  * **`OK`**: Normal temperature band.
* **Idempotent Timestamp Guard (`should_update_live_status`):**
  * Rejects out-of-order, delayed, or duplicate network packets.
  * Only accepts incoming messages if `incoming_ts > stored_ts`.
* **Alert Transition Filter (`should_generate_alert`):**
  * Only creates a new record in `alerts` collection when status transitions **into** `ALERT` (avoids spamming thousands of duplicate alerts for the same ongoing excursion).

---

### 5.3 Raw Data Archiver (`archiver`)
* **Role:** Compliant long-term audit storage.
* **Flush Rules:** Flushes when either:
  1. Message count in partition buffer reaches **1,000 records**, OR
  2. Buffer time reaches **30 seconds**.
* **Output Path:**
  `data/archive/YYYY/MM/DD/{partition}-{start_offset}.jsonl.gz`
* **Compression:** `gzip` format saves >85% disk space compared to raw JSON.

---

### 5.4 Silence Detector (`silence-detector`)
* **Role:** Detects lost communication (dead batteries, cellular dead zones, broken transmitters).
* **Behavior:**
  * Runs every 30 seconds.
  * Checks `live_status` in Firestore.
  * If $(\text{Current Time} - \text{last\_ts}) > 120\text{ seconds}$, atomically sets truck status to **`NO_SIGNAL`**.

---

### 5.5 Dashboard API & Simulator (`dashboard-api`)
* **FastAPI Backend:** Serves `/api/trucks`, `/api/alerts`, `/health`, `/api/telemetry/inject`, and `/api/telemetry/logs`.
* **CORS Security:** Restricted to authorized frontend origins.
* **Firestore Singleton:** Single shared client prevents connection exhaustion.
* **Dual-Layer Persistence:** Browser `localStorage` + server in-memory ring buffer (`deque(maxlen=200)`) preserves logs across browser page refreshes.

---

## 6. Failure Modes, DLQ & Resilience Patterns

| Failure Scenario | How the System Defends Itself |
| :--- | :--- |
| **Broker Crash** | RF=2 with KRaft controller instantly promotes surviving replica to partition leader. Zero message loss. |
| **Poison-Pill / Corrupt Message** | Processor tracks retry count (`MAX_NACK_RETRIES=5`). After 5 failures, routes raw payload to `truck-telemetry-dlq` and acks original message to prevent consumer stall. |
| **Network Spike / Burst Traffic** | Kafka buffers tens of thousands of messages in memory and disk (consumer lag). Sinks consume at safe steady-state speed. |
| **Out-of-Order Packets** | Idempotent timestamp guard (`should_update_live_status`) compares ISO timestamps; stale historical packets cannot overwrite current live state. |
| **Driver Leaves Door Open** | Processing classification immediately upgrades status from OK to ALERT once temperature rises $+2^\circ\text{C}$ above setpoint with door open. |
| **Truck Disconnects / Goes Silent** | Silence detector detects absence of heartbeat after 120s and marks vehicle `NO_SIGNAL`. |

---

## 7. Glossary & Interview / Viva Cheat Sheet

### Q1: Why use Apache Kafka instead of a traditional SQL or NoSQL database for ingestion?
> **Answer:** Databases are optimized for CRUD operations, indexing, and querying, but experience high lock contention and write bottlenecks at high throughput. Kafka is an append-only distributed commit log written sequentially to disk (leveraging OS page cache), easily handling hundreds of thousands of writes per second with sub-millisecond latencies.

### Q2: What is the difference between `acks=0`, `acks=1`, and `acks=all`?
> * `acks=0`: Fire-and-forget. Producer sends without waiting for any confirmation. Highest speed, but high risk of lost data.
> * `acks=1`: Producer waits for confirmation from the partition Leader only. If the leader crashes before replicating to followers, data is lost.
> * `acks=all` (used here): Producer waits until all In-Sync Replicas have written the message to disk. Guarantees zero data loss.

### Q3: What is Consumer Lag and is high lag always bad?
> **Answer:** Consumer lag is the difference between the latest message produced to a topic and the latest message processed by a consumer. High lag is not necessarily bad; it demonstrates Kafka acting as an ingestion buffer during peak load bursts, protecting downstream services from crashing. However, persistent growing lag means the consumer group needs more parallel consumers or optimization.

### Q4: Why did we partition by `truck_id`?
> **Answer:** Kafka only guarantees message ordering **within a single partition**, not across the entire topic. By hashing `truck_id` as the message key, all telemetry from `TRK-001` is guaranteed to land in the same partition and be consumed in strict chronological order.

### Q5: What is KRaft mode?
> **Answer:** KRaft (Kafka Raft Metadata mode) is Kafka's consensus protocol that eliminated the dependency on external Apache ZooKeeper. In KRaft, metadata is managed directly within Kafka brokers using Raft consensus, leading to faster leader elections, smaller operational footprints, and scalability to millions of partitions.

---

## 8. Run & Deploy Guide: All Commands

### 8.1 Running Locally (Docker Compose)

All microservices and emulators (Pub/Sub & Firestore emulators) run locally with Docker:

```bash
# 1. Start all containers in the background with build
make up
# (or: docker compose up --build -d)

# 2. View live streaming logs across all microservices
make logs
# (or: docker compose logs -f)

# 3. Stop all running containers
make down
# (or: docker compose down)

# 4. Full teardown including volumes and orphan containers
make reset
# (or: docker compose down -v --remove-orphans)
```

**Local Endpoints:**
* **Operations Dashboard (Live Map):** [http://localhost:8000](http://localhost:8000)
* **Telemetry Test Studio (Simulator):** [http://localhost:8000/simulator.html](http://localhost:8000/simulator.html)
* **Historical Analytics:** [http://localhost:8000/analytics.html](http://localhost:8000/analytics.html)
* **Swagger API Documentation:** [http://localhost:8000/docs](http://localhost:8000/docs)

---

### 8.2 Simulation & Stress Testing Commands

```bash
# Run complete test suite (23 unit tests)
make test
# (or: pytest tests/ -v)

# High-speed telemetry generator stress mode (~150 msgs/sec)
make stress

# Replay 24,000 dataset records into Cloud Pub/Sub
make replay

# Restore normal 5.0s telemetry generator cadence
make normal

# Benchmark 1,000 msg/sec Pub/Sub throughput (dry run)
python3 scripts/blast_telemetry.py --rate 1000 --duration 5 --dry-run

# Test Driver 16 thermal excursion & Discord push alert
python3 scripts/test_driver_alert.py
```

---

### 8.3 Turnkey Deployment to Google Cloud Platform (GCP)

Deploy the entire production infrastructure (Cloud Run, Pub/Sub, BigQuery, Firestore, GCS) with one command:

```bash
# 1. Authenticate with GCP
gcloud auth login
gcloud config set project <YOUR_GCP_PROJECT_ID>

# 2. Run the automated deployment script
make tf-deploy
# (or directly: ./terraform/deploy.sh <YOUR_GCP_PROJECT_ID> asia-south1)
```

The script automatically:
1. Enables required GCP APIs (Cloud Run, Pub/Sub, Firestore, BigQuery, Artifact Registry, Cloud Build, Cloud Scheduler).
2. Creates the Artifact Registry Docker repository (`coldchain-containers`).
3. Builds and pushes all 5 microservices using Google Cloud Build.
4. Provisions BigQuery datasets, partitioned tables, GCS archive buckets, Firestore databases, and Pub/Sub subscriptions.
5. Deploys 3 auto-scaling Cloud Run services (`coldchain-dashboard-api`, `coldchain-processor`, `coldchain-alert-notifier`) and 2 Cloud Run jobs (`coldchain-telemetry-generator`, `coldchain-silence-detector`).
6. Outputs the live public HTTPS Dashboard URL.

---

### 8.4 GCP Operational Commands

```bash
# Execute telemetry generator job on Cloud Run
gcloud run jobs execute coldchain-telemetry-generator --region=asia-south1

# Manually trigger silence detector audit
gcloud run jobs execute coldchain-silence-detector --region=asia-south1

# Read live logs from Cloud Run Processor
gcloud run services logs read coldchain-processor --region=asia-south1 --tail=50

# Query streaming telemetry in BigQuery
bq query --use_legacy_sql=false \
'SELECT STRING(data.truck_id) AS truck, FLOAT64(data.cargo_temp_c) AS temp, publish_time \
 FROM `coldchain_analytics.telemetry_stream` ORDER BY publish_time DESC LIMIT 10'
```

---

### 8.5 Teardown & Destroy Cloud Resources

```bash
# Destroy all Cloud Run and GCP resources via Terraform
make tf-destroy
# (or: cd terraform && terraform destroy -auto-approve)
```

---

## 9. Architectural Gap Analysis & Solutions (1,000 msg/s Conflation & Webhook Rate Limiting)

Based on the target system specification in [`architecture.txt`](file:///home/user/Desktop/cold-chain-cloud/architecture.txt), five critical architectural gaps were identified and resolved to make the pipeline resilient to 1,000+ msg/sec streams.

### 9.1 Gap 1: Firestore Write Amplification & Lack of Conflation Buffer

* **The Problem:** 
  In the initial implementation, every telemetry message pulled from Pub/Sub triggered immediate, synchronous Firestore writes (`isolated_truck_ref.set()` and `doc_ref.set()`). Under 1,000 msg/s stress bursts, this caused 1,000+ writes/second to Firestore.
* **Why It Is Dangerous:** 
  Google Cloud Firestore enforces a documented quota limit of **1 write per second per document**. Writing to the same truck document 50–100 times per second during a burst triggers write contention, write latency spikes, HTTP 429 throttling errors, and massive Firestore billing costs.
* **How We Solved It:**
  Implemented a **1.0s Conflation Buffer** in [`processor/main.py`](file:///home/user/Desktop/cold-chain-cloud/processor/main.py#L65-L115):
  1. Incoming messages for all 16 trucks are inspected and stored in an in-memory dictionary `_conflation_buffer[truck_id] = record` under a thread lock.
  2. If 1,000 messages arrive for TRK-001 within one second, only the latest chronological state is retained.
  3. A background daemon thread (`conflation_flusher_loop`) runs once every second, dumping all conflated records in a single atomic Firestore `db.batch()` write.
  4. **Guarantee:** Regardless of whether 100 or 10,000 msg/s are ingested, Firestore receives at most **1 write/s per truck (max 16 writes/s total)**.

---

### 9.2 Gap 2: Ingress Timestamp Guard Blocking on Network Reads

* **The Problem:** 
  Before updating live truck status, the processor previously executed `snapshot = doc_ref.get()` over the network for every single incoming message to compare `incoming_ts > existing_ts`.
* **Why It Is Dangerous:** 
  Performing 1,000 network round-trip reads per second to Firestore creates an insurmountable I/O bottleneck, starving worker threads and ballooning CPU/network latency.
* **How We Solved It:**
  Moved the Out-of-Order Timestamp Guard purely **into RAM** ([`processor/main.py`](file:///home/user/Desktop/cold-chain-cloud/processor/main.py#L140-L155)):
  1. Maintained an in-memory dictionary `_truck_latest_ts: dict[str, str] = {}`.
  2. When a message arrives, its ISO timestamp is compared in RAM against `_truck_latest_ts.get(truck_id)`.
  3. Stale, out-of-order, or duplicate packets are dropped in microseconds with zero network overhead.

---

### 9.3 Gap 3: Missing Live HUD Metrics Document (`live_metrics/hud`)

* **The Problem:** 
  [`architecture.txt`](file:///home/user/Desktop/cold-chain-cloud/architecture.txt) specifies a `live_metrics/hud` document in Firestore to provide global telemetry throughput rates and incident counts for operational HUDs.
* **How We Solved It:**
  1. The conflation flusher computes the live throughput rate (`_window_msgs_count / elapsed_sec`).
  2. The flusher batches this metric into `db.collection("live_metrics").document("hud")` on every 1.0s tick, containing `current_msg_rate`, `total_messages_processed`, `total_alerts_generated`, and `active_trucks`.
  3. Added the [`/api/live-hud`](file:///home/user/Desktop/cold-chain-cloud/dashboard/main.py#L1270-L1295) endpoint in the Dashboard API to surface these metrics.

---

### 9.4 Gap 4: Discord Webhook Rate Limiting & Cooldown Mismatch

* **The Problem:** 
  Discord webhooks enforce strict rate limits (max 5 requests per 2 seconds). Sending alerts for multiple trucks simultaneously could result in Discord HTTP 429 rate limit lockouts. Furthermore, the alert cooldown was set to 300s (5 minutes) instead of the 60s specified in [`architecture.txt`](file:///home/user/Desktop/cold-chain-cloud/architecture.txt).
* **How We Solved It:**
  1. Added a thread-safe `WebhookRateLimiter` ([`alert-notifier/notifier.py`](file:///home/user/Desktop/cold-chain-cloud/alert-notifier/notifier.py#L56-L72)) enforcing a strict interval of `1.0 / 2.0 = 0.5s` (max 2 requests/second).
  2. Standardized the default incident alert cooldown to **60.0 seconds** per truck in both the Stream Processor and Alert Notifier.

---

### 9.5 Gap 5: API Route & Frontend Page Aliasing

* **The Problem:** 
  [`architecture.txt`](file:///home/user/Desktop/cold-chain-cloud/architecture.txt) references `POST /api/simulate`, `GET /api/history`, `dashboard.html`, and `historical.html`, while the existing codebase used `/api/telemetry/simulate-batch`, `/api/analytics`, `index.html`, and `analytics.html`.
* **How We Solved It:**
  In [`dashboard/main.py`](file:///home/user/Desktop/cold-chain-cloud/dashboard/main.py):
  1. Added `@app.post("/api/simulate")` as an alias to `trigger_batch_scenario`.
  2. Added `@app.get("/api/history")` as an alias to `get_analytics`.
  3. Added redirect routes `/dashboard.html` $\rightarrow$ `/index.html` and `/historical.html` $\rightarrow$ `/analytics.html` to ensure complete interoperability.


