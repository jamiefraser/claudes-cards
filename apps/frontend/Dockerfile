# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20 AS builder

WORKDIR /build

# Vite bakes env vars at build time. In Azure, the API + socket URLs are the
# Container App FQDNs; they aren't known until the CAE exists, so the deploy
# workflow supplies them as --build-arg.
ARG VITE_API_URL=/api/v1
ARG VITE_SOCKET_URL=
ARG VITE_AUTH_MODE=production
ARG VITE_B2C_CLIENT_ID=
ARG VITE_B2C_AUTHORITY=
ARG VITE_B2C_KNOWN_AUTHORITIES=
ARG VITE_LOG_LEVEL=info

# VITE_B2C_REDIRECT_URI is intentionally NOT baked here. MSAL derives the
# redirect URI from window.location.origin at runtime so one image serves
# multiple hosts (custom domain + CAE default hostname + localhost).

ENV VITE_API_URL=$VITE_API_URL \
    VITE_SOCKET_URL=$VITE_SOCKET_URL \
    VITE_AUTH_MODE=$VITE_AUTH_MODE \
    VITE_B2C_CLIENT_ID=$VITE_B2C_CLIENT_ID \
    VITE_B2C_AUTHORITY=$VITE_B2C_AUTHORITY \
    VITE_B2C_KNOWN_AUTHORITIES=$VITE_B2C_KNOWN_AUTHORITIES \
    VITE_LOG_LEVEL=$VITE_LOG_LEVEL

COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/cards-engine/package.json ./packages/cards-engine/
COPY apps/frontend/package.json ./apps/frontend/

RUN npm ci --workspace=packages/shared-types --workspace=packages/cards-engine \
    --workspace=apps/frontend --include-workspace-root

COPY packages/shared-types ./packages/shared-types
COPY packages/cards-engine ./packages/cards-engine
COPY apps/frontend ./apps/frontend

RUN npm run build --workspace=packages/shared-types
RUN npm run build --workspace=packages/cards-engine
RUN npm run build --workspace=apps/frontend

# ── Production stage ────────────────────────────────────────────────────────────
FROM nginx:alpine AS production

# wget for healthchecks (not in base nginx:alpine)
RUN apk add --no-cache wget

# Copy built static assets
COPY --from=builder /build/apps/frontend/dist /usr/share/nginx/html

# Nginx serves static only in Azure — the browser talks to the API and socket
# container apps directly via absolute URLs baked into the Vite bundle above.
COPY apps/frontend/nginx.azure.conf /etc/nginx/conf.d/default.conf

RUN rm -f /etc/nginx/conf.d/default.conf.bak 2>/dev/null || true

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
