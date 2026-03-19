#!/usr/bin/env bash
set -euo pipefail

MONGO_URI="${MONGO_URI:?MONGO_URI not set}"
BACKUP_ROOT="${BACKUP_ROOT:-/backup/mongo}"
RESTORE_ROOT="/restore"
ARCHIVE_ARG="${1:-}"

mkdir -p "${RESTORE_ROOT}"

echo "[mongo-restore] Starting restore"
echo "[mongo-restore] Mongo URI: ${MONGO_URI}"

if [[ -z "${ARCHIVE_ARG}" ]]; then
    echo "[mongo-restore] No archive specified — searching for latest in ${BACKUP_ROOT}..."
    LATEST_DIR="$(find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort | tail -n 1)"
    if [[ -z "${LATEST_DIR}" ]]; then
        echo "[mongo-restore] ERROR: No backup directories found in ${BACKUP_ROOT}" >&2
        exit 1
    fi
    LOCAL_ARCHIVE="${LATEST_DIR}/mongo.archive.gz"
    if [[ ! -f "${LOCAL_ARCHIVE}" ]]; then
        echo "[mongo-restore] ERROR: Archive not found in latest directory: ${LOCAL_ARCHIVE}" >&2
        exit 1
    fi
elif [[ "${ARCHIVE_ARG}" = /* ]]; then
    LOCAL_ARCHIVE="${ARCHIVE_ARG}"
else
    LOCAL_ARCHIVE="${RESTORE_ROOT}/${ARCHIVE_ARG}"
fi

if [[ ! -f "${LOCAL_ARCHIVE}" ]]; then
    echo "[mongo-restore] ERROR: Archive not found: ${LOCAL_ARCHIVE}" >&2
    exit 1
fi

echo "[mongo-restore] Selected backup: ${LOCAL_ARCHIVE}"
echo "[mongo-restore] Running mongorestore..."

if mongorestore \
    --uri="${MONGO_URI}" \
    --archive="${LOCAL_ARCHIVE}" \
    --gzip \
    --drop; then
    echo "[mongo-restore] Restore completed successfully"
else
    echo "[mongo-restore] ERROR: mongorestore failed" >&2
    exit 1
fi

if [[ "${LOCAL_ARCHIVE}" == "${RESTORE_ROOT}/"* ]]; then
    find "${RESTORE_ROOT}" -mindepth 1 -maxdepth 1 -type f -mtime +7 -exec rm -f {} \; || true
    echo "[mongo-restore] Local cleanup done (older than 7 days)"
fi