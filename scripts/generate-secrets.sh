#!/bin/bash

# Generate Secure Secrets
# Usage: ./scripts/generate-secrets.sh

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🔐 Generating secure secrets..."

# Generate secure random values
MONGO_SECRET=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 32)
FORMIO_ADMIN_KEY=$(openssl rand -hex 32)
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
    elif [[ $line =~ ^[[:space:]]*FORMIO_ADMIN_KEY= ]]; then
        echo "FORMIO_ADMIN_KEY=$FORMIO_ADMIN_KEY"
    elif [[ $line =~ ^[[:space:]]*MONGO_ROOT_PASSWORD= ]]; then
        # Only replace if it contains "change_this" to avoid overwriting set passwords
        if [[ $line == *"change_this"* ]]; then
             echo "MONGO_ROOT_PASSWORD=$MONGO_PASSWORD"
        else
             echo "$line"
        fi
    elif [[ $line =~ ^[[:space:]]*FORMIO_ROOT_PASSWORD= ]]; then
        # Only replace if it contains "change_this" to avoid overwriting set passwords
        if [[ $line == *"change_this"* ]]; then
             echo "FORMIO_ROOT_PASSWORD=$FORMIO_PASSWORD"
        else
             echo "$line"
        fi
    else
        echo "$line"
    fi
done < "$ENV_FILE" > "$ENV_NEW"

# Replace original .env
mv "$ENV_NEW" "$ENV_FILE"

echo "✅ Secure secrets generated:"
echo "   - MongoDB Secret: ${MONGO_SECRET:0:16}..."
echo "   - JWT Secret: ${JWT_SECRET:0:16}..."
echo "   - Mongo Password: (generated)"
echo "   - Form.io Password: (generated)"
echo ""
echo "⚠️  Make sure to backup these values securely!"
