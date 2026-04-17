# Azure bootstrap — one-time setup

The one-time setup is automated. Run [bootstrap.sh](bootstrap.sh):

```bash
# Prereqs: az, gh, openssl installed and logged in.
az login
gh auth login
./infra/bootstrap.sh
```

Set any of these env vars before running if you want to override defaults:

| Variable | Default |
|---|---|
| `RESOURCE_GROUP` | `claudes-cards-rg` |
| `LOCATION` | `canadacentral` |
| `PROJECT_SLUG` | `claudescards` |
| `DNS_ZONE` | `relevanttechnologyservices.com` |
| `DNS_ZONE_RG` | auto-detected |
| `GITHUB_REPO` | `jamiefraser/claudes-cards` |
| `SP_DISPLAY_NAME` | `claudes-cards-deploy` |
| `B2C_TENANT` | `cards.onmicrosoft.com` |
| `B2C_APP_CLIENT_ID` | `096195ca-be77-44f5-9a5b-40e154f2ca46` |
| `FRONTEND_URL` | `https://cardgames.relevanttechnologyservices.com` |
| `PG_ADMIN_PASSWORD` | auto-generated |
| `JWT_SECRET` | auto-generated |

## What it does

1. Creates the resource group if missing.
2. Auto-detects the RG that holds `relevanttechnologyservices.com`.
3. Creates the deploy service principal + OIDC federated credentials for the GitHub repo (main branch + workflow_dispatch).
4. Grants the SP `Contributor` + `AcrPush` on the app RG, plus `DNS Zone Contributor` on the zone's RG.
5. Writes these GitHub **secrets**: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `PG_ADMIN_PASSWORD`, `JWT_SECRET`.
6. Writes these GitHub **variables**: `B2C_CLIENT_ID`, `B2C_AUTHORITY`, `B2C_KNOWN_AUTHORITIES`.
7. Prompts for sign-in to the B2C tenant and adds `https://cardgames.relevanttechnologyservices.com` as a redirect URI on the SPA app registration.

It's idempotent — every step checks for existing state, so you can safely re-run.

## After bootstrap

```bash
gh workflow run "Azure deploy" --repo jamiefraser/claudes-cards
gh run watch --repo jamiefraser/claudes-cards
```

First run: ~20 min (Postgres + Redis + image builds + DNS cert issuance). Subsequent runs: ~5 min.

On-demand redeploys from the Actions tab → **Azure deploy** → Run workflow. Inputs:

- `image_tag` — leave blank to use the current commit SHA, or paste any previously-built tag to roll back.
- `skip_infra` — check this to skip the bicep step (only rebuild + roll images) when you know infra hasn't changed.

## Tear down

```bash
az group delete --name claudes-cards-rg --yes --no-wait
# Also remove the cardgames CNAME + asuid TXT records from the DNS zone.
```
