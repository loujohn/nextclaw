# ────────────────────────────────────────────────────────
# Stage 1: Build
# ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Build tools required by better-sqlite3 (native addon)
RUN apk add --no-cache python3 make g++ ca-certificates

WORKDIR /app

# Enable pnpm (version pinned to workspace)
RUN corepack enable && corepack prepare pnpm@9.15.1 --activate

# Copy root workspace manifests first (for pnpm workspace resolution)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy all packages needed for build + runtime plugin loading
COPY packages/nextclaw-core/                              ./packages/nextclaw-core/
COPY packages/nextclaw-runtime/                           ./packages/nextclaw-runtime/
COPY packages/nextclaw-openclaw-compat/                   ./packages/nextclaw-openclaw-compat/
COPY packages/nextclaw-digital-employee/                  ./packages/nextclaw-digital-employee/
COPY packages/nextclaw-agent-chat/                        ./packages/nextclaw-agent-chat/
COPY packages/nextclaw-server/                            ./packages/nextclaw-server/
COPY packages/nextclaw-ui/                                ./packages/nextclaw-ui/
COPY packages/nextclaw/                                   ./packages/nextclaw/
COPY packages/extensions/                                 ./packages/extensions/

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Build (runs preflight:deps → builds workspace libs, then nuxt build)
RUN pnpm --filter @nextclaw/digital-employee build

# Create a production-only node_modules for channel plugin runtime resolution.
# `pnpm deploy --prod` hoists all transitive production deps into a flat layout,
# giving us a self-contained node_modules without devDependencies.
RUN pnpm --filter @nextclaw/openclaw-compat deploy --prod /tmp/compat-deploy

# Add channel plugin packages (loaded by jiti at runtime, not in openclaw-compat's deps)
RUN for pkg in dingtalk discord email feishu mochat qq slack telegram wecom whatsapp; do \
      src="packages/extensions/nextclaw-channel-plugin-$pkg"; \
      dest="/tmp/compat-deploy/node_modules/@nextclaw/channel-plugin-$pkg"; \
      if [ -d "$src" ]; then cp -r "$src" "$dest"; fi; \
    done

# Add workspace packages that channel plugins import (dist only, no src)
RUN for pair in "packages/nextclaw-core:core" "packages/extensions/nextclaw-channel-runtime:channel-runtime"; do \
      src="${pair%%:*}"; name="${pair##*:}"; \
      dest="/tmp/compat-deploy/node_modules/@nextclaw/$name"; \
      mkdir -p "$dest"; \
      cp "$src/package.json" "$dest/"; \
      [ -d "$src/dist" ] && cp -r "$src/dist" "$dest/dist"; \
    done

# ────────────────────────────────────────────────────────
# Stage 2: Production runner
# ────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

# Python execution environment + timezone data
RUN apk add --no-cache python3 py3-pip py3-virtualenv tzdata ca-certificates && \
  update-ca-certificates && \
    ln -sf python3 /usr/bin/python && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app

# Copy the self-contained Nitro output (includes bundled node_modules)
COPY --from=builder /app/packages/nextclaw-digital-employee/dist ./

# Copy templates for employee workspace initialization
COPY --from=builder /app/packages/nextclaw-digital-employee/templates ./templates/

# Skills layout — three access paths used by different runtime mechanisms:
# 1. /app/server/skills/  ← SkillsLoader.BUILTIN_SKILLS_DIR
# 2. /app/dist/skills/    ← resolveBuiltinSkillsDir() candidate
# 3. /app/skills/         ← seed-skills Nitro plugin, process.cwd()/skills/
COPY --from=builder /app/packages/nextclaw-core/dist/skills           ./server/skills/
COPY --from=builder /app/packages/nextclaw-digital-employee/skills     ./server/skills/
COPY --from=builder /app/packages/nextclaw-core/dist/skills           ./dist/skills/
COPY --from=builder /app/packages/nextclaw-digital-employee/skills     ./dist/skills/
COPY --from=builder /app/packages/nextclaw-digital-employee/skills     ./skills/

# Channel plugins + production dependency tree (from pnpm deploy --prod).
# Separate from Nitro's server/node_modules to avoid conflicts with bundled stubs.
COPY --from=builder /tmp/compat-deploy/node_modules/ ./plugins-runtime/node_modules/

# Copy entrypoint (backs up SQLite before each start)
COPY packages/nextclaw-digital-employee/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Persistent data directory (SQLite DB + agent workspace)
RUN mkdir -p /data

ENV NODE_ENV=production
# Channel plugins (loaded by jiti at runtime) resolve deps from plugins-runtime.
# This avoids conflicts with Nitro's ESM-only stubs in server/node_modules.
ENV NODE_PATH=/app/plugins-runtime/node_modules
ENV TZ=Asia/Shanghai
ENV NEXTCLAW_DIGITAL_EMPLOYEE_HOME=/data
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

VOLUME ["/data"]

ENTRYPOINT ["/entrypoint.sh"]
