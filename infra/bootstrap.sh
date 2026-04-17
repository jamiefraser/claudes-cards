#!/usr/bin/env bash
#
# One-shot Azure bootstrap for claudes-cards.
#
# Automates everything that the GitHub Actions workflow can't do itself:
#   - creates the resource group
#   - creates the deploy service principal + OIDC federated credentials
#   - grants the SP Contributor + AcrPush + DNS Zone Contributor roles
#   - pushes secrets and variables into the GitHub repo (via `gh`)
#   - registers the custom-domain redirect URI on the B2C app registration
#
# Re-runnable: every step checks for existing state and is a no-op if already
# done, so safe to run again after partial failures.
#
# Requirements on the machine that runs this:
#   - az CLI   (logged in against the target subscription)
#   - gh CLI   (authenticated against the GitHub repo owner)
#   - openssl  (for generating JWT_SECRET + PG password if not supplied)
#
# Usage:
#   ./infra/bootstrap.sh
#
# Optional environment overrides (with sensible defaults):
#   RESOURCE_GROUP       claudes-cards-rg
#   LOCATION             canadacentral
#   PROJECT_SLUG         claudescards
#   DNS_ZONE             relevanttechnologyservices.com
#   DNS_ZONE_RG          (auto-detected; override if multiple zones match)
#   GITHUB_REPO          jamiefraser/claudes-cards
#   SP_DISPLAY_NAME      claudes-cards-deploy
#   B2C_TENANT           cards.onmicrosoft.com
#   B2C_APP_OBJECT_ID    (looked up if omitted)
#   B2C_APP_CLIENT_ID    096195ca-be77-44f5-9a5b-40e154f2ca46
#   FRONTEND_URL         https://cardgames.relevanttechnologyservices.com
#   PG_ADMIN_PASSWORD    (auto-generated if unset; written into GitHub secret)
#   JWT_SECRET           (auto-generated if unset; written into GitHub secret)

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────
RESOURCE_GROUP="${RESOURCE_GROUP:-claudes-cards-rg}"
LOCATION="${LOCATION:-canadacentral}"
PROJECT_SLUG="${PROJECT_SLUG:-claudescards}"
DNS_ZONE="${DNS_ZONE:-relevanttechnologyservices.com}"
GITHUB_REPO="${GITHUB_REPO:-jamiefraser/claudes-cards}"
SP_DISPLAY_NAME="${SP_DISPLAY_NAME:-claudes-cards-deploy}"
B2C_TENANT="${B2C_TENANT:-cards.onmicrosoft.com}"
B2C_APP_CLIENT_ID="${B2C_APP_CLIENT_ID:-096195ca-be77-44f5-9a5b-40e154f2ca46}"
B2C_AUTHORITY="${B2C_AUTHORITY:-https://cards.b2clogin.com/cards.onmicrosoft.com/B2C_1_SUSI}"
B2C_KNOWN_AUTHORITIES="${B2C_KNOWN_AUTHORITIES:-cards.b2clogin.com}"
FRONTEND_URL="${FRONTEND_URL:-https://cardgames.relevanttechnologyservices.com}"

