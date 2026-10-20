variable "project_id" {
  description = "The Google Cloud Project ID"
  type        = string
}

variable "region" {
  description = "The Google Cloud region to deploy resources to"
  type        = string
  default     = "asia-south1"
}

variable "environment" {
  description = "Deployment environment name (e.g., dev, prod, staging)"
  type        = string
  default     = "prod"
}

variable "artifact_registry_repo_name" {
  description = "Name of the Artifact Registry repository for container images"
  type        = string
  default     = "coldchain-containers"
}

variable "image_tag" {
  description = "Tag for container images deployed to Cloud Run"
  type        = string
  default     = "latest"
}

variable "alert_cooldown_sec" {
  description = "Anti-spam cooldown duration in seconds per truck for alert notifications"
  type        = number
  default     = 300
}

variable "silence_timeout_sec" {
  description = "Number of seconds before an unresponsive truck is flagged as NO_SIGNAL"
  type        = number
  default     = 120
}

variable "discord_webhook_url" {
  description = "Discord Webhook URL for real-time mobile push alerts"
  type        = string
  default     = "https://discord.com/api/webhooks/1562083725309775932/47uha9d8Ktdx0WziYRu6zOR_u7440PUIB2jicXUxbPtkrSM28YesJLeUt1jnjpXtknTr"
}

variable "discord_voice_tts" {
  description = "Enable Discord voice Text-to-Speech (TTS)"
  type        = bool
  default     = false
}


variable "bigquery_dataset_id" {
  description = "BigQuery dataset ID for high-speed analytical storage"
  type        = string
  default     = "coldchain_analytics"
}

variable "bigquery_table_id" {
  description = "BigQuery table ID for raw telemetry streaming"
  type        = string
  default     = "telemetry_stream"
}
