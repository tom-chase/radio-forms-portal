#!/bin/bash
#
# Deploys a project template to the destination Form.io server.
#
# Usage: ./scripts/deploy-formio.sh <template_file>
#   - template_file: The path to the template file to deploy.

set -e

# Load environment variables from .env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# --- Configuration ---
# Note: For production, these should be set to the production server values.
TEMPLATE_FILE=${1:-./config/bootstrap/default-template.json}

DST_URL=${PROD_FORMIO_DOMAIN}/import
DST_ADMIN_KEY=${PROD_API_KEYS}

# --- Validation ---
if [ -z "$TEMPLATE_FILE" ]; then
  echo "Error: No template file specified." >&2
  echo "Usage: $0 <template_file>" >&2
  exit 1
fi

if [ ! -f "$TEMPLATE_FILE" ]; then
  echo "Error: Template file not found at $TEMPLATE_FILE" >&2
  exit 1
fi

if [ -z "$DST_ADMIN_KEY" ]; then
  echo "Error: PROD_API_KEYS is not set for the destination environment." >&2
  exit 1
fi

echo "Deploying template '$TEMPLATE_FILE' to $DST_URL..."

# --- Deploy Command ---
# The payload must be wrapped in a 'template' object.
JSON_PAYLOAD=$(printf '{"template": %s}' "$(cat "$TEMPLATE_FILE")")

# Use curl to send the template directly to the project update endpoint.
RESPONSE_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "x-token: $DST_ADMIN_KEY" \
  --data "$JSON_PAYLOAD" \
  "$DST_URL")

if [ "$RESPONSE_CODE" -ne 200 ]; then
  echo "Error: Deployment failed with HTTP status code $RESPONSE_CODE" >&2
  # Attempt to get error message from server
  curl -s -X POST -H "Content-Type: application/json" -H "x-token: $DST_ADMIN_KEY" --data "$JSON_PAYLOAD" "$DST_URL"
  exit 1
fi

echo "Deployment successful."
