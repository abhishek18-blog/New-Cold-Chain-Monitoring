ROLE
You are a senior data/platform engineer. Build a complete, runnable, local-first
microservice project called "coldchain-fleet" for real-time cold chain truck
monitoring. Everything must start with ONE command: docker compose up --build

GOALS
- Real-time path: generator -> Kafka -> pubsub-bridge -> Pub/Sub emulator -> processor
  -> Firestore emulator -> dashboard
- Archive path: Kafka -> archiver -> dated JSONL.gz files on a local volume
- No single point of failure in Kafka: demonstrate broker failover locally
- Code must move to GCP later by changing environment variables only

TECH CONSTRAINTS
- Python 3.12, confluent-kafka (not kafka-python), pydantic v2, FastAPI + uvicorn,
  google-cloud-pubsub, google-cloud-firestore, pytest
- Docker Compose v2, one Dockerfile per service, pinned image/library versions
- Config only through environment variables (.env + .env.example), no hardcoded hosts
- Structured JSON logging, graceful SIGTERM shutdown, restart: unless-stopped,
  healthchecks and depends_on conditions on every service

SERVICES (one folder + Dockerfile each)
1. kafka-1, kafka-2: image apache/kafka:4.0.0, KRaft, roles broker+controller
2. kafka-quorum: same image, role controller only (the third vote, so quorum survives
   one failure). QUORUM_VOTERS=1@kafka-1:9093,2@kafka-2:9093,3@kafka-quorum:9093
   - Two listeners per broker: INTERNAL (kafka-1:19092) for containers and
     inter-broker traffic, EXTERNAL (localhost:9092 / localhost:9094) for the host
   - Replication factor 2, min.insync.replicas=1, unclean.leader.election=false,
     data on named volumes
3. kafka-init: one-shot container that creates topics once brokers are healthy:
   truck-telemetry (3 partitions, RF 2) and truck-telemetry-dlq (1 partition, RF 2)
4. kafka-ui: kafbat/kafka-ui on localhost:8080 showing the cluster
5. telemetry-generator: simulates 5 trucks (TRK-001..005), one ping per truck every
   PING_INTERVAL seconds (default 5), message key = truck_id, producer acks=all and
   idempotence enabled, bootstrap servers = both brokers. Randomly injects
   temperature excursions (about 1% chance per ping, lasting 15-30 pings, sometimes
   with the door open). Simulated GPS movement around Pune.
6. pubsub-bridge: Kafka consumer (group "pubsub-bridge") publishing each message to
   the Pub/Sub emulator topic "telemetry-topic". Manual offset commit AFTER a
   successful publish. Support running 2 replicas. This is the local stand-in for the
   Kafka Connect Pub/Sub sink.
7. archiver: separate consumer group ("archiver") writing batched, gzip JSONL files to
   /archive/truck-data/YYYY/MM/DD/<partition>-<start_offset>.jsonl.gz (flush every
   1000 records or 30 seconds). Stand-in for the Kafka Connect GCS sink.
8. pubsub-emulator and firestore-emulator: image
   gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators
   (pubsub on 8085, firestore on 8080 inside the network, project "coldchain-local").
   A pubsub-init step creates topic telemetry-topic and subscription
   telemetry-sub (plus a dead-letter topic with max 5 delivery attempts).
9. processor: pulls from telemetry-sub. Keep ALL business logic in a pure module
   (processing.py) with no I/O, so it can later be wrapped as a Cloud Function.
   - Validate with pydantic; invalid messages go to Kafka topic truck-telemetry-dlq
     (or are logged and acked) instead of blocking the stream
   - Classify status from excess = cargo_temp_c - setpoint_c:
       ALERT if excess >= 4, or door_open and excess >= 2
       WARNING if excess >= 2
       otherwise OK
   - Upsert Firestore live_status/{truck_id} inside a transaction, only if the incoming
     timestamp is newer than the stored one (idempotent, handles duplicates and
     out-of-order messages)
   - Write a document to the alerts collection only when status changes into ALERT
10. silence-detector: every 30 seconds, mark any truck in live_status with no ping
    for over 120 seconds as NO_SIGNAL and write one alert per transition. (Replaced by
    Cloud Scheduler on GCP.)
11. dashboard-api: FastAPI on localhost:8000 with GET /api/trucks, GET /api/alerts,
    GET /health, and a static page (Leaflet via CDN, vanilla JS) that polls every 3
    seconds, draws truck markers colored green/amber/red/grey for
    OK/WARNING/ALERT/NO_SIGNAL, shows a status table, temperature and last-seen time,
    and a recent alerts list.

MESSAGE SCHEMA (JSON)
  {"truck_id": "TRK-001", "ts": "ISO-8601 UTC", "lat": 18.52, "lon": 73.85,
   "speed_kmph": 55.0, "fuel_pct": 80.2, "cargo_temp_c": 4.1,
   "setpoint_c": 4.0, "door_open": false}

DELIVERABLES
- Full folder tree printed first, then every file with complete code (no placeholders,
  no "TODO", no "..." elisions)
- docker-compose.yml, .env.example, Makefile (up, down, logs, test, failover, reset)
- scripts/failover_test.sh: stops kafka-1 while data flows, prints topic leader and ISR
  via kafka-topics.sh --describe, waits 30 s, confirms the dashboard timestamps are
  still advancing, then restarts kafka-1 and shows it rejoining
- pytest unit tests for classify() and the timestamp-guard upsert logic
- README.md: architecture diagram (ASCII), how to run, the URLs, how to run the
  failover demo, and a table mapping each local component to its GCP equivalent
  (Kafka containers -> Compute Engine VMs, pubsub-bridge and archiver -> Kafka Connect
  sinks, emulators -> Pub/Sub and Firestore, processor -> Cloud Function,
  silence-detector -> Cloud Scheduler, dashboard-api -> Cloud Run)

HOW TO WORK
1. First give a short plan and list any assumptions. Do not ask questions unless truly
   blocked.
2. Build in this order and verify each stage before moving on: Kafka cluster + init +
   UI, generator, emulators, pubsub-bridge, processor, archiver, silence-detector,
   dashboard, tests, failover script.
3. After each stage, show the exact command to verify it and the output I should expect.
4. Keep code simple and readable, with brief comments only where the reason is not
   obvious.

ACCEPTANCE CRITERIA
- docker compose up --build brings everything healthy with no manual steps
- localhost:8080 shows 2 brokers in the cluster and both topics with RF 2
- localhost:8000 shows 5 trucks updating about every 5 seconds, with some turning
  amber/red during injected excursions
- Archive files appear under ./data/archive/truck-data/YYYY/MM/DD/
- Running docker stop kafka-1 does not stop the dashboard from updating, and
  restarting it brings it back into the cluster
- Stopping the generator turns trucks grey (NO_SIGNAL) within about 2 minutes
- make test passes