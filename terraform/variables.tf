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

variable "kafka_bootstrap_servers" {
  description = "Bootstrap servers for Kafka cluster (e.g., GCE VM IP or Managed Kafka). Optional for pure Pub/Sub paths."
  type        = string
  default     = ""
}

variable "kafka_topic_telemetry" {
  description = "Kafka topic name for telemetry events"
  type        = string
  default     = "truck-telemetry"
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
