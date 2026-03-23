# ────────────────────────────────────────────────────────
# Stage 1: Build
# ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Build tools required by better-sqlite3 (native addon)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Enable pnpm (version pinned to workspace)
RUN corepack enable && corepack prepare pnpm@9.15.1 --activate

# Copy root workspace manifests first (for pnpm workspace resolution)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy only the packages required to build nextclaw-digital-employee
# (matches what preflight:deps builds)
COPY packages/nextclaw-core/                              ./packages/nextclaw-core/
COPY packages/nextclaw-runtime/                           ./packages/nextclaw-runtime/
COPY packages/extensions/nextclaw-channel-runtime/        ./packages/extensions/nextclaw-channel-runtime/
COPY packages/nextclaw-openclaw-compat/                   ./packages/nextclaw-openclaw-compat/
COPY packages/nextclaw-digital-employee/                  ./packages/nextclaw-digital-employee/

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Build (runs preflight:deps → builds workspace libs, then nuxt build)
RUN pnpm --filter @nextclaw/digital-employee build

# ────────────────────────────────────────────────────────
# Stage 2: Production runner
# ────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Copy the self-contained Nitro output (includes bundled node_modules)
COPY --from=builder /app/packages/nextclaw-digital-employee/.output ./

# Persistent data directory (SQLite DB + agent workspace)
RUN mkdir -p /data

ENV NODE_ENV=production
# Data directory for SQLite and agent workspace
ENV NEXTCLAW_DIGITAL_EMPLOYEE_HOME=/data
# Listen on all interfaces inside the container
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

VOLUME ["/data"]

CMD ["node", "server/index.mjs"]
