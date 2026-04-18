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
| `GITHUB_REPO` | `jamiefraser/claudes-cards` |
| `SP_DISPLAY_NAME` | `claudes-cards-deploy` |
| `B2C_TENANT` | `cards.onmicrosoft.com` |
| `B2C_APP_CLIENT_ID` | `096195ca-be77-44f5-9a5b-40e154f2ca46` |
| `FRONTEND_URL` | `https://cardgames.relevanttechnologyservices.com` |
| `PG_ADMIN_PASSWORD` | auto-generated |
| `JWT_SECRET` | auto-generated |

## What it does

1. Creates the resource group if missing.
2. Creates the deploy service principal + OIDC federated credentials for the GitHub repo (main + master branches).
3. Grants the SP `Reader` on the subscription, `Owner` + `AcrPush` on the app RG.
4. Writes these GitHub **secrets**: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `PG_ADMIN_PASSWORD`, `JWT_SECRET`.
5. Writes these GitHub **variables**: `B2C_CLIENT_ID`, `B2C_AUTHORITY`, `B2C_KNOWN_AUTHORITIES`.
6. Prompts for sign-in to the B2C tenant and adds the frontend redirect URI on the SPA app registration.

It's idempotent — every step checks for existing state, so you can safely re-run.

## Custom domain (optional, manual)

The workflow deploys the frontend at its default Container Apps URL
(`claudescards-web.<env>.canadacentral.azurecontainerapps.io`). If you want a
custom domain, set it up **once** in the portal:

1. Azure portal → Container Apps → `claudescards-web` → Custom domains → **Add custom domain**.
2. Copy the verification id and create the CNAME + `asuid.` TXT records it shows.
3. Let Azure issue the managed certificate (1–5 minutes).

This isn't automated because Azure's managed-cert validator uses an internal
DNS cache that lags public resolvers, so scripting it is unreliable. Doing it
once by hand is fast.

## After bootstrap

```bash
gh workflow run "Azure deploy" --repo jamiefraser/claudes-cards
gh run watch --repo jamiefraser/claudes-cards
```

First run: ~10 min (Postgres + Redis + image builds). Subsequent runs: ~5 min.

On-demand redeploys from the Actions tab → **Azure deploy** → Run workflow. Inputs:

- `image_tag` — leave blank to use the current commit SHA, or paste any previously-built tag to roll back.
- `run_infra` — check this to force the bicep step to run. By default the workflow runs bicep **only** when something under `infra/` or `.github/workflows/azure-deploy.yml` changed in the push (or the Container Apps environment doesn't exist yet). On a normal code-only change the bicep step is skipped and the deploy finishes in a few minutes instead of ~10.

## Tear down

```bash
az group delete --name claudes-cards-rg --yes --no-wait
```
