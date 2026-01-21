#!/bin/bash

# Update Dependencies Script
# Usage: ./scripts/update-dependencies.sh [formio|mongo|all]

set -e

SERVICE=${1:-all}
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🔄 Updating dependencies for: $SERVICE"

cd "$PROJECT_DIR"

case $SERVICE in
    "formio")
        echo "📦 Updating Form.io to latest stable..."
        # Get latest stable version
        LATEST_FORMIO=$(curl -s https://api.github.com/repos/formio/formio/releases | \
            grep -m1 '"tag_name"' | cut -d'"' -f4 | sed 's/v//')
        
        if [ -n "$LATEST_FORMIO" ]; then
            echo "Latest Form.io version: $LATEST_FORMIO"
            sed -i.bak "s|formio/formio:.*|formio/formio:v$LATEST_FORMIO|" docker-compose.yml
            sed -i.bak "s|formio/formio:.*|formio/formio:v$LATEST_FORMIO|" docker-compose.dev.yml
            echo "✅ Form.io updated to v$LATEST_FORMIO"
        else
            echo "⚠️  Could not determine latest Form.io version"
        fi
        ;;
        
    "mongo")
        echo "📦 Updating MongoDB to latest 6.x..."
        # Get latest MongoDB 6.x version
        LATEST_MONGO=$(curl -s https://api.github.com/repos/mongodb/mongo/tags | \
            grep -m1 '"name"' | grep -o '6\.[0-9]*\.[0-9]*' | head -1)
        
        if [ -n "$LATEST_MONGO" ]; then
            echo "Latest MongoDB version: $LATEST_MONGO"
            sed -i.bak "s|mongo:.*|mongo:$LATEST_MONGO|" docker-compose.yml
            sed -i.bak "s|mongo:.*|mongo:$LATEST_MONGO|" docker-compose.dev.yml
            echo "✅ MongoDB updated to $LATEST_MONGO"
        else
            echo "⚠️  Could not determine latest MongoDB version"
        fi
        ;;
        
    "caddy")
        echo "📦 Updating Caddy to latest..."
        # Get latest Caddy version
        LATEST_CADDY=$(curl -s https://api.github.com/repos/caddyserver/caddy/tags | \
            grep -m1 '"name"' | cut -d'"' -f4)
        
        if [ -n "$LATEST_CADDY" ]; then
            echo "Latest Caddy version: $LATEST_CADDY"
            sed -i.bak "s|caddy:.*|caddy:v$LATEST_CADDY|" docker-compose.yml
            sed -i.bak "s|caddy:.*|caddy:v$LATEST_CADDY|" docker-compose.dev.yml
            echo "✅ Caddy updated to v$LATEST_CADDY"
        else
            echo "⚠️  Could not determine latest Caddy version"
        fi
        ;;
        
    "all")
        echo "📦 Updating all services..."
        ./scripts/update-dependencies.sh formio
        ./scripts/update-dependencies.sh mongo
        ./scripts/update-dependencies.sh caddy
        ;;
        
    *)
        echo "❌ Unknown service: $SERVICE"
        echo "Usage: $0 [formio|mongo|caddy|all]"
        exit 1
        ;;
esac

echo ""
echo "🔄 Next steps:"
echo "1. Review changes in docker-compose.yml"
echo "2. Test with: docker-compose pull"
echo "3. Deploy with: ./scripts/deploy-staging.sh"
echo ""
echo "💾 Backup files created with .bak extension"
