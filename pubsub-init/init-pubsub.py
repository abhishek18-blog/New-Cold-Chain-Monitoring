import os
import time
import logging
from google.cloud import pubsub_v1
from google.api_core.exceptions import AlreadyExists, GoogleAPICallError

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("pubsub-init")

project_id = os.environ.get("GCP_PROJECT_ID", "coldchain-local")
topic_id = os.environ.get("PUBSUB_TOPIC", "telemetry-topic")
sub_id = os.environ.get("PUBSUB_SUB", "telemetry-sub")
dlq_topic_id = os.environ.get("PUBSUB_DLQ_TOPIC", "telemetry-dlq-topic")

def initialize_pubsub():
    logger.info("Connecting to Pub/Sub Emulator at %s for project %s", 
                os.environ.get("PUBSUB_EMULATOR_HOST", "not-set"), project_id)
    
    publisher = pubsub_v1.PublisherClient()
    subscriber = pubsub_v1.SubscriberClient()
    
    topic_path = publisher.topic_path(project_id, topic_id)
    dlq_topic_path = publisher.topic_path(project_id, dlq_topic_id)
    sub_path = subscriber.subscription_path(project_id, sub_id)
    
    # Wait for emulator to be ready
    ready = False
    for attempt in range(1, 31):
        try:
            publisher.list_topics(request={"project": f"projects/{project_id}"})
            ready = True
            break
        except Exception as e:
            logger.info("Waiting for Pub/Sub emulator... attempt %d/30 (%s)", attempt, e)
            time.sleep(2)
            
    if not ready:
        logger.error("Failed to connect to Pub/Sub emulator after 60s")
        exit(1)
        
    # Create main topic
    try:
        publisher.create_topic(request={"name": topic_path})
        logger.info("Created topic: %s", topic_path)
    except AlreadyExists:
        logger.info("Topic already exists: %s", topic_path)
        
    # Create DLQ topic
    try:
        publisher.create_topic(request={"name": dlq_topic_path})
        logger.info("Created DLQ topic: %s", dlq_topic_path)
    except AlreadyExists:
        logger.info("DLQ topic already exists: %s", dlq_topic_path)
        
    # Create Subscription with Dead Letter Policy
    dead_letter_policy = pubsub_v1.types.DeadLetterPolicy(
        dead_letter_topic=dlq_topic_path,
        max_delivery_attempts=5
    )
    
    try:
        subscriber.create_subscription(
            request={
                "name": sub_path,
                "topic": topic_path,
                "dead_letter_policy": dead_letter_policy,
                "ack_deadline_seconds": 20
            }
        )
        logger.info("Created subscription: %s attached to %s (max_delivery_attempts=5)", sub_path, topic_path)
    except AlreadyExists:
        logger.info("Subscription already exists: %s", sub_path)

    # Create Alerts topic & subscription for Driver & Ops Alerting
    alerts_topic_id = os.environ.get("PUBSUB_ALERTS_TOPIC", "alerts-topic")
    alerts_sub_id = os.environ.get("PUBSUB_ALERTS_SUB", "alerts-sub")
    alerts_topic_path = publisher.topic_path(project_id, alerts_topic_id)
    alerts_sub_path = subscriber.subscription_path(project_id, alerts_sub_id)

    try:
        publisher.create_topic(request={"name": alerts_topic_path})
        logger.info("Created alerts topic: %s", alerts_topic_path)
    except AlreadyExists:
        logger.info("Alerts topic already exists: %s", alerts_topic_path)

    try:
        subscriber.create_subscription(
            request={
                "name": alerts_sub_path,
                "topic": alerts_topic_path,
                "ack_deadline_seconds": 20
            }
        )
        logger.info("Created alerts subscription: %s attached to %s", alerts_sub_path, alerts_topic_path)
    except AlreadyExists:
        logger.info("Alerts subscription already exists: %s", alerts_sub_path)
        
    logger.info("Pub/Sub Emulator initialization completed successfully.")

if __name__ == "__main__":
    initialize_pubsub()
