#!/usr/bin/env bash
set -euo pipefail

# ===== Config from environment =====
MONGO_URI="${MONGO_URI:?MONGO_URI not set}"

S3_BUCKET_NAME="${S3_BACKUP_BUCKET:?S3_BACKUP_BUCKET not set}"
S3_PREFIX="${S3_PREFIX:-}"  # Optional

BACKUP_ROOT="/backup"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
ARCHIVE_PATH="${BACKUP_DIR}/mongo.archive.gz"

echo "[mongo-backup] Starting backup at ${TIMESTAMP}"
echo "[mongo-backup] Mongo URI: ${MONGO_URI}"
echo "[mongo-backup] S3 bucket: s3://${S3_BUCKET_NAME}/${S3_PREFIX}"

mkdir -p "${BACKUP_DIR}"

# ===== Run mongodump with gzip-compressed archive =====
if mongodump \
  --uri="${MONGO_URI}" \
  --archive="${ARCHIVE_PATH}" \
  --gzip; then
    echo "[mongo-backup] mongodump completed: ${ARCHIVE_PATH}"
else
    echo "[mongo-backup] ERROR: mongodump failed" >&2
    exit 1
fi

# ===== Upload to S3 =====
S3_KEY="${TIMESTAMP}.archive.gz"
S3_URI="s3://${S3_BUCKET_NAME}${S3_PREFIX:+/${S3_PREFIX}}/${S3_KEY}"

echo "[mongo-backup] Uploading to ${S3_URI}..."
if aws s3 cp "${ARCHIVE_PATH}" "${S3_URI}"; then
    echo "[mongo-backup] Upload complete"
else
    echo "[mongo-backup] ERROR: Upload to S3 failed" >&2
    exit 1
fi

# ===== Local cleanup (older than 7 days) =====
if find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} \; ; then
    echo "[mongo-backup] Local cleanup done (older than 7 days)"
else
    echo "[mongo-backup] WARNING: Local cleanup encountered an issue" >&2
fi

echo "[mongo-backup] Backup finished successfully"