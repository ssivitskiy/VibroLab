#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${1:-${APP_DIR:-$HOME/vibrolab}}"
BACKUP_FILE="${2:-}"
DB_PATH="${DB_PATH:-${APP_DIR}/runtime/vibrolab.db}"

if [ -z "${BACKUP_FILE}" ]; then
  echo "Usage: bash scripts/restore_database_backup.sh <app_dir> <backup_file>" >&2
  exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Database backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

mkdir -p "$(dirname "${DB_PATH}")"

if command -v docker >/dev/null 2>&1; then
  (
    cd "${APP_DIR}"
    docker compose stop web >/dev/null 2>&1 || true
  )
fi

cp -f "${BACKUP_FILE}" "${DB_PATH}"

if command -v docker >/dev/null 2>&1; then
  (
    cd "${APP_DIR}"
    docker compose up -d web >/dev/null 2>&1 || true
  )
fi

echo "Restored database from ${BACKUP_FILE}"
