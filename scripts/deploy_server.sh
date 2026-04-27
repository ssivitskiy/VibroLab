#!/usr/bin/env bash

set -Eeuo pipefail

APP_DIR="${1:-${APP_DIR:-$HOME/vibrolab}}"
BRANCH="${BRANCH:-main}"
SKIP_GIT_PULL="${SKIP_GIT_PULL:-0}"
DEPLOY_SHA="${DEPLOY_SHA:-}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/vibrolab_backups}"
DB_BACKUP_DIR="${DB_BACKUP_DIR:-$HOME/vibrolab_db_backups}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1/api/health}"
INFRA_DIR="${APP_DIR}/runtime/infra"
LOG_DIR="${INFRA_DIR}/logs"
DEPLOY_LOG="${LOG_DIR}/deploy.log"
DEPLOY_HISTORY="${LOG_DIR}/deploy-history.log"

mkdir -p "${LOG_DIR}"

exec > >(tee -a "${DEPLOY_LOG}") 2>&1

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

log() {
  echo "[$(timestamp)] [DEPLOY] $*"
}

PREV_REF=""
PREV_SHA=""
NEW_SHA=""
BACKUP_ARCHIVE=""
DB_BACKUP_FILE=""

rollback_on_error() {
  local exit_code=$?

  log "Deploy failed with exit code ${exit_code}."
  if [ -n "${PREV_REF}" ]; then
    log "Rolling back code to ${PREV_SHA}."
    git checkout --detach "${PREV_REF}" >/dev/null 2>&1 || true
    docker compose up -d --build web >/dev/null 2>&1 || true
  fi

  printf "%s status=failure prev_sha=%s attempted_sha=%s backup=%s branch=%s\n" \
    "$(timestamp)" "${PREV_SHA:-unknown}" "${NEW_SHA:-unknown}" "${BACKUP_ARCHIVE:-none} db_backup=${DB_BACKUP_FILE:-none}" "${BRANCH}" \
    >> "${DEPLOY_HISTORY}"

  log "Rollback attempt finished. Runtime backup remains at ${BACKUP_ARCHIVE:-none}. Database backup remains at ${DB_BACKUP_FILE:-none}."
  exit "${exit_code}"
}

trap rollback_on_error ERR

log "app dir: ${APP_DIR}"
log "branch: ${BRANCH}"
log "skip git pull: ${SKIP_GIT_PULL}"
log "backup dir: ${BACKUP_DIR}"
log "db backup dir: ${DB_BACKUP_DIR}"

cd "${APP_DIR}"

PREV_REF="$(git rev-parse HEAD)"
PREV_SHA="$(git rev-parse --short HEAD)"
BACKUP_ARCHIVE="$(bash "${APP_DIR}/scripts/backup_runtime.sh" "${APP_DIR}")"
DB_BACKUP_FILE="$(DB_BACKUP_DIR="${DB_BACKUP_DIR}" bash "${APP_DIR}/scripts/backup_database.sh" "${APP_DIR}")"

log "Current revision: ${PREV_SHA}"
log "Runtime backup created: ${BACKUP_ARCHIVE}"
log "Database backup created: ${DB_BACKUP_FILE:-none}"

if [ "${SKIP_GIT_PULL}" = "1" ]; then
  if [ -n "${DEPLOY_SHA}" ]; then
    NEW_SHA="${DEPLOY_SHA:0:7}"
  else
    NEW_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo uploaded)"
  fi
  log "Using uploaded working tree; skipping server-side git pull."
  log "Target revision: ${NEW_SHA}"
else
  git fetch --all --prune
  git checkout "${BRANCH}"
  git pull --ff-only origin "${BRANCH}"

  NEW_SHA="$(git rev-parse --short HEAD)"
  log "Target revision: ${NEW_SHA}"
fi

docker compose up -d --build web

log "Waiting for local healthcheck: ${HEALTHCHECK_URL}"
sleep 3
curl --fail --silent --show-error --max-time 30 "${HEALTHCHECK_URL}" >/dev/null

printf "%s status=success prev_sha=%s new_sha=%s backup=%s branch=%s\n" \
  "$(timestamp)" "${PREV_SHA}" "${NEW_SHA}" "${BACKUP_ARCHIVE} db_backup=${DB_BACKUP_FILE:-none}" "${BRANCH}" \
  >> "${DEPLOY_HISTORY}"

log "Deploy succeeded."
log "Active containers:"
docker compose ps
