#!/bin/bash

# Generate Form.io Configuration
# Usage: ./scripts/generate-formio-config.sh [dev|staging|production]

set -e

ENVIRONMENT=${1:-dev}
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🔧 Generating Form.io configuration for $ENVIRONMENT..."

# Source environment variables safely
if [ -f "$PROJECT_DIR/.env" ]; then
    # Read .env file line by line to avoid issues with complex values
    while IFS= read -r line; do
        # Skip comments and empty lines
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "$line" ]] && continue
        
        # Export variables safely
        if [[ "$line" =~ ^[[:space:]]*([^=]+)=(.*)$ ]]; then
            export "${BASH_REMATCH[1]}=${BASH_REMATCH[2]}"
        fi
    done < "$PROJECT_DIR/.env"
else
    echo "❌ Error: .env file not found. Run setup-environment.sh first"
    exit 1
fi

# Normalize environment name for config filename compatibility.
# Form.io uses NODE_ENV values like "development" to pick config/<env>.json.
case $ENVIRONMENT in
    "dev")
        CONFIG_ENV_NAME="development"
        ;;
    "development")
        CONFIG_ENV_NAME="development"
        ;;
    "staging")
        CONFIG_ENV_NAME="staging"
        ;;
    "production")
        CONFIG_ENV_NAME="production"
        ;;
    *)
        CONFIG_ENV_NAME="$ENVIRONMENT"
        ;;
esac

# Environment-specific configurations
case $ENVIRONMENT in
    "dev"|"development")
        FORMIO_DOMAIN=${FORMIO_DOMAIN:-"http://localhost:3001"}
        FORMIO_HOST=${FORMIO_HOST:-"localhost"}
        FORMIO_PROTOCOL=${FORMIO_PROTOCOL:-"http"}
        FORMIO_ALLOWED_ORIGINS=${FORMIO_ALLOWED_ORIGINS:-"http://localhost:3000,http://localhost:3001"}
        FORMIO_ALLOWED_ORIGINS_ARRAY=${FORMIO_ALLOWED_ORIGINS_ARRAY:-'["http://localhost:3000", "http://localhost:3001"]'}
        DEBUG=${DEBUG:-"formio:*"}
        LOG_LEVEL=${LOG_LEVEL:-"debug"}
        NODE_ENV=${NODE_ENV:-"development"}
        # Disable trust proxy for local dev (no reverse proxy)
        TRUST_PROXY=${TRUST_PROXY:-"false"}
        ;;
    "staging")
        FORMIO_DOMAIN=${FORMIO_DOMAIN:-"https://${API_DOMAIN:-api.staging.forms.your-domain.com}"}
        FORMIO_HOST=${FORMIO_HOST:-"${API_DOMAIN:-api.staging.forms.your-domain.com}"}
        FORMIO_PROTOCOL=${FORMIO_PROTOCOL:-"https"}
        # Use SPA_DOMAIN and API_DOMAIN to build allowed origins
        SPA_URL="https://${SPA_DOMAIN:-staging.forms.your-domain.com}"
        API_URL="https://${API_DOMAIN:-api.staging.forms.your-domain.com}"
        FORMIO_ALLOWED_ORIGINS_ARRAY=${FORMIO_ALLOWED_ORIGINS_ARRAY:-"[\"$SPA_URL\", \"$API_URL\"]"}
        FORMIO_ALLOWED_ORIGINS=${FORMIO_ALLOWED_ORIGINS:-"$SPA_URL,$API_URL"}
        DEBUG=${DEBUG:-"formio:error"}
        TRUST_PROXY=${TRUST_PROXY:-${FORMIO_TRUST_PROXY:-"true"}}
        ;;
    "production")
        FORMIO_DOMAIN=${FORMIO_DOMAIN:-"https://${API_DOMAIN:-api.forms.your-domain.com}"}
        FORMIO_HOST=${FORMIO_HOST:-"${API_DOMAIN:-api.forms.your-domain.com}"}
        FORMIO_PROTOCOL=${FORMIO_PROTOCOL:-"https"}
        # Use SPA_DOMAIN and API_DOMAIN to build allowed origins
        SPA_URL="https://${SPA_DOMAIN:-forms.your-domain.com}"
        API_URL="https://${API_DOMAIN:-api.forms.your-domain.com}"
        FORMIO_ALLOWED_ORIGINS_ARRAY=${FORMIO_ALLOWED_ORIGINS_ARRAY:-"[\"$SPA_URL\", \"$API_URL\"]"}
        FORMIO_ALLOWED_ORIGINS=${FORMIO_ALLOWED_ORIGINS:-"$SPA_URL,$API_URL"}
        DEBUG=${DEBUG:-"formio:error"}
        TRUST_PROXY=${TRUST_PROXY:-${FORMIO_TRUST_PROXY:-"true"}}
        ;;
esac

# Create configuration directory
mkdir -p "$PROJECT_DIR/config/env"

# Generate environment-specific config file
CONFIG_FILE="$PROJECT_DIR/config/env/$CONFIG_ENV_NAME.json"

# Set all required variables with defaults for envsubst
export MONGO_ROOT_USERNAME=${MONGO_ROOT_USERNAME:-"admin"}
export MONGO_ROOT_PASSWORD=${MONGO_ROOT_PASSWORD:-"mongoadmin"}
export MONGO_DB_NAME=${MONGO_DB_NAME:-"formio"}
export MONGO_SECRET=${MONGO_SECRET}
export MONGO_CONFIG=${MONGO_CONFIG:-""}
export MONGO_CA=${MONGO_CA:-""}
export FORMIO_PORT=${FORMIO_PORT:-"3001"}
export FORMIO_APP_PORT=${FORMIO_APP_PORT:-"8080"}
export FORMIO_HOST=${FORMIO_HOST}
export FORMIO_PROTOCOL=${FORMIO_PROTOCOL}
# FIX: Do not override this with hardcoded localhost values!
export FORMIO_ALLOWED_ORIGINS_ARRAY=${FORMIO_ALLOWED_ORIGINS_ARRAY}
export FORMIO_BASE_PATH=${FORMIO_BASE_PATH:-""}
export FORMIO_DOMAIN=${FORMIO_DOMAIN}
export JWT_SECRET=${JWT_SECRET}
export JWT_EXPIRES_IN=${JWT_EXPIRES_IN:-240}
export JWT_ISSUER=${JWT_ISSUER:-"formio"}
export TRUST_PROXY=${TRUST_PROXY}
export SMTP_HOST=${SMTP_HOST:-""}
export SMTP_PORT=${SMTP_PORT:-"587"}
export SMTP_SECURE=${SMTP_SECURE:-"true"}
export SMTP_USER=${SMTP_USER:-""}
export SMTP_PASS=${SMTP_PASS:-""}
export FORMIO_ACTIONS=${FORMIO_ACTIONS:-"{\"updateLatestRoleLogId\": \"/app/src/actions/UpdateLatestRoleLogId.js\"}"}
export DEBUG=${DEBUG:-"false"}
export ROOT_EMAIL=${ROOT_EMAIL:-"admin@localhost"}

envsubst < "$PROJECT_DIR/formio-config.json.template" > "$CONFIG_FILE"

echo "✅ Generated $ENVIRONMENT configuration: $CONFIG_FILE"

echo "✅ Form.io configuration generated for $ENVIRONMENT"
echo "📍 Location: config/env/$ENVIRONMENT.json"
