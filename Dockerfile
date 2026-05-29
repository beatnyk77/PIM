# Root Dockerfile for Railway monorepo deploys.
# It intentionally builds only the backend relay from /backend.

FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY backend/package*.json ./
COPY backend/tsconfig.json ./

RUN npm ci

COPY backend/server.ts ./

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

RUN apk add --no-cache wget

COPY backend/package*.json ./

RUN npm ci --omit=dev

COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" >/dev/null || exit 1

CMD ["node", "dist/server.js"]
