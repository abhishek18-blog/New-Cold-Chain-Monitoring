output "dashboard_url" {
  description = "The public HTTPS URL for the ColdChain Fleet Dashboard & API"
  value       = google_cloud_run_v2_service.dashboard_api.uri
}

output "artifact_registry_repository" {
  description = "Artifact Registry Docker repository address"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers.repository_id}"
}

output "pubsub_telemetry_topic" {
  description = "Full ID of the telemetry ingestion Pub/Sub topic"
  value       = google_pubsub_topic.telemetry.id
}

output "pubsub_alerts_topic" {
  description = "Full ID of the alert dispatch Pub/Sub topic"
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

output "gcs_archive_bucket" {
  description = "Cloud Storage bucket name for historical telemetry archives"
  value       = google_storage_bucket.telemetry_archive.name
}

output "service_account_email" {
  description = "The dedicated Cloud Run execution Service Account email"
  value       = google_service_account.coldchain_sa.email
}

output "silence_detector_job_name" {
  description = "Cloud Run Job name for silence detection"
  value       = google_cloud_run_v2_job.silence_detector.name
}
