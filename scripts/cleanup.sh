#!/bin/bash

# Cleanup Script
# Usage: ./scripts/cleanup.sh [dev|staging|production]

set -e

ENVIRONMENT=${1:-dev}
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🧹 Cleaning up $ENVIRONMENT environment..."

cd "$PROJECT_DIR"

# Stop and remove containers
echo "🐳 Stopping Docker containers..."
docker-compose down

# Remove unused images
echo "🗑️  Removing unused Docker images..."
docker image prune -f

# Clean up old logs (keep last 7 days)
echo "📋 Cleaning up old logs..."
if [ -d "logs" ]; then
    find logs -name "*.log" -mtime +7 -delete
    echo "✅ Old logs cleaned up"
fi

# Clean up temporary files
echo "🗂️  Cleaning up temporary files..."
find . -name "*.tmp" -delete
find . -name ".DS_Store" -delete
find . -name "Thumbs.db" -delete

# Clean up node modules if requested
if [ "$2" = "--deep" ]; then
    echo "🧊 Deep cleaning node modules..."
    find . -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
fi

# Clean up Docker volumes (caution)
if [ "$2" = "--reset-data" ]; then
    echo "⚠️  Resetting Docker volumes..."
    docker volume rm radio-forms-portal_mongo-data 2>/dev/null || true
    docker volume rm radio-forms-portal_caddy_data 2>/dev/null || true
    docker volume rm radio-forms-portal_caddy_config 2>/dev/null || true
fi

echo "✅ Cleanup complete for $ENVIRONMENT environment!"
