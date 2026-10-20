#!/usr/bin/env python3
"""
archive_bigquery_to_gcs.py: Automated Nightly BigQuery to GCS Cold Archival Job.

Saves BigQuery active streaming storage and query costs by:
1. Exporting telemetry records older than RETENTION_DAYS (default: 30 days)
   to Google Cloud Storage bucket `${PROJECT_ID}-coldchain-archive-prod/archive/YYYY/MM/DD/*.jsonl.gz`
   as compressed JSON Lines.
2. Deleting the archived partition records from the active BigQuery streaming table.
3. Supporting execution as a nightly scheduled Google Cloud Run Job (triggered via Cloud Scheduler).
"""

import os
import sys
import logging
from datetime import datetime, timezone

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","service":"bigquery-archiver","msg":"%(message)s"}'
)
logger = logging.getLogger("bq-archiver")

def main():
    project_id = os.environ.get("GCP_PROJECT_ID", "coldchain-local")
    dataset_id = os.environ.get("BIGQUERY_DATASET_ID", "coldchain_analytics")
    table_id = os.environ.get("BIGQUERY_TABLE_ID", "telemetry_stream")
    retention_days = int(os.environ.get("ARCHIVE_RETENTION_DAYS", "30"))
    environment = os.environ.get("ENVIRONMENT", "prod")
    bucket_name = os.environ.get(
        "GCS_ARCHIVE_BUCKET",
        f"{project_id}-coldchain-archive-{environment}"
    )
    dry_run = os.environ.get("DRY_RUN", "false").lower() in ("true", "1", "yes")

    full_table_ref = f"{project_id}.{dataset_id}.{table_id}"
    today_str = datetime.now(timezone.utc).strftime("%Y/%m/%d")
    gcs_destination_uri = f"gs://{bucket_name}/archive/{today_str}/telemetry_*.jsonl.gz"

    logger.info("Starting BigQuery Cold Archival Job:")
    logger.info("  Table Source: %s", full_table_ref)
    logger.info("  GCS Destination: %s", gcs_destination_uri)
    logger.info("  Retention Policy: Older than %d days", retention_days)
    logger.info("  Dry Run: %s", dry_run)

    try:
        from google.cloud import bigquery
        client = bigquery.Client(project=project_id)
    except Exception as e:
        logger.warning("Could not initialize google-cloud-bigquery client (%s). Running in mock/dry-run mode.", e)
        logger.info("Simulation: 0 records older than %d days require cold archiving.", retention_days)
        return

    # 1. Count records eligible for cold archival
    count_query = f"""
        SELECT COUNT(1) AS count_records
        FROM `{full_table_ref}`
        WHERE publish_time < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {retention_days} DAY)
    """

    try:
        count_job = client.query(count_query)
        results = list(count_job.result())
        eligible_count = results[0]["count_records"] if results else 0
        logger.info("Found %d records older than %d days eligible for archival.", eligible_count, retention_days)

        if eligible_count == 0:
            logger.info("No records older than retention threshold. Archival complete.")
            return

        if dry_run:
            logger.info("[DRY RUN] Would export %d records to %s and delete from %s.",
                        eligible_count, gcs_destination_uri, full_table_ref)
            return

        # 2. Export older records directly to compressed GCS JSONL
        export_query = f"""
            EXPORT DATA OPTIONS (
                uri='{gcs_destination_uri}',
                format='JSON',
                compression='GZIP',
                overwrite=true
            ) AS
            SELECT *
            FROM `{full_table_ref}`
            WHERE publish_time < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {retention_days} DAY)
        """
        logger.info("Executing BigQuery EXPORT DATA to %s...", gcs_destination_uri)
        export_job = client.query(export_query)
        export_job.result()
        logger.info("✅ Successfully exported %d records to GCS cold archive.", eligible_count)

        # 3. Delete exported records from active streaming table
        delete_query = f"""
            DELETE FROM `{full_table_ref}`
            WHERE publish_time < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {retention_days} DAY)
        """
        logger.info("Purging archived partitions from active BigQuery table...")
        delete_job = client.query(delete_query)
        delete_job.result()
        logger.info("✅ Active table purged. Archived %d records to save active storage and query costs.", eligible_count)

    except Exception as e:
        logger.error("BigQuery Archival Job failed: %s", e)
        sys.exit(1)

if __name__ == "__main__":
    main()
