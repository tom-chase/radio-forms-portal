#!/bin/bash

# Local Development Setup Script
# Usage: ./scripts/deploy-dev.sh [branch-name] [forms-to-sync]
# Examples:
#   ./scripts/deploy-dev.sh                            # Current branch
#   ./scripts/deploy-dev.sh main                       # Main branch
#   ./scripts/deploy-dev.sh feature-branch book,tasks  # Feature branch, sync book and tasks forms [forms-to-sync]

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

# Check if we should skip sync
if [ "$FORMS_TO_SYNC" = "skip" ] || [ "$FORMS_TO_SYNC" = "none" ]; then
    echo "⏩ Skipping form template sync..."
else
    # Sync form templates to default-template.json
    echo "🔄 Syncing form templates..."
    if ./scripts/sync-form-templates.sh "$FORMS_TO_SYNC"; then
        echo "✅ Form templates synced successfully"
    else
        echo "❌ Form template sync failed"
        exit 1
    fi
fi

# Generate Form.io configuration for development
echo "🔧 Generating Form.io configuration..."
./scripts/generate-formio-config.sh dev

# Generate Frontend Configuration for development
echo "🔧 Generating frontend configuration..."
cat > app/config.js << JS_EOF
// Generated during deployment - DO NOT EDIT
window.API_BASE_URL = 'http://localhost:3001';
window.SPA_ORIGIN = 'http://localhost:3000';
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
