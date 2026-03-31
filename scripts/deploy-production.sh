#!/bin/bash

# Production Deployment Script
# Usage: ./scripts/deploy-production.sh [OPTIONS] [path-to-ssh-key]
#
# Options:
#   --code-only              Deploy code changes only (skip all Docker operations)
#   --services <list>        Restart only specified services (comma-separated)
#                            Valid services: mongo,formio,uploads,caddy,mongo-backup
#   --help                   Show this help message
#
# Examples:
#   ./scripts/deploy-production.sh                           # Full deployment (default)
#   ./scripts/deploy-production.sh --code-only               # Code-only, no Docker restart
#   ./scripts/deploy-production.sh --services formio         # Restart only formio
#   ./scripts/deploy-production.sh --services formio,uploads # Restart formio and uploads

set -e

# Load local .env so PROD_* and STATION_* vars are available
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

# Configuration
PROD_SERVER="${PROD_SERVER:-10.8.0.1}"
PROD_USER="${PROD_USER:-admin}"
APP_DIR="${PROD_APP_DIR:-/home/admin/radio-forms-portal}"
BACKUP_DIR="${PROD_BACKUP_DIR:-/home/admin/backups}"

# Parse command-line arguments
CODE_ONLY=false
SELECTIVE_SERVICES=""
SSH_KEY=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --code-only)
      CODE_ONLY=true
      shift
      ;;
    --services)
      SELECTIVE_SERVICES="$2"
      shift 2
      ;;
    --help)
      head -n 20 "$0" | grep "^#" | sed 's/^# //g' | sed 's/^#//g'
      exit 0
      ;;
    -*)
      echo "❌ Error: Unknown option $1"
      echo "Run '$0 --help' for usage information."
      exit 1
      ;;
    *)
      SSH_KEY="$1"
      shift
      ;;
  esac
done

# SSH Key handling
SSH_OPTS=""
if [ -n "$SSH_KEY" ]; then
    if [ ! -f "$SSH_KEY" ]; then
        echo "❌ Error: SSH key file '$SSH_KEY' not found."
        exit 1
    fi
    echo "🔑 Using SSH key: $SSH_KEY"
    SSH_OPTS="-i $SSH_KEY"
fi

# Display deployment mode
if [ "$CODE_ONLY" = true ]; then
    echo "🚀 Deploying CODE ONLY to PRODUCTION (no Docker operations)..."
elif [ -n "$SELECTIVE_SERVICES" ]; then
    echo "🚀 Deploying to PRODUCTION with SELECTIVE SERVICE RESTART: $SELECTIVE_SERVICES"
else
    echo "🚀 Deploying FULL DEPLOYMENT to PRODUCTION (all services)..."
fi
echo "Target: $PROD_USER@$PROD_SERVER"

# Create tarball of the current directory
echo "📦 Packaging application..."
TEMP_DIR=$(mktemp -d)
TAR_FILE="$TEMP_DIR/deploy.tar.gz"

# Create archive, excluding development/system files
# CRITICAL: We exclude .env so we don't overwrite production secrets with local ones
# We also exclude app/config.js and config/env/production.json because these are
# generated on the server from the server's .env (see config generation below).
# COPYFILE_DISABLE suppresses macOS resource fork (._*) files in the tarball.
COPYFILE_DISABLE=1 tar -czf "$TAR_FILE" \
    --exclude='.git' \
    --exclude='.github' \
    --exclude='.windsurf' \
    --exclude='node_modules' \
    --exclude='.env' \
    --exclude='Caddyfile' \
    --exclude='Caddyfile.*' \
    --exclude='app/config.js' \
    --exclude='config/env/production.json' \
    --exclude='logs' \
    --exclude='backups' \
    --exclude='.DS_Store' \
    --exclude='*.tar.gz' \
    --exclude='docs' \
    --exclude='infrastructure' \
    .

echo "📤 Uploading package to server..."
scp $SSH_OPTS "$TAR_FILE" "$PROD_USER@$PROD_SERVER:/tmp/deploy.tar.gz"
rm -rf "$TEMP_DIR"

