output "dashboard_url" {
  description = "The public HTTPS URL for the ColdChain Fleet Dashboard & REST API"
  value       = google_cloud_run_v2_service.dashboard_api.uri
}

output "artifact_registry_repository" {
  description = "Artifact Registry Docker repository address for all microservices"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers.repository_id}"
}

output "pubsub_telemetry_topic" {
  description = "Full ID of the high-speed telemetry ingestion Pub/Sub topic"
  value       = google_pubsub_topic.telemetry.id
}

output "pubsub_alerts_topic" {
  description = "Full ID of the incident alert dispatch Pub/Sub topic"
  value       = google_pubsub_topic.alerts.id
}

output "pubsub_telemetry_subscription" {
  description = "Full ID of the stream processor Pub/Sub subscription"
  value       = google_pubsub_subscription.telemetry_sub.id
}

output "pubsub_alerts_subscription" {
  description = "Full ID of the driver alert notifier Pub/Sub subscription"
  value       = google_pubsub_subscription.alerts_sub.id
}

output "bigquery_dataset" {
  description = "BigQuery dataset ID for high-speed analytical queries"
  value       = google_bigquery_dataset.coldchain_analytics.dataset_id
}

output "bigquery_table" {
  description = "BigQuery table ID where Pub/Sub streams real-time telemetry"
  value       = "${var.project_id}.${google_bigquery_dataset.coldchain_analytics.dataset_id}.${google_bigquery_table.telemetry_stream.table_id}"
}

output "gcs_archive_bucket" {
  description = "Cloud Storage bucket name for multi-tier cold telemetry archives"
  value       = google_storage_bucket.telemetry_archive.name
}

output "service_account_email" {
  description = "The dedicated Cloud Run execution Service Account email"
  value       = google_service_account.coldchain_sa.email
}

output "telemetry_generator_job" {
  description = "Run this gcloud command to execute live high-speed fleet telemetry ingestion in Cloud Run"
  value       = "gcloud run jobs execute ${google_cloud_run_v2_job.telemetry_generator.name} --region=${var.region} --project=${var.project_id}"
}

output "silence_detector_job" {
  description = "Run this gcloud command to execute manual fleet silence detection audit"
  value       = "gcloud run jobs execute ${google_cloud_run_v2_job.silence_detector.name} --region=${var.region} --project=${var.project_id}"
}
