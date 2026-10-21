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
    "bigquery.googleapis.com",
    "cloudscheduler.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudresourcemanager.googleapis.com",
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
# 2. Artifact Registry (Container Images for all Microservices)
# ==============================================================================
resource "google_artifact_registry_repository" "containers" {
  location      = var.region
  repository_id = var.artifact_registry_repo_name
  description   = "Docker container registry for ColdChain Fleet microservices"
  format        = "DOCKER"

  depends_on = [google_project_service.enabled_apis]
}

# ==============================================================================
# 3. High-Speed Storage A: Google Cloud Storage (Data Lake & Cold Archive)
# ==============================================================================
resource "google_storage_bucket" "telemetry_archive" {
  name                        = "${var.project_id}-coldchain-archive-${var.environment}"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true

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

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type          = "SetStorageClass"
      storage_class = "ARCHIVE"
    }
  }

  depends_on = [google_project_service.enabled_apis]
}

# ==============================================================================
# 4. High-Speed Storage B: Google Cloud Firestore (Sub-millisecond Real-Time Live State)
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
# 5. High-Speed Storage C: Google BigQuery (High-Speed Analytics & Compliance Audit)
# ==============================================================================
resource "google_bigquery_dataset" "coldchain_analytics" {
  dataset_id                  = var.bigquery_dataset_id
  friendly_name               = "ColdChain Fleet Telemetry Analytics"
  description                 = "Real-time high-speed data warehouse for cold-chain IoT telemetry"
  location                    = var.region
  default_table_expiration_ms = null

  depends_on = [google_project_service.enabled_apis]
}

resource "google_bigquery_table" "telemetry_stream" {
  dataset_id = google_bigquery_dataset.coldchain_analytics.dataset_id
  table_id   = var.bigquery_table_id

  time_partitioning {
    type          = "DAY"
    field         = "publish_time"
    expiration_ms = 2592000000 # 30 days active retention (saves BigQuery storage & query costs)
  }

  schema = jsonencode([
    { name = "data", type = "JSON", mode = "REQUIRED", description = "Raw IoT telemetry JSON document payload from truck sensors" },
    { name = "publish_time", type = "TIMESTAMP", mode = "REQUIRED", description = "Timestamp when event was ingested by Pub/Sub" },
    { name = "subscription_name", type = "STRING", mode = "NULLABLE", description = "Pub/Sub subscription that delivered the message" },
    { name = "message_id", type = "STRING", mode = "REQUIRED", description = "Unique Pub/Sub message identifier" },
    { name = "attributes", type = "JSON", mode = "NULLABLE", description = "Optional Pub/Sub message metadata attributes" }
  ])

  deletion_protection = false

  depends_on = [google_bigquery_dataset.coldchain_analytics]
}

# ==============================================================================
# 6. High-Speed Ingestion: Google Cloud Pub/Sub (Topics, DLQ & BigQuery Streaming Pipe)
# ==============================================================================
resource "google_pubsub_topic" "telemetry_dlq" {
  name       = "telemetry-dlq-topic"
  depends_on = [google_project_service.enabled_apis]
}

resource "google_pubsub_topic" "telemetry" {
  name                       = "telemetry-topic"
  message_retention_duration = "604800s" # 7 days retention

  depends_on = [google_project_service.enabled_apis]
}

resource "google_pubsub_topic" "alerts" {
  name                       = "alerts-topic"
  message_retention_duration = "604800s" # 7 days retention

  depends_on = [google_project_service.enabled_apis]
}

resource "google_pubsub_subscription" "telemetry_dlq_sub" {
  name                       = "telemetry-dlq-sub"
  topic                      = google_pubsub_topic.telemetry_dlq.id
  ack_deadline_seconds       = 60
  message_retention_duration = "604800s"
}

# Stream Processor Subscription (Pulls high-velocity telemetry for realtime classification)
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

# Alert Notifier Subscription (Pulls incident events for driver Discord push alerts & SMS)
resource "google_pubsub_subscription" "alerts_sub" {
  name                 = "alerts-sub"
  topic                = google_pubsub_topic.alerts.id
  ack_deadline_seconds = 60

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "300s"
  }
}

