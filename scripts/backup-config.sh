#!/bin/bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/home/admin/radio-forms-portal}"

# Source the project .env to pick up BACKUPS_NAS_PATH and BACKUPS_RETENTION_DAYS
if [[ -f "$PROJECT_DIR/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    . "$PROJECT_DIR/.env"
    set +a
fi

BACKUP_ROOT="${BACKUPS_NAS_PATH:-/mnt/nas-backup}/config"
RETENTION_DAYS="${BACKUPS_RETENTION_DAYS:-30}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_PATH="${BACKUP_ROOT}/config-${TIMESTAMP}.tar.gz"

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

find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type f -name 'config-*.tar.gz' -mtime +"$RETENTION_DAYS" -exec rm -f {} \;

echo "Created config backup: $ARCHIVE_PATH"
