#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${1:-${APP_DIR:-$HOME/vibrolab}}"
TARGET_REF="${2:-}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1/api/health}"

cd "${APP_DIR}"

if [ -z "${TARGET_REF}" ]; then
  TARGET_REF="$(git rev-list --max-count=2 HEAD | tail -n 1)"
fi

if [ -z "${TARGET_REF}" ]; then
  echo "Could not determine rollback target." >&2
  exit 1
fi

echo "[ROLLBACK] target: ${TARGET_REF}"

git fetch --all --prune
git checkout --detach "${TARGET_REF}"
docker compose up -d --build web
sleep 3
curl --fail --silent --show-error --max-time 30 "${HEALTHCHECK_URL}" >/dev/null

echo "[ROLLBACK] service is healthy on ${TARGET_REF}"
