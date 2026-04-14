# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20 AS builder

WORKDIR /build

COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/cards-engine/package.json ./packages/cards-engine/
COPY apps/socket-service/package.json ./apps/socket-service/

RUN npm ci --workspace=packages/shared-types --workspace=packages/cards-engine \
    --workspace=apps/socket-service --include-workspace-root

COPY packages/shared-types ./packages/shared-types
COPY packages/cards-engine ./packages/cards-engine
COPY apps/socket-service ./apps/socket-service

RUN npm run build --workspace=packages/shared-types
RUN npm run build --workspace=packages/cards-engine
RUN npm run build --workspace=apps/socket-service

# ── Production stage ────────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache dumb-init openssl

COPY package.json package-lock.json turbo.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/cards-engine/package.json ./packages/cards-engine/
COPY apps/socket-service/package.json ./apps/socket-service/

RUN npm ci --workspace=packages/shared-types --workspace=packages/cards-engine \
    --workspace=apps/socket-service --include-workspace-root --omit=dev

COPY --from=builder /build/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /build/packages/cards-engine/dist ./packages/cards-engine/dist
COPY --from=builder /build/apps/socket-service/dist ./apps/socket-service/dist

ENV NODE_ENV=production
ENV SOCKET_PORT=3002

EXPOSE 3002

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3002/health || exit 1

WORKDIR /app/apps/socket-service
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
