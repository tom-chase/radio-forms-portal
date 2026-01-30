#!/bin/bash
#
# Syncs form/resource definitions from code to the running local dev database.
#
# This script provides a non-destructive way to apply form definition changes
# during development without needing to wipe the database.
#
# Usage: ./scripts/cli-sync-dev.sh [form_name]
#   - form_name: (Optional) The name of the form/resource to sync. Defaults to 'book'.

set -e

# Load environment variables from .env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# --- Configuration ---
FORM_NAME=${1:-book}
TEMPLATE_FILE="./config/bootstrap/default-template.json"
API_URL_BASE=${FORMIO_DOMAIN:-http://localhost:3001}
DST_ADMIN_KEY=${API_KEYS}

# --- Validation ---
if [ -z "$DST_ADMIN_KEY" ]; then
  echo "Error: API_KEYS is not set for the development environment." >&2
  exit 1
fi

# 1. Sync the individual form template into the main default-template.json
echo "🔄 Syncing '$FORM_NAME' to $TEMPLATE_FILE..."
./scripts/sync-form-templates.sh "$FORM_NAME"

# 2. Deploy the updated default-template.json to the running dev server
echo "🚀 Deploying updated template to dev server at $API_URL_BASE..."

# The correct endpoint for Community Edition is /import, and the payload must be wrapped in a 'template' object.
DST_URL="$API_URL_BASE/import"
echo "POSTing template to $DST_URL..."

# Construct the JSON payload by wrapping the template file content.
JSON_PAYLOAD=$(printf '{"template": %s}' "$(cat "$TEMPLATE_FILE")")

# Use curl to POST the template. This endpoint handles both initial creation and subsequent updates.
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-token: $DST_ADMIN_KEY" \
  --data "$JSON_PAYLOAD" \
  "$DST_URL"

echo "✅ Sync complete. Refresh your browser to see the changes."
