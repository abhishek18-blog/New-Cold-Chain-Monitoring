terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.30"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ==============================================================================
# 1. Enable Required GCP APIs
# ==============================================================================
locals {
  required_services = [
    "run.googleapis.com",
    "pubsub.googleapis.com",
    "firestore.googleapis.com",
    "storage.googleapis.com",
    "cloudscheduler.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "iam.googleapis.com"
  ]
}

resource "google_project_service" "enabled_apis" {
  for_each           = toset(local.required_services)
  project            = var.project_id
  service            = each.key
  disable_on_destroy = false
}

# ==============================================================================
# 2. Artifact Registry (Container Images)
# ==============================================================================
resource "google_artifact_registry_repository" "containers" {
  location      = var.region
  repository_id = var.artifact_registry_repo_name
  description   = "Docker container registry for ColdChain Fleet microservices"
  format        = "DOCKER"

  depends_on = [google_project_service.enabled_apis]
}

# ==============================================================================
# 3. Google Cloud Storage Bucket (Cold Telemetry Archive)
# ==============================================================================
resource "google_storage_bucket" "telemetry_archive" {
  name                        = "${var.project_id}-coldchain-archive-${var.environment}"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }

  depends_on = [google_project_service.enabled_apis]
}

# ==============================================================================
# 4. Cloud Firestore Database (Native Mode)
# ==============================================================================
resource "google_firestore_database" "database" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  delete_protection_state = "DELETE_PROTECTION_DISABLED"
  deletion_policy         = "DELETE"

  depends_on = [google_project_service.enabled_apis]
}

# ==============================================================================
# 5. Google Cloud Pub/Sub (Topics & Subscriptions)
# ==============================================================================
# Dead Letter Topic
resource "google_pubsub_topic" "telemetry_dlq" {
  name = "telemetry-dlq-topic"

  depends_on = [google_project_service.enabled_apis]
}

# Primary Telemetry Topic
resource "google_pubsub_topic" "telemetry" {
  name = "telemetry-topic"

  depends_on = [google_project_service.enabled_apis]
}

# Incident Alerts Topic
resource "google_pubsub_topic" "alerts" {
  name = "alerts-topic"

  depends_on = [google_project_service.enabled_apis]
}

# Dead Letter Topic Subscription
resource "google_pubsub_subscription" "telemetry_dlq_sub" {
  name                 = "telemetry-dlq-sub"
  topic                = google_pubsub_topic.telemetry_dlq.id
  ack_deadline_seconds = 60

  message_retention_duration = "604800s" # 7 days
}

# Telemetry Subscription with Dead-Letter Policy
resource "google_pubsub_subscription" "telemetry_sub" {
  name                 = "telemetry-sub"
  topic                = google_pubsub_topic.telemetry.id
  ack_deadline_seconds = 60

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.telemetry_dlq.id
    max_delivery_attempts = 5
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
}

# Alerts Subscription
resource "google_pubsub_subscription" "alerts_sub" {
  name                 = "alerts-sub"
  topic                = google_pubsub_topic.alerts.id
  ack_deadline_seconds = 60

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "300s"
  }
}

# ==============================================================================
# 6. Service Account & IAM Roles
# ==============================================================================
resource "google_service_account" "coldchain_sa" {
  account_id   = "coldchain-cloudrun-sa"
  display_name = "ColdChain Cloud Run Execution Service Account"

  depends_on = [google_project_service.enabled_apis]
}

locals {
  service_account_roles = [
    "roles/datastore.user",              # Firestore read/write
    "roles/pubsub.publisher",            # Publish to Pub/Sub topics
    "roles/pubsub.subscriber",           # Pull from Pub/Sub subscriptions
    "roles/storage.objectAdmin",         # Archive to Cloud Storage
    "roles/run.invoker"                  # Invoke Cloud Run services / jobs
  ]
}

resource "google_project_iam_member" "coldchain_sa_roles" {
  for_each = toset(local.service_account_roles)
  project  = var.project_id
  role     = each.key
  member   = "serviceAccount:${google_service_account.coldchain_sa.email}"
}

# Allow Pub/Sub to publish to DLQ topic on behalf of dead-letter policy
resource "google_pubsub_topic_iam_member" "dlq_publisher" {
  topic  = google_pubsub_topic.telemetry_dlq.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"

  depends_on = [google_project_service.enabled_apis]
}

# Allow Pub/Sub subscriber service agent to acknowledge dead-lettered messages
resource "google_pubsub_subscription_iam_member" "dlq_subscriber" {
  subscription = google_pubsub_subscription.telemetry_sub.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"

  depends_on = [google_project_service.enabled_apis]
}