log()  { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

need_cmd() { command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"; }
need_cmd az
need_cmd gh
need_cmd openssl

# ── 0 · Confirm caller context ──────────────────────────────────────────────
log "Checking az login…"
az account show -o none 2>/dev/null || die "Run 'az login' first."

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
CALLER_UPN=$(az account show --query user.name -o tsv)
log "Azure subscription: $SUBSCRIPTION_ID (tenant $TENANT_ID, caller $CALLER_UPN)"

log "Checking gh auth…"
gh auth status >/dev/null 2>&1 || die "Run 'gh auth login' first."
gh repo view "$GITHUB_REPO" -q .name >/dev/null || die "Can't see repo $GITHUB_REPO; does your gh user have access?"
log "GitHub repo: $GITHUB_REPO"

# ── 1 · Resource group ──────────────────────────────────────────────────────
log "Ensuring resource group $RESOURCE_GROUP in $LOCATION…"
az group create -n "$RESOURCE_GROUP" -l "$LOCATION" -o none

# ── 2 · DNS zone location (may live in a different RG) ──────────────────────
if [ -z "${DNS_ZONE_RG:-}" ]; then
  log "Locating DNS zone $DNS_ZONE…"
  ZONE_ID=$(az network dns zone list --query "[?name=='$DNS_ZONE'].id" -o tsv | head -n1)
  [ -n "$ZONE_ID" ] || die "DNS zone $DNS_ZONE not found in subscription $SUBSCRIPTION_ID."
  DNS_ZONE_RG=$(echo "$ZONE_ID" | awk -F/ '{print $5}')
fi
log "DNS zone $DNS_ZONE lives in resource group: $DNS_ZONE_RG"

# ── 3 · Service principal + federated credentials ───────────────────────────
log "Ensuring app registration '$SP_DISPLAY_NAME'…"
APP_ID=$(az ad app list --display-name "$SP_DISPLAY_NAME" --query '[0].appId' -o tsv)
APP_OBJECT_ID=$(az ad app list --display-name "$SP_DISPLAY_NAME" --query '[0].id' -o tsv)
if [ -z "$APP_ID" ]; then
  APP_ID=$(az ad app create --display-name "$SP_DISPLAY_NAME" --query appId -o tsv)
  APP_OBJECT_ID=$(az ad app show --id "$APP_ID" --query id -o tsv)
fi
log "App id: $APP_ID"

log "Ensuring service principal…"
az ad sp show --id "$APP_ID" -o none 2>/dev/null || az ad sp create --id "$APP_ID" -o none

ensure_federated_cred() {
  local name="$1" subject="$2"
  local existing
  existing=$(az ad app federated-credential list --id "$APP_OBJECT_ID" --query "[?name=='$name'].subject" -o tsv)
  if [ -n "$existing" ]; then
    log "  federated cred '$name' already present"
    return
  fi
  local tmp
  tmp=$(mktemp)
  cat > "$tmp" <<JSON
{
  "name": "$name",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "$subject",
  "audiences": ["api://AzureADTokenExchange"]
}
JSON
  az ad app federated-credential create --id "$APP_OBJECT_ID" --parameters "@$tmp" -o none
  rm -f "$tmp"
  log "  federated cred '$name' created"
}

log "Registering federated credentials for GitHub OIDC…"
ensure_federated_cred "gha-main"   "repo:${GITHUB_REPO}:ref:refs/heads/main"
ensure_federated_cred "gha-master" "repo:${GITHUB_REPO}:ref:refs/heads/master"
# Covers workflow_dispatch on any branch/tag — subject "pull_request" excluded
# intentionally so PR runs never get deploy creds.
ensure_federated_cred "gha-dispatch" "repo:${GITHUB_REPO}:ref:refs/heads/main"

# ── 4 · Role assignments ────────────────────────────────────────────────────
assign_role() {
  local role="$1" scope="$2"
  if az role assignment list --assignee "$APP_ID" --scope "$scope" --query "[?roleDefinitionName=='$role'] | length(@)" -o tsv | grep -q '^0$'; then
    log "  granting $role on $scope"
    az role assignment create --assignee "$APP_ID" --role "$role" --scope "$scope" -o none
  else
    log "  $role on $scope already assigned"
  fi
}

log "Assigning roles to the deploy SP…"
SP_PRINCIPAL_ID=$(az ad sp show --id "$APP_ID" --query id -o tsv)
assign_role "Contributor" "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP"
assign_role "AcrPush"     "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP"
assign_role "DNS Zone Contributor" \
  "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$DNS_ZONE_RG/providers/Microsoft.Network/dnszones/$DNS_ZONE"

# ── 5 · GitHub secrets + variables ──────────────────────────────────────────
# Generate a strong Postgres admin password + JWT secret if not supplied.
PG_ADMIN_PASSWORD="${PG_ADMIN_PASSWORD:-$(openssl rand -base64 32 | tr -d '+/=' | cut -c1-28)Aa1!}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"

set_secret() {
  local name="$1" value="$2"
  printf '%s' "$value" | gh secret set "$name" --repo "$GITHUB_REPO" --body -
  log "  secret $name set"
}
set_var() {
  local name="$1" value="$2"
  gh variable set "$name" --repo "$GITHUB_REPO" --body "$value" -o none 2>/dev/null || \
    gh variable set "$name" --repo "$GITHUB_REPO" --body "$value"
  log "  variable $name set"
}

log "Writing GitHub secrets + variables…"
set_secret AZURE_CLIENT_ID       "$APP_ID"
set_secret AZURE_TENANT_ID       "$TENANT_ID"
set_secret AZURE_SUBSCRIPTION_ID "$SUBSCRIPTION_ID"
set_secret PG_ADMIN_PASSWORD     "$PG_ADMIN_PASSWORD"
set_secret JWT_SECRET            "$JWT_SECRET"

set_var    B2C_CLIENT_ID         "$B2C_APP_CLIENT_ID"
set_var    B2C_AUTHORITY         "$B2C_AUTHORITY"
set_var    B2C_KNOWN_AUTHORITIES "$B2C_KNOWN_AUTHORITIES"

# ── 6 · B2C redirect URI ────────────────────────────────────────────────────
# The B2C app registration lives in a separate directory (the B2C tenant),
# not the primary subscription's tenant, so we need a separate az login into
# that tenant. Skip gracefully if the caller can't (or doesn't want to).
log "Ensuring B2C redirect URI $FRONTEND_URL on app $B2C_APP_CLIENT_ID (tenant $B2C_TENANT)…"
if az account show --query "tenantDefaultDomain || user.name" -o tsv 2>/dev/null | grep -qi "$B2C_TENANT"; then
  warn "Already signed into the B2C tenant — skipping re-login."
else
  warn "Need to sign into the B2C tenant to update the app registration."
  warn "If a browser window opens, authenticate; otherwise Ctrl-C and rerun with B2C steps skipped."
  az login --tenant "$B2C_TENANT" --allow-no-subscriptions --only-show-errors >/dev/null || {
    warn "B2C login failed or was skipped. Add the redirect URI manually:"
    warn "  portal.azure.com → Azure AD B2C → App registrations → $B2C_APP_CLIENT_ID"
    warn "  → Authentication → add $FRONTEND_URL"
    exit 0
  }
fi

B2C_APP_OBJECT_ID="${B2C_APP_OBJECT_ID:-$(az ad app show --id "$B2C_APP_CLIENT_ID" --query id -o tsv 2>/dev/null || true)}"
if [ -z "$B2C_APP_OBJECT_ID" ]; then
  warn "Couldn't locate B2C app $B2C_APP_CLIENT_ID in tenant $B2C_TENANT — add the redirect URI manually."
else
  # Get existing SPA redirect URIs as newline-separated tsv, check for match.
  EXISTING=$(az ad app show --id "$B2C_APP_OBJECT_ID" --query "spa.redirectUris" -o tsv 2>/dev/null || true)
  if printf '%s\n' "$EXISTING" | grep -Fxq "$FRONTEND_URL"; then
    log "  $FRONTEND_URL already registered"
  else
    # Build the new JSON array by concatenating the existing URIs + the new one.
    # Each element becomes a JSON string; `printf %s | awk` handles quoting.
    json_array=$(
      { printf '%s\n' $EXISTING; printf '%s\n' "$FRONTEND_URL"; } \
        | awk 'NF{gsub(/"/, "\\\"", $0); printf "%s\"%s\"", (c++?",":""), $0} END{print ""}'
    )
    az rest --method PATCH \
      --url "https://graph.microsoft.com/v1.0/applications/$B2C_APP_OBJECT_ID" \
      --headers 'Content-Type=application/json' \
      --body "{\"spa\":{\"redirectUris\":[$json_array]}}" \
      >/dev/null
    log "  $FRONTEND_URL added to spa.redirectUris"
  fi
fi

# Swap back to the original subscription/tenant so the rest of the user's
# session isn't stuck in the B2C directory.
az account set --subscription "$SUBSCRIPTION_ID" -o none || true

# ── 7 · Summary ─────────────────────────────────────────────────────────────
cat <<SUMMARY

────────────────────────────────────────────────────────────
 Bootstrap complete.

   Deploy SP         : $APP_ID
   Resource group    : $RESOURCE_GROUP ($LOCATION)
   DNS zone RG       : $DNS_ZONE_RG
   GitHub repo       : $GITHUB_REPO

   Secrets written   : AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID,
                       PG_ADMIN_PASSWORD, JWT_SECRET
   Variables written : B2C_CLIENT_ID, B2C_AUTHORITY, B2C_KNOWN_AUTHORITIES

 Next:
   gh workflow run "Azure deploy" --repo $GITHUB_REPO
   gh run watch    --repo $GITHUB_REPO

 First deploy creates Postgres + Redis + Container Apps + images + DNS +
 TLS cert; allow ~20 min. Subsequent runs take ~5 min.
────────────────────────────────────────────────────────────
SUMMARY
