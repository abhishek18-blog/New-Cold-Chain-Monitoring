# ☁️ ColdChain Fleet - Google Cloud Run Terraform Deployment

This directory contains production-grade Terraform configurations to deploy the entire **ColdChain Fleet** streaming and monitoring platform to **Google Cloud Platform (GCP)** using **Cloud Run**, **Cloud Pub/Sub**, **Cloud Firestore (Native)**, **Cloud Storage (GCS)**, and **Cloud Scheduler**.

---

## 🏛️ Architecture Overview on GCP

```
[IoT Trucks / Telemetry Ingestion]
        │
        ▼
 ┌────────────────────────────────────────────────────────┐
 │ ☁️ Google Cloud Pub/Sub                                │
 │   • telemetry-topic  ──► telemetry-sub (with DLQ)      │
 │   • alerts-topic     ──► alerts-sub                    │
 │   • telemetry-dlq-topic                                │
 └──────────────────────┬─────────────────────────────────┘
                        │
         ┌──────────────┴──────────────┐
         ▼                             ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│ 🚀 Cloud Run (Worker)     │ │ 🚀 Cloud Run (Worker)     │
│   coldchain-processor     │ │   coldchain-alert-notifier│
│   (Continuous CPU,        │ │   (Driver SMS, in-cab     │
│    streaming pull)        │ │    buzzer downlink)       │
└────────────┬──────────────┘ └───────────────────────────┘
             │
             ▼
┌───────────────────────────┐ ◄─── ⏰ Cloud Scheduler (every 1 min)
│ 🔥 Cloud Firestore        │       │
│   • live_status           │       ▼
│   • alerts                │     ┌───────────────────────────┐
└────────────┬──────────────┘     │ ⏱️ Cloud Run Job          │
             │                    │   coldchain-silence-      │
             ▼                    │   detector (flags dead)   │
┌───────────────────────────┐     └───────────────────────────┘
│ 🖥️ Cloud Run (Public API)  │
│   coldchain-dashboard-api │ ────► Public HTTPS Web UI & API
└───────────────────────────┘

┌───────────────────────────┐
│ 💾 Google Cloud Storage   │
│   ${project}-coldchain-   │ ◄─── Cold telemetry data lake
│   archive-prod            │     (Nearline: 30d, Coldline: 90d)
└───────────────────────────┘
```

---

## 📦 Provisioned GCP Resources

| GCP Service | Resource Name / ID | Purpose |
| :--- | :--- | :--- |
| **Artifact Registry** | `coldchain-containers` | Private Docker registry storing microservice container images |
| **Cloud Run Service** | `coldchain-dashboard-api` | Public HTTPS Web Dashboard and FastAPI REST service (port 8000) |
| **Cloud Run Service** | `coldchain-processor` | Background stream processing worker with always-on CPU allocation |
| **Cloud Run Service** | `coldchain-alert-notifier` | Background worker consuming incident alerts & dispatching notifications |
| **Cloud Run Job** | `coldchain-silence-detector` | One-shot job auditing unresponsive trucks (>120s silent) |
| **Cloud Scheduler** | `coldchain-silence-detector-trigger` | Cron job triggering silence detection once per minute (`* * * * *`) |
| **Cloud Firestore** | `(default)` | Native mode document DB storing `live_status` and `alerts` |
| **Cloud Pub/Sub** | `telemetry-topic` & `telemetry-sub` | Primary streaming telemetry ingestion with 5-retry dead-letter policy |
| **Cloud Pub/Sub** | `alerts-topic` & `alerts-sub` | Incident and excursion alert event stream |
| **Cloud Pub/Sub** | `telemetry-dlq-topic` | Dead Letter Queue for poison-pill payloads |
| **Cloud Storage** | `${project}-coldchain-archive-${env}` | GCS bucket with Nearline (30d) and Coldline (90d) retention lifecycle |
| **IAM Service Account** | `coldchain-cloudrun-sa` | Least-privilege execution identity for Cloud Run services and jobs |

---

## 🛠️ Prerequisites

1. **Google Cloud SDK (`gcloud`)** installed and authenticated:
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```
2. **Terraform >= 1.5.0** installed:
   ```bash
   terraform version
   ```
3. **Docker** installed and running on your local machine.
4. Active Google Cloud Project with billing enabled.

---

## 🚀 Quick Deployment (One-Command)

Run the included automated deployment script with your GCP Project ID:

```bash
chmod +x terraform/deploy.sh
./terraform/deploy.sh <YOUR_GCP_PROJECT_ID> [REGION]
```

*Example:*
```bash
./terraform/deploy.sh my-gcp-project-123 asia-south1
```

This script will:
1. Enable required GCP service APIs (`run`, `pubsub`, `firestore`, `storage`, `cloudscheduler`, `artifactregistry`).
2. Create the Artifact Registry repository.
3. Configure Docker authentication.
4. Build and push images for `dashboard-api`, `processor`, `alert-notifier`, and `silence-detector`.
5. Run `terraform init` and `terraform apply`.
6. Output the live public dashboard URL.

---

## 📝 Manual Deployment Steps

If you prefer step-by-step control:

### 1. Build and Push Container Images

```bash
PROJECT_ID="your-gcp-project-id"
REGION="asia-south1"
REPO="coldchain-containers"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}"

# Configure Docker authentication
gcloud auth configure-docker "${REGION}-docker.pkg.dev"

# Build & Push
docker build -t "${REGISTRY}/dashboard-api:latest" ./dashboard
docker push "${REGISTRY}/dashboard-api:latest"

docker build -t "${REGISTRY}/processor:latest" ./processor
docker push "${REGISTRY}/processor:latest"

docker build -t "${REGISTRY}/alert-notifier:latest" ./alert-notifier
docker push "${REGISTRY}/alert-notifier:latest"

docker build -t "${REGISTRY}/silence-detector:latest" ./silence-detector
docker push "${REGISTRY}/silence-detector:latest"
```

### 2. Configure Terraform Variables

Create a `terraform.tfvars` file:

```bash
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
```

Edit `terraform/terraform.tfvars`:
```hcl
project_id                  = "your-gcp-project-id"
region                      = "asia-south1"
environment                 = "prod"
artifact_registry_repo_name = "coldchain-containers"
image_tag                   = "latest"
```

### 3. Deploy Infrastructure

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

### 4. Inspect Outputs

```bash
terraform output dashboard_url
```

Open the printed URL in your browser to interact with the live operations dashboard and map.

---

## 🧹 Teardown / Destroy

To destroy all deployed GCP resources and prevent recurring costs:

```bash
cd terraform
terraform destroy
```
