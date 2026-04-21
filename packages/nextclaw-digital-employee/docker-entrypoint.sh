#!/bin/sh
set -e

export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--openssl-legacy-provider"

echo "[boot] NODE_PATH=$NODE_PATH"
if [ -d "/app/server/node_modules/knex-dm" ]; then
  echo "[boot] knex-dm found at /app/server/node_modules/knex-dm"
else
  echo "[boot] WARNING: knex-dm NOT found at /app/server/node_modules/knex-dm"
  ls -la /app/server/node_modules/ 2>/dev/null || echo "[boot] /app/server/node_modules/ does not exist"
fi

# 有一个ACTIVE 在这里拼接.env.test

ENV_FILE="/app/server/.env${ACTIVE:+.$ACTIVE}"

if [ -f "$ENV_FILE" ]; then
  echo "[env] Loading $ENV_FILE"
  set -a
  . "$ENV_FILE"
  set +a
fi

echo "[env] DB_HOST=$DB_HOST"
exec node server/index.mjs
