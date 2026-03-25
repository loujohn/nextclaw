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

# Python execution environment + timezone data
RUN apk add --no-cache python3 py3-pip py3-virtualenv tzdata && \
    ln -sf python3 /usr/bin/python && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app

# Copy the self-contained Nitro output (includes bundled node_modules)
COPY --from=builder /app/packages/nextclaw-digital-employee/dist ./

# Skills layout — three access paths used by different runtime mechanisms:
#
# 1. /app/server/skills/  ← SkillsLoader.BUILTIN_SKILLS_DIR
#      resolved from import.meta.url of index.mjs → <server-dir>/skills/
#      used by listSkills() / loadSkill() for UI listing and agent execution
#
# 2. /app/dist/skills/    ← resolveBuiltinSkillsDir() candidate
#      used by seedBuiltinSkills() on startup to seed workspace/skills/
#
# 3. /app/skills/         ← seed-skills Nitro plugin, process.cwd()/skills/
#      used to seed employee-creator (and future skills) into workspace

COPY --from=builder /app/packages/nextclaw-core/dist/skills           ./server/skills/
COPY --from=builder /app/packages/nextclaw-digital-employee/skills     ./server/skills/

COPY --from=builder /app/packages/nextclaw-core/dist/skills           ./dist/skills/
COPY --from=builder /app/packages/nextclaw-digital-employee/skills     ./dist/skills/

COPY --from=builder /app/packages/nextclaw-digital-employee/skills     ./skills/

# Copy entrypoint (backs up SQLite before each start)
COPY packages/nextclaw-digital-employee/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Persistent data directory (SQLite DB + agent workspace)
RUN mkdir -p /data

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai
# Data directory for SQLite and agent workspace
ENV NEXTCLAW_DIGITAL_EMPLOYEE_HOME=/data
# Listen on all interfaces inside the container
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

VOLUME ["/data"]

ENTRYPOINT ["/entrypoint.sh"]
