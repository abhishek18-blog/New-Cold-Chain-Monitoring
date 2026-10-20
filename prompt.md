You are an expert Cloud Software Engineer and Solutions Architect specializing in Google Cloud Platform (GCP), serverless event-driven architectures, and Python IoT pipelines. 

Your objective is to refactor this repository to transition it from a legacy, heavy, local Kafka-based system into a streamlined, high-performance, cost-effective, serverless GCP architecture based on the specifications below. Proceed systematically, file by file.

---

### PHASE 1: Infrastructure Cleanup & Simplification
1. **Purge Apache Kafka & the Ingestion Bridge:**
   - Modify `docker-compose.yml` to completely remove all Kafka services (`kafka-1`, `kafka-2`, `kafka-quorum`, `kafka-init`, `kafka-ui`).
   - Completely delete the `pubsub-bridge/` directory and its microservice logic. The system will now publish directly to GCP Pub/Sub.
2. **Remove Orphaned / Scratch Files:**
   - Locate and permanently delete: `terraform/error`, `.recall_scratchpad.md`, and `scripts/test_fast2sms.py`.
3. **Deprecate the Local Archiver & Broken SMS Gateway:**
   - Delete the `archiver/` microservice directory. Cold archiving will be handled natively via BigQuery storage lifecycle policies and GCS, rendering local ephemeral gzipped logs obsolete.
   - In `alert-notifier/notifier.py` and `alert-notifier/alert_manager.py`, fully strip out all references to `Fast2SMS` / `send_fast2sms`. Keep the active, working Discord Webhook as the primary notification delivery network.

---

### PHASE 2: Solving Firestore & Simulator Synchronization
1. **Refactor the Telemetry Generator / Simulator (`generator.py`):**
   - Update the network transmission client to connect directly to the GCP Pub/Sub client library instead of a Kafka broker client.
   - **Implement Dual-Speed Cadence:** Refactor the core simulation loop so it no longer blasts high-frequency data (like 300 msgs/sec) blindly. 
     - *Normal Mode:* Send standard telemetry (GPS coordinates, speed, base temperature) on a realistic, production-grade 1-second interval. This protects Firestore from hitting its 1-write-per-second-per-document limit.
     - *Burst/Event Mode:* If an anomaly occurs (e.g., Door Opened, Engine Failure, Temperature Excursion), bypass the 1-second sleep timer and transmit that critical alert payload immediately.
   - **Network Dropout Simulation:** If a network drop is simulated, cache data locally to an in-memory or file buffer. When connection is restored, flush messages to Pub/Sub with a metadata attribute flag set to `is_backlog: true`.

2. **Refactor the Processor Microservice (`processor.py`):**
   - **Firestore Guard:** Ensure every truck writes to its own isolated document route: `trucks/truck_{id}`. Never append telemetry directly to arrays inside global summary documents. For the alerts collection, ensure every alert generates a unique document ID.
   - **Out-of-Order & Backlog Protection:** Implement an ingress verification wrapper. For incoming messages:
     - Check the Pub/Sub attributes. If `is_backlog == true`, stream the payload directly to the BigQuery analytical sink, but completely bypass updating the Firestore `live_status` document so the real-time map dashboard layout doesn't glitch or warp backwards.
     - For standard streaming events, read the incoming timestamp. Compare it against the active `last_updated` value in Firestore. If the incoming payload timestamp is older than what is already in the database, discard the Firestore write but preserve the write to BigQuery.

3. **Optimise Dashboard Delivery Data Path:**
   - Refactor the Operations Dashboard data interface. Instead of the frontend client running HTTP REST polling loops against the `dashboard-api` server, switch the dashboard frontend initialization to use the native Firestore web SDK listener (`onSnapshot()`). This connects the UI directly to the `trucks/` collection for serverless, true real-time map updates.

4. **Close the BigQuery Storage Gap:**
   - Review or create a script/configuration ensuring a BigQuery Table Expiration Policy or a nightly Cloud Run Job is defined to automatically move older analytics data out to the GCS Cold Archive bucket (`${project}-coldchain-archive-prod`) as compressed files, deleting it from the active streaming table to save query costs.

---

### PHASE 3: Execution & Output Requirements
Execute these tasks step-by-step. For each file you modify:
1. Display a brief explanation of the architectural change you are introducing.
2. Present the exact code diff or rewritten file.
3. Validate that no references to Kafka, the bridge service, or Fast2SMS remain in the updated code.

Begin by analyzing the root directory and listing the files you intend to process first.
