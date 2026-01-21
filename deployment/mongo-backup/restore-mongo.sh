#!/usr/bin/env bash
set -euo pipefail

# ===== Config from environment =====
MONGO_URI="${MONGO_URI:?MONGO_URI not set}"

S3_BUCKET_NAME="${S3_BACKUP_BUCKET:?S3_BACKUP_BUCKET not set}"
S3_PREFIX="${S3_PREFIX:-}"

RESTORE_ROOT="/restore"
mkdir -p "${RESTORE_ROOT}"

# Optional argument: specific S3 key (e.g. 20241207-010203.archive.gz)
S3_KEY="${1:-}"

echo "[mongo-restore] Starting restore"
echo "[mongo-restore] Mongo URI: ${MONGO_URI}"
echo "[mongo-restore] S3 bucket: s3://${S3_BUCKET_NAME}/${S3_PREFIX}"

# ===== Helper: get latest backup object =====
get_latest_backup() {
    local prefix="$1"

    if [ -z "$prefix" ]; then
        aws s3 ls "s3://${S3_BUCKET_NAME}/"
    else
        aws s3 ls "s3://${S3_BUCKET_NAME}/${prefix}/"
    fi | awk '$4 ~ /\.archive\.gz$/ {print}' | sort | tail -n 1
}

# ===== Select backup to restore =====
if [[ -z "${S3_KEY}" ]]; then
    echo "[mongo-restore] No S3 key provided; searching for latest .archive.gz in s3://${S3_BUCKET_NAME}/${S3_PREFIX}/"
    LATEST_LINE="$(get_latest_backup "${S3_PREFIX}")"

    if [[ -z "${LATEST_LINE}" ]]; then
        echo "[mongo-restore] ERROR: No backups found in s3://${S3_BUCKET_NAME}/${S3_PREFIX}/"
        exit 1
    fi

    S3_KEY="$(awk '{print $4}' <<< "${LATEST_LINE}")"
fi

S3_URI="s3://${S3_BUCKET_NAME}${S3_PREFIX:+/${S3_PREFIX}}/${S3_KEY}"
LOCAL_ARCHIVE="${RESTORE_ROOT}/${S3_KEY}"

echo "[mongo-restore] Selected backup: ${S3_URI}"
echo "[mongo-restore] Downloading to ${LOCAL_ARCHIVE}..."

# ===== Download backup =====
if ! aws s3 cp "${S3_URI}" "${LOCAL_ARCHIVE}"; then
    echo "[mongo-restore] ERROR: Download from S3 failed" >&2
    exit 1
fi

echo "[mongo-restore] Download complete. Running mongorestore..."

# WARNING: --drop will drop collections before restoring.
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

# Optional local cleanup
find "${RESTORE_ROOT}" -mindepth 1 -maxdepth 1 -type f -mtime +7 -exec rm -f {} \; || true
echo "[mongo-restore] Local cleanup done (older than 7 days)"