# Zero-Code Direct High-Speed Stream Ingestion: Pub/Sub -> BigQuery
resource "google_pubsub_subscription" "telemetry_bigquery_sub" {
  name  = "telemetry-bigquery-sub"
  topic = google_pubsub_topic.telemetry.id

  bigquery_config {
    table            = "${var.project_id}.${google_bigquery_dataset.coldchain_analytics.dataset_id}.${google_bigquery_table.telemetry_stream.table_id}"
    use_topic_schema = false
    write_metadata   = true
  }

  depends_on = [
    google_bigquery_table.telemetry_stream,
    google_project_iam_member.pubsub_bigquery_editor
  ]
}

# ==============================================================================
# 7. Service Account & IAM Permissions
# ==============================================================================
data "google_project" "current" {
  project_id = var.project_id
}

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
    "roles/bigquery.dataEditor",         # High-speed write to BigQuery
    "roles/bigquery.jobUser",            # Run BigQuery analytical queries
    "roles/run.invoker"                  # Invoke Cloud Run services / jobs
  ]
}

resource "google_project_iam_member" "coldchain_sa_roles" {
  for_each = toset(local.service_account_roles)
  project  = var.project_id
  role     = each.key
  member   = "serviceAccount:${google_service_account.coldchain_sa.email}"
}

# Allow Pub/Sub Service Agent to publish to DLQ topic on behalf of dead-letter policy
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

# Allow Pub/Sub Service Agent to write directly into BigQuery for high-speed streaming
resource "google_project_iam_member" "pubsub_bigquery_editor" {
  project = var.project_id
  role    = "roles/bigquery.dataEditor"
  member  = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"

  depends_on = [google_project_service.enabled_apis]
}

# ==============================================================================
# 8. Microservices Architecture on Cloud Run
# ==============================================================================

# ------------------------------------------------------------------------------
# MICROSERVICE 1: dashboard-api (Operations UI & Public REST API)
# ------------------------------------------------------------------------------
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
        name  = "PUBSUB_TOPIC"
        value = google_pubsub_topic.telemetry.name
      }
      env {
        name  = "DISCORD_WEBHOOK_URL"
        value = var.discord_webhook_url
      }
    }
  }

  depends_on = [
    google_project_service.enabled_apis,
    google_firestore_database.database
  ]
}

# Allow public unauthenticated HTTPS access to the operations dashboard UI
resource "google_cloud_run_v2_service_iam_member" "dashboard_public_access" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.dashboard_api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ------------------------------------------------------------------------------
# MICROSERVICE 2: processor (Real-Time High-Throughput Stream Processing Worker)
# ------------------------------------------------------------------------------
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
        # Keep CPU allocated continuously for zero-lag Pub/Sub stream processing
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
    }
  }

  depends_on = [
    google_project_service.enabled_apis,
    google_firestore_database.database,
    google_pubsub_subscription.telemetry_sub
  ]
}

# ------------------------------------------------------------------------------
# MICROSERVICE 3: alert-notifier (Driver Push Alerts, Discord & In-Cab Worker)
# ------------------------------------------------------------------------------
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
        # Keep CPU allocated continuously for instant alert dispatch
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
      env {
        name  = "DISCORD_WEBHOOK_URL"
        value = var.discord_webhook_url
      }
      env {
        name  = "DISCORD_VOICE_TTS"
        value = tostring(var.discord_voice_tts)
      }
    }
  }

  depends_on = [
    google_project_service.enabled_apis,
    google_pubsub_subscription.alerts_sub
  ]
}

# ------------------------------------------------------------------------------
# MICROSERVICE 4: silence-detector (Cloud Run Job & Cron Scheduler)
# ------------------------------------------------------------------------------
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

# ------------------------------------------------------------------------------
# MICROSERVICE 5: telemetry-generator (High-Speed Ingestion Fleet Simulator Job)
# ------------------------------------------------------------------------------
resource "google_cloud_run_v2_job" "telemetry_generator" {
  name     = "coldchain-telemetry-generator"
  location = var.region

  template {
    template {
      service_account = google_service_account.coldchain_sa.email

      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repo_name}/telemetry-generator:${var.image_tag}"

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
          name  = "PUBSUB_TOPIC"
          value = google_pubsub_topic.telemetry.name
        }
        env {
          name  = "PING_INTERVAL_SEC"
          value = "1.0"
        }
        env {
          name  = "EXCURSION_PROBABILITY"
          value = "0.03"
        }
      }
    }
  }

  depends_on = [
    google_project_service.enabled_apis,
    google_pubsub_topic.telemetry
  ]
}
