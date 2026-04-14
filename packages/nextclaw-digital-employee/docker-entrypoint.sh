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

if [ -f "/app/server/.env" ]; then
  echo "[env] Loading /app/server/.env"
  set -a
  . /app/server/.env
  set +a
fi
exec node server/index.mjs
