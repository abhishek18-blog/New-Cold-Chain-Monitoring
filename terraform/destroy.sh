#!/usr/bin/env bash
set -e

# ==============================================================================
# ColdChain Fleet - Automated Infrastructure Teardown Script
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ID="${1:-$PROJECT_ID}"
REGION="${2:-${REGION:-asia-south1}}"

if [ -z "$PROJECT_ID" ]; then
  PROJECT_ID=$(gcloud config get-value project 2>/dev/null || true)
fi

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Error: Google Cloud Project ID is required."
  echo "Usage: ./destroy.sh [PROJECT_ID] [REGION]"
  exit 1
fi

echo "=========================================================="
echo "⚠️  ColdChain Fleet: Tearing Down Cloud Infrastructure"
echo "Project ID : $PROJECT_ID"
echo "Region     : $REGION"
echo "=========================================================="

cd "$ROOT_DIR/terraform"

# Export gcloud access token to bypass Cloud Shell metadata server token EOF errors
ACCESS_TOKEN="$(gcloud auth print-access-token 2>/dev/null || true)"
if [ -n "$ACCESS_TOKEN" ]; then
  export GOOGLE_OAUTH_ACCESS_TOKEN="$ACCESS_TOKEN"
fi

terraform destroy \
  -var="project_id=${PROJECT_ID}" \
  -var="region=${REGION}" \
  "${@:3}"

echo ""
echo "✅ All ColdChain Fleet Cloud Resources destroyed successfully."
