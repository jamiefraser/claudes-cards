# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20 AS builder

WORKDIR /build

# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api-service/package.json ./apps/api-service/

RUN npm ci --workspace=packages/shared-types --workspace=apps/api-service --include-workspace-root

# Copy source
COPY packages/shared-types ./packages/shared-types
COPY apps/api-service ./apps/api-service

# Build shared-types first
RUN npm run build --workspace=packages/shared-types

# Generate Prisma client BEFORE api-service tsc — the service imports types from @prisma/client
RUN npx prisma generate --schema=apps/api-service/prisma/schema.prisma

# Now build api-service
RUN npm run build --workspace=apps/api-service

# Precompile seed script for production use (no ts-node at runtime)
RUN cd apps/api-service && npx tsc --outDir dist-seed --rootDir prisma --module CommonJS --moduleResolution Node --esModuleInterop --skipLibCheck --target ES2022 --resolveJsonModule --composite false prisma/seed.ts

# ── Production stage ────────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init openssl

# Copy workspace manifests for production install
COPY package.json package-lock.json turbo.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api-service/package.json ./apps/api-service/

RUN npm ci --workspace=packages/shared-types --workspace=apps/api-service \
    --include-workspace-root --omit=dev

# Copy compiled output
COPY --from=builder /build/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /build/apps/api-service/dist ./apps/api-service/dist

# Copy prisma schema + generated client (required at runtime)
COPY --from=builder /build/apps/api-service/prisma ./apps/api-service/prisma
COPY --from=builder /build/apps/api-service/dist-seed ./apps/api-service/dist-seed
COPY --from=builder /build/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /build/node_modules/@prisma ./node_modules/@prisma

ENV NODE_ENV=production
ENV API_PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

WORKDIR /app/apps/api-service
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy --schema=prisma/schema.prisma && node dist-seed/seed.js && node dist/index.js"]
