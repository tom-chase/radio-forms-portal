#!/bin/bash

# Production Deployment Script
# Usage: ./scripts/deploy-production.sh [path-to-ssh-key]

set -e

# Configuration
PROD_SERVER="${PROD_SERVER:-34.224.137.109}"
PROD_USER="${PROD_USER:-admin}"
APP_DIR="${PROD_APP_DIR:-/home/admin/radio-forms-portal}"
BACKUP_DIR="${PROD_BACKUP_DIR:-/home/admin/backups}"

# SSH Key handling
SSH_KEY=${1:-}
SSH_OPTS=""
if [ -n "$SSH_KEY" ]; then
    if [ ! -f "$SSH_KEY" ]; then
        echo "❌ Error: SSH key file '$SSH_KEY' not found."
        exit 1
    fi
    echo "🔑 Using SSH key: $SSH_KEY"
    SSH_OPTS="-i $SSH_KEY"
fi

echo "🚀 Deploying CURRENT LOCAL DIRECTORY to PRODUCTION..."
echo "Target: $PROD_USER@$PROD_SERVER"

# Create tarball of the current directory
echo "📦 Packaging application..."
TEMP_DIR=$(mktemp -d)
TAR_FILE="$TEMP_DIR/deploy.tar.gz"

# Create archive, excluding development/system files
# CRITICAL: We exclude .env so we don't overwrite production secrets with local ones
tar -czf "$TAR_FILE" \
    --exclude='.git' \
    --exclude='.github' \
    --exclude='node_modules' \
    --exclude='.env' \
    --exclude='Caddyfile' \
    --exclude='Caddyfile.*' \
    --exclude='logs' \
    --exclude='backups' \
    --exclude='.DS_Store' \
    --exclude='*.tar.gz' \
    .

echo "📤 Uploading package to server..."
scp $SSH_OPTS "$TAR_FILE" "$PROD_USER@$PROD_SERVER:/tmp/deploy.tar.gz"
rm -rf "$TEMP_DIR"

# SSH into production server and deploy
echo "🔧 Deploying on production server..."
ssh $SSH_OPTS $PROD_USER@$PROD_SERVER << EOF
    set -e
    
    # Ensure app directory exists
    mkdir -p $APP_DIR
    cd $APP_DIR
    
    # Create backup of current config just in case
    echo "💾 Creating config backup..."
    mkdir -p $BACKUP_DIR
    if [ -f .env ]; then cp .env "$BACKUP_DIR/.env.pre-deploy"; fi
    
    # Extract new files (overwriting existing ones)
    echo "📦 Extracting new version..."
    tar -xzf /tmp/deploy.tar.gz -C .
    rm /tmp/deploy.tar.gz

    # Ensure scripts are executable
    chmod +x scripts/*.sh
    
    # Regenerate Backend Configuration (Form.io)
    # This uses the fixed template and server's .env values
    echo "🔧 Generating backend configuration..."
    ./scripts/generate-formio-config.sh production

    # Debug: Check environment variables
    echo "🔍 Checking server environment variables..."
    if [ -f .env ]; then
        # Grep for EMAIL to see what's in the file without sourcing (to see raw value)
        grep "^EMAIL=" .env || echo "EMAIL not found in .env"
    else
        echo "❌ .env file missing!"
    fi

    # Source .env to export variables for docker-compose
    # Sanitize .env first to remove any Windows carriage returns (\r)
    if [ -f .env ]; then
        sed -i 's/\r$//' .env
        set -a
        . ./.env
        set +a
    fi

    # Ensure EMAIL is set for Caddy
    if [ -z "\$EMAIL" ]; then
        echo "⚠️  EMAIL variable is empty or missing. Defaulting to admin@localhost"
        export EMAIL="admin@localhost"
    else
        echo "✅ EMAIL is set to: \$EMAIL"
    fi

    # Ensure Domains are set (fallback to localhost if missing)
    export SPA_DOMAIN="\${SPA_DOMAIN:-localhost}"
    export API_DOMAIN="\${API_DOMAIN:-api.localhost}"

    # Generate Frontend Configuration (Environment specific)
    echo "🔧 Generating frontend configuration..."
    cat > app/config.js << JS_EOF
// Generated during deployment - DO NOT EDIT
window.API_BASE_URL = 'https://${API_DOMAIN}';
window.SPA_ORIGIN = 'https://${SPA_DOMAIN}';
JS_EOF

    echo "✅ Configuration generated"
    
    # Restart services
    echo "🔄 Restarting services..."
    docker-compose down
    
    # Prune old images to free space and ensure fresh build
    docker image prune -f
    
    # Start services with explicit environment variables
    EMAIL="\$EMAIL" SPA_DOMAIN="\$SPA_DOMAIN" API_DOMAIN="\$API_DOMAIN" docker-compose up -d --build
    
    # Wait for services
    echo "⏳ Waiting for services to start..."
    sleep 15
    
    # Check health
    if docker-compose ps | grep -q "Up"; then
        echo "✅ Services are running:"
        docker-compose ps

        # Run post-bootstrap configuration
        echo "🔧 Running post-bootstrap configuration..."
        if docker exec formio node /app/post-bootstrap.js; then
            echo "✅ Post-bootstrap configuration completed successfully"
        else
            echo "❌ Post-bootstrap configuration failed"
        fi
    else
        echo "❌ Service startup failed. Checking logs..."
        docker-compose logs --tail=50
        exit 1
    fi
    
    echo "✅ Production deployment complete!"
EOF

