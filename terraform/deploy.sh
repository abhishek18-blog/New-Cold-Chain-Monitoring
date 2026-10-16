#!/usr/bin/env bash
set -e

# ==============================================================================
# ColdChain Fleet - Cloud Run Automated Deployment Script
# ==============================================================================

PROJECT_ID="${1:-$PROJECT_ID}"
REGION="${2:-${REGION:-asia-south1}}"
REPO_NAME="coldchain-containers"
IMAGE_TAG="latest"

if [ -z "$PROJECT_ID" ]; then
  PROJECT_ID=$(gcloud config get-value project 2>/dev/null || true)
fi

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Error: Google Cloud Project ID is required."
  echo "Usage: ./deploy.sh <PROJECT_ID> [REGION]"
  exit 1
fi

echo "=========================================================="
echo "🚀 ColdChain Fleet: Cloud Run Deployment"
echo "Project ID : $PROJECT_ID"
echo "Region     : $REGION"
echo "Registry   : ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}"
echo "=========================================================="

# 1. Enable Artifact Registry API
echo ""
echo ">>> [1/5] Ensuring Artifact Registry API is enabled..."
gcloud services enable artifactregistry.googleapis.com --project="$PROJECT_ID"

# 2. Create Artifact Registry Docker repository if not exists
echo ""
echo ">>> [2/5] Checking Artifact Registry repository..."
if ! gcloud artifacts repositories describe "$REPO_NAME" --project="$PROJECT_ID" --location="$REGION" >/dev/null 2>&1; then
  echo "Creating repository '$REPO_NAME' in '$REGION'..."
  gcloud artifacts repositories create "$REPO_NAME" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --repository-format=docker \
    --description="Docker container registry for ColdChain Fleet"
else
  echo "Repository '$REPO_NAME' already exists."
fi

# 3. Configure Docker credential helper
echo ""
echo ">>> [3/5] Configuring Docker authentication for Google Artifact Registry..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# 4. Build and push container images
REGISTRY_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}"
SERVICES=("dashboard:dashboard-api" "processor:processor" "alert-notifier:alert-notifier" "silence-detector:silence-detector")

echo ""
echo ">>> [4/5] Building and pushing container images to Artifact Registry..."

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for item in "${SERVICES[@]}"; do
  DIR="${item%%:*}"
  SVC="${item##*:}"
  FULL_IMAGE="${REGISTRY_URL}/${SVC}:${IMAGE_TAG}"

  echo "  🔨 Building ${SVC} from ${DIR}/..."
  docker build -t "$FULL_IMAGE" "$ROOT_DIR/$DIR"

  echo "  📤 Pushing ${FULL_IMAGE}..."
  docker push "$FULL_IMAGE"
done

# 5. Initialize and apply Terraform
echo ""
echo ">>> [5/5] Running Terraform..."
cd "$ROOT_DIR/terraform"

terraform init

terraform apply \
  -var="project_id=${PROJECT_ID}" \
  -var="region=${REGION}" \
  -var="artifact_registry_repo_name=${REPO_NAME}" \
  -var="image_tag=${IMAGE_TAG}" \
  -auto-approve

echo ""
echo "=========================================================="
echo "✅ ColdChain Fleet Cloud Run Deployment Completed!"
echo "Dashboard URL:"
terraform output dashboard_url
echo "=========================================================="
