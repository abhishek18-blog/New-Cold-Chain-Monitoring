.PHONY: up down logs test failover reset clean help stress replay normal tf-deploy tf-destroy

help:
	@echo "ColdChain Fleet Management Microservices"
	@echo "----------------------------------------"
	@echo "make up        - Build and start all microservices in background"
	@echo "make down      - Stop and remove all running containers"
	@echo "make logs      - Follow live structured logs across all services"
	@echo "make test      - Run pytest unit tests for classify & timestamp guards"
	@echo "make clean     - Clean Python bytecode (__pycache__), pytest caches, and temp files"
	@echo "make failover  - Execute automated Kafka broker failover chaos test"
	@echo "make stress    - High-speed Kafka stress test (0.1s interval = ~150 msg/s)"
	@echo "make replay    - Stream all 24,000 dataset records into Kafka at high speed"
	@echo "make normal    - Restore smooth 5.0s live telemetry generator interval"
	@echo "make tf-deploy - Automated build, container push & Terraform deployment to Cloud Run"
	@echo "make tf-destroy- Tear down all Cloud Run and GCP resources via Terraform"
	@echo "make reset     - Full teardown including volumes and archive data"

clean:
	@echo "🧹 Cleaning Python bytecode, caches, and temporary files..."
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.py[cod]" -delete 2>/dev/null || true
	rm -rf .pytest_cache .coverage htmlcov
	@echo "✅ Clean completed."

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f

test:
	pytest tests/ -v

failover:
	./scripts/failover_test.sh

stress:
	@echo "⚡ Starting telemetry generator in high-speed STRESS MODE (~150 msgs/sec)..."
	PING_INTERVAL_SEC=0.1 STRESS_MODE=true docker compose up -d telemetry-generator
	@echo "✅ Stress mode active! Monitor throughput & consumer lag in Kafka UI: http://localhost:8082"

replay:
	@echo "🚀 Replaying 24,000 dataset records from shipment-sensor-dataset.csv into Kafka..."
	docker compose exec telemetry-generator python /app/scripts/replay_dataset.py --rate 250

normal:
	@echo "🔄 Restoring normal telemetry generator interval (5.0s per tick)..."
	PING_INTERVAL_SEC=5 STRESS_MODE=false docker compose up -d telemetry-generator
	@echo "✅ Normal mode restored."

reset:
	docker compose down -v --remove-orphans
	rm -rf ./data/archive
	@echo "Full cluster reset completed."

tf-deploy:
	./terraform/deploy.sh

tf-destroy:
	cd terraform && terraform destroy
