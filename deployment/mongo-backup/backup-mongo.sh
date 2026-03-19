#!/usr/bin/env bash
set -euo pipefail

MONGO_URI="${MONGO_URI:?MONGO_URI not set}"
BACKUP_ROOT="${BACKUP_ROOT:-/backup/mongo}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
ARCHIVE_PATH="${BACKUP_DIR}/mongo.archive.gz"

echo "[mongo-backup] Starting backup at ${TIMESTAMP}"
echo "[mongo-backup] Mongo URI: ${MONGO_URI}"
echo "[mongo-backup] Backup root: ${BACKUP_ROOT}"

mkdir -p "${BACKUP_DIR}"

if mongodump \
  --uri="${MONGO_URI}" \
  --archive="${ARCHIVE_PATH}" \
  --gzip; then
    echo "[mongo-backup] mongodump completed: ${ARCHIVE_PATH}"
else
    echo "[mongo-backup] ERROR: mongodump failed" >&2
    exit 1
fi

if [[ ! -s "${ARCHIVE_PATH}" ]]; then
    echo "[mongo-backup] ERROR: Archive was not created or is empty" >&2
    exit 1
fi

ARCHIVE_SIZE="$(du -h "${ARCHIVE_PATH}" | awk '{print $1}')"
echo "[mongo-backup] Archive ready: ${ARCHIVE_PATH} (${ARCHIVE_SIZE})"

if find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime +"${RETENTION_DAYS}" -exec rm -rf {} \; ; then
    echo "[mongo-backup] Cleanup complete (older than ${RETENTION_DAYS} days)"
else
    echo "[mongo-backup] WARNING: Cleanup encountered an issue" >&2
fi

echo "[mongo-backup] Backup finished successfully"