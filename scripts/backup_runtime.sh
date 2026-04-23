#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${1:-${APP_DIR:-$HOME/vibrolab}}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/vibrolab_backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
RUNTIME_DIR="${APP_DIR}/runtime"

mkdir -p "${RUNTIME_DIR}" "${BACKUP_DIR}"

TS="$(date -u +%Y%m%d-%H%M%S)"
SHA="$(git -C "${APP_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
ARCHIVE="${BACKUP_DIR}/vibrolab-runtime-${TS}-${SHA}.tgz"
MANIFEST="${BACKUP_DIR}/vibrolab-runtime-${TS}-${SHA}.txt"

tar -czf "${ARCHIVE}" -C "${APP_DIR}" runtime

cat > "${MANIFEST}" <<EOF
timestamp_utc=${TS}
commit_sha=${SHA}
app_dir=${APP_DIR}
runtime_dir=${RUNTIME_DIR}
archive=${ARCHIVE}
EOF

find "${BACKUP_DIR}" -type f \( -name 'vibrolab-runtime-*.tgz' -o -name 'vibrolab-runtime-*.txt' \) -mtime +"${RETENTION_DAYS}" -delete

echo "${ARCHIVE}"
