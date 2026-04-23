#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${1:-${APP_DIR:-$HOME/vibrolab}}"
ARCHIVE_PATH="${2:-}"

if [ -z "${ARCHIVE_PATH}" ]; then
  echo "Usage: bash scripts/restore_runtime_backup.sh <app_dir> <archive_path>" >&2
  exit 1
fi

if [ ! -f "${ARCHIVE_PATH}" ]; then
  echo "Backup archive not found: ${ARCHIVE_PATH}" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

tar -xzf "${ARCHIVE_PATH}" -C "${TMP_DIR}"

if [ ! -d "${TMP_DIR}/runtime" ]; then
  echo "Archive does not contain runtime/ directory: ${ARCHIVE_PATH}" >&2
  exit 1
fi

mkdir -p "${APP_DIR}/runtime"
rsync -a --delete "${TMP_DIR}/runtime/" "${APP_DIR}/runtime/"

echo "Restored runtime from ${ARCHIVE_PATH}"
