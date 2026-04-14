# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20 AS builder

WORKDIR /build

COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/worker-service/package.json ./apps/worker-service/
COPY apps/api-service/package.json ./apps/api-service/
COPY apps/api-service/prisma ./apps/api-service/prisma

RUN npm ci --workspace=packages/shared-types --workspace=apps/worker-service \
    --workspace=apps/api-service --include-workspace-root

COPY packages/shared-types ./packages/shared-types
COPY apps/worker-service ./apps/worker-service

RUN npm run build --workspace=packages/shared-types

# Generate Prisma client (worker uses @prisma/client for leaderboard processor)
RUN npx prisma generate --schema=apps/api-service/prisma/schema.prisma

RUN npm run build --workspace=apps/worker-service

# ── Production stage ────────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache dumb-init openssl

COPY package.json package-lock.json turbo.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/worker-service/package.json ./apps/worker-service/

RUN npm ci --workspace=packages/shared-types --workspace=apps/worker-service \
    --include-workspace-root --omit=dev

COPY --from=builder /build/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /build/apps/worker-service/dist ./apps/worker-service/dist

# Prisma client — required at runtime for leaderboard processor
COPY --from=builder /build/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /build/node_modules/@prisma ./node_modules/@prisma

ENV NODE_ENV=production

# Worker has no HTTP port — it connects outbound to Redis and PostgreSQL only

WORKDIR /app/apps/worker-service
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
