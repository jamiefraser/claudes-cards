# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20 AS builder

WORKDIR /build

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

# Copy nginx configuration
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Remove default nginx config
RUN rm -f /etc/nginx/conf.d/default.conf.bak 2>/dev/null || true

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
