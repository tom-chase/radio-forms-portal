#!/bin/bash

# Local Development Setup Script
# Usage: ./scripts/deploy-dev.sh [branch-name] [forms-to-sync]
# Examples:
#   ./scripts/deploy-dev.sh                            # Current branch
#   ./scripts/deploy-dev.sh main                       # Main branch
#   ./scripts/deploy-dev.sh feature-branch book,tasks  # Feature branch, sync book and tasks forms
#   ./scripts/deploy-dev.sh main all                   # Sync all form templates

set -e

# Get branch name (default: current branch)
BRANCH=${1:-$(git branch --show-current)}
# Get forms to sync (optional, second argument)
FORMS_TO_SYNC=${2:-"none"}

echo "🚀 Setting up local development environment for branch '$BRANCH'..."

# Check if branch exists
if ! git show-ref --verify --quiet refs/heads/$BRANCH; then
    echo "❌ Error: Branch '$BRANCH' does not exist"
    exit 1
fi

# Ensure we're on the correct branch
if [ "$(git branch --show-current)" != "$BRANCH" ]; then
    echo "� Switching to branch '$BRANCH'..."
    git checkout $BRANCH
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "📝 Setting up environment..."
    ./scripts/setup-environment.sh dev
fi

# Resolve 'all' to a comma-separated list of every form template
if [ "$FORMS_TO_SYNC" = "all" ]; then
    FORM_TEMPLATES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../config/bootstrap/form_templates" && pwd)"
    FORMS_TO_SYNC=$(find "$FORM_TEMPLATES_DIR" -maxdepth 1 -name '*.json' -exec basename {} .json \; | sort | paste -sd ',' -)
    echo "📋 Resolved 'all' to: $FORMS_TO_SYNC"
fi

# Check if we should skip sync
if [ "$FORMS_TO_SYNC" = "skip" ] || [ "$FORMS_TO_SYNC" = "none" ]; then
    echo "⏩ Skipping form template sync..."
else
    # Sync form templates to default-template.json
    echo "🔄 Syncing form templates..."
    if ./scripts/lib/sync-form-templates.sh "$FORMS_TO_SYNC"; then
        echo "✅ Form templates synced successfully"
    else
        echo "❌ Form template sync failed"
        exit 1
    fi
fi

# Generate Form.io configuration for development
echo "🔧 Generating Form.io configuration..."
./scripts/lib/generate-formio-config.sh dev

# Generate Frontend Configuration for development
echo "🔧 Generating frontend configuration..."
# Source .env to pick up STATION_* and any other vars
if [ -f .env ]; then
  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$line" ]] && continue
    if [[ "$line" =~ ^[[:space:]]*([^=]+)=(.*)$ ]]; then
      val="${BASH_REMATCH[2]}"
      # Strip surrounding quotes (single or double)
      val="${val#\"}" ; val="${val%\"}"
      val="${val#\'}" ; val="${val%\'}"
      export "${BASH_REMATCH[1]}=${val}"
    fi
  done < .env
fi
cat > app/config.js << JS_EOF
// Generated during deployment - DO NOT EDIT
window.API_BASE_URL = 'http://localhost:3001';
window.SPA_ORIGIN = 'http://localhost:3000';
window.UPLOAD_MODE = '${UPLOAD_MODE:-local}';
window.UPLOAD_ENABLE_S3_FALLBACK = '${UPLOAD_ENABLE_S3_FALLBACK:-true}';
window.UPLOAD_BASE_URL = '${UPLOAD_BASE_URL:-http://localhost:3000}';
window.UPLOAD_MAX_FILE_SIZE_MB = '${UPLOAD_MAX_FILE_SIZE_MB:-50}';
window.STATION_NAME = '${STATION_NAME:-Your Radio Station}';
window.STATION_CALL_SIGN = '${STATION_CALL_SIGN:-[CALL SIGN]}';
window.STATION_ADDRESS = '${STATION_ADDRESS:-}';
window.STATION_LOGO_URL = '${STATION_LOGO_URL:-}';
window.STATION_WEBSITE_URL = '${STATION_WEBSITE_URL:-}';
JS_EOF

# Stop any existing development containers
echo "🛑 Stopping existing development containers..."
docker-compose -f docker-compose.dev.yml down 2>/dev/null || true

# Start development environment
echo "🚀 Starting development environment..."
docker-compose -f docker-compose.dev.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 15

# Check service health
echo "🏥 Checking service health..."
if docker-compose -f docker-compose.dev.yml ps | grep -q "Up"; then
    echo "✅ Development environment is running"

    echo ""
    echo "🌐 Access your application:"
    echo "   SPA: http://localhost:3000"
    echo "   Form.io API: http://localhost:3001"
    echo "   MongoDB: localhost:27017 (for debugging)"
    echo ""
    echo "📋 Useful commands:"
    echo "   View logs: docker-compose -f docker-compose.dev.yml logs -f"
    echo "   Stop: docker-compose -f docker-compose.dev.yml down"
    echo "   Restart: docker-compose -f docker-compose.dev.yml restart"
    echo ""
    echo "📝 Forms synced: $FORMS_TO_SYNC"
else
    echo "❌ Some services failed to start"
    docker-compose -f docker-compose.dev.yml ps
    exit 1
fi
