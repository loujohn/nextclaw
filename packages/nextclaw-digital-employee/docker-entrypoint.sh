#!/bin/sh
set -e

DB_FILE="/data/platform.sqlite"
BACKUP_DIR="/data/backups"

# 如果数据库已存在，先备份
if [ -f "$DB_FILE" ]; then
  mkdir -p "$BACKUP_DIR"
  TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
  BACKUP_FILE="$BACKUP_DIR/platform_$TIMESTAMP.sqlite"
  cp "$DB_FILE" "$BACKUP_FILE"
  echo "[backup] Saved $BACKUP_FILE"

  # 只保留最近 10 份备份，自动清理旧的
  ls -t "$BACKUP_DIR"/platform_*.sqlite 2>/dev/null | tail -n +11 | xargs -r rm --
  echo "[backup] Cleaned old backups, kept latest 10"
fi

exec node server/index.mjs
