#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${1:-${APP_DIR:-$HOME/vibrolab}}"
DB_PATH="${DB_PATH:-${APP_DIR}/runtime/vibrolab.db}"
DB_BACKUP_DIR="${DB_BACKUP_DIR:-$HOME/vibrolab_db_backups}"
DB_BACKUP_RETENTION_DAYS="${DB_BACKUP_RETENTION_DAYS:-30}"

mkdir -p "${DB_BACKUP_DIR}" "$(dirname "${DB_PATH}")"

if [ ! -f "${DB_PATH}" ]; then
  echo ""
  exit 0
fi

TS="$(date -u +%Y%m%d-%H%M%S)"
SHA="$(git -C "${APP_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
BACKUP_FILE="${DB_BACKUP_DIR}/vibrolab-db-${TS}-${SHA}.sqlite3"
MANIFEST_FILE="${DB_BACKUP_DIR}/vibrolab-db-${TS}-${SHA}.txt"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "${DB_PATH}" ".backup '${BACKUP_FILE}'"
elif command -v python3 >/dev/null 2>&1; then
  python3 - "${DB_PATH}" "${BACKUP_FILE}" <<'PY'
import sqlite3
import sys

src_path, dst_path = sys.argv[1], sys.argv[2]
src = sqlite3.connect(src_path)
dst = sqlite3.connect(dst_path)
src.backup(dst)
dst.close()
src.close()
PY
else
  cp -f "${DB_PATH}" "${BACKUP_FILE}"
fi

cat > "${MANIFEST_FILE}" <<EOF
timestamp_utc=${TS}
commit_sha=${SHA}
db_path=${DB_PATH}
backup_file=${BACKUP_FILE}
EOF

find "${DB_BACKUP_DIR}" -type f \( -name 'vibrolab-db-*.sqlite3' -o -name 'vibrolab-db-*.txt' \) -mtime +"${DB_BACKUP_RETENTION_DAYS}" -delete

echo "${BACKUP_FILE}"
