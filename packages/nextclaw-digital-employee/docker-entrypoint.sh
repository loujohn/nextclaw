#!/bin/sh
set -e

DB_CLIENT="${DB_CLIENT:-sqlite}"

if [ "$DB_CLIENT" = "sqlite" ]; then
  DB_FILE="/data/platform.sqlite"
  BACKUP_DIR="/data/backups"

  if [ -f "$DB_FILE" ]; then
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_FILE="$BACKUP_DIR/platform_$TIMESTAMP.sqlite"
    cp "$DB_FILE" "$BACKUP_FILE"
    echo "[backup] Saved $BACKUP_FILE"

    ls -t "$BACKUP_DIR"/platform_*.sqlite 2>/dev/null | tail -n +11 | xargs -r rm --
    echo "[backup] Cleaned old backups, kept latest 10"
  fi
else
  echo "[db] Using external database (DB_CLIENT=$DB_CLIENT), skipping SQLite backup"
  export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--openssl-legacy-provider"
fi

ENV_ARG=""
if [ -f "/data/.env" ]; then
  echo "[env] Loading /data/.env"
  ENV_ARG="--env-file=/data/.env"
fi

exec node $ENV_ARG server/index.mjs
