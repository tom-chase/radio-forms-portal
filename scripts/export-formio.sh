#!/bin/bash
#
# Exports the current project state from the source Form.io server to a JSON template file.
#
# Usage: ./scripts/export-formio.sh [output_file]
#   - output_file: (Optional) The path to save the template. Defaults to './config/bootstrap/cli-template.json'.

set -e

# Load environment variables from .env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# --- Configuration ---
SRC_URL=${FORMIO_DOMAIN:-http://localhost:3001}
SRC_ADMIN_KEY=${API_KEYS}
OUTPUT_FILE=${1:-./config/bootstrap/cli-template.json}

# --- Validation ---
if [ -z "$SRC_ADMIN_KEY" ]; then
  echo "Error: API_KEYS is not set in your .env file." >&2
  exit 1
fi

echo "Exporting project from $SRC_URL..."

# --- Export Command (using curl) ---
# The @formio/cli clone command is buggy; using curl is more reliable.
# We target the /export endpoint to get the JSON template.
curl -sf -H "x-token: $SRC_ADMIN_KEY" "${SRC_URL}/export" > "$OUTPUT_FILE"

echo "Project template successfully exported to $OUTPUT_FILE"
