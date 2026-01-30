#!/bin/bash

# Deployment script for staging server
# Usage: ./scripts/deploy-staging.sh [branch-name]

set -e

# Configuration
STAGING_SERVER="your-staging-server.com"  # Update with your staging server
STAGING_USER="admin"                    # Update with your username
APP_DIR="/home/admin/radio-forms-portal"        # Update with your app directory

# Get branch name (default: current branch)
BRANCH=${1:-$(git branch --show-current)}

echo "🚀 Deploying branch '$BRANCH' to staging server..."

# Check if branch exists
if ! git show-ref --verify --quiet refs/heads/$BRANCH; then
    echo "❌ Error: Branch '$BRANCH' does not exist"
    exit 1
fi

# Push current branch to remote
echo "📤 Pushing branch to remote..."
git push origin $BRANCH

# SSH into staging server and deploy
echo "🔧 Deploying on staging server..."
ssh $STAGING_USER@$STAGING_SERVER << EOF
    cd $APP_DIR
    
    # Fetch latest changes
    git fetch origin
    
    # Checkout branch
    git checkout $BRANCH
    git pull origin $BRANCH
    
    # Stop existing containers
    docker-compose down
    
    # Generate environment-specific config
echo "🔧 Generating environment configuration..."
cat > app/config.js << EOF
// Generated during deployment - DO NOT EDIT
window.API_BASE_URL = '${API_DOMAIN:-https://api.staging.forms.your-domain.com}';
window.SPA_ORIGIN = '${SPA_DOMAIN:-https://staging.forms.your-domain.com}';
EOF

echo "✅ Configuration generated"
    
    # Use staging-specific Caddyfile
    cp Caddyfile.staging Caddyfile
    
    # Start services
    docker-compose up -d --build
    
    # Show status
    docker-compose ps
    
    echo "✅ Deployment complete!"
EOF

echo "🎉 Branch '$BRANCH' deployed to staging server!"
