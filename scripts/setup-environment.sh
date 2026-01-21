#!/bin/bash

# Environment Setup Script
# Usage: ./scripts/setup-environment.sh [dev|staging|production]

set -e

ENVIRONMENT=${1:-dev}
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🔧 Setting up $ENVIRONMENT environment..."

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|production)$ ]]; then
    echo "❌ Error: Environment must be dev, staging, or production"
    exit 1
fi

# ARM64-specific development setup
if [[ "$ENVIRONMENT" == "dev" && $(uname -m) == "arm64" ]]; then
    echo "🍎 ARM64 MacBook Pro detected - setting up optimized development environment..."
    
    # Create environment file if it doesn't exist
    if [ ! -f "$PROJECT_DIR/.env" ]; then
        echo "📝 Creating .env file from template..."
        cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
        
        # Generate secure secrets for development
        echo "🔐 Generating development secrets..."
        MONGO_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "change_this_mongo_secret_dev")
        JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "change_this_jwt_secret_dev")
        
        # Use temporary files to avoid regex issues with special characters
        echo "Replacing secrets in .env file..."
        
        # Replace MONGO_SECRET (preserve indentation)
        sed -i.bak "s|^    MONGO_SECRET=.*|    MONGO_SECRET=$MONGO_SECRET|g" "$PROJECT_DIR/.env"
        
        # Replace JWT_SECRET (preserve indentation)
        sed -i.bak "s|^    JWT_SECRET=.*|    JWT_SECRET=$JWT_SECRET|g" "$PROJECT_DIR/.env"
        
        # Set development-friendly defaults (preserve indentation)
        sed -i.bak 's|^    FORMIO_ROOT_EMAIL=.*|    FORMIO_ROOT_EMAIL=admin@localhost|g' "$PROJECT_DIR/.env"
        sed -i.bak 's|^    FORMIO_ROOT_PASSWORD=.*|    FORMIO_ROOT_PASSWORD=admin123|g' "$PROJECT_DIR/.env"
        sed -i.bak 's|^    MONGO_ROOT_PASSWORD=.*|    MONGO_ROOT_PASSWORD=mongoadmin|g' "$PROJECT_DIR/.env"
        sed -i.bak 's|^    FORMIO_DOMAIN=.*|    FORMIO_DOMAIN=http://localhost:3001|g' "$PROJECT_DIR/.env"
        sed -i.bak 's|^    FORMIO_HOST=.*|    FORMIO_HOST=localhost|g' "$PROJECT_DIR/.env"
        sed -i.bak 's|^    FORMIO_PROTOCOL=.*|    FORMIO_PROTOCOL=http|g' "$PROJECT_DIR/.env"
        
        # Set development-specific domains
        sed -i.bak 's|^    SPA_DOMAIN=.*|    SPA_DOMAIN=localhost:3000|g' "$PROJECT_DIR/.env"
        sed -i.bak 's|^    API_DOMAIN=.*|    API_DOMAIN=localhost:3001|g' "$PROJECT_DIR/.env"
        sed -i.bak 's|^    EMAIL=.*|    EMAIL=dev@localhost|g' "$PROJECT_DIR/.env"
        
        # Disable trust proxy for local development (not needed without reverse proxy)
        sed -i.bak 's|^    # FORMIO_TRUST_PROXY=.*|    FORMIO_TRUST_PROXY=false|g' "$PROJECT_DIR/.env"
        
        # Enable CORS for local development
        sed -i.bak 's|^    # FORMIO_CORS_ENABLED=.*|    FORMIO_CORS_ENABLED=true|g' "$PROJECT_DIR/.env"
        
        # Clean up backup files
        rm -f "$PROJECT_DIR/.env.bak"
        
        echo "✅ Development environment configured with ARM64-optimized defaults"
    else
        echo "✅ .env file already exists"
    fi
    
    # Generate Form.io configuration
    echo "🔧 Generating Form.io configuration..."
    "$PROJECT_DIR/scripts/generate-formio-config.sh" "$ENVIRONMENT"
    
    # Build Form.io for ARM64 if needed
    echo "🔨 Checking if Form.io ARM64 build is needed..."
    if ! docker images | grep -q "radio-forms_formio"; then
        echo "📦 Building Form.io from source for ARM64 (this may take 10-15 minutes)..."
        "$PROJECT_DIR/scripts/build-formio.sh"
    else
        echo "✅ Form.io ARM64 image already exists"
    fi
    
    # Start services for development
    echo "🚀 Starting development services..."
    docker-compose -f "$PROJECT_DIR/docker-compose.dev.yml" up -d
    
    # Validate setup
    echo "🔍 Validating development setup..."
    "$PROJECT_DIR/scripts/validate-dev.sh"
    
    echo ""
    echo "🎉 ARM64 development environment is ready!"
    echo ""
    echo "🌐 Access URLs:"
    echo "   • SPA (Frontend): http://localhost:3000"
    echo "   • Form.io API:    http://localhost:3001"
    echo "   • Form.io Admin:  http://localhost:3001"
    echo ""
    echo "👤 Default Admin Credentials:"
    echo "   • Email:    admin@localhost"
    echo "   • Password: admin123"
    echo ""
    echo "🔧 Useful Commands:"
    echo "   • View logs: docker-compose -f docker-compose.dev.yml logs -f"
    echo "   • Stop services: docker-compose -f docker-compose.dev.yml down"
    echo "   • Restart: docker-compose -f docker-compose.dev.yml restart"
    
    exit 0
fi

# Standard environment setup for staging/production or non-ARM64 dev
# Create environment file if it doesn't exist
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo "📝 Creating .env file from template..."
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
    echo "⚠️  Please edit .env file with your actual values"
else
    echo "✅ .env file already exists"
fi

# Generate Form.io configuration
echo "🔧 Generating Form.io configuration..."
"$PROJECT_DIR/scripts/generate-formio-config.sh" "$ENVIRONMENT"

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p "$PROJECT_DIR/config/env"
mkdir -p "$PROJECT_DIR/config/actions"
mkdir -p "$PROJECT_DIR/config/bootstrap"
mkdir -p "$PROJECT_DIR/logs"

# Set proper permissions
echo "🔒 Setting permissions..."
chmod 600 "$PROJECT_DIR/.env"
chmod +x "$PROJECT_DIR/scripts/"*.sh

# Generate secrets if not present
if ! grep -q "change_this" "$PROJECT_DIR/.env"; then
    echo "✅ Secrets already configured"
else
    echo "🔐 Generating secure secrets..."
    "$PROJECT_DIR/scripts/generate-secrets.sh"
fi

echo "✅ $ENVIRONMENT environment setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your actual values"
echo "2. Run: docker-compose up -d"
echo "3. Access your application"
