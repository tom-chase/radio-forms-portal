#!/bin/bash

# Unified Deployment Script
# Usage: ./scripts/deploy.sh <environment> [options]
# Example: ./scripts/deploy.sh dev
# Example: ./scripts/deploy.sh production --ssh-key ~/.ssh/my-key.pem

set -e

# --- Configuration ---
ENVIRONMENT=$1
shift # Consume environment argument

# Default settings
FORMIO_TEMPLATE_PATH="./config/bootstrap/default-template.json"
TRANSFORMER_PATH="./scripts/migration-transformer.js"

# --- Functions ---
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] - $1"
}

run_local_deployment() {
    log "Starting local deployment for '$ENVIRONMENT' environment..."

    # 1. Setup environment files
    log "Setting up .env and docker-compose files..."
    ./scripts/setup-environment.sh $ENVIRONMENT

    # 2. Start services
    log "Starting Docker services..."
    docker-compose -f docker-compose.$ENVIRONMENT.yml up -d --build

    log "Waiting for services to become healthy..."
    sleep 15 # Allow time for services to initialize
    ./scripts/health-check.sh $ENVIRONMENT

    # 3. Run Form.io CLI migration
    log "Running formio-cli to migrate project structure..."
    # Set FORMIO_URL for the transformer
    export FORMIO_URL="http://localhost:3001"
    if [ "$ENVIRONMENT" == "production" ]; then
        # This would be the production URL if run locally against prod
        export FORMIO_URL="https://api.radio.mycopri.org"
    fi

    npx formio-cli migrate $FORMIO_TEMPLATE_PATH $TRANSFORMER_PATH $FORMIO_URL --dst-key $ROOT_PASSWORD

    # 4. Run standard DB migrations
    log "Running database migrations..."
    docker-compose -f docker-compose.$ENVIRONMENT.yml exec -T formio node /app/run-migrations.js

    log "'$ENVIRONMENT' deployment completed successfully!"
}

run_production_deployment() {
    log "Starting remote deployment to PRODUCTION..."
    # (This section would contain the tarball/scp logic from deploy-production.sh)
    # For now, we will assume this script is run ON the server for simplicity.
    # The tarball logic can be wrapped around this.
    run_local_deployment
}

# --- Main Execution ---
if [ -z "$ENVIRONMENT" ]; then
    log "ERROR: No environment specified. Usage: $0 <dev|staging|production>"
    exit 1
fi

# Source .env to get ROOT_PASSWORD etc.
if [ -f .env ]; then
    set -a
    source ./.env
    set +a
fi

case "$ENVIRONMENT" in
    dev)
        run_local_deployment
        ;;
    staging)
        log "Staging deployment not yet implemented in this script."
        # run_staging_deployment
        ;;
    production)
        log "Production deployment via this unified script requires review."
        log "Simulating a local-style deployment for now."
        run_production_deployment
        ;;
    *)
        log "ERROR: Unknown environment '$ENVIRONMENT'"
        exit 1
        ;;
esac

chmod +x /Users/thomaschase/radio-forms-portal/scripts/deploy.sh
