# ==========================================
# STAGE 1: Build & Transpile TypeScript
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy dependency catalogs
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including devDependencies for tsc)
RUN npm ci

# Copy server code
COPY server.ts ./

# Transpile server.ts to dist/server.js
RUN npm run build

# ==========================================
# STAGE 2: Secure Lightweight Production Runner
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Copy dynamic package catalogs for runtime install
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy transpiled assets from the builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Expose port (railway / fly bind dynamically to PORT env)
EXPOSE 3000

# Execute server
CMD ["node", "dist/server.js"]
