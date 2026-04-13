#!/bin/sh
set -e

export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--openssl-legacy-provider"

if [ -f "/data/.env" ]; then
  echo "[env] Loading /data/.env"
  exec node --env-file=/data/.env server/index.mjs
else
  exec node server/index.mjs
fi
