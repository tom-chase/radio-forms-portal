#!/bin/bash

# Restore Script — Import a production mongodump archive into the local dev database
# Usage: ./scripts/restore.sh <path-to-archive.gz>
#
# The archive should be a gzip-compressed mongodump archive (.archive.gz)
# produced by the mongo-backup service (deployment/mongo-backup/backup-mongo.sh).
# Download it from S3 into ./backups/ first, then pass the path here.

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER_NAME="mongo-dev"

# ===== Validate arguments =====
if [ -z "$1" ]; then
    echo "Usage: ./scripts/restore.sh <path-to-archive.gz>"
    echo ""
    echo "Example:"
    echo "  ./scripts/restore.sh ./backups/20250213-030000.archive.gz"
    exit 1
fi

ARCHIVE_PATH="$1"

# Resolve relative paths
if [[ "$ARCHIVE_PATH" != /* ]]; then
    ARCHIVE_PATH="$PROJECT_DIR/$ARCHIVE_PATH"
fi

if [ ! -f "$ARCHIVE_PATH" ]; then
    echo "❌ File not found: $ARCHIVE_PATH"
    exit 1
fi

ARCHIVE_FILENAME="$(basename "$ARCHIVE_PATH")"

# ===== Load dev credentials from .env =====
if [ -f "$PROJECT_DIR/.env" ]; then
    # Source only the variables we need (avoid side effects)
    MONGO_ROOT_USERNAME=$(grep -E '^MONGO_ROOT_USERNAME=' "$PROJECT_DIR/.env" | cut -d'=' -f2-)
    MONGO_ROOT_PASSWORD=$(grep -E '^MONGO_ROOT_PASSWORD=' "$PROJECT_DIR/.env" | cut -d'=' -f2-)
fi

if [ -z "$MONGO_ROOT_USERNAME" ] || [ -z "$MONGO_ROOT_PASSWORD" ]; then
    echo "❌ MONGO_ROOT_USERNAME and MONGO_ROOT_PASSWORD must be set in .env"
    exit 1
fi

# ===== Check that mongo-dev container is running =====
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "❌ Container '${CONTAINER_NAME}' is not running."
    echo "   Start the dev stack first: docker compose -f docker-compose.dev.yml up -d"
    exit 1
fi

# ===== Confirmation prompt =====
echo ""
echo "⚠️  WARNING: This will DROP and REPLACE the 'formio' database in ${CONTAINER_NAME}."
echo "   Archive: ${ARCHIVE_PATH}"
echo "   Target:  ${CONTAINER_NAME} (dev)"
echo ""
read -r -p "Continue? [y/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# ===== Copy archive into container =====
echo ""
echo "📦 Copying archive into ${CONTAINER_NAME}..."
docker cp "$ARCHIVE_PATH" "${CONTAINER_NAME}:/tmp/${ARCHIVE_FILENAME}"

# ===== Detect gzip vs raw archive =====
# Gzip files start with magic bytes 1f8b; raw mongodump archives do not.
GZIP_FLAG=""
if [ "$(xxd -l 2 -p "$ARCHIVE_PATH")" = "1f8b" ]; then
    GZIP_FLAG="--gzip"
    echo "   Detected gzip-compressed archive"
else
    echo "   Detected raw (uncompressed) archive"
fi

# ===== Run mongorestore =====
MONGO_URI="mongodb://${MONGO_ROOT_USERNAME}:${MONGO_ROOT_PASSWORD}@localhost:27017/?authSource=admin"

echo "🔄 Restoring formio database from archive..."
docker exec "${CONTAINER_NAME}" mongorestore \
    --uri="${MONGO_URI}" \
    --archive="/tmp/${ARCHIVE_FILENAME}" \
    $GZIP_FLAG \
    --drop \
    --nsInclude="formio.*"

# ===== Cleanup temp file in container =====
echo "🧹 Cleaning up..."
docker exec "${CONTAINER_NAME}" rm -f "/tmp/${ARCHIVE_FILENAME}"

# ===== Done =====
echo ""
echo "✅ Restore complete!"
echo ""
echo "💡 Tip: Consider restarting formio-dev to clear cached role/form data:"
echo "   docker compose -f docker-compose.dev.yml restart formio"
