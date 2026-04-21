#!/bin/bash
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--openssl-legacy-provider"

echo "[boot] NODE_PATH=$NODE_PATH"
if [ -d "/app/server/node_modules/knex-dm" ]; then
  echo "[boot] knex-dm found at /app/server/node_modules/knex-dm"
else
  echo "[boot] WARNING: knex-dm NOT found at /app/server/node_modules/knex-dm"
  ls -la /app/server/node_modules/ 2>/dev/null || echo "[boot] /app/server/node_modules/ does not exist"
fi

ENV_FILE="/app/server/.env"

if [ -f "$ENV_FILE.$ACTIVE" ]; then
  echo "[env] Loading $ENV_FILE.$ACTIVE"
  source "$ENV_FILE.$ACTIVE"
fi

exec node --env-file $ENV_FILE.$ACTIVE server/index.mjs


