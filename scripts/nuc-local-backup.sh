#!/bin/bash
#
# NUC Local MongoDB Backup Script
# Backs up MongoDB to a local USB drive as a complement to S3 backups.
#
# Usage:
#   sudo /usr/local/bin/nuc-local-backup.sh
#
# Cron (daily at 2 AM):
#   0 2 * * * /usr/local/bin/nuc-local-backup.sh >> /var/log/nuc-mongo-backup.log 2>&1
#
# Prerequisites:
#   - USB drive mounted at /mnt/usb-backup (or override BACKUP_ROOT)
#   - MongoDB container named 'mongo' running
#   - .env file at PROJECT_DIR with MONGO_ROOT_PASSWORD set

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────

BACKUP_ROOT="${BACKUP_ROOT:-/mnt/usb-backup}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
PROJECT_DIR="${PROJECT_DIR:-/home/admin/radio-forms-portal}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ARCHIVE_NAME="mongo-${TIMESTAMP}.archive.gz"
ARCHIVE_PATH="${BACKUP_ROOT}/${ARCHIVE_NAME}"

# ── Logging ───────────────────────────────────────────────────────────────────

log()   { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
error() { log "ERROR: $*" >&2; exit 1; }

# ── Preflight Checks ──────────────────────────────────────────────────────────

check_prerequisites() {
    [[ -d "$BACKUP_ROOT" ]] \
        || error "Backup directory $BACKUP_ROOT does not exist. Mount USB drive first: sudo mount /dev/sdb1 /mnt/usb-backup"

    [[ -f "$PROJECT_DIR/.env" ]] \
        || error ".env not found at $PROJECT_DIR/.env"

    command -v docker &>/dev/null \
        || error "Docker not found"

    docker ps --format '{{.Names}}' | grep -q '^mongo$' \
        || error "MongoDB container 'mongo' is not running"

    # Check USB drive has enough free space (warn if < 1GB)
    local free_kb
    free_kb=$(df -k "$BACKUP_ROOT" | awk 'NR==2 {print $4}')
    if (( free_kb < 1048576 )); then
        log "WARNING: Less than 1GB free on $BACKUP_ROOT (${free_kb}KB available)"
    fi
}

# ── Read Mongo Password ───────────────────────────────────────────────────────

get_mongo_password() {
    local password
    password=$(grep "^MONGO_ROOT_PASSWORD=" "$PROJECT_DIR/.env" | cut -d'=' -f2- | head -1)
    # Strip whitespace and surrounding quotes
    password=$(echo "$password" | sed "s/^[[:space:]]*//;s/[[:space:]]*$//;s/^['\"]//;s/['\"]$//")
    [[ -n "$password" ]] || error "MONGO_ROOT_PASSWORD not found in .env"
    echo "$password"
}

# ── Backup ────────────────────────────────────────────────────────────────────

create_backup() {
    local mongo_password="$1"
    local temp_path="/tmp/${ARCHIVE_NAME}"

    log "Starting backup → $ARCHIVE_PATH"

    docker exec mongo mongodump \
        --uri="mongodb://admin:${mongo_password}@localhost:27017/?authSource=admin" \
        --archive="${temp_path}" \
        --gzip \
        || error "mongodump failed"

    docker cp "mongo:${temp_path}" "$ARCHIVE_PATH" \
        || error "Failed to copy archive from container"

    docker exec mongo rm -f "$temp_path"

    [[ -f "$ARCHIVE_PATH" ]] || error "Archive not found after copy"

    local size
    size=$(du -h "$ARCHIVE_PATH" | cut -f1)
    log "Backup created: $ARCHIVE_NAME ($size)"
}

# ── Integrity Check ───────────────────────────────────────────────────────────

verify_backup() {
    [[ -s "$ARCHIVE_PATH" ]] || error "Archive is empty"

    # Check gzip magic bytes (1f 8b)
    local magic
    magic=$(xxd -l 2 "$ARCHIVE_PATH" 2>/dev/null | awk '{print $2$3}' | tr -d ' ')
    [[ "$magic" == "1f8b" ]] || error "Archive does not appear to be valid gzip (magic: $magic)"

    log "Integrity check passed"
}

# ── Retention Cleanup ─────────────────────────────────────────────────────────

cleanup_old_backups() {
    log "Removing backups older than $RETENTION_DAYS days..."
    local count=0
    while IFS= read -r file; do
        rm -f "$file"
        log "  Deleted: $(basename "$file")"
        ((count++))
    done < <(find "$BACKUP_ROOT" -name "mongo-*.archive.gz" -mtime +"$RETENTION_DAYS" -type f 2>/dev/null)
    log "Cleanup complete ($count file(s) removed)"
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
    log "=========================================="
    log "NUC Local MongoDB Backup"
    log "=========================================="

    check_prerequisites

    local mongo_password
    mongo_password=$(get_mongo_password)

    create_backup "$mongo_password"
    verify_backup
    cleanup_old_backups

    local total_count total_size
    total_count=$(find "$BACKUP_ROOT" -name "mongo-*.archive.gz" -type f 2>/dev/null | wc -l)
    total_size=$(du -sh "$BACKUP_ROOT" 2>/dev/null | cut -f1)

    log "=========================================="
    log "Backup complete"
    log "  Archive : $ARCHIVE_NAME"
    log "  Location: $BACKUP_ROOT"
    log "  Total   : $total_count backup(s), $total_size used"
    log "=========================================="
}

main "$@"
