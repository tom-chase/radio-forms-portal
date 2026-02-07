#!/bin/bash

# Generate Secure Secrets
# Usage: ./scripts/lib/generate-secrets.sh

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "🔐 Generating secure secrets..."

# Generate secure random values
MONGO_SECRET=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 32)
API_KEYS=$(openssl rand -hex 32)
PROD_API_KEYS=$(openssl rand -hex 32)
# Generate passwords (alphanumeric only to avoid shell escaping issues)
MONGO_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9')
FORMIO_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9')

# Create temporary .env.new file
ENV_FILE="$PROJECT_DIR/.env"
ENV_NEW="$PROJECT_DIR/.env.new"

# Copy existing .env and replace placeholder secrets
while IFS= read -r line; do
    if [[ $line =~ ^[[:space:]]*MONGO_SECRET= ]]; then
        echo "MONGO_SECRET=$MONGO_SECRET"
    elif [[ $line =~ ^[[:space:]]*JWT_SECRET= ]]; then
        echo "JWT_SECRET=$JWT_SECRET"
    elif [[ $line =~ ^[[:space:]]*API_KEYS= ]]; then
        # Only replace if it contains "change_this" to avoid overwriting set keys
        if [[ $line == *"change_this"* ]]; then
             echo "API_KEYS=$API_KEYS"
        else
             echo "$line"
        fi
    elif [[ $line =~ ^[[:space:]]*PROD_API_KEYS= ]]; then
        # Only replace if it contains "change_this" to avoid overwriting set keys
        if [[ $line == *"change_this"* ]]; then
             echo "PROD_API_KEYS=$PROD_API_KEYS"
        else
             echo "$line"
        fi
    elif [[ $line =~ ^[[:space:]]*MONGO_ROOT_PASSWORD= ]]; then
        # Only replace if it contains "change_this" to avoid overwriting set passwords
        if [[ $line == *"change_this"* ]]; then
             echo "MONGO_ROOT_PASSWORD=$MONGO_PASSWORD"
        else
             echo "$line"
        fi
    elif [[ $line =~ ^[[:space:]]*ROOT_PASSWORD= ]]; then
        # Only replace if it contains "change_this" to avoid overwriting set passwords
        if [[ $line == *"change_this"* ]]; then
             echo "ROOT_PASSWORD=$FORMIO_PASSWORD"
        else
             echo "$line"
        fi
    else
        echo "$line"
    fi
done < "$ENV_FILE" > "$ENV_NEW"

# Append keys if missing (helps when upgrading older .env files)
if ! grep -q '^API_KEYS=' "$ENV_NEW"; then
    echo "API_KEYS=$API_KEYS" >> "$ENV_NEW"
fi
if ! grep -q '^PROD_API_KEYS=' "$ENV_NEW"; then
    echo "PROD_API_KEYS=$PROD_API_KEYS" >> "$ENV_NEW"
fi

# Replace original .env
mv "$ENV_NEW" "$ENV_FILE"

echo "✅ Secure secrets generated:"
echo "   - MongoDB Secret: ${MONGO_SECRET:0:16}..."
echo "   - JWT Secret: ${JWT_SECRET:0:16}..."
echo "   - Dev API Key: ${API_KEYS:0:16}..."
echo "   - Prod API Key: ${PROD_API_KEYS:0:16}..."
echo "   - Mongo Password: (generated)"
echo "   - Form.io Password: (generated)"
echo ""
echo "⚠️  Make sure to backup these values securely!"