data "google_project" "current" {
  project_id = var.project_id
}

# ==============================================================================
# 7. Cloud Run Services
# ==============================================================================

# --- Service A: dashboard-api (Public Operations UI & REST API) ---
resource "google_cloud_run_v2_service" "dashboard_api" {
  name     = "coldchain-dashboard-api"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.coldchain_sa.email

    scaling {
      min_instance_count = 1
      max_instance_count = 5
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repo_name}/dashboard-api:${var.image_tag}"

      ports {
        container_port = 8000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle = true
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "KAFKA_BOOTSTRAP_SERVERS"
        value = var.kafka_bootstrap_servers
      }
      env {
        name  = "KAFKA_TOPIC_TELEMETRY"
        value = var.kafka_topic_telemetry
      }
    }
  }

  depends_on = [
    google_project_service.enabled_apis,
    google_firestore_database.database
  ]
}

# Allow public unauthenticated access to the dashboard UI
resource "google_cloud_run_v2_service_iam_member" "dashboard_public_access" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.dashboard_api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# --- Service B: processor (Real-Time Stream Processing Worker) ---
resource "google_cloud_run_v2_service" "processor" {
  name     = "coldchain-processor"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.coldchain_sa.email

    scaling {
      min_instance_count = 1
      max_instance_count = 10
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repo_name}/processor:${var.image_tag}"

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        # Keep CPU allocated continuously for asynchronous Pub/Sub streaming pull
        cpu_idle = false
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "PUBSUB_SUB"
        value = google_pubsub_subscription.telemetry_sub.name
      }
      env {
        name  = "PUBSUB_ALERTS_TOPIC"
        value = google_pubsub_topic.alerts.name
      }
      env {
        name  = "KAFKA_BOOTSTRAP_SERVERS"
        value = var.kafka_bootstrap_servers
      }
      env {
        name  = "KAFKA_TOPIC_DLQ"
        value = "truck-telemetry-dlq"
      }
    }
  }

  depends_on = [
    google_project_service.enabled_apis,
    google_firestore_database.database,
    google_pubsub_subscription.telemetry_sub
  ]
}

# --- Service C: alert-notifier (Driver SMS / Incident Notification Worker) ---
resource "google_cloud_run_v2_service" "alert_notifier" {
  name     = "coldchain-alert-notifier"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.coldchain_sa.email

    scaling {
      min_instance_count = 1
      max_instance_count = 3
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repo_name}/alert-notifier:${var.image_tag}"

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        # Keep CPU allocated continuously for asynchronous alerts pull
        cpu_idle = false
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "PUBSUB_ALERTS_SUB"
        value = google_pubsub_subscription.alerts_sub.name
      }
      env {
        name  = "ALERT_COOLDOWN_SEC"
        value = tostring(var.alert_cooldown_sec)
      }
    }
  }

  depends_on = [
    google_project_service.enabled_apis,
    google_pubsub_subscription.alerts_sub
  ]
}

# ==============================================================================
# 8. Cloud Run Job & Scheduler (Silence Detector)
# ==============================================================================
resource "google_cloud_run_v2_job" "silence_detector" {
  name     = "coldchain-silence-detector"
  location = var.region

  template {
    template {
      service_account = google_service_account.coldchain_sa.email

      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repo_name}/silence-detector:${var.image_tag}"

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }

        env {
          name  = "GCP_PROJECT_ID"
          value = var.project_id
        }
        env {
          name  = "RUN_ONCE"
          value = "true"
        }
        env {
          name  = "SILENCE_CHECK_INTERVAL_SEC"
          value = "30"
        }
        env {
          name  = "SILENCE_TIMEOUT_SEC"
          value = tostring(var.silence_timeout_sec)
        }
      }
    }
  }

  depends_on = [
    google_project_service.enabled_apis,
    google_firestore_database.database
  ]
}

# Cloud Scheduler: Triggers silence-detector job every 1 minute
resource "google_cloud_scheduler_job" "silence_detector_trigger" {
  name        = "coldchain-silence-detector-trigger"
  description = "Triggers the silence-detector Cloud Run job every minute"
  schedule    = "* * * * *"
  time_zone   = "UTC"
  region      = var.region

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.silence_detector.name}:run"

    oauth_token {
      service_account_email = google_service_account.coldchain_sa.email
    }
  }

  depends_on = [
    google_project_service.enabled_apis,
    google_cloud_run_v2_job.silence_detector
  ]
}