# SSH into production server and deploy
echo "🔧 Deploying on production server..."
ssh $SSH_OPTS $PROD_USER@$PROD_SERVER "CODE_ONLY='$CODE_ONLY' SELECTIVE_SERVICES='$SELECTIVE_SERVICES' APP_DIR='$APP_DIR' BACKUP_DIR='$BACKUP_DIR' bash -s" << 'EOF'
    set -e
    set -o pipefail
    
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

    # Remove any macOS resource fork files (._*) from previous deployments
    find . -name '._*' -not -path './.git/*' -delete

    # Ensure scripts are executable
    chmod +x scripts/*.sh scripts/lib/*.sh
    
    # Regenerate Backend Configuration (Form.io)
    # This uses the fixed template and server's .env values
    echo "🔧 Generating backend configuration..."
    # Safety check: if production.json is a directory (from a previous failed run), remove it
    if [ -d config/env/production.json ]; then
        echo "⚠️  config/env/production.json is a directory (stale). Removing..."
        rm -rf config/env/production.json
    fi
    ./scripts/lib/generate-formio-config.sh production

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
    if [ -z "$EMAIL" ]; then
        echo "⚠️  EMAIL variable is empty or missing. Defaulting to admin@localhost"
        export EMAIL="admin@localhost"
    else
        echo "✅ EMAIL is set to: $EMAIL"
    fi

    # Ensure Domains are set (fallback to localhost if missing)
    export SPA_DOMAIN="${SPA_DOMAIN:-localhost}"
    export API_DOMAIN="${API_DOMAIN:-api.localhost}"

    # Generate Frontend Configuration from server's .env values
    echo "🔧 Generating frontend configuration..."
    printf '// Generated during deployment - DO NOT EDIT\nwindow.API_BASE_URL = '"'"'https://%s'"'"';\nwindow.SPA_ORIGIN = '"'"'https://%s'"'"';\nwindow.UPLOAD_MODE = '"'"'%s'"'"';\nwindow.UPLOAD_ENABLE_S3_FALLBACK = '"'"'%s'"'"';\nwindow.UPLOAD_BASE_URL = '"'"'%s'"'"';\nwindow.UPLOAD_MAX_FILE_SIZE_MB = '"'"'%s'"'"';\nwindow.STATION_NAME = '"'"'%s'"'"';\nwindow.STATION_CALL_SIGN = '"'"'%s'"'"';\nwindow.STATION_ADDRESS = '"'"'%s'"'"';\nwindow.STATION_LOGO_URL = '"'"'%s'"'"';\nwindow.STATION_WEBSITE_URL = '"'"'%s'"'"';\n' "$API_DOMAIN" "$SPA_DOMAIN" "${UPLOAD_MODE:-local}" "${UPLOAD_ENABLE_S3_FALLBACK:-true}" "${UPLOAD_BASE_URL:-https://$SPA_DOMAIN}" "${UPLOAD_MAX_FILE_SIZE_MB:-50}" "${STATION_NAME:-Your Radio Station}" "${STATION_CALL_SIGN:-[CALL SIGN]}" "${STATION_ADDRESS:-}" "${STATION_LOGO_URL:-}" "${STATION_WEBSITE_URL:-}" > app/config.js
    echo "   app/config.js -> API: https://$API_DOMAIN, SPA: https://$SPA_DOMAIN, Station: ${STATION_NAME:-Your Radio Station}"

    echo "✅ Configuration generated"
    
    # Conditional Docker operations based on deployment mode
    if [ "$CODE_ONLY" = true ]; then
        echo "⏭️  Skipping Docker operations (--code-only mode)"
        echo "✅ Code-only deployment complete!"
    elif [ -n "$SELECTIVE_SERVICES" ]; then
        # Selective service restart
        echo "🔄 Restarting selected services: $SELECTIVE_SERVICES..."
        
        # Stop selected services
        docker compose stop $SELECTIVE_SERVICES
        
        # Start selected services (no --build, use existing images)
        EMAIL="$EMAIL" SPA_DOMAIN="$SPA_DOMAIN" API_DOMAIN="$API_DOMAIN" docker compose up -d $SELECTIVE_SERVICES
        
        # Wait for services
        echo "⏳ Waiting for services to start..."
        sleep 10
        
        # Check health
        if docker compose ps | grep -q "Up"; then
            echo "✅ Services are running:"
            docker compose ps
            
            # Run post-bootstrap only if formio was restarted
            if echo "$SELECTIVE_SERVICES" | grep -q "formio"; then
                echo "� Running post-bootstrap configuration..."
                mkdir -p logs
                if docker exec formio node /app/post-bootstrap.js 2>&1 | tee -a logs/post-bootstrap.log; then
                    echo "✅ Post-bootstrap configuration completed successfully"
                else
                    echo "❌ Post-bootstrap configuration failed"
                    echo "   See logs/post-bootstrap.log on the server for details."
                fi
            else
                echo "ℹ️  Skipping post-bootstrap (formio not restarted)"
            fi
        else
            echo "❌ Service startup failed. Checking logs..."
            docker compose logs --tail=50
            exit 1
        fi
        
        echo "✅ Selective deployment complete!"
    else
        # Full deployment (default behavior)
        echo "�� Restarting all services..."
        docker compose down
        
        # Prune old images to free space and ensure fresh build
        docker image prune -f
        
        # Start services with explicit environment variables
        EMAIL="$EMAIL" SPA_DOMAIN="$SPA_DOMAIN" API_DOMAIN="$API_DOMAIN" docker compose up -d --build
        
        # Wait for services
        echo "⏳ Waiting for services to start..."
        sleep 15
        
        # Check health
        if docker compose ps | grep -q "Up"; then
            echo "✅ Services are running:"
            docker compose ps

            # Run post-bootstrap configuration
            echo "🔧 Running post-bootstrap configuration..."
            mkdir -p logs
            if docker exec formio node /app/post-bootstrap.js 2>&1 | tee -a logs/post-bootstrap.log; then
                echo "✅ Post-bootstrap configuration completed successfully"
            else
                echo "❌ Post-bootstrap configuration failed"
                echo "   See logs/post-bootstrap.log on the server for details."
            fi
        else
            echo "❌ Service startup failed. Checking logs..."
            docker compose logs --tail=50
            exit 1
        fi
        
        echo "✅ Production deployment complete!"
    fi
EOF
