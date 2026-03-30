#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load environment variables from .env file
if [ -f "$SCRIPT_DIR/../.env" ]; then
  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$line" ]] && continue
    if [[ "$line" =~ ^[[:space:]]*([^=]+)=(.*)$ ]]; then
      export "${BASH_REMATCH[1]}=${BASH_REMATCH[2]}"
    fi
  done < "$SCRIPT_DIR/../.env"
fi

BACKUP_ROOT="${BACKUPS_NAS_PATH:-/mnt/nas-backup}/config"
UPLOADS_BACKUP_ROOT="${BACKUPS_NAS_PATH:-/mnt/nas-backup}/uploads"
RETENTION_DAYS="${BACKUPS_RETENTION_DAYS:-30}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_PATH="${BACKUP_ROOT}/config-${TIMESTAMP}.tar.gz"
UPLOADS_ARCHIVE_PATH="${UPLOADS_BACKUP_ROOT}/uploads-${TIMESTAMP}.tar.gz"
UPLOADS_PATH="${UPLOADS_PATH:-/home/admin/radio-forms-portal/uploads}"

required_paths=(
    "$PROJECT_DIR/.env"
    "$PROJECT_DIR/docker-compose.yml"
    "$PROJECT_DIR/Caddyfile"
    "$PROJECT_DIR/formio-config.json.template"
    "$PROJECT_DIR/config/bootstrap"
    "$PROJECT_DIR/config/actions"
)

for path in "${required_paths[@]}"; do
    [[ -e "$path" ]] || {
        echo "Missing required path: $path" >&2
        exit 1
    }
done

mkdir -p "$BACKUP_ROOT"
mkdir -p "$UPLOADS_BACKUP_ROOT"

tar czf "$ARCHIVE_PATH" \
    -C "$PROJECT_DIR" \
    .env \
    docker-compose.yml \
    Caddyfile \
    formio-config.json.template \
    config/bootstrap \
    config/actions

[[ -s "$ARCHIVE_PATH" ]] || {
    echo "Config backup archive was not created or is empty" >&2
    exit 1
}

if [[ -d "$UPLOADS_PATH" ]]; then
    tar czf "$UPLOADS_ARCHIVE_PATH" \
        -C "$UPLOADS_PATH" \
        .

    [[ -s "$UPLOADS_ARCHIVE_PATH" ]] || {
        echo "Uploads backup archive was not created or is empty" >&2
        exit 1
    }
    echo "Created uploads backup: $UPLOADS_ARCHIVE_PATH"
else
    echo "Uploads path not found, skipping uploads backup: $UPLOADS_PATH"
fi

find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type f -name 'config-*.tar.gz' -mtime +"$RETENTION_DAYS" -exec rm -f {} \;
find "$UPLOADS_BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type f -name 'uploads-*.tar.gz' -mtime +"$RETENTION_DAYS" -exec rm -f {} \;

echo "Created config backup: $ARCHIVE_PATH"
