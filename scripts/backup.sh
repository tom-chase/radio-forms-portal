#!/bin/bash

# Backup Script
# Usage: ./scripts/backup.sh [dev|staging|production]

set -e

ENVIRONMENT=${1:-dev}
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="$PROJECT_DIR/backups"
BACKUP_NAME="backup-$ENVIRONMENT-$TIMESTAMP"

# Load environment variables from .env if available
if [ -f "$PROJECT_DIR/.env" ]; then
    while IFS= read -r line; do
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "$line" ]] && continue
        if [[ "$line" =~ ^[[:space:]]*([^=]+)=(.*)$ ]]; then
            export "${BASH_REMATCH[1]}=${BASH_REMATCH[2]}"
        fi
    done < "$PROJECT_DIR/.env"
fi

UPLOADS_PATH="${UPLOADS_PATH:-$PROJECT_DIR/uploads}"

echo "💾 Creating backup for $ENVIRONMENT environment..."

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup Docker volumes
echo "🐳 Backing up Docker volumes..."
cd "$PROJECT_DIR"

# Create temporary backup container
docker run --rm -v radio-forms-portal_mongo-data:/data -v "$BACKUP_DIR":/backup \
    alpine tar czf "/backup/mongo-$BACKUP_NAME.tar.gz" -C /data .

# Backup configuration files
echo "📁 Backing up configuration..."
CONFIG_BACKUP="$BACKUP_DIR/config-$BACKUP_NAME.tar.gz"
tar czf "$CONFIG_BACKUP" \
    config/ \
    .env \
    docker-compose.yml \
    Caddyfile \
    formio-config.json.template \
    config/bootstrap/ \
    config/actions/

# Backup application files (excluding node_modules, logs, etc.)
echo "📦 Backing up application files..."
APP_BACKUP="$BACKUP_DIR/app-$BACKUP_NAME.tar.gz"
tar czf "$APP_BACKUP" \
    --exclude=node_modules \
    --exclude=logs \
    --exclude=backups \
    --exclude=.git \
    app/ \
    scripts/ \
    tools/ \
    deployment/

# Backup uploaded files if present
if [ -d "$UPLOADS_PATH" ]; then
    echo "📎 Backing up uploads..."
    UPLOADS_BACKUP="$BACKUP_DIR/uploads-$BACKUP_NAME.tar.gz"
    tar czf "$UPLOADS_BACKUP" \
        -C "$UPLOADS_PATH" \
        .
else
    echo "ℹ️ Uploads path not found, skipping uploads backup: $UPLOADS_PATH"
fi

# Create backup manifest
echo "📋 Creating backup manifest..."
cat > "$BACKUP_DIR/manifest-$BACKUP_NAME.txt" << EOF
Backup Information
=================
Environment: $ENVIRONMENT
Timestamp: $TIMESTAMP
Created: $(date)

Files Created:
- mongo-$BACKUP_NAME.tar.gz (MongoDB data)
- config-$BACKUP_NAME.tar.gz (Configuration)
- app-$BACKUP_NAME.tar.gz (Application files)
- uploads-$BACKUP_NAME.tar.gz (Uploaded files, if present)

Restore Commands:
1. Restore MongoDB: docker run --rm -v radio-forms-portal_mongo-data:/data -v \$(pwd):/backup alpine tar xzf /backup/mongo-$BACKUP_NAME.tar.gz -C /data
2. Restore Config: tar xzf config-$BACKUP_NAME.tar.gz
3. Restart: docker-compose down && docker-compose up -d

System Information:
- Docker: $(docker --version)
- Docker Compose: $(docker-compose --version)
- OS: $(uname -a)
EOF

# Clean up old backups (keep last 10)
echo "🧹 Cleaning up old backups..."
cd "$BACKUP_DIR"
ls -t backup-$ENVIRONMENT-*.tar.gz | tail -n +11 | xargs -r rm
ls -t manifest-$ENVIRONMENT-*.txt | tail -n +11 | xargs -r rm

# Show backup summary
echo "✅ Backup complete!"
echo "📍 Location: $BACKUP_DIR"
echo "📦 Files created:"
ls -lh "$BACKUP_DIR"/*$BACKUP_NAME* 2>/dev/null || echo "No backup files found"

echo ""
echo "📊 Backup summary:"
echo "   MongoDB data: mongo-$BACKUP_NAME.tar.gz"
echo "   Configuration: config-$BACKUP_NAME.tar.gz"
echo "   Application: app-$BACKUP_NAME.tar.gz"
echo "   Uploads: uploads-$BACKUP_NAME.tar.gz (if present)"
echo "   Manifest: manifest-$BACKUP_NAME.txt"
