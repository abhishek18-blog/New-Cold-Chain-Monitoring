#!/usr/bin/env bash
set -e

# ==============================================================================
# ColdChain Fleet - Cloud Run Automated Deployment Script
# Optimized for Google Cloud Shell and Local CLI deployments
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

# 1. Enable Required GCP APIs
echo ""
echo ">>> [1/6] Enabling required GCP APIs..."
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  storage.googleapis.com \
  run.googleapis.com \
  pubsub.googleapis.com \
  firestore.googleapis.com \
  cloudscheduler.googleapis.com \
  --project="$PROJECT_ID"

# 2. Ensure Artifact Registry Docker repository exists
echo ""
echo ">>> [2/6] Ensuring Artifact Registry repository '$REPO_NAME' exists in '$REGION'..."
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

# 3. Grant Cloud Build service account permissions to push images to Artifact Registry
echo ""
echo ">>> [3/6] Configuring Cloud Build IAM permissions..."
PROJECT_NUM=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)" 2>/dev/null || true)
if [ -n "$PROJECT_NUM" ]; then
  echo "Granting Artifact Registry writer role to Cloud Build service accounts (Project #$PROJECT_NUM)..."
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${PROJECT_NUM}@cloudbuild.gserviceaccount.com" \
    --role="roles/artifactregistry.writer" --condition=None --quiet 2>/dev/null || true
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${PROJECT_NUM}-compute@developer.gserviceaccount.com" \
    --role="roles/artifactregistry.writer" --condition=None --quiet 2>/dev/null || true
fi

# 4. Ensure Regional Cloud Build staging bucket exists (fixes NOT_FOUND errors)
echo ""
echo ">>> [4/6] Setting up Cloud Build staging storage..."
STAGING_BUCKET="${PROJECT_ID}-cloudbuild-staging"
if ! gcloud storage buckets describe "gs://${STAGING_BUCKET}" >/dev/null 2>&1; then
  echo "Creating regional staging bucket 'gs://${STAGING_BUCKET}' in '$REGION'..."
  gcloud storage buckets create "gs://${STAGING_BUCKET}" \
    --location="$REGION" \
    --project="$PROJECT_ID" \
    --uniform-bucket-level-access 2>/dev/null || true
else
  echo "Staging bucket 'gs://${STAGING_BUCKET}' already exists."
fi

# 5. Build and push container images using Cloud Build (faster & avoids Cloud Shell Docker socket issues)
REGISTRY_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}"
SERVICES=("dashboard:dashboard-api" "processor:processor" "alert-notifier:alert-notifier" "silence-detector:silence-detector")

echo ""
echo ">>> [5/6] Building and pushing container images via Google Cloud Build..."

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for item in "${SERVICES[@]}"; do
  DIR="${item%%:*}"
  SVC="${item##*:}"
  FULL_IMAGE="${REGISTRY_URL}/${SVC}:${IMAGE_TAG}"

  echo "----------------------------------------------------------"
  echo "  🔨 Submitting build for ${SVC} from ${DIR}/..."
  echo "  Target: ${FULL_IMAGE}"
  echo "----------------------------------------------------------"

  gcloud builds submit "$ROOT_DIR/$DIR" \
    --region="$REGION" \
    --gcs-source-staging-dir="gs://${STAGING_BUCKET}/source" \
    --tag="$FULL_IMAGE" \
    --project="$PROJECT_ID"
done

# 6. Initialize and apply Terraform
echo ""
echo ">>> [6/6] Initializing and applying Terraform..."
cd "$ROOT_DIR/terraform"

terraform init

# Helper function to check if resource exists in state safely (avoids "No state file was found!" noise)
has_resource_in_state() {
  [ -f terraform.tfstate ] && terraform state list 2>/dev/null | grep -q "$1"
}

# If the repository was created outside terraform, import it so terraform doesn't fail with 409 Conflict
REPO_ID="projects/${PROJECT_ID}/locations/${REGION}/repositories/${REPO_NAME}"
if ! has_resource_in_state "google_artifact_registry_repository.containers"; then
  echo "Ensuring Artifact Registry is tracked in Terraform state..."
  terraform import \
    -var="project_id=${PROJECT_ID}" \
    -var="region=${REGION}" \
    -var="artifact_registry_repo_name=${REPO_NAME}" \
    -var="image_tag=${IMAGE_TAG}" \
    google_artifact_registry_repository.containers "$REPO_ID" 2>/dev/null || true
fi

# If Firestore database already exists, import it to prevent 409 Conflict
if ! has_resource_in_state "google_firestore_database.database"; then
  if gcloud firestore databases describe --database="(default)" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "Importing existing Firestore (default) database into Terraform state..."
    terraform import \
      -var="project_id=${PROJECT_ID}" \
      -var="region=${REGION}" \
      -var="artifact_registry_repo_name=${REPO_NAME}" \
      -var="image_tag=${IMAGE_TAG}" \
      google_firestore_database.database "(default)" 2>/dev/null || true
  fi
fi

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
