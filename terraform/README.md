# ☁️ ColdChain Fleet - Google Cloud High-Speed Streaming & Microservices

This directory contains Terraform scripts and an automated deployment pipeline to host the **ColdChain Fleet Platform** on **Google Cloud Platform (GCP)**. It is architected for **high-speed telemetry ingestion**, **multi-tier storage (BigQuery + Cloud Storage + Firestore)**, and **5 decoupled microservices on Google Cloud Run**.

---

## 🏛️ End-to-End High-Speed Cloud Architecture

```
[IoT Telemetry / Mobile Fleet / Generator]
                 │
                 ▼ (High-Velocity JSON Streaming)
┌─────────────────────────────────────────────────────────────────┐
│ ⚡ GOOGLE CLOUD PUB/SUB INGESTION ENGINE (High-Throughput)      │
│   • telemetry-topic  ──► Direct BigQuery Streaming Pipe         │
│   • telemetry-topic  ──► telemetry-sub (Processor Worker)       │
│   • alerts-topic     ──► alerts-sub (Alert Notification Worker) │
│   • telemetry-dlq-topic (Dead Letter Quarantine)                │
└────────┬──────────────────────┬─────────────────────────────────┘
         │                      │
         │ Direct Streaming     │ Streaming Pull
         ▼                      ▼
┌─────────────────────────┐  ┌───────────────────────────────────┐
│ 📊 GOOGLE BIGQUERY      │  │ 🚀 Microservice: Processor         │
│   coldchain_analytics   │  │   (Cloud Run - Auto-scale 1-10)   │
│   .telemetry_stream     │  │   • Schema Validation             │
│   • Day-Partitioned (ts)│  │   • Excursion & Door Anomaly      │
│   • Clustered by Truck  │  │   • Out-of-order Timestamp Guard  │
└─────────────────────────┘  └──────────────┬────────────────────┘
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
┌────────────────────────────────────────┐ ┌────────────────────────────────────────┐
│ 🔥 GOOGLE CLOUD FIRESTORE              │ │ 📢 Microservice: Alert Notifier        │
│   • live_status (Real-time fleet state)│ │   (Cloud Run - Auto-scale 1-3)         │
│   • alerts (Immutable compliance audit)│ │   • Discord Webhook Push Notification  │
└────────────────────┬───────────────────┘ │   • Fleet Ops Incident Channel         │
                     │                     │   • In-Cab Buzzer Telematics Downlink  │
                     ▼                     └────────────────────────────────────────┘
┌────────────────────────────────────────┐
│ 🌐 Microservice: Operations Dashboard  │
│   coldchain-dashboard-api              │ ◄─── Public HTTPS Web UI & REST API
│   (Cloud Run - Auto-scale 1-5)         │      Live Map, Analytics & Simulator
└────────────────────────────────────────┘

┌────────────────────────────────────────┐ ┌────────────────────────────────────────┐
│ 💾 Microservice: Silence Detector      │ │ 🚚 Microservice: Telemetry Generator   │
│   (Cloud Run Job + Cloud Scheduler)    │ │   (Cloud Run Job - On-Demand Testing)  │
│   Runs every 1 min, flags dead trucks  │ │   High-Speed Live Fleet Simulator      │
└────────────────────────────────────────┘ └────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 🗄️ GOOGLE CLOUD STORAGE DATA LAKE (Cold Archive)                │
│   ${project}-coldchain-archive-prod (Lifecycle: Nearline ->     │
│   Coldline 90d -> Archive 365d)                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 Provisioned GCP Microservices & Storage Layers

| Layer | Service / Resource | Purpose |
| :--- | :--- | :--- |
| **Microservice 1** | `coldchain-dashboard-api` (Cloud Run) | Public HTTPS Operations Dashboard + FastAPI REST backend |
| **Microservice 2** | `coldchain-processor` (Cloud Run) | High-throughput stream processor pulling from Pub/Sub |
| **Microservice 3** | `coldchain-alert-notifier` (Cloud Run) | Real-time Discord app push alerts with root cause failure diagnosis |
| **Microservice 4** | `coldchain-silence-detector` (Cloud Run Job) | Scheduled auditor flagging unresponsive trucks (>120s silent) |
| **Microservice 5** | `coldchain-telemetry-generator` (Cloud Run Job)| High-speed fleet telemetry generator for live simulations on GCP |
| **High-Speed Ingestion**| `telemetry-bigquery-sub` (Pub/Sub) | **Direct zero-code streaming** into BigQuery at unlimited scale |
| **Analytics Storage** | `coldchain_analytics.telemetry_stream` | Day-partitioned, clustered BigQuery table for sub-second SQL queries |
| **Real-time State** | Cloud Firestore Native `(default)` | Sub-millisecond reads/writes for live fleet coordinates |
| **Cold Data Lake** | Cloud Storage Bucket | Multi-tier storage (Standard -> Nearline 30d -> Coldline 90d -> Archive 365d) |

---

## ⚡ Deployment: Commands for Google Cloud CLI / Cloud Shell

You can deploy the entire infrastructure with **a single command** directly from Google Cloud Shell or any terminal authenticated with `gcloud`.

### Step 1: Open Google Cloud Shell & Clone
```bash
git clone https://github.com/abhishek18-blog/New-Cold-Chain-Monitoring.git
cd New-Cold-Chain-Monitoring
```

### Step 2: Set Your GCP Project & Authenticate
```bash
gcloud config set project <YOUR_PROJECT_ID>
```

### Step 3: Run the Automated Deployer
```bash
./terraform/deploy.sh
```
*(Optionally specify a custom region: `./terraform/deploy.sh <YOUR_PROJECT_ID> asia-south1`)*

The script automatically:
1. Enables all 10 required GCP APIs.
2. Creates the Artifact Registry Docker repository.
3. Builds and pushes all 5 microservices using Google Cloud Build.
4. Provisions BigQuery, Cloud Storage, Firestore, Pub/Sub, and Cloud Run services via Terraform.
5. Prints your **Public Live Dashboard URL** and BigQuery table path.

---

## 🎮 Post-Deployment: Useful `gcloud` CLI Commands

### 1. Launch Live High-Speed Fleet Simulation in Google Cloud
Run the telemetry generator microservice directly on Cloud Run:
```bash
gcloud run jobs execute coldchain-telemetry-generator --region=asia-south1
```

### 2. Stream Live Logs from Microservices
* **Stream Processor Logs:**
  ```bash
  gcloud run services logs read coldchain-processor --region=asia-south1 --tail=50
  ```
* **Alert Notifier & Discord Dispatch Logs:**
  ```bash
  gcloud run services logs read coldchain-alert-notifier --region=asia-south1 --tail=50
  ```
* **Dashboard API Logs:**
  ```bash
  gcloud run services logs read coldchain-dashboard-api --region=asia-south1 --tail=50
  ```

### 3. Query Real-Time High-Speed Telemetry in BigQuery (Native JSON)
Run a sub-second SQL query directly on the raw JSON documents from the Cloud CLI:
```bash
bq query --use_legacy_sql=false \
'SELECT 
   STRING(data.truck_id) AS truck, 
   FLOAT64(data.cargo_temp_c) AS temp_c, 
   FLOAT64(data.setpoint_c) AS setpoint, 
   BOOL(data.door_open) AS door_open, 
   publish_time
 FROM `coldchain_analytics.telemetry_stream` 
 ORDER BY publish_time DESC 
 LIMIT 10'
```

### 4. Manually Trigger Silence Detection Audit
```bash
gcloud run jobs execute coldchain-silence-detector --region=asia-south1
```

### 5. Tear Down / Destroy All Cloud Resources
When you want to stop all billing and remove all resources:
```bash
make tf-destroy
# OR
cd terraform && terraform destroy -auto-approve
```
