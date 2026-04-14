#!/bin/bash
# scripts/deploy.sh
# Full deployment: VAPID key check → docker build+push → k8s apply → rolling update
#
# Usage:
#   GIT_SHA=$(git rev-parse --short HEAD) ./scripts/deploy.sh [--env staging|production] [--registry my-registry.io]
#
# Required env vars:
#   GIT_SHA          — git commit SHA for image tagging
#
# Optional env vars:
#   REGISTRY         — Docker registry prefix (default: card-platform)
#   KUBE_NAMESPACE   — Kubernetes namespace (default: card-platform)

set -euo pipefail

# ── Argument parsing ────────────────────────────────────────────────────────────
ENV="staging"
REGISTRY="${REGISTRY:-card-platform}"
KUBE_NAMESPACE="${KUBE_NAMESPACE:-card-platform}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      ENV="$2"
      shift 2
      ;;
    --env=*)
      ENV="${1#--env=}"
      shift
      ;;
    --registry)
      REGISTRY="$2"
      shift 2
      ;;
    --registry=*)
      REGISTRY="${1#--registry=}"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--env staging|production] [--registry <registry>]" >&2
      exit 1
      ;;
  esac
done

# ── Validate required variables ─────────────────────────────────────────────────
if [[ -z "${GIT_SHA:-}" ]]; then
  echo "Error: GIT_SHA environment variable is required." >&2
  echo "  export GIT_SHA=\$(git rev-parse --short HEAD)" >&2
  exit 1
fi

if [[ "$ENV" != "staging" && "$ENV" != "production" ]]; then
  echo "Error: --env must be 'staging' or 'production', got '$ENV'" >&2
  exit 1
fi

echo "=== Card Platform Deploy ==="
echo "Environment : $ENV"
echo "GIT_SHA     : $GIT_SHA"
echo "Registry    : $REGISTRY"
echo "Namespace   : $KUBE_NAMESPACE"
echo ""

# ── Step 1: Ensure VAPID keys exist ────────────────────────────────────────────
echo "[1/5] Checking VAPID keys..."
./scripts/generate-vapid.sh --env "$ENV"

# ── Step 2: Load secrets into k8s Secret ───────────────────────────────────────
echo "[2/5] Applying secrets to Kubernetes..."
SECRETS_FILE=".env.${ENV}.secrets"
if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "Error: secrets file $SECRETS_FILE not found." >&2
  exit 1
fi

kubectl create secret generic card-platform-secrets \
  --from-env-file="$SECRETS_FILE" \
  --namespace="$KUBE_NAMESPACE" \
  --dry-run=client -o yaml | kubectl apply -f -

# ── Step 3: Build and push Docker images ───────────────────────────────────────
echo "[3/5] Building and pushing Docker images (tag: $GIT_SHA)..."

docker build -t "${REGISTRY}/api:${GIT_SHA}" apps/api-service
docker push "${REGISTRY}/api:${GIT_SHA}"

docker build -t "${REGISTRY}/socket:${GIT_SHA}" apps/socket-service
docker push "${REGISTRY}/socket:${GIT_SHA}"

docker build -t "${REGISTRY}/worker:${GIT_SHA}" apps/worker-service
docker push "${REGISTRY}/worker:${GIT_SHA}"

docker build -t "${REGISTRY}/frontend:${GIT_SHA}" apps/frontend
docker push "${REGISTRY}/frontend:${GIT_SHA}"

echo "All images pushed successfully."

# ── Step 4: Apply k8s manifests ────────────────────────────────────────────────
echo "[4/5] Applying Kubernetes manifests..."
kubectl apply -f k8s/ --recursive --namespace="$KUBE_NAMESPACE"

# ── Step 5: Rolling update with new image tags ─────────────────────────────────
echo "[5/5] Rolling out new images..."

kubectl set image deployment/api-deployment \
  api="${REGISTRY}/api:${GIT_SHA}" \
  --namespace="$KUBE_NAMESPACE"

kubectl set image deployment/socket-deployment \
  socket="${REGISTRY}/socket:${GIT_SHA}" \
  --namespace="$KUBE_NAMESPACE"

kubectl set image deployment/worker-deployment \
  worker="${REGISTRY}/worker:${GIT_SHA}" \
  --namespace="$KUBE_NAMESPACE"

kubectl set image deployment/frontend-deployment \
  frontend="${REGISTRY}/frontend:${GIT_SHA}" \
  --namespace="$KUBE_NAMESPACE"

# Wait for rollouts to complete
kubectl rollout status deployment/api-deployment \
  --namespace="$KUBE_NAMESPACE" --timeout=120s

kubectl rollout status deployment/socket-deployment \
  --namespace="$KUBE_NAMESPACE" --timeout=120s

kubectl rollout status deployment/worker-deployment \
  --namespace="$KUBE_NAMESPACE" --timeout=120s

kubectl rollout status deployment/frontend-deployment \
  --namespace="$KUBE_NAMESPACE" --timeout=120s

echo ""
echo "=== Deployment complete ==="
echo "SHA: $GIT_SHA"
echo "Environment: $ENV"